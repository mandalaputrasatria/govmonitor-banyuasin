@echo off
title GovMonitor - Sinkronisasi ke GitHub (Main & GH-Pages)
color 0B
echo ================================================================
echo   Sinkronisasi Otomatis GovMonitor Diskoperindag Banyuasin
echo   ke Repositori GitHub: mandalaputrasatria/govmonitor-banyuasin
echo ================================================================
echo.

set "GIT_CMD=C:\Program Files\Git\cmd\git.exe"
if not exist "%GIT_CMD%" set "GIT_CMD=git"

echo 1. Memeriksa status berkas di branch main...
"%GIT_CMD%" checkout main
"%GIT_CMD%" status -s

echo.
echo 2. Menambahkan perubahan ke branch main...
"%GIT_CMD%" add .

set /p COMMIT_MSG="Masukkan catatan pembaruan (Tekan Enter untuk default): "
if "%COMMIT_MSG%"=="" set COMMIT_MSG=Pembaruan sistem GovMonitor Diskoperindag Banyuasin

echo.
echo 3. Menyimpan perubahan ke branch main...
"%GIT_CMD%" commit -m "%COMMIT_MSG%"
"%GIT_CMD%" push origin main

echo.
echo 4. Memperbarui website live di branch gh-pages...
node -e "
const fs = require('fs');
let html = fs.readFileSync('Index.html', 'utf8');
const mockBoot = { success: true, version: '2026.10.07-gh-pages', deployment_url: '', timezone: 'Asia/Jakarta', archive_token: '' };
html = html.replace(/<script id=\"gm-boot-data\" type=\"application\/json\">[\s\S]*?<\/script>/, '<script id=\"gm-boot-data\" type=\"application/json\">' + JSON.stringify(mockBoot) + '</script>');
html = html.replace(/<\?!=?\s*bootJson\s*\?>/g, JSON.stringify(mockBoot));
html = html.replace(/<\?!=\s*include\(['\"]([^'\"]+)['\"]\)\s*;?\s*\?>/g, (m, f) => fs.existsSync(f + '.html') ? fs.readFileSync(f + '.html', 'utf8') : '');
fs.writeFileSync('bundle_temp.html', html, 'utf8');
"

if exist "bundle_temp.html" (
    "%GIT_CMD%" checkout gh-pages
    move /y "bundle_temp.html" "Index.html" >nul
    "%GIT_CMD%" add Index.html
    "%GIT_CMD%" commit -m "Update otomatis website live gh-pages: %COMMIT_MSG%"
    "%GIT_CMD%" push origin gh-pages
    "%GIT_CMD%" checkout main
)

echo.
echo ================================================================
echo   SUKSES! Kode tersimpan di main dan website aktif di gh-pages.
echo ================================================================
pause
