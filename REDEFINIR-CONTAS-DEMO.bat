@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
node "%~dp0scripts\reset-demo-credentials.mjs"
echo.
if errorlevel 1 (
  echo Redefinicao nao concluida. Nenhuma senha foi confirmada como alterada.
) else (
  echo Copie as credenciais exibidas para um local privado antes de fechar esta janela.
)
pause
endlocal
