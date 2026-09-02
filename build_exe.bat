@echo off
title Build MusicGit Desktop EXE (Windows)
cd /d "%~dp0"
echo ========================================================
echo   Membangun File Executable (.exe) MusicGit Desktop App
echo ========================================================
echo.

echo 1. Membersihkan folder build dan dist lama...
if exist "build" rmdir /s /q "build"
if exist "dist\YTPlaylistDownloader" rmdir /s /q "dist\YTPlaylistDownloader"
if exist "dist\YTPlaylistDownloader.zip" del /f /q "dist\YTPlaylistDownloader.zip"
if exist "dist\MusicGit" rmdir /s /q "dist\MusicGit"
if exist "dist\MusicGit.zip" del /f /q "dist\MusicGit.zip"
if exist "dist\MusicGit-v2.0-Windows.zip" del /f /q "dist\MusicGit-v2.0-Windows.zip"
if exist "dist\MusicGit-v2.2-Windows.zip" del /f /q "dist\MusicGit-v2.2-Windows.zip"

echo.
echo 2. Memeriksa dependensi Python...
pip install -r requirements.txt
pip install pyinstaller

echo.
echo 3. Menjalankan PyInstaller untuk MusicGit...
pyinstaller --noconfirm --onedir --windowed --name "MusicGit" --icon "app_icon.ico" --add-data "frontend;frontend" --hidden-import "webview" --hidden-import "webview.platforms.winforms" --hidden-import "webview.platforms.edgechromium" --hidden-import "clr" --hidden-import "clr_loader" --hidden-import "pythonnet" --hidden-import "bottle" --hidden-import "proxy_tools" --hidden-import "uvicorn.logging" --hidden-import "uvicorn.loops" --hidden-import "uvicorn.loops.auto" --hidden-import "uvicorn.protocols" --hidden-import "uvicorn.protocols.http" --hidden-import "uvicorn.protocols.http.auto" --hidden-import "uvicorn.protocols.websockets" --hidden-import "uvicorn.protocols.websockets.auto" --hidden-import "mutagen" --hidden-import "mutagen.mp3" --hidden-import "mutagen.mp4" --hidden-import "mutagen.id3" --hidden-import "PIL" --hidden-import "yt_dlp" --hidden-import "tkinter" --hidden-import "tkinter.filedialog" run.py

echo.
echo 4. Menyalin ffmpeg.exe ke folder dist\MusicGit...
if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe" (
    copy /Y "%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe" "dist\MusicGit\ffmpeg.exe"
) else if exist "ffmpeg.exe" (
    copy /Y "ffmpeg.exe" "dist\MusicGit\ffmpeg.exe"
)

echo.
echo 5. Menyinkronkan APK Android terbaru jika tersedia...
if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
    copy /Y "android\app\build\outputs\apk\debug\app-debug.apk" "dist\MusicGit-v2.2-Android.apk"
)

echo.
echo.
echo 6. Membuat file ZIP rilis untuk GitHub Releases...
python -c "import shutil; shutil.make_archive('dist/MusicGit-v2.2-Windows', 'zip', 'dist', 'MusicGit')"

echo.
echo 7. Memeriksa Inno Setup untuk membuat file installer Setup (.exe)...
set "ISCC_EXE="
if exist "C:\Program Files (x86)\Inno Setup 6\iscc.exe" set "ISCC_EXE=C:\Program Files (x86)\Inno Setup 6\iscc.exe"
if exist "C:\Program Files\Inno Setup 6\iscc.exe" set "ISCC_EXE=C:\Program Files\Inno Setup 6\iscc.exe"
if exist "%LocalAppData%\Programs\Inno Setup 6\iscc.exe" set "ISCC_EXE=%LocalAppData%\Programs\Inno Setup 6\iscc.exe"

if "%ISCC_EXE%"=="" goto NO_INNO
echo    Inno Setup ditemukan: %ISCC_EXE%
echo    Mengompilasi dist\MusicGit-v2.2-Setup.exe...
"%ISCC_EXE%" installer.iss
echo    File Installer: dist\MusicGit-v2.2-Setup.exe
goto INNO_DONE

:NO_INNO
echo    (Info) Inno Setup tidak terdeteksi. File rilis utama ZIP siap digunakan.

:INNO_DONE

echo.
echo ========================================================
echo   BUILD DESKTOP WINDOWS SELESAI!
echo   Folder App : dist\MusicGit\MusicGit.exe
echo   File ZIP   : dist\MusicGit-v2.2-Windows.zip
if exist "dist\MusicGit-v2.2-Setup.exe" echo   Installer  : dist\MusicGit-v2.2-Setup.exe
echo ========================================================



