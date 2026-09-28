@echo off
setlocal
cd /d "%~dp0"
for %%V in (DATABASE_URL DATABASE_MIGRATION_URL CLIENT_DOCS_DIR PGLITE_DATA_DIR) do (
  if defined %%V (
    echo RECUSADO: remova %%V do ambiente antes de iniciar QA.
    pause
    exit /b 2
  )
)
if exist ".env*" (
  echo RECUSADO: arquivo .env detectado; use uma extracao limpa para QA local.
  pause
  exit /b 2
)
where node >nul 2>&1
if errorlevel 1 goto :neednode
where npm >nul 2>&1
if errorlevel 1 goto :neednode
for /f "delims=" %%V in ('node -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%V"
if not "%NODE_MAJOR%"=="22" goto :neednode
set "QA_PGLITE_ONLY=true"
set "OLLAMA_ENABLED=false"
set "NEXT_PUBLIC_ALLOW_INDEX=false"
set "NEXT_PUBLIC_ENV=beta"
set "MAIL_HOST="
set "MAIL_USER="
set "MAIL_PASSWORD="
set "MAIL_FROM="
set "LEADS_NOTIFY_EMAIL="
set "OLLAMA_HOST="
set "BIND_HOST=127.0.0.1"
set "PORT=3000"
echo Grupo SEG System - PREVIA QA LOCAL, nao producao
echo Instalando dependencias travadas e compilando (requer internet)...
call npm ci --no-audit --no-fund
if errorlevel 1 goto :failure
call npm run build
if errorlevel 1 goto :failure
echo Abra http://localhost:3000 no navegador. Pare com Ctrl+C.
node server.mjs
if errorlevel 1 goto :failure
exit /b 0
:neednode
echo Instale Node.js 22 e npm antes de iniciar esta previa.
pause
exit /b 2
:failure
echo Falha no preparo/inicio. Nao confunda a previa com producao.
pause
exit /b 1
