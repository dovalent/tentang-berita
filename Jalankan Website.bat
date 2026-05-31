@echo off
title TENTANG Berita - Preview Website
color 2F
echo.
echo  ========================================
echo     TENTANG Berita - Preview Website
echo  ========================================
echo.
echo  Membuka website di browser...
echo.

cd /d "%~dp0"

:: Open browser after 3 seconds
start "" "http://localhost:4321"

:: Start Astro dev server
echo  Website berjalan di http://localhost:4321
echo  Jangan tutup jendela ini saat preview.
echo  Tekan Ctrl+C untuk berhenti.
echo.
npx astro dev

pause
