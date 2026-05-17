@echo off
setlocal
cd /d "%~dp0"
set "CODEX_AUTO_OPEN_BROWSER=0"
set "CODEX_REQUIRE_ADMIN=0"
call npm run harnes:app
