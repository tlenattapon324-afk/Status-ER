/**
 * ER Status — Backend API Server
 * รองรับ MySQL และ PostgreSQL
 * เริ่มด้วย: node server.js  (หรือ start.bat)
 */

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const cors    = require('cors');
const { execFileSync } = require('child_process');

const app  = express();
const PORT = 4000;

/* เก็บ config/data ใน ProgramData (เขียนได้โดยไม่ต้องใช้ Admin)
   fallback เป็น __dirname สำหรับ dev mode */
const DATA_DIR = process.env.PROGRAMDATA
  ? path.join(process.env.PROGRAMDATA, 'StatusER')
  : __dirname;
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const CONFIG_FILE   = path.join(DATA_DIR, 'config.json');
const DEFAULTS_FILE = path.join(DATA_DIR, 'user-defaults.json');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');

/* migrate config.json เก่าจาก __dirname → DATA_DIR ถ้ายังไม่มีใน DATA_DIR */
(function migrateConfig() {
  const oldCfg = path.join(__dirname, 'config.json');
  if (!fs.existsSync(CONFIG_FILE) && fs.existsSync(oldCfg)) {
    try { fs.copyFileSync(oldCfg, CONFIG_FILE); } catch {}
  }
})();

app.use(cors());
app.use(express.json());

/* ── ฝัง API token ลงในหน้า dashboard/tv ตอนเสิร์ฟไฟล์ (ไม่ใช่ static ตรงๆ)
   เพื่อให้หน้าจอเรียก /api/er-data ได้เองอัตโนมัติโดยไม่ต้อง publish token ผ่าน endpoint อื่น ── */
function serveWithToken(fileName) {
  return (req, res) => {
    try {
      const cfg   = loadConfig();
      const token = cfg?.apiToken || '';
      let html = fs.readFileSync(path.join(__dirname, fileName), 'utf8');
      html = html.replace('<script>', `<script>\nwindow.__API_TOKEN__=${JSON.stringify(token)};\n`);
      res.type('html').send(html);
    } catch (err) {
      res.status(500).send('โหลดหน้าไม่สำเร็จ: ' + err.message);
    }
  };
}
app.get('/dashboard.html', serveWithToken('dashboard.html'));
app.get('/tv.html',        serveWithToken('tv.html'));

app.use(express.static(__dirname)); /* serve HTML files */

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */

/* ── DPAPI (Windows Data Protection API) — เข้ารหัสไฟล์ config/profiles โดยผูกกับ
   เครื่องนี้ (LocalMachine scope) กันกรณีไฟล์ถูกคัดลอก/สำรองไปเปิดที่เครื่องอื่น ── */
function dpapiRun(method, base64Data) {
  const script =
    'Add-Type -AssemblyName System.Security;' +
    `$b=[Convert]::FromBase64String('${base64Data}');` +
    `$r=[System.Security.Cryptography.ProtectedData]::${method}($b,$null,` +
    '[System.Security.Cryptography.DataProtectionScope]::LocalMachine);' +
    '[Convert]::ToBase64String($r)';
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (!out) throw new Error('dpapi: empty output');
  return out;
}
function dpapiEncrypt(plainText) { return dpapiRun('Protect', Buffer.from(plainText, 'utf8').toString('base64')); }
function dpapiDecrypt(cipherB64) { return Buffer.from(dpapiRun('Unprotect', cipherB64), 'base64').toString('utf8'); }

/* ── config.json — cache ในหน่วยความจำ, ถอดรหัสแค่ตอนเริ่ม server (ไม่ใช่ทุก request) ── */
let _configCache; // undefined = ยังไม่โหลด
function readConfigFromDisk() {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
  try {
    return JSON.parse(dpapiDecrypt(raw));
  } catch {
    /* ไฟล์เก่าที่ยังเป็น plaintext (ก่อนอัปเดตนี้) — migrate เป็นแบบเข้ารหัสอัตโนมัติ */
    try {
      const cfg = JSON.parse(raw);
      writeConfigToDisk(cfg);
      console.log('[Config] Migrated plaintext config.json -> encrypted (DPAPI)');
      return cfg;
    } catch { return null; }
  }
}
function writeConfigToDisk(cfg) {
  fs.writeFileSync(CONFIG_FILE, dpapiEncrypt(JSON.stringify(cfg)));
}
function loadConfig() {
  if (_configCache === undefined) _configCache = readConfigFromDisk();
  return _configCache;
}
function saveConfig(cfg) {
  writeConfigToDisk(cfg);
  _configCache = cfg;
}

