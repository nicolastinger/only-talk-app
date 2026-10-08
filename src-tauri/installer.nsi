!macro customInit
  ; 自更新走可见向导(非 /S): 由安装器内置的 CheckIfAppIsRunning 提示用户关闭本进程。
  ; 仅在手动静默安装(/S)时无提示, 这里直接结束进程, 避免 exe 被占用导致覆盖失败。
  IfSilent 0 +3
  nsExec::ExecToStack 'taskkill /IM "Only Talk.exe" /F'
!macroend

!macro customInstall
  nsExec::ExecToStack 'netsh advfirewall firewall add rule name="Only Talk UDP Inbound" dir=in action=allow program="$INSTDIR\Only Talk.exe" protocol=udp enable=yes'
  ; 手动静默安装(/S)完成后自动重启新版本; 向导安装由完成页“运行 Only Talk”勾选启动
  IfSilent 0 +3
  Sleep 2000
  ExecShell "" "$INSTDIR\Only Talk.exe"
!macroend

!macro customUnInstall
  nsExec::ExecToStack 'netsh advfirewall firewall delete rule name="Only Talk UDP Inbound"'
!macroend
