@echo off
title Build YT Playlist Downloader EXE
cd /d "%~dp0"
echo ========================================================
echo   Membangun File Executable (.exe) Desktop App
echo ========================================================
echo.

echo 1. Membersihkan folder build dan dist lama...
if exist "build" rmdir /s /q "build"
if exist "dist" rmdir /s /q "dist"

echo.
echo 2. Memeriksa dependensi...
pip install -r requirements.txt
pip install pyinstaller

echo.
echo 3. Menjalankan PyInstaller...
pyinstaller --noconfirm --onedir --windowed --name "YTPlaylistDownloader" --icon "app_icon.ico" --add-data "frontend;frontend" --hidden-import "webview" --hidden-import "webview.platforms.winforms" --hidden-import "webview.platforms.edgechromium" --hidden-import "clr" --hidden-import "clr_loader" --hidden-import "pythonnet" --hidden-import "bottle" --hidden-import "proxy_tools" --hidden-import "uvicorn.logging" --hidden-import "uvicorn.loops" --hidden-import "uvicorn.loops.auto" --hidden-import "uvicorn.protocols" --hidden-import "uvicorn.protocols.http" --hidden-import "uvicorn.protocols.http.auto" --hidden-import "uvicorn.protocols.websockets" --hidden-import "uvicorn.protocols.websockets.auto" --hidden-import "mutagen" --hidden-import "mutagen.mp3" --hidden-import "mutagen.id3" --hidden-import "PIL" --hidden-import "yt_dlp" --hidden-import "tkinter" --hidden-import "tkinter.filedialog" run.py

echo.
echo 4. Menyalin ffmpeg.exe ke folder dist...
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe" (
    copy /Y "%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe" "dist\YTPlaylistDownloader\ffmpeg.exe"
) else if exist "ffmpeg.exe" (
    copy /Y "ffmpeg.exe" "dist\YTPlaylistDownloader\ffmpeg.exe"
)

echo.
echo 5. Membuat file ZIP siap rilis untuk GitHub Releases...
if exist "dist\YTPlaylistDownloader.zip" del /f /q "dist\YTPlaylistDownloader.zip"
python -c "import shutil; shutil.make_archive('dist/YTPlaylistDownloader', 'zip', 'dist', 'YTPlaylistDownloader')"

echo.
echo ========================================================
echo   BUILD SELESAI!
echo   Folder App : dist\YTPlaylistDownloader\YTPlaylistDownloader.exe
echo   File Rilis : dist\YTPlaylistDownloader.zip (Upload file ini ke GitHub Releases)
echo ========================================================
pause