/* ── profiles.json — เข้ารหัส + cache แบบเดียวกับ config.json ── */
let _profilesCache; // undefined = ยังไม่โหลด
function readProfilesFromDisk() {
  if (!fs.existsSync(PROFILES_FILE)) return [];
  const raw = fs.readFileSync(PROFILES_FILE, 'utf8');
  try {
    return JSON.parse(dpapiDecrypt(raw));
  } catch {
    try {
      const profiles = JSON.parse(raw);
      writeProfilesToDisk(profiles);
      console.log('[Profiles] Migrated plaintext profiles.json -> encrypted (DPAPI)');
      return profiles;
    } catch { return []; }
  }
}
function writeProfilesToDisk(profiles) {
  fs.writeFileSync(PROFILES_FILE, dpapiEncrypt(JSON.stringify(profiles)));
}
function loadProfiles() {
  if (_profilesCache === undefined) _profilesCache = readProfilesFromDisk();
  return _profilesCache;
}
function saveProfiles(profiles) {
  writeProfilesToDisk(profiles);
  _profilesCache = profiles;
}

/* ── ซ่อน password ก่อนส่งกลับให้ client (กันรั่วผ่าน network ที่ไม่ได้ auth) ── */
function maskConfig(cfg) {
  if (!cfg) return cfg;
  const { password, ...rest } = cfg;
  return { ...rest, password: '', hasPassword: !!password };
}

/* ── ถ้า client ส่ง password ว่างมา (เพราะฟอร์มถูก mask ไว้) แต่ฟิลด์อื่นตรงกับ
   config ที่บันทึกไว้ทุกตัว ให้ใช้ password เดิมแทน — ใช้กับปุ่ม test/check/add field ── */
function fillPasswordIfUnchanged(cfg) {
  if (cfg.password) return cfg;
  const saved = loadConfig();
  if (saved && saved.dbType === cfg.dbType && saved.host === cfg.host &&
      String(saved.port) === String(cfg.port) && saved.database === cfg.database &&
      saved.username === cfg.username) {
    return { ...cfg, password: saved.password };
  }
  return cfg;
}

/* ── บังคับ API token กับ endpoint ที่ดึงข้อมูลคนไข้ — กัน copy URL ไปยิงตรงจาก Postman
   ถ้ายังไม่เคยตั้งค่า token ไว้ (ค่าว่าง) จะไม่บังคับ เพื่อไม่ให้เครื่องเก่าที่ยังไม่ได้ตั้ง token พังทันที ── */
function requireApiToken(req, res) {
  const cfg = loadConfig();
  if (!cfg?.apiToken) return true;
  const provided = req.get('X-API-Token') || req.query.token;
  if (provided !== cfg.apiToken) {
    res.status(401).json({ ok: false, error: 'ต้องระบุ API token ให้ถูกต้อง' });
    return false;
  }
  return true;
}

/**
 * Run a query using a one-shot connection.
 * Works for both MySQL and PostgreSQL.
 */
async function runQuery(cfg, sql, params = []) {
  if (cfg.dbType === 'mysql') {
    const mysql = require('mysql2/promise');
    const conn  = await mysql.createConnection({
      host: cfg.host, port: parseInt(cfg.port),
      database: cfg.database,
      user: cfg.username, password: cfg.password,
      connectTimeout: 30000,
    });
    try {
      await conn.query('SET SESSION wait_timeout=60, interactive_timeout=60');
      const [rows] = await conn.query(sql, params);
      return rows;
    } finally {
      await conn.end().catch(() => {});
    }

  } else {
    const { Client } = require('pg');
    const client = new Client({
      host: cfg.host, port: parseInt(cfg.port),
      database: cfg.database,
      user: cfg.username, password: cfg.password,
      connectionTimeoutMillis: 30000,
      query_timeout: 60000,
    });
    await client.connect();
    try {
      await client.query('SET statement_timeout = 60000');
      const result = await client.query(sql, params);
      return result.rows;
    } finally {
      await client.end().catch(() => {});
    }
  }
}

/* ══════════════════════════════════════════════
   ROUTES
══════════════════════════════════════════════ */

/* ── GET  /api/defaults — load saved display defaults ── */
app.get('/api/defaults', (req, res) => {
  try {
    if (fs.existsSync(DEFAULTS_FILE)) {
      res.json({ ok: true, defaults: JSON.parse(fs.readFileSync(DEFAULTS_FILE, 'utf8')) });
    } else {
      res.json({ ok: true, defaults: null });
    }
  } catch { res.json({ ok: true, defaults: null }); }
});

