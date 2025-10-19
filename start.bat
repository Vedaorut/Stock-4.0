@echo off
setlocal enabledelayedexpansion

echo.
echo ========================================================
echo.
echo    🚀 Telegram Shop Platform
echo.
echo ========================================================
echo.

REM Проверка Node.js
echo 📋 Checking requirements...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Node.js is not installed
    echo.
    echo Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo ✓ Node.js %NODE_VERSION%

REM Проверка npm
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ npm is not installed
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo ✓ npm v%NPM_VERSION%

echo.

REM Проверка .env файлов
echo 📝 Checking configuration files...

if not exist "backend\.env" (
    echo ⚠ backend\.env not found
    if exist "backend\.env.example" (
        copy "backend\.env.example" "backend\.env" >nul 2>nul
        echo ✓ Created backend\.env from .env.example
        echo   Please edit backend\.env with your values
    ) else if exist ".env.example" (
        copy ".env.example" "backend\.env" >nul 2>nul
        echo ✓ Created backend\.env from root .env.example
    ) else (
        echo ❌ No .env.example file found
    )
) else (
    echo ✓ backend\.env exists
)

echo.

REM Проверка зависимостей
echo 📦 Checking dependencies...

set NEED_INSTALL=0

if not exist "node_modules" (
    echo ⚠ Root dependencies not found
    set NEED_INSTALL=1
)

if not exist "backend\node_modules" (
    echo ⚠ Backend dependencies not found
    set NEED_INSTALL=1
)

if not exist "webapp\node_modules" (
    echo ⚠ WebApp dependencies not found
    set NEED_INSTALL=1
)

if !NEED_INSTALL! EQU 1 (
    echo.
    echo 📦 Installing dependencies...
    echo This may take a few minutes...
    echo.

    call npm install

    if not exist "backend\node_modules" (
        echo Installing backend dependencies...
        cd backend
        call npm install
        cd ..
    )

    if not exist "webapp\node_modules" (
        echo Installing webapp dependencies...
        cd webapp
        call npm install
        cd ..
    )

    echo.
    echo ✓ All dependencies installed
) else (
    echo ✓ All dependencies are installed
)

echo.

REM Проверка портов (упрощенная для Windows)
echo 🔌 Checking ports...

netstat -an | find "3000" | find "LISTENING" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo ⚠ Port 3000 is already in use
    echo   Backend may fail to start
) else (
    echo ✓ Port 3000 is available
)

netstat -an | find "5173" | find "LISTENING" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo ⚠ Port 5173 is already in use
    echo   WebApp may use another port
) else (
    echo ✓ Port 5173 is available
)

echo.
echo ========================================================
echo.
echo    🚀 Starting services...
echo.
echo ========================================================
echo.
echo Backend:  http://localhost:3000
echo WebApp:   http://localhost:5173
echo Health:   http://localhost:3000/health
echo.
echo Press Ctrl+C to stop
echo.

REM Запуск
call npm run dev
