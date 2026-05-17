!macro customInstall
  nsExec::ExecToStack 'netsh advfirewall firewall add rule name="only-talk UDP Inbound" dir=in action=allow program="$INSTDIR\only-talk.exe" protocol=udp enable=yes'
!macroend

!macro customUnInstall
  nsExec::ExecToStack 'netsh advfirewall firewall delete rule name="only-talk UDP Inbound"'
!macroend