/* ── POST /api/defaults — save display defaults to file ── */
app.post('/api/defaults', (req, res) => {
  try {
    fs.writeFileSync(DEFAULTS_FILE, JSON.stringify(req.body, null, 2));
    console.log('[Defaults] Saved display defaults');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ── GET  /api/config — return current DB config for settings pre-fill ── */
/* password ไม่ถูกส่งกลับ (endpoint นี้ไม่ต้อง auth) — ส่งแค่ hasPassword flag แทน */
app.get('/api/config', (req, res) => {
  const cfg = loadConfig();
  if (!cfg) return res.json({ ok: false });
  res.json({ ok: true, config: maskConfig(cfg) });
});

/* ── POST /api/officer-login — เช็คสิทธิ์ Admin ผ่านตาราง officer ของ HOSxP ── */
/* ต้องมี officer_task_id='77' ผูกกับกลุ่มของ officer คนนั้นถึงจะเข้าหน้าตั้งค่าได้
   ถ้ายังไม่เคยตั้งค่าฐานข้อมูลเลย (ติดตั้งเครื่องใหม่) อนุญาตให้เข้าได้โดยไม่ต้อง login
   เพราะยังไม่มีฐานข้อมูลให้เช็คสิทธิ์ */
app.post('/api/officer-login', async (req, res) => {
  const cfg = loadConfig();
  if (!cfg) return res.json({ ok: true, allowed: true, bootstrap: true });

  const { username, password } = req.body || {};
  if (!username || !password) return res.json({ ok: true, allowed: false });

  /* คอลัมน์จริงใน HOSxP: officer.officer_login_name / officer.officer_login_password_md5
     (เก็บ MD5 hash เป็นตัวพิมพ์ใหญ่ ต่างจาก MySQL/PG MD5() ที่คืนตัวพิมพ์เล็ก — เทียบแบบไม่สนตัวเล็กใหญ่)
     เช็คด้วยว่า officer_active='Y' กันบัญชีที่ถูกปิดใช้งานแล้วยัง login เข้ามาได้ */
  const isMySQL = cfg.dbType === 'mysql';
  const sql = isMySQL ? `
    SELECT l.officer_id
    FROM officer_group_task_access t
    LEFT OUTER JOIN officer_group g ON g.officer_group_id = t.officer_group_id
    LEFT OUTER JOIN officer_group_list l ON l.officer_group_id = g.officer_group_id
    LEFT OUTER JOIN officer o ON o.officer_id = l.officer_id
    WHERE o.officer_login_name = ?
      AND UPPER(o.officer_login_password_md5) = UPPER(MD5(?))
      AND o.officer_active = 'Y'
      AND t.officer_task_id = '77'
    LIMIT 1
  ` : `
    SELECT l.officer_id
    FROM officer_group_task_access t
    LEFT OUTER JOIN officer_group g ON g.officer_group_id = t.officer_group_id
    LEFT OUTER JOIN officer_group_list l ON l.officer_group_id = g.officer_group_id
    LEFT OUTER JOIN officer o ON o.officer_id = l.officer_id
    WHERE o.officer_login_name = $1
      AND UPPER(o.officer_login_password_md5) = UPPER(MD5($2))
      AND o.officer_active = 'Y'
      AND t.officer_task_id = '77'
    LIMIT 1
  `;

  try {
    const rows = await runQuery(cfg, sql, [username, password]);
    console.log(`[OfficerLogin] ${username} — ${rows.length > 0 ? 'allowed' : 'denied'}`);
    res.json({ ok: true, allowed: rows.length > 0 });
  } catch (err) {
    console.error('[OfficerLogin] ERROR —', err.message);
    res.status(500).json({ ok: false, error: 'เชื่อมต่อฐานข้อมูลไม่ได้: ' + err.message });
  }
});

/* ── GET  /api/status — server health check ── */
app.get('/api/status', (req, res) => {
  const cfg = loadConfig();
  res.json({
    ok: true,
    configured: !!(cfg && cfg.host),
    dbType: cfg?.dbType || null,
    host:   cfg?.host   || null,
  });
});

/* ── DELETE /api/config — ล้างค่าการเชื่อมต่อ DB (เก็บ apiToken ไว้) เพื่อให้เข้าหน้าตั้งค่าใหม่ได้โดยไม่ต้อง login ── */
app.delete('/api/config', (req, res) => {
  try {
    const old = loadConfig();
    saveConfig(old?.apiToken ? { apiToken: old.apiToken } : {});
    console.log('[Config] Connection cleared');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ── POST /api/config — save DB config to file ── */
/* ถ้า password ว่าง (ฟอร์มถูก mask ไว้ ผู้ใช้ไม่ได้พิมพ์รหัสใหม่) ให้คงรหัสเดิมไว้ */
app.post('/api/config', (req, res) => {
  try {
    const incoming = { ...req.body };
    if (!incoming.password) {
      const existing = loadConfig();
      if (existing?.password) incoming.password = existing.password;
    }
    saveConfig(incoming);
    console.log(`[Config] Saved — ${incoming.dbType} @ ${incoming.host}:${incoming.port}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ── POST /api/test — test DB connection ── */
app.post('/api/test', async (req, res) => {
  try {
    const cfg = fillPasswordIfUnchanged(req.body);
    await runQuery(cfg, 'SELECT 1');
    console.log(`[Test] OK — ${cfg.dbType} @ ${cfg.host}:${cfg.port}`);
    res.json({ ok: true, message: 'เชื่อมต่อสำเร็จ' });
  } catch (err) {
    console.error(`[Test] FAIL — ${err.message}`);
    res.status(400).json({ ok: false, message: err.message });
  }
});

/* ── GET /api/er-data — ER patient list (today) ── */
app.get('/api/er-data', async (req, res) => {
  if (!requireApiToken(req, res)) return;
  const cfg = loadConfig();
  if (!cfg) {
    return res.status(503).json({ ok: false, error: 'ยังไม่ได้ตั้งค่าฐานข้อมูล กรุณาตั้งค่าก่อน' });
  }

  const isMySQL = cfg.dbType === 'mysql';

  /* ── SQL — ตรงกับ query ที่ใช้งานได้จริงใน HOSxP ── */
  const sql = isMySQL ? `
    SELECT
      TIME(e.enter_er_time)                              AS enter_time,
      CONCAT(p.pname, p.fname, ' ', p.lname)             AS pt_name,
      el.er_leave_status_name                             AS status_name,
      o.hn                                                AS hn,
      IFNULL(e.er_emergency_type, 5)                      AS triage_level,
      o.vn                                                AS vn,
      COALESCE(el.leave, '')                              AS leave_flag
    FROM ovst o
    LEFT JOIN er_regist e          ON e.vn  = o.vn
    LEFT JOIN patient p            ON p.hn  = o.hn
    LEFT JOIN er_emergency_type ep ON ep.er_emergency_type = e.er_emergency_type
    LEFT JOIN er_leave_status el   ON el.er_leave_status_id = e.er_leave_status_id
    LEFT JOIN ovstist os           ON os.ovstist = o.ovstist
    WHERE e.vstdate = CURDATE()
    ORDER BY e.er_emergency_type ASC, e.enter_er_time ASC
  ` : `
    SELECT
      e.enter_er_time::time                              AS enter_time,
      CONCAT(p.pname, p.fname, ' ', p.lname)             AS pt_name,
      el.er_leave_status_name                             AS status_name,
      o.hn                                                AS hn,
      COALESCE(
        NULLIF(TRIM(CAST(e.er_emergency_type AS text)), '')::int,
        5
      )                                                   AS triage_level,
      o.vn                                                AS vn,
      COALESCE(el.leave::text, '')                        AS leave_flag
    FROM ovst o
    LEFT JOIN er_regist e          ON e.vn  = o.vn
    LEFT JOIN patient p            ON p.hn  = o.hn
    LEFT JOIN er_emergency_type ep ON ep.er_emergency_type = e.er_emergency_type
    LEFT JOIN er_leave_status el   ON el.er_leave_status_id = e.er_leave_status_id
    LEFT JOIN ovstist os           ON os.ovstist = o.ovstist
    WHERE e.vstdate = CURRENT_DATE
    ORDER BY e.er_emergency_type ASC, e.enter_er_time ASC
  `;

  try {
    const [rows, nameRows] = await Promise.all([
      runQuery(cfg, sql),
      runQuery(cfg, 'SELECT hospitalname FROM opdconfig LIMIT 1').catch(() => []),
    ]);
    const hospitalName = (nameRows[0]?.hospitalname || '').trim();
    console.log(`[ER Data] ${rows.length} rows | รพ.: ${hospitalName || '-'}`);
    res.json({ ok: true, data: rows, count: rows.length, hospitalName, ts: Date.now() });
  } catch (err) {
    console.error(`[ER Data] ERROR — ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ── GET /api/er-leave-summary — สรุปสถานะออกจาก ER วันนี้ ── */
app.get('/api/er-leave-summary', async (req, res) => {
  if (!requireApiToken(req, res)) return;
  const cfg = loadConfig();
  if (!cfg) return res.status(503).json({ ok: false, error: 'ยังไม่ได้ตั้งค่าฐานข้อมูล' });

  const isMySQL = cfg.dbType === 'mysql';
  /* หมายเหตุ: ห้ามฝัง literal ภาษาไทย (เช่น 'ไม่ระบุ') ใน SQL ตรงนี้ — บางฐาน HOSxP (MySQL)
     เก็บข้อมูลเป็น TIS-620 ทำให้ literal ที่ฝังในคำสั่ง SQL ถูกส่ง/แปลงกลับมาผิดเพี้ยน
     (เจอจริงกับ รพ.พิชัย — COALESCE(...,'ไม่ระบุ') กลายเป็นอักขระเพี้ยน) ใส่ค่า default
     ให้ null ในโค้ด JS แทนหลัง query เสร็จ จะปลอดภัยกับทุก charset ของฐานข้อมูล */
  const sql = isMySQL ? `
    SELECT
      el.er_leave_status_name                         AS status_name,
      COALESCE(el.leave, '')                          AS leave_flag,
      COUNT(*)                                        AS cnt
    FROM ovst o
    LEFT JOIN er_regist e       ON e.vn  = o.vn
    LEFT JOIN er_leave_status el ON el.er_leave_status_id = e.er_leave_status_id
    WHERE e.vstdate = CURDATE()
    GROUP BY el.er_leave_status_name, el.leave
    ORDER BY (el.leave = 'Y') ASC, cnt DESC
  ` : `
    SELECT
      el.er_leave_status_name                         AS status_name,
      COALESCE(el.leave::text, '')                    AS leave_flag,
      COUNT(*)                                        AS cnt
    FROM ovst o
    LEFT JOIN er_regist e        ON e.vn  = o.vn
    LEFT JOIN er_leave_status el ON el.er_leave_status_id = e.er_leave_status_id
    WHERE e.vstdate = CURRENT_DATE
    GROUP BY el.er_leave_status_name, el.leave
    ORDER BY (el.leave = 'Y') ASC NULLS FIRST, cnt DESC
  `;

  try {
    const rows = await runQuery(cfg, sql);
    rows.forEach(r => { if (r.status_name == null) r.status_name = 'ไม่ระบุ'; });
    console.log(`[Leave Summary] ${rows.length} status groups`);
    res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(`[Leave Summary] ERROR — ${err.message}`);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ── POST /api/check-leave-field — ตรวจสอบว่ามีฟิล leave ใน er_leave_status ── */
/* รับ cfg จาก request body (ค่าฟอร์มปัจจุบัน ไม่ใช่ config.json ที่บันทึกไว้) */
app.post('/api/check-leave-field', async (req, res) => {
  const cfg = fillPasswordIfUnchanged(req.body || {});
  if (!cfg || !cfg.host) return res.status(400).json({ ok: false, error: 'ไม่มีข้อมูลการเชื่อมต่อ' });

  const isMySQL = cfg.dbType === 'mysql';
  const sql = isMySQL
    ? `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'er_leave_status' AND COLUMN_NAME = 'leave'`
    : `SELECT COUNT(*) AS cnt FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       WHERE c.relname = 'er_leave_status' AND a.attname = 'leave' AND NOT a.attisdropped`;

  try {
    const rows = await runQuery(cfg, sql);
    const cnt  = parseInt(rows[0]?.cnt ?? rows[0]?.count ?? 0);
    console.log(`[CheckField] leave exists: ${cnt > 0}`);
    res.json({ ok: true, exists: cnt > 0 });
  } catch (err) {
    console.error('[CheckField] ERROR —', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ── POST /api/add-leave-field — เพิ่มฟิล leave CHAR(1) ใน er_leave_status ── */
/* รับ cfg จาก request body */
app.post('/api/add-leave-field', async (req, res) => {
  const cfg = fillPasswordIfUnchanged(req.body || {});
  if (!cfg || !cfg.host) return res.status(400).json({ ok: false, error: 'ไม่มีข้อมูลการเชื่อมต่อ' });

  /* "leave" เป็นคำสงวนใน MySQL/MariaDB (ใช้ในคำสั่ง LEAVE ของ stored procedure)
     ต้อง quote ชื่อฟิลด์ด้วย backtick เสมอ ไม่งั้น syntax error */
  const isMySQL = cfg.dbType === 'mysql';
  const sql = isMySQL
    ? 'ALTER TABLE er_leave_status ADD COLUMN `leave` CHAR(1) DEFAULT NULL'
    : 'ALTER TABLE er_leave_status ADD COLUMN "leave" CHAR(1) DEFAULT NULL';
  try {
    await runQuery(cfg, sql);
    console.log('[AddField] เพิ่มฟิล leave ใน er_leave_status สำเร็จ');
    res.json({ ok: true });
  } catch (err) {
    console.error('[AddField] ERROR —', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ── GET /api/profiles — รายการ profiles ทั้งหมด ── */
/* password ของแต่ละ profile ไม่ถูกส่งกลับ (endpoint นี้ไม่ต้อง auth) ── */
app.get('/api/profiles', (req, res) => {
  const profiles = loadProfiles().map(maskConfig);
  const cfg      = loadConfig();
  res.json({ ok: true, profiles, activeHost: cfg?.host || null, activeDb: cfg?.database || null });
});

/* ── POST /api/profiles — บันทึก profile ใหม่หรืออัปเดต ── */
app.post('/api/profiles', (req, res) => {
  const { id, name, ...dbCfg } = req.body;
  if (!name || !dbCfg.host) return res.status(400).json({ ok: false, error: 'ต้องระบุชื่อและ host' });

  const profiles = loadProfiles();
  const pid      = id || `prof_${Date.now()}`;
  const idx      = profiles.findIndex(p => p.id === pid);

  /* ถ้า password ว่าง (ฟอร์มถูก mask ไว้) แต่กำลังอัปเดต profile เดิม ให้คงรหัสเดิมไว้ */
  if (!dbCfg.password && idx >= 0 && profiles[idx].password) dbCfg.password = profiles[idx].password;

  const entry = { id: pid, name, savedAt: new Date().toISOString(), ...dbCfg };

  if (idx >= 0) profiles[idx] = entry;
  else          profiles.push(entry);

  saveProfiles(profiles);
  console.log(`[Profiles] Saved — "${name}" (${dbCfg.dbType} @ ${dbCfg.host}:${dbCfg.port})`);
  res.json({ ok: true, id: pid });
});

/* ── POST /api/profiles/:id/activate — เปิดใช้ profile นี้ (copy → config.json) ── */
app.post('/api/profiles/:id/activate', (req, res) => {
  const profiles = loadProfiles();
  const prof     = profiles.find(p => p.id === req.params.id);
  if (!prof) return res.status(404).json({ ok: false, error: 'ไม่พบ profile' });

  const { id, name, ...cfg } = prof;
  cfg.savedAt = new Date().toISOString();
  saveConfig(cfg);
  console.log(`[Profiles] Activated — "${name}" (${cfg.dbType} @ ${cfg.host}:${cfg.port})`);
  res.json({ ok: true, name });
});

/* ── DELETE /api/profiles/:id — ลบ profile ── */
app.delete('/api/profiles/:id', (req, res) => {
  const profiles = loadProfiles();
  const idx      = profiles.findIndex(p => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ ok: false, error: 'ไม่พบ profile' });

  const [removed] = profiles.splice(idx, 1);
  saveProfiles(profiles);
  console.log(`[Profiles] Deleted — "${removed.name}"`);
  res.json({ ok: true });
});

/* ══════════════════════════════════════════════
   START
══════════════════════════════════════════════ */
app.listen(PORT, () => {
  console.log('');
  console.log(' ╔══════════════════════════════════╗');
  console.log(' ║   🏥  ER Status Server  v1.0     ║');
  console.log(` ║   http://localhost:${PORT}          ║`);
  console.log(' ╚══════════════════════════════════╝');
  console.log('');
  const cfg = loadConfig();
  if (cfg) {
    console.log(` ✅ DB Config: ${cfg.dbType?.toUpperCase()} @ ${cfg.host}:${cfg.port}`);
  } else {
    console.log(' ⚠  ยังไม่มี config.json — กรุณาตั้งค่าการเชื่อมต่อก่อน');
  }
  console.log('');
});
