@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0piper_secure_install.ps1" %*
set "EXIT_CODE=%errorlevel%"
exit /b %EXIT_CODE%
