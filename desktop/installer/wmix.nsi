!include "MUI2.nsh"
!include "x64.nsh"
!include "LogicLib.nsh"

!ifndef WMIX_PAYLOAD_DIR
  !error "WMIX_PAYLOAD_DIR must point to the staged Windows desktop application"
!endif
!ifndef WMIX_ICON
  !error "WMIX_ICON must point to the WMix Windows .ico file"
!endif

!define APP_NAME "WMix Studio"
!define APP_VERSION "0.1.0"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\WMix Studio"

!ifndef WMIX_OUTPUT
  !error "WMIX_OUTPUT must point to the setup executable destination"
!endif

Name "${APP_NAME}"
OutFile "${WMIX_OUTPUT}"
InstallDir "$PROGRAMFILES64\WMix Studio"
InstallDirRegKey HKLM "Software\WMix Studio" "InstallDir"
RequestExecutionLevel admin
Unicode true
SetCompressor /SOLID lzma
BrandingText "WMix Studio"
CRCCheck force
VIProductVersion "0.1.0.0"
VIAddVersionKey /LANG=1046 "ProductName" "WMix Studio"
VIAddVersionKey /LANG=1046 "FileDescription" "Instalador do WMix Studio para Windows"
VIAddVersionKey /LANG=1046 "CompanyName" "WMix"
VIAddVersionKey /LANG=1046 "FileVersion" "0.1.0"
VIAddVersionKey /LANG=1046 "ProductVersion" "0.1.0"
Icon "${WMIX_ICON}"
UninstallIcon "${WMIX_ICON}"

!define MUI_ICON "${WMIX_ICON}"
!define MUI_UNICON "${WMIX_ICON}"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\WMix.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Executar WMix Studio"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "PortugueseBR"
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "Este instalador do WMix requer Windows de 64 bits." /SD IDOK
    Abort
  ${EndIf}
FunctionEnd

Section "WMix Studio (obrigatorio)" SecMain
  SectionIn RO
  SetShellVarContext all
  SetRegView 64
  SetOutPath "$INSTDIR"
  File /r "${WMIX_PAYLOAD_DIR}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\WMix Studio"
  CreateShortcut "$SMPROGRAMS\WMix Studio\WMix Studio.lnk" "$INSTDIR\WMix.exe" "" "$INSTDIR\WMix.exe" 0
  CreateShortcut "$SMPROGRAMS\WMix Studio\Desinstalar WMix Studio.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\WMix Studio" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "Publisher" "WMix"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\WMix.exe"
  WriteRegStr HKLM "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoRepair" 1
SectionEnd

Section "Criar atalho na area de trabalho" SecDesktop
  SetShellVarContext all
  CreateShortcut "$DESKTOP\WMix Studio.lnk" "$INSTDIR\WMix.exe" "" "$INSTDIR\WMix.exe" 0
SectionEnd

Section "Uninstall"
  SetShellVarContext all
  SetRegView 64
  Delete "$DESKTOP\WMix Studio.lnk"
  Delete "$SMPROGRAMS\WMix Studio\WMix Studio.lnk"
  Delete "$SMPROGRAMS\WMix Studio\Desinstalar WMix Studio.lnk"
  RMDir "$SMPROGRAMS\WMix Studio"
  DeleteRegKey HKLM "${UNINSTALL_KEY}"
  DeleteRegKey HKLM "Software\WMix Studio"
  RMDir /r "$INSTDIR"
SectionEnd
