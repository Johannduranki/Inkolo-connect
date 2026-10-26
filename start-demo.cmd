@echo off
setlocal
cd /d "%~dp0"
node scripts\docker-demo.mjs %*
exit /b %errorlevel%
