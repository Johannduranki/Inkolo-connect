@echo off
setlocal

set "PROJECT_DIR=%~dp0"
set "NODE_EXE=C:\Users\johan\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

set "ALLOW_DEMO_AUTH=true"
set "FORCE_DEMO_MODE=true"
set "DB_HOST=127.0.0.1"
set "DB_USER=demo"
set "DB_NAME=duranki_demo"
set "ID_PEPPER=local-demo-pepper"
set "JWT_SECRET=local-demo-secret"
set "FRONTEND_ORIGINS=http://127.0.0.1:4200,http://localhost:4200"

if not exist "%NODE_EXE%" (
  echo Node runtime not found: %NODE_EXE%
  exit /b 1
)

start "Duranki Backend API" cmd /k "cd /d ""%PROJECT_DIR%"" && set PORT=3000 && ""%NODE_EXE%"" backend/src/server.js"
start "Duranki Frontend Demo" cmd /k "cd /d ""%PROJECT_DIR%"" && set PORT=4200 && set HOST=127.0.0.1 && set API_TARGET=http://127.0.0.1:3000 && ""%NODE_EXE%"" scripts/local-demo-server.mjs"

echo Duranki demo services are starting.
echo Open http://127.0.0.1:4200/login
