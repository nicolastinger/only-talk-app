!macro customInstall
  nsExec::ExecToStack 'netsh advfirewall firewall add rule name="Only Talk UDP Inbound" dir=in action=allow program="$INSTDIR\Only Talk.exe" protocol=udp enable=yes'
!macroend

!macro customUnInstall
  nsExec::ExecToStack 'netsh advfirewall firewall delete rule name="Only Talk UDP Inbound"'
!macroend
