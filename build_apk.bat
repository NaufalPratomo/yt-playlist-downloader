@echo off
title Build MusicGit Android APK
echo ===================================================
echo        MEMULAI BUILD MUSICGIT ANDROID APK
echo ===================================================
echo.

cd /d "%~dp0\android"

if exist gradlew.bat (
    echo Menjalankan Gradle Build APK...
    call gradlew.bat assembleDebug
) else (
    echo Menjalankan Gradle Assemble...
    gradle assembleDebug
)

echo.
echo ===================================================
echo File APK Anda berada di:
echo %~dp0android\app\build\outputs\apk\debug\app-debug.apk
echo ===================================================
pause
