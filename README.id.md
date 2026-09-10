<div align="center">

<img src="public/image/logo-lightmode.jpg" alt="MusicGit Logo" width="120" style="border-radius: 20px;" />

# MusicGit

**Cross-Platform (Desktop Windows & Android) Multi-Provider Music Downloader, Player, Real-Time Synchronized Lyrics, dan Git-Like Sync Engine**

Unduh playlist, album, dan lagu dari **YouTube, Spotify, Deezer, Apple Music, dan SoundCloud** menjadi file MP3 berkualitas tinggi lengkap dengan metadata ID3v2 resmi, cover art kotak 1:1, lirik lagu otomatis (.lrc), kontrol media notification centre & lock screen Android, fitur layar tetap menyala (*Keep Screen Awake*), pemutar musik bawaan (*Built-in Music Player*), tampilan lirik karaoke (*Time-Synced LRC*), serta sinkronisasi cerdas playlist (*Git Pull for Music*).

[English](README.md) • [Bahasa Indonesia](README.id.md)

<br/>

[![Download Windows (.exe)](https://img.shields.io/badge/Download_Aplikasi-Windows_(.exe)-0288d1?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/naufalpratomo/yt-playlist-downloader/releases/latest)
[![Download Android (.apk)](https://img.shields.io/badge/Download_Aplikasi-Android_(.apk)-3ddc84?style=for-the-badge&logo=android&logoColor=white)](https://github.com/naufalpratomo/yt-playlist-downloader/releases/latest)
[![Website](https://img.shields.io/badge/Author-Naufal_Pratomo-10b981?style=for-the-badge&logo=googlechrome&logoColor=white)](https://naufalpratomo.my.id)

<br/>

[![YouTube](https://img.shields.io/badge/YouTube-FF0000?style=flat-square&logo=youtube&logoColor=white)](https://youtube.com/)
[![Spotify](https://img.shields.io/badge/Spotify-1ED760?style=flat-square&logo=spotify&logoColor=white)](https://spotify.com/)
[![Deezer](https://img.shields.io/badge/Deezer-A238FF?style=flat-square&logo=deezer&logoColor=white)](https://deezer.com/)
[![Apple Music](https://img.shields.io/badge/Apple_Music-FA2D48?style=flat-square&logo=apple-music&logoColor=white)](https://music.apple.com/)
[![SoundCloud](https://img.shields.io/badge/SoundCloud-FF5500?style=flat-square&logo=soundcloud&logoColor=white)](https://soundcloud.com/)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue?style=flat-square&logo=python)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Android](https://img.shields.io/badge/Mobile-Android_(Chaquopy)-3ddc84?style=flat-square&logo=android)](https://developer.android.com/)
[![pywebview](https://img.shields.io/badge/GUI-pywebview-4B0082?style=flat-square)](https://pywebview.flowrl.com/)
[![yt-dlp](https://img.shields.io/badge/Engine-yt--dlp-red?style=flat-square)](https://github.com/yt-dlp/yt-dlp)
[![LRCLIB](https://img.shields.io/badge/Lyrics-LRCLIB-blueviolet?style=flat-square)](https://lrclib.net/)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

</div>

---

## Konsep Filosofi MusicGit

MusicGit memperlakukan **Playlist Musik** seperti *Remote Repository* dan folder musik lokal di PC atau ponsel Android Anda sebagai *Local Repository*:
- **Remote Mapping**: Setiap folder playlist lokal otomatis menyimpan tautan remote dalam file metadata `.musicgit.json`.
- **Git Pull / Sync Engine**: Bandingkan perbedaan (*Diff*) antara daftar lagu pada remote playlist dengan koleksi file lokal Anda. Cukup 1-klik tombol **"Sync with YouTube"** untuk mengunduh lagu-lagu baru yang belum tersimpan di lokal tanpa mengunduh ulang lagu yang sudah ada.
- **Dukungan Multi-Provider Universal**: Cukup tempel link dari YouTube, Spotify, Deezer, Apple Music, atau SoundCloud. Sistem secara cerdas mendeteksi platform penyedia, mengekstrak tracklist resmi, dan mengunduh audio dengan akurasi tinggi.
- **Built-in Music Player**: Dengarkan seluruh koleksi musik langsung di dalam aplikasi (Desktop & Mobile) tanpa membutuhkan player pihak ketiga.
- **Real-Time Synchronized Lyrics**: Menampilkan lirik lagu berjalan dengan sorotan baris aktif secara otomatis serta fitur interaktif *click-to-seek* (klik baris lirik untuk langsung melompat ke detik lagu tersebut).
- **Cross-Platform Ready**: Nikmati pengalaman yang konsisten di Windows PC maupun ponsel pintar Android dengan sinkronisasi penyimpanan lokal (`Music/` folder).

---

## Fitur Utama

### 1. Dukungan Multi-Platform (Desktop Windows & Android APK)
- **Desktop (Windows)**: Aplikasi native ringan menggunakan framework `pywebview` dan server FastAPI lokal. Tersedia dalam format installer setup (`.exe`) dan arsip portable (`.zip`).
- **Mobile (Android APK)**: Ditenagai embedded Python engine (`Chaquopy`) yang menjalankan backend FastAPI langsung di dalam perangkat Android. Python dijalankan langsung dari `MainActivity` dengan diagnostik error lengkap dan polling server otomatis.
- **Playback Media & Pusat Notifikasi Android**: Dilengkapi Android Foreground Service dengan kontrol native `MediaSessionCompat` dan `NotificationCompat.MediaStyle` (Previous, Play/Pause, Next, Seekbar, dan Cover Album) pada Pusat Notifikasi dan Layar Kunci Android 13+.
- **Pertahankan Layar Menyala (Keep Screen Awake)**: Fitur *Display Wake Lock* mencegah layar ponsel mati atau meredup otomatis saat lagu sedang berputar.
- **Sistem Ikon 100% SVG**: Seluruh antarmuka menggunakan vektor SVG murni tanpa karakter emoji Unicode, menjamin ketajaman visual di seluruh resolusi layar.
- **Mobile Responsive UI**: Tampilan adaptif dengan *Bottom Navigation Bar*, *compact player bar*, dan navigasi sentuh yang dioptimalkan untuk layar ponsel.
- **Tema Gelap / Terang**: Pergantian tema lengkap dengan pertukaran logo dinamis (aset branding dark mode & light mode), preferensi disimpan via `localStorage`.

### 2. Downloader Musik & Playlist Multi-Provider (v2.3)
- **Spotify**: Ekstraksi playlist, album, dan lagu tunggal melalui decoding schema JSON embed Next.js. Menghasilkan judul bersih, nama artis resmi, urutan lagu, dan cover art kotak 640x640 tanpa memerlukan API key developer Spotify.
- **Deezer**: Terintegrasi langsung dengan API publik Deezer. Mendukung playlist, album, dan track tunggal dengan cover art lossless super jernih 1000x1000 pixels.
- **Apple Music**: Penguraian katalog resmi untuk playlist terkurasi dan album musik.
- **SoundCloud**: Ekstraksi langsung untuk sets/playlist dan lagu tunggal via engine native yt-dlp.
- **YouTube & YouTube Music**: Sinkronisasi diff playlist lengkap, lagu tunggal, dan video Shorts.
- **Pencocokan Audio Cerdas (Audio Matcher)**: Menggunakan algoritma fuzzy search berbobot durasi untuk mencocokkan lagu dari Spotify, Deezer, dan Apple Music ke audio resmi terbaik di YouTube Music.
- **Preservasi Metadata Bersih**: Judul asli, artis, album, nomor track, dan tahun rilis tertanam bersih ke tag ID3v2 tanpa embel-embel judul video.

### 3. Built-in Music Player & Real-time LRC Lyrics (Karaoke Mode)
- Pemutar musik persisten dengan kontrol lengkap: *Play/Pause, Next, Previous, Shuffle, Repeat (All / One / Off), Timeline Seekbar, Volume Booster*.
- Panel lirik bersinkronisasi waktu (*Time-Synced LRC*) dengan auto-scroll dan penanda baris aktif yang elegan.
- **Click-to-Seek**: Klik pada baris lirik mana saja untuk langsung melompat ke detik audio tersebut.
- Antrian putar (*Playback Queue*), tampilan layar penuh lirik (*Full Karaoke View*), dan pintasan keyboard desktop (`Space`, `ArrowLeft/Right`, `ArrowUp/Down`).

### 4. Discord Rich Presence (Listening to MusicGit - Spotify Style)
- **Status Realtime di Discord**: Otomatis menampilkan aktivitas musik yang sedang berputar di profil Discord Desktop Anda ("Listening to MusicGit").
- **Detail Lengkap ala Spotify**: Menampilkan judul lagu yang sedang berputar, nama artis ("by Artis"), nama album, cover art resolusi tinggi, serta seekbar durasi live dengan penunjuk menit elapsed dan remaining secara akurat.
- **Pure Native IPC**: Terhubung langsung ke Discord Desktop melalui Windows Named Pipe (`\\.\pipe\discord-ipc-0`) tanpa dependensi pihak ketiga yang berat dan berjalan non-blocking di latar belakang.
- **Pengaturan Fleksibel**: Aktifkan atau nonaktifkan Discord Rich Presence di menu Pengaturan, serta opsi kustomisasi Discord Application ID sesuai preferensi.

### 5. Sinkronisasi Playlist Universal (Git Pull for Music)
- Tautkan folder playlist lokal ke URL playlist remote (**YouTube, Spotify, Deezer, Apple Music, atau SoundCloud**).
- Deteksi otomatis lagu baru yang baru saja ditambahkan di playlist remote.
- Diff perbandingan status lagu (*Lokal OK* vs *+ Baru*).
- Unduh selektif lagu baru dengan 1-klik melalui engine pencocokan audio cerdas.

### 6. Downloader Audio Berkualitas Tinggi & ID3v2 Metadata
- Pilihan bitrate MP3: **192 kbps**, **256 kbps**, **320 kbps**, dan **128 kbps**.
- Template penamaan file kustom (`{num}. {title}-{id}.mp3`, `{artist} - {title}.mp3`, dll).
- Otomatis memotong (*center-crop*) cover art resolusi tinggi menjadi rasio 1:1.
- Menulis metadata ID3v2 lengkap: Track Number (`TRCK`), Judul (`TIT2`), Artis (`TPE1`), Album (`TALB`), Artis Album (`TPE2`), dan Tahun rilis (`TDRC`).
- Menggabungkan lagu dalam 1 playlist menjadi 1 album utuh di Windows Media Player / Groove Music / Apple Music / Head Unit Mobil / Pemutar Musik Android.

### 7. Manajer Tag & Perbaikan Folder Lokal (Repair Toolkit)
- Inspeksi kesehatan metadata folder musik: deteksi lagu tanpa artis (*Unknown Artist*), tanpa cover art, atau tanpa lirik.
- Perbaikan massal 1-klik untuk menyematkan `cover.jpg` dan mengambil lirik otomatis dari database LRCLIB.

---

## Panduan Menjalankan & Build

### 1. Menjalankan untuk Developer (Source Code - Desktop)

```bash
# Clone repository
git clone https://github.com/naufalpratomo/yt-playlist-downloader.git
cd yt-playlist-downloader

# Install dependensi Python
pip install -r requirements.txt
```

> **Catatan FFmpeg**: Pastikan `ffmpeg.exe` telah terpasang di sistem Anda atau berada di PATH sistem (`winget install Gyan.FFmpeg`), atau letakkan file `ffmpeg.exe` di folder root project.

**Jalankan Aplikasi:**
- **Opsi A (Windows Batch)**: Double-click file `start.bat`.
- **Opsi B (Terminal)**:
  ```bash
  python run.py
  ```
- **Opsi C (Mode Pengembangan Browser dengan Hot Reload)**:
  ```bash
  npm run dev:web
  # atau double-click start_web.bat
  ```

---

### 2. Build Standalone Windows Executable (.exe)

Untuk menghasilkan file `.exe` mandiri, installer setup, dan arsip `.zip`:
```bash
# Double-click build_exe.bat atau jalankan melalui CMD:
build_exe.bat
```
File output akan tersedia di direktori `dist/`:
- Folder portable: `dist/MusicGit/MusicGit.exe`
- File ZIP rilis: `dist/MusicGit-v2.3-Windows.zip`
- File Installer Setup (.exe): `dist/MusicGit-v2.3-Setup.exe` (via Inno Setup)

---

### 3. Build Android APK (.apk)

Aplikasi Android dibangun dengan Gradle dan Chaquopy yang mengemas backend Python & frontend WebView ke dalam APK native.

**Prasyarat:**
- Java Development Kit (JDK 17+)
- Android SDK / Android Studio

**Cara Build:**
- **Opsi A (Skrip Otomatis)**: Double-click `build_apk.bat`.
- **Opsi B (Terminal / Gradle)**:
  ```bash
  cd android
  ./gradlew assembleDebug
  ```

> File APK hasil build akan tersimpan di:
> - `dist/MusicGit-v2.3-Android.apk`
> - `android/app/build/outputs/apk/debug/app-debug.apk`

---

## Struktur Proyek

```
yt-playlist-downloader/
├── android/                  # Proyek Android Native (Chaquopy + WebView)
│   ├── app/
│   │   ├── build.gradle      # Konfigurasi dependensi Android & Chaquopy Python
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       ├── java/         # MainActivity, MediaSessionCompat & BackgroundService
│   │       ├── python/       # Runner backend embedded (android_server.py)
│   │       └── res/          # Ikon launcher (mipmap), tema & konfigurasi XML
│   ├── build.gradle          # Root Gradle build script
│   └── gradlew.bat           # Gradle wrapper script
├── backend/
│   ├── __init__.py           # Penanda package Python
│   ├── app.py                # Server FastAPI, endpoint REST & SSE event streaming
│   ├── audio_matcher.py      # Algoritma pencocokan audio lintas platform & durasi
│   ├── library_manager.py    # Pemindai library musik, .musicgit metadata, & LRC parser
│   ├── cover_processor.py    # Pemrosesan & center-cropping cover art 1:1
│   ├── discord_rpc.py        # Manajer Discord Rich Presence via IPC Windows Named Pipe
│   ├── downloader.py         # Engine download multi-provider & playlist diff sync
│   ├── lyrics_fetcher.py     # Integrasi API LRCLIB (lirik plain & .lrc)
│   ├── metadata_tagger.py    # Penulisan tag ID3v2 & album unity
│   ├── providers/            # Modul multi-provider (Spotify, Apple Music, Deezer, SoundCloud, YouTube)
│   └── utils.py              # Helper dialog Windows, deteksi path lintas OS (Win/Android)
├── frontend/
│   ├── assets/
│   │   ├── logo-lightmode.jpg # Logo mode terang & icon aplikasi
│   │   ├── logo-darkmode.jpg  # Logo mode gelap
│   │   └── MusicGit-logo.png  # Logo fallback legacy
│   ├── app.js                # Logika player, Time-Synced LRC, manajer tema & SSE stream
│   ├── index.html            # Layout desktop & mobile (Sidebar, Bottom Nav, Lyrics, Player)
│   └── style.css             # Tema dark navy glassmorphism & styling mobile responsive
├── public/image/             # Aset branding master (logo-lightmode.jpg, logo-darkmode.jpg)
├── tests/                    # Unit testing (ID3 tagging, Library manager, API endpoints)
├── app_icon.ico              # Ikon Windows multi-resolusi (generated dari logo)
├── build_apk.bat             # Skrip otomatis build Android APK (.apk)
├── build_exe.bat             # Skrip otomatis build Windows Executable (.exe & .zip)
├── fix_existing_tags.py      # Skrip CLI perbaikan ID3 tags folder lokal
├── installer.iss             # Skrip Inno Setup untuk installer Windows
├── package.json              # Konfigurasi package & scripts (dev:web, capacitor)
├── requirements.txt          # Dependensi Python
├── run.py                    # Launcher aplikasi desktop (pywebview + server)
├── start.bat                 # Skrip launcher cepat untuk development desktop
└── start_web.bat             # Skrip launcher cepat untuk mode browser (hot reload)
```

---

## Lisensi & Kontributor

Developed by **[Naufal Pratomo](https://naufalpratomo.my.id)**

Didistribusikan di bawah lisensi MIT. Silakan gunakan, pelajari, dan kembangkan sesuai kebutuhan.