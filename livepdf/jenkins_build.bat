@echo off
REM =========================================================================
REM LivePDF Jenkins Windows Batch Build Script
REM Used in Jenkins Freestyle Jobs with "Execute Windows Batch Command" step
REM =========================================================================

echo [INFO] Starting LivePDF Build on Windows Node...
echo.

echo [1/5] Checking System Prerequisites...
java -version
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Java SDK is not found or not in PATH.
    exit /b 1
)

mvn -version
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Maven is not found in PATH.
)

node -v
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not found or not in PATH.
    exit /b 1
)

python --version
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Python is not found in PATH.
)
echo [OK] System tools checked.
echo.

echo [2/5] Running Maven JUnit CI Tests...
if exist ..\maven-ci (
    cd ..\maven-ci
    call mvn clean test
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Maven JUnit tests failed.
        exit /b 1
    )
    cd ..\livepdf
    echo [OK] Maven JUnit tests passed.
) else (
    echo [INFO] maven-ci directory not found, skipping.
)
echo.

echo [3/5] Building Backend Server...
cd server
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Backend npm install failed.
    exit /b 1
)
cd ..
echo [OK] Backend server dependencies installed.
echo.

echo [4/5] Building Frontend Client...
cd client
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Client npm install failed.
    exit /b 1
)
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Client build failed.
    exit /b 1
)
cd ..
echo [OK] Client build succeeded.
echo.

echo [5/5] Verifying Python Microservice...
cd python
if exist requirements.txt (
    echo [INFO] requirements.txt present.
)
cd ..
echo.

echo =========================================================================
echo [SUCCESS] LivePDF Windows Build Completed Successfully!
echo =========================================================================
