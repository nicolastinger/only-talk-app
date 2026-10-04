!macro customInit
  ; 自更新走静默安装(/S): 先结束运行中的进程, 避免 exe 被占用导致覆盖失败
  IfSilent 0 +3
  nsExec::ExecToStack 'taskkill /IM "Only Talk.exe" /F'
!macroend

!macro customInstall
  nsExec::ExecToStack 'netsh advfirewall firewall add rule name="Only Talk UDP Inbound" dir=in action=allow program="$INSTDIR\Only Talk.exe" protocol=udp enable=yes'
  ; 自更新静默安装完成后自动重启新版本
  IfSilent 0 +3
  Sleep 2000
  ExecShell "" "$INSTDIR\Only Talk.exe"
!macroend

!macro customUnInstall
  nsExec::ExecToStack 'netsh advfirewall firewall delete rule name="Only Talk UDP Inbound"'
!macroend
