@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PORT=5501

echo ========================================
echo   Chris-style demo - Local Preview
echo ========================================
echo.
echo URL: http://127.0.0.1:%PORT%/
echo Keep the server window open while viewing.
echo.

start "Chris Style Preview" cmd /k "cd /d "%~dp0" && (py -m http.server %PORT% || python -m http.server %PORT%)"

timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/"

echo Browser opened. Press F5 if the page is blank.
pause
