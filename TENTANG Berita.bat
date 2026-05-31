@echo off
title TENTANG Berita - Launcher
color 3F
echo.
echo  ========================================
echo     TENTANG Berita - Launcher
echo  ========================================
echo.
echo  [1] Jalankan CMS Dashboard (tulis artikel)
echo  [2] Jalankan Preview Website
echo  [3] Jalankan Keduanya (CMS + Website)
echo  [4] Keluar
echo.
set /p pilihan="  Pilih (1/2/3/4): "

cd /d "%~dp0"

if "%pilihan%"=="1" (
    start "" "http://localhost:3001"
    node cms/server.js
) else if "%pilihan%"=="2" (
    start "" "http://localhost:4321"
    npx astro dev
) else if "%pilihan%"=="3" (
    echo.
    echo  Memulai CMS + Website...
    start "CMS Server" cmd /c "cd /d "%~dp0" && node cms/server.js"
    timeout /t 2 /nobreak >nul
    start "" "http://localhost:3001"
    start "" "http://localhost:4321"
    npx astro dev
) else (
    exit
)

pause
