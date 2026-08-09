!include "FileFunc.nsh"
!include "LogicLib.nsh"

; Tauri's current-user NSIS bundle installs Bakbak directly under LocalAppData.
; Keep that location for the first Electron install and every later update so the
; legacy updater replaces the application instead of creating a parallel copy.
!macro customInit
  StrCpy $INSTDIR "$LOCALAPPDATA\Bakbak"

  ; The Tauri updater invokes NSIS with /P /R /UPDATE /ARGS. electron-builder's
  ; installer has its own flags, so translate the legacy passive request here.
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/P" $R1
  ${IfNot} ${Errors}
    SetSilent silent
  ${EndIf}
!macroend

; The legacy install used uninstall.exe and product-name registry keys. Remove
; those only after the Electron files and uninstaller have been written.
!macro customInstall
  Delete "$INSTDIR\uninstall.exe"
  Delete "$INSTDIR\WebView2Loader.dll"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Bakbak"
  DeleteRegKey HKCU "Software\bakbak\Bakbak"
  DeleteRegKey /ifempty HKCU "Software\bakbak"
!macroend

; /R is how the Tauri updater asks the replacement app to start. Waiting until
; the installer succeeds avoids launching Electron while files are still moving.
Function .onInstSuccess
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/R" $R1
  ${IfNot} ${Errors}
    ExecShell "open" "$INSTDIR\bakbak.exe" "--updated"
  ${EndIf}
FunctionEnd
