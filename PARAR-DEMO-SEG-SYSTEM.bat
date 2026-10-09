@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\demo-publico.ps1" -Action Stop
if errorlevel 1 (
  echo.
  echo A demonstracao nao encerrou. Confira a mensagem acima e os logs em %%LOCALAPPDATA%%\GrupoSEG-PublicoBase\logs.
  pause
)
endlocal
