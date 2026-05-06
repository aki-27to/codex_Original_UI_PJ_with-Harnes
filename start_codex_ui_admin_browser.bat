@echo off
setlocal
set "CODEX_REQUIRE_ADMIN=1"
set "CODEX_AUTO_OPEN_BROWSER=1"
call "%~dp0start_codex_ui.bat" %*
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
