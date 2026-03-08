@echo off
setlocal

cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\bootstrap_english_conversation_app_repo.ps1" %*
set "EXIT_CODE=%errorlevel%"

endlocal & exit /b %EXIT_CODE%
