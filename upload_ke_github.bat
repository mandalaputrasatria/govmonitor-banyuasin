@echo off
title GovMonitor - Sinkronisasi ke GitHub
color 0B
echo ================================================================
echo   Sinkronisasi Proyek GovMonitor Diskoperindag Banyuasin
echo   ke Repositori GitHub: mandalaputrasatria/govmonitor-banyuasin
echo ================================================================
echo.

set "GIT_CMD=C:\Program Files\Git\cmd\git.exe"
if not exist "%GIT_CMD%" set "GIT_CMD=git"

echo 1. Memeriksa status berkas...
"%GIT_CMD%" status -s

echo.
echo 2. Menambahkan seluruh perubahan berkas...
"%GIT_CMD%" add .

echo.
set /p COMMIT_MSG="Masukkan pesan perubahan (Tekan Enter untuk pesan default): "
if "%COMMIT_MSG%"=="" set COMMIT_MSG=Pembaruan sistem GovMonitor Diskoperindag Banyuasin

echo.
echo 3. Menyimpan perubahan (commit)...
"%GIT_CMD%" commit -m "%COMMIT_MSG%"

echo.
echo 4. Mengunggah ke GitHub (push main)...
"%GIT_CMD%" push -u origin main

echo.
echo ================================================================
echo   Proses Selesai!
echo ================================================================
pause
