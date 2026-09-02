; Inno Setup Script for MusicGit Desktop App
; Compile using Inno Setup (iscc.exe installer.iss) to generate dist\MusicGit-v2.2-Setup.exe

#define MyAppName "MusicGit"
#define MyAppVersion "2.2"
#define MyAppPublisher "Naufal Pratomo"
#define MyAppURL "https://github.com/naufalpratomo/yt-playlist-downloader"
#define MyAppExeName "MusicGit.exe"

[Setup]
AppId={{D37E84B1-2E9E-4B07-A961-A768F80BB872}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={userappdata}\Programs\{#MyAppName}
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=MusicGit-v2.2-Setup
SetupIconFile=app_icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "dist\MusicGit\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; IconFilename: "{app}\{#MyAppExeName}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
