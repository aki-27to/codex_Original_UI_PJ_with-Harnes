@echo off
setlocal

cd /d "%~dp0"
if "%CODEX_PAUSE_ON_EXIT%"=="" set "CODEX_PAUSE_ON_EXIT=1"
if "%CODEX_ENGLISH_CONVERSATION_APP_ROOT%"=="" if exist "%~dp0..\english-conversation-app\index.html" set "CODEX_ENGLISH_CONVERSATION_APP_ROOT=%~dp0..\english-conversation-app"
if "%CODEX_AUTO_OPEN_PATH%"=="" set "CODEX_AUTO_OPEN_PATH=/english-conversation-app/index.html"
if "%CODEX_EXECUTION_PROFILE%"=="" set "CODEX_EXECUTION_PROFILE=english-conversation-ui"

call "%~dp0start_codex_ui.bat" %*
set "EXIT_CODE=%errorlevel%"

endlocal & exit /b %EXIT_CODE%
