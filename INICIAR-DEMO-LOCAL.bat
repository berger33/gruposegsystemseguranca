@echo off
setlocal
cd /d "%~dp0"
echo Grupo SEG - DEMONSTRACAO FICTICIA LOCAL, NAO PRODUCAO
where node >nul 2>&1
if errorlevel 1 goto :neednode
where npm >nul 2>&1
if errorlevel 1 goto :neednode
if not exist "node_modules\embedded-postgres" (
  echo Instalando dependencias travadas...
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto :failure
)
if exist "%LOCALAPPDATA%\GrupoSEG\seg-system-demo-v1\config.json" goto :start
if exist "%LOCALAPPDATA%\GrupoSEG\seg-system-demo-v1" goto :incomplete
echo A primeira inicializacao cria APENAS dados ficticios em seu perfil do Windows.
echo Eles permanecem apos fechar a janela; ainda NAO existe backup operacional.
echo NAO use dados reais e NAO abra tunel/porta para terceiros.
set /p CONFIRM=Digite SIM para inicializar a demonstracao local (SIM):
if /I not "%CONFIRM%"=="SIM" exit /b 2
node scripts\local-demo.mjs --init
goto :done
:start
node scripts\local-demo.mjs --start
goto :done
:incomplete
echo A pasta de dados ja existe, mas a inicializacao esta incompleta.
echo Nao apague nem reinicialize. Leia docs\demo-local-persistente.md.
goto :failure
:neednode
echo Instale Node.js 22 e npm; veja docs\demo-local-persistente.md.
goto :failure
:done
if errorlevel 1 goto :failure
echo A demonstracao foi encerrada; os dados locais NAO foram apagados.
pause
exit /b 0
:failure
echo Nao foi possivel iniciar. Nao trate a demonstracao como homologada.
pause
exit /b 1
