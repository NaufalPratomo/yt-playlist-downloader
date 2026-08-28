@echo off
title Build YT Playlist Downloader EXE
cd /d "%~dp0"
echo ========================================================
echo   Membangun File Executable (.exe) dengan PyInstaller
echo ========================================================
echo.

echo 1. Memeriksa dependensi...
pip install -r requirements.txt
pip install pyinstaller

echo.
echo 2. Menjalankan PyInstaller...
pyinstaller --noconfirm --onedir --windowed --name "YTPlaylistDownloader" --icon "app_icon.ico" --add-data "frontend;frontend" --hidden-import "uvicorn.logging" --hidden-import "uvicorn.loops" --hidden-import "uvicorn.loops.auto" --hidden-import "uvicorn.protocols" --hidden-import "uvicorn.protocols.http" --hidden-import "uvicorn.protocols.http.auto" --hidden-import "uvicorn.protocols.websockets" --hidden-import "uvicorn.protocols.websockets.auto" --hidden-import "mutagen" --hidden-import "mutagen.mp3" --hidden-import "mutagen.id3" --hidden-import "PIL" --hidden-import "yt_dlp" run.py

echo.
echo 3. Menyalin ffmpeg.exe ke folder dist...
copy /Y "%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe" "dist\YTPlaylistDownloader\ffmpeg.exe"

echo.
echo ========================================================
echo   BUILD SELESAI!
echo   File aplikasi berada di: dist\YTPlaylistDownloader\YTPlaylistDownloader.exe
echo ========================================================
pause
