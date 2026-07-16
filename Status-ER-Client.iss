; ============================================================
;  Status ER — Client Firewall Setup
;  ติดตั้งบนเครื่อง Client เพื่อเปิด port 4000
; ============================================================

#define MyAppName    "Status ER Client"
#define MyAppVersion "1.0.0"
#define SrcDir       RemoveBackslashUnlessRoot(SourcePath)

[Setup]
AppId={{C8A1F2B3-D4E5-6789-ABCD-EF0123456789}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=imhosxp4-byte
DefaultDirName={autopf}\StatusER-Client
CreateUninstallRegKey=yes
UninstallDisplayName={#MyAppName}
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=no
OutputDir={#SrcDir}\dist
OutputBaseFilename=Status-ER-Client-Setup
SetupIconFile={#SrcDir}\build\status-er.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; ไม่มีไฟล์ — แค่รัน script เปิด firewall

[Run]
; เปิด port 4000 ทั้ง inbound และ outbound
Filename: "netsh.exe"; \
  Parameters: "advfirewall firewall add rule name=""Status ER Port 4000 In"" dir=in action=allow protocol=TCP localport=4000"; \
  Flags: runhidden waituntilterminated

Filename: "netsh.exe"; \
  Parameters: "advfirewall firewall add rule name=""Status ER Port 4000 Out"" dir=out action=allow protocol=TCP remoteport=4000"; \
  Flags: runhidden waituntilterminated

[UninstallRun]
Filename: "netsh.exe"; \
  Parameters: "advfirewall firewall delete rule name=""Status ER Port 4000 In"""; \
  Flags: runhidden; RunOnceId: "DelIn"

Filename: "netsh.exe"; \
  Parameters: "advfirewall firewall delete rule name=""Status ER Port 4000 Out"""; \
  Flags: runhidden; RunOnceId: "DelOut"

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    MsgBox('เปิด Port 4000 สำเร็จ!' + #13#10 +
           'ตอนนี้สามารถเปิด ER Status ได้ที่:' + #13#10 +
           'http://192.168.34.162:4000/dashboard.html',
           mbInformation, MB_OK);
  end;
end;
