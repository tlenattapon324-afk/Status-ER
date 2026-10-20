; ============================================================
;  Status ER — Inno Setup 6 Installer Script
;  https://github.com/imhosxp4-byte/Status-ER
; ============================================================

#define MyAppName      "Status ER"
#define MyAppVersion   "1.4.0"
#define MyAppPublisher "imhosxp4-byte"
#define MyAppURL       "https://github.com/imhosxp4-byte/Status-ER"
#define SrcDir         RemoveBackslashUnlessRoot(SourcePath)

[Setup]
AppId={{D7684450-FFD4-42FC-91E3-1C50A684D546}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\StatusER
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir={#SrcDir}\dist
OutputBaseFilename=Status-ER-Setup
SetupIconFile={#SrcDir}\build\status-er.ico
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\status-er.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
CloseApplications=yes
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "สร้าง Desktop Shortcut"; GroupDescription: "ตั้งค่าเพิ่มเติม:"; Flags: checkedonce
Name: "autostart";   Description: "เปิดอัตโนมัติเมื่อ Windows เริ่ม (แนะนำสำหรับเครื่อง Server)"; GroupDescription: "ตั้งค่าเพิ่มเติม:"; Flags: checkedonce

; ── สร้างโฟลเดอร์ ProgramData\StatusER ให้ user เขียนได้ ──────
[Dirs]
Name: "{commonappdata}\StatusER"; Permissions: users-modify

; ── ไฟล์ทั้งหมดที่ติดตั้ง ───────────────────────────────────
[Files]

; Node.js runtime (bundled — ไม่ต้องใช้อินเตอร์เน็ต)
; ไม่ใส่ ignoreversion — ถ้าเครื่องมี node.exe รุ่นเดียวกันติดตั้งอยู่แล้ว (จากการติดตั้งครั้งก่อน) จะข้ามการคัดลอกไฟล์นี้
Source: "C:\Program Files\nodejs\node.exe"; DestDir: "{app}"

; Launcher scripts
Source: "{#SrcDir}\build\launch.vbs";      DestDir: "{app}"; Flags: ignoreversion
Source: "{#SrcDir}\build\stop-server.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SrcDir}\build\status-er.ico";   DestDir: "{app}"; Flags: ignoreversion

; Web UI
Source: "{#SrcDir}\dashboard.html";  DestDir: "{app}"; Flags: ignoreversion
Source: "{#SrcDir}\dashboard2.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SrcDir}\tv.html";        DestDir: "{app}"; Flags: ignoreversion
Source: "{#SrcDir}\index.html";     DestDir: "{app}"; Flags: ignoreversion
Source: "{#SrcDir}\settings.html";  DestDir: "{app}"; Flags: ignoreversion

; Tailwind (local copy — client ไม่ต้องออกอินเทอร์เน็ตเพื่อโหลดสไตล์)
Source: "{#SrcDir}\vendor\tailwind.js"; DestDir: "{app}\vendor"; Flags: ignoreversion

; Server
Source: "{#SrcDir}\server.js";           DestDir: "{app}"; Flags: ignoreversion
Source: "{#SrcDir}\package.json";        DestDir: "{app}"; Flags: ignoreversion
Source: "{#SrcDir}\package-lock.json";   DestDir: "{app}"; Flags: ignoreversion
Source: "{#SrcDir}\config.example.json"; DestDir: "{app}"; Flags: ignoreversion

; หมายเหตุ: ไม่รวม config.json — เครื่องใหม่จะเปิดหน้า Settings อัตโนมัติ
; (ถ้าเคยติดตั้งแล้ว config.json เดิมจะยังคงอยู่ ไม่ถูกลบ)

; ค่าตั้งต้นของหน้าจอ (สี/ฟอนต์/มาสก์ชื่อ ฯลฯ) — ใช้เฉพาะเครื่องที่ติดตั้งใหม่ (onlyifdoesntexist)
; เครื่องที่เคยติดตั้ง/ปรับแต่งไว้แล้ว จะไม่ถูกเขียนทับ
Source: "{#SrcDir}\build\user-defaults.default.json"; DestDir: "{commonappdata}\StatusER"; \
  DestName: "user-defaults.json"; Flags: onlyifdoesntexist

; node_modules (pre-installed — offline ใช้ได้ทันที)
Source: "{#SrcDir}\node_modules\*"; DestDir: "{app}\node_modules"; \
  Flags: ignoreversion recursesubdirs createallsubdirs

; ── Shortcuts ────────────────────────────────────────────────
[Icons]
; Start Menu
Name: "{group}\เปิด Status ER";         Filename: "{sys}\wscript.exe"; \
  Parameters: """{app}\launch.vbs""";   WorkingDir: "{app}"; \
  IconFilename: "{app}\status-er.ico";  Comment: "เปิดระบบ ER Status Dashboard"

Name: "{group}\หยุด Server";            Filename: "{sys}\wscript.exe"; \
  Parameters: """{app}\stop-server.vbs"""; WorkingDir: "{app}"; \
  IconFilename: "{app}\status-er.ico";  Comment: "หยุด ER Status Server"

Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"; \
  IconFilename: "{app}\status-er.ico"

; Desktop shortcut
Name: "{commondesktop}\Status ER";      Filename: "{sys}\wscript.exe"; \
  Parameters: """{app}\launch.vbs""";   WorkingDir: "{app}"; \
  IconFilename: "{app}\status-er.ico";  Comment: "เปิดระบบ ER Status Dashboard"; \
  Tasks: desktopicon

; ── คำสั่งหลังติดตั้ง ────────────────────────────────────────
[Run]
; 1. ตั้ง Task Scheduler — เปิดอัตโนมัติเมื่อ Windows เริ่ม
Filename: "schtasks.exe"; \
  Parameters: "/create /tn ""StatusER"" /tr ""wscript.exe \""{app}\launch.vbs\"""" /sc ONSTART /rl HIGHEST /f"; \
  Flags: runhidden waituntilterminated; Tasks: autostart

; 2. เปิด Windows Firewall port 4000 (รองรับ LAN)
Filename: "netsh.exe"; \
  Parameters: "advfirewall firewall add rule name=""Status ER Port 4000"" dir=in action=allow protocol=TCP localport=4000"; \
  Flags: runhidden waituntilterminated

; 3. เปิดโปรแกรมทันทีหลังติดตั้ง
Filename: "{sys}\wscript.exe"; \
  Parameters: """{app}\launch.vbs"""; \
  Description: "เปิดโปรแกรม Status ER ทันที"; \
  Flags: postinstall nowait skipifsilent

; ── คำสั่งเมื่อถอนติดตั้ง ────────────────────────────────────
[UninstallRun]
; หยุด server
Filename: "cmd.exe"; \
  Parameters: "/c for /f ""tokens=5"" %a in ('netstat -ano ^| findstr :4000 ^| findstr LISTENING') do taskkill /F /PID %a"; \
  Flags: runhidden; RunOnceId: "KillNode4000"

; ลบ Task Scheduler
Filename: "schtasks.exe"; \
  Parameters: "/delete /tn ""StatusER"" /f"; \
  Flags: runhidden; RunOnceId: "DelTask"

; ลบ Firewall rule
Filename: "netsh.exe"; \
  Parameters: "advfirewall firewall delete rule name=""Status ER Port 4000"""; \
  Flags: runhidden; RunOnceId: "DelFirewall"

; ── Pascal Script ────────────────────────────────────────────
[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssInstall then
  begin
    // หยุด server เก่าก่อนติดตั้ง
    Exec('cmd.exe',
      '/c for /f "tokens=5" %a in (''netstat -ano ^| findstr :4000 ^| findstr LISTENING'') do taskkill /F /PID %a',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    // ลบ task เก่าถ้ามี
    Exec('schtasks.exe', '/delete /tn "StatusER" /f',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(600);
  end;
end;
