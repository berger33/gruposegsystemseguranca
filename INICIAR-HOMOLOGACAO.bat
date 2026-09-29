@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 goto :neednode
where npm >nul 2>&1
if errorlevel 1 goto :neednode
echo Grupo SEG System - HOMOLOGACAO LOCAL POSTGRESQL DESCARTAVEL (NAO PRODUCAO)
echo Pare o pacote PGlite anterior antes de continuar: porta 3000 deve estar livre.
node scripts\qa-homologacao-local.mjs --preflight
if errorlevel 1 goto :failure
echo Instalando dependencias travadas (internet necessaria na primeira vez)...
call npm ci --no-audit --no-fund
if errorlevel 1 goto :failure
echo Aguarde as 96 migracoes. A URL e acessos ficticios serao mostrados neste terminal.
node scripts\qa-homologacao-local.mjs
if errorlevel 1 goto :failure
exit /b 0
:neednode
echo Instale Node.js 22 e npm. Confira LEIA-ME-HOMOLOGACAO.md.
pause
exit /b 2
:failure
echo Nao foi possivel iniciar ou encerrar corretamente a homologacao. Nenhuma aprovacao funcional deve ser inferida.
pause
exit /b 1
