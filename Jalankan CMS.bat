@echo off
title TENTANG Berita - CMS Dashboard
color 1F
echo.
echo  ========================================
echo     TENTANG Berita - CMS Dashboard
echo  ========================================
echo.
echo  Membuka CMS di browser...
echo.

cd /d "%~dp0"

:: Open browser after 2 seconds
start "" "http://localhost:3001"

:: Start CMS server
echo  Server berjalan di http://localhost:3001
echo  Jangan tutup jendela ini saat menggunakan CMS.
echo  Tekan Ctrl+C untuk berhenti.
echo.
node cms/server.js

pause
