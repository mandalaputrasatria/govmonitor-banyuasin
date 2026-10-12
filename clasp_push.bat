@echo off
title Clasp Push to Google Apps Script - GovMonitor
color 0B
echo ================================================================
echo   Mengirim file ke Google Apps Script (Script ID: 1A0W2XeCW...)...
echo ================================================================
echo.

node "C:\Users\Administrator\AppData\Roaming\npm\node_modules\@google\clasp\build\src\index.js" push -f

echo.
echo ================================================================
echo   Selesai! Buka Google Apps Script dan buat Versi Baru Deployment.
echo ================================================================
pause
