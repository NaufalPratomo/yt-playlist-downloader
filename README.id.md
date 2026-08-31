<div align="center">

# MusicGit

**Cross-Platform (Desktop & Android) Music Player, Real-Time Synchronized Lyrics, and YouTube Playlist Git-Like Sync Engine**

Unduh playlist atau video YouTube menjadi file MP3 berkualitas tinggi lengkap dengan metadata ID3v2, cover art 1:1, lirik lagu otomatis (.lrc), pemutar musik bawaan (*Built-in Music Player*), tampilan lirik karaoke (*Time-Synced LRC*), sinkronisasi cerdas playlist YouTube (*Git Pull for Music*), serta dukungan penuh untuk **Desktop Windows (.exe)** dan **Android Mobile (.apk)**.

[English](README.md) • [Bahasa Indonesia](README.id.md)

<br/>

[![Download Windows (.exe)](https://img.shields.io/badge/Download_Aplikasi-Windows_(.exe)-0288d1?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/naufalpratomo/yt-playlist-downloader/releases/latest)
[![Download Android (.apk)](https://img.shields.io/badge/Download_Aplikasi-Android_(.apk)-3ddc84?style=for-the-badge&logo=android&logoColor=white)](https://github.com/naufalpratomo/yt-playlist-downloader/releases/latest)
[![Website](https://img.shields.io/badge/Author-Naufal_Pratomo-10b981?style=for-the-badge&logo=googlechrome&logoColor=white)](https://naufalpratomo.my.id)

<br/>

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

MusicGit memperlakukan **YouTube Playlist** seperti *Remote Repository* dan folder musik lokal di PC / Android Anda sebagai *Local Repository*:
- **Remote Mapping**: Setiap folder playlist lokal otomatis menyimpan tautan remote YouTube dalam file metadata `.musicgit.json`.
- **Git Pull / Sync Engine**: Bandingkan perbedaan (*Diff*) antara daftar lagu di YouTube dengan koleksi file lokal. Cukup 1-klik tombol **"Sync with YouTube"** untuk mengunduh lagu-lagu baru yang belum tersimpan di lokal tanpa mengunduh ulang lagu yang sudah ada.
- **Built-in Music Player**: Dengarkan seluruh koleksi musik langsung di dalam aplikasi (Desktop & Mobile) tanpa membutuhkan player pihak ketiga.
- **Real-Time Synchronized Lyrics**: Menampilkan lirik lagu berjalan dengan sorotan baris aktif secara otomatis serta fitur interaktif *click-to-seek* (klik baris lirik untuk langsung melompat ke detik lagu tersebut).
- **Cross-Platform Ready**: Nikmati pengalaman yang sama di Windows PC maupun ponsel pintar Android dengan sinkronisasi penyimpanan lokal (`Music/` folder).

---

## Fitur Utama

### 1. Dukungan Multi-Platform (Desktop Windows & Android APK)
- **Desktop (Windows)**: Aplikasi native ringan menggunakan framework `pywebview` dan server FastAPI lokal.
- **Mobile (Android APK)**: Ditenagai embedded Python engine (`Chaquopy`) yang menjalankan backend FastAPI langsung di dalam perangkat Android.
- **Background Media Playback (Android)**: Dilengkapi Android Foreground Service dan notifikasi media sehingga musik tetap berputar mulus saat layar mati atau berpindah aplikasi.
- **Mobile Responsive UI**: Tampilan adaptif dengan *Bottom Navigation Bar*, *compact player bar*, dan navigasi sentuh yang dioptimalkan untuk layar ponsel.

### 2. Built-in Music Player & Real-time LRC Lyrics (Karaoke Mode)
- Pemutar musik persisten dengan kontrol lengkap: *Play/Pause, Next, Previous, Shuffle, Repeat (All / One / Off), Timeline Seekbar, Volume Booster*.
- Panel lirik bersinkronisasi waktu (*Time-Synced LRC*) dengan auto-scroll dan penanda baris aktif yang elegan.
- **Click-to-Seek**: Klik pada baris lirik mana saja untuk langsung melompat ke detik audio tersebut.
- Antrian putar (*Playback Queue*), tampilan layar penuh lirik (*Full Karaoke View*), dan pintasan keyboard desktop (`Space`, `ArrowLeft/Right`, `ArrowUp/Down`).

### 3. Sinkronisasi Playlist YouTube (Git Pull for Music)
- Tautkan folder playlist lokal ke YouTube Playlist ID / URL.
- Deteksi otomatis lagu baru yang baru saja ditambahkan di YouTube.
- Diff perbandingan status lagu (*Lokal OK* vs *+ Baru*).
- Unduh selektif lagu baru dengan 1-klik saja.

### 4. Downloader Audio Berkualitas Tinggi
- Mendukung tautan playlist YouTube maupun single video.
- Pilihan bitrate MP3: **192 kbps**, **256 kbps**, **320 kbps**, dan **128 kbps**.
- Template penamaan file kustom (`{num}. {title}-{id}.mp3`, `{artist} - {title}.mp3`, dll).
- Real-time progress bar, kecepatan unduh, perkiraan sisa waktu (ETA), dan log aktivitas SSE.

### 5. ID3v2 Metadata & Album Unity
- Otomatis memotong (*center-crop*) cover art resolusi tinggi menjadi rasio 1:1.
- Menulis metadata ID3v2 lengkap: Track Number (`TRCK`), Judul (`TIT2`), Artis (`TPE1`), Album (`TALB`), Artis Album (`TPE2`), dan Tahun rilis (`TDRC`).
- Menggabungkan lagu dalam 1 playlist menjadi 1 album utuh di Windows Media Player / Groove Music / Apple Music / Head Unit Mobil / Pemutar Musik Android.

### 6. Manajer Tag & Perbaikan Folder Lokal (Repair Toolkit)
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

---

### 2. Build Standalone Windows Executable (.exe)

Untuk menghasilkan file `.exe` mandiri beserta arsip `.zip` menggunakan PyInstaller:
```bash
# Double-click build_exe.bat atau jalankan melalui CMD:
build_exe.bat
```
File output akan tersedia di direktori `dist/MusicGit/MusicGit.exe` dan `dist/MusicGit-v2.0-Windows.zip`.

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
> `android/app/build/outputs/apk/debug/app-debug.apk`

---

## Struktur Proyek

```
yt-playlist-downloader/
├── android/                  # Proyek Android Native (Chaquopy + WebView)
│   ├── app/
│   │   ├── build.gradle      # Konfigurasi dependensi Android & Chaquopy Python
│   │   └── src/main/
│   │       ├── AndroidManifest.xml
│   │       ├── java/         # MainActivity & MusicGitBackgroundService
│   │       └── python/       # Runner backend embedded android_server.py
│   ├── build.gradle          # Root Gradle build script
│   └── gradlew.bat           # Gradle wrapper script
├── backend/
│   ├── app.py                # Server FastAPI, endpoint REST & SSE event streaming
│   ├── library_manager.py    # Pemindai library musik, .musicgit metadata, & LRC parser
│   ├── cover_processor.py    # Pemrosesan & center-cropping cover art 1:1
│   ├── downloader.py         # Engine download yt-dlp & playlist diff sync
│   ├── lyrics_fetcher.py     # Integrasi API LRCLIB (lirik plain & .lrc)
│   ├── metadata_tagger.py    # Penulisan tag ID3v2 & album unity
│   └── utils.py              # Helper dialog Windows, deteksi path lintas OS (Win/Android)
├── frontend/
│   ├── assets/
│   │   ├── logo-lightmode.jpg # Logo mode terang & icon aplikasi
│   │   └── logo-darkmode.jpg  # Logo mode gelap
│   ├── app.js                # Logika player, Time-Synced LRC, sync UI, & SSE stream
│   ├── index.html            # Layout desktop & mobile (Sidebar, Bottom Nav, Lyrics, Player)
│   └── style.css             # Tema dark navy glassmorphism & styling mobile responsive
├── public/image/             # Aset gambar & logo master
├── tests/                    # Unit testing (ID3 tagging, Library manager, API endpoints)
├── build_apk.bat             # Skrip otomatis build Android APK (.apk)
├── build_exe.bat             # Skrip otomatis build Windows Executable (.exe & .zip)
├── capacitor.config.json     # Konfigurasi Capacitor cross-platform
├── fix_existing_tags.py      # Skrip CLI perbaikan ID3 tags folder lokal
├── package.json              # Konfigurasi package & scripts Capacitor / Android
├── requirements.txt          # Dependensi Python
├── run.py                    # Launcher aplikasi desktop (pywebview + server)
└── start.bat                 # Skrip launcher cepat untuk development
```

---

## Lisensi & Kontributor

Developed by **[Naufal Pratomo](https://naufalpratomo.my.id)**

Didistribusikan di bawah lisensi MIT. Silakan gunakan, pelajari, dan kembangkan sesuai kebutuhan.