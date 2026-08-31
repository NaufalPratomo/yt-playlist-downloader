@echo off
title MusicGit Web Dev Server
cd /d "%~dp0"
echo ========================================================
echo   MusicGit - Web Dev Testing Server (Auto Reload)
echo ========================================================
echo Server berjalan di http://127.0.0.1:8585
echo Membuka browser...
echo.

start http://127.0.0.1:8585
python -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8585
pause
