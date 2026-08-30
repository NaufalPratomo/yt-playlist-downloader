<div align="center">

# MusicGit

**Desktop Music Player, Real-Time Synchronized Lyrics, and YouTube Playlist Git-Like Sync Engine**

Unduh playlist atau video YouTube menjadi file MP3 berkualitas tinggi lengkap dengan metadata ID3v2, cover art 1:1, lirik lagu otomatis (.lrc), pemutar musik desktop bawaan (*Built-in Music Player*), tampilan lirik karaoke (*Time-Synced LRC*), serta fitur sinkronisasi cerdas playlist YouTube (*Git Pull for Music*).

[![Download Windows (.exe)](https://img.shields.io/badge/Download_Aplikasi-Windows_(.exe)-0288d1?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/naufalpratomo/yt-playlist-downloader/releases/latest)
[![Website](https://img.shields.io/badge/Author-Naufal_Pratomo-10b981?style=for-the-badge&logo=googlechrome&logoColor=white)](https://naufalpratomo.my.id)

<br/>

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue?style=flat-square&logo=python)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![pywebview](https://img.shields.io/badge/GUI-pywebview-4B0082?style=flat-square)](https://pywebview.flowrl.com/)
[![yt-dlp](https://img.shields.io/badge/Engine-yt--dlp-red?style=flat-square)](https://github.com/yt-dlp/yt-dlp)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

</div>

---

## Konsep Filosofi MusicGit

MusicGit memperlakukan **YouTube Playlist** seperti *Remote Repository* dan folder musik lokal di PC Anda sebagai *Local Repository*:
- **Remote Mapping**: Setiap folder playlist lokal otomatis menyimpan tautan remote YouTube dalam file `.musicgit.json`.
- **Git Pull / Sync**: Bandingkan perbedaan (*Diff*) antara lagu di YouTube dengan file lokal. Cukup 1-klik tombol **"Sync with YouTube"** untuk mengunduh lagu-lagu baru yang belum tersimpan di lokal tanpa perlu mengunduh ulang yang sudah ada.
- **Built-in Music Player**: Dengarkan seluruh koleksi musik langsung di dalam aplikasi tanpa player pihak ketiga.
- **Real-Time Synchronized Lyrics**: Menampilkan lirik lagu berjalan dengan sorotan baris aktif secara otomatis dan fitur interaktif *click-to-seek* (klik baris lirik untuk langsung lompat ke detik lagu tersebut).

---

## Fitur Utama

### 1. Built-in Desktop Music Player & Real-time LRC Lyrics
- Pemutar musik persisten di bagian bawah aplikasi dengan kontrol lengkap: *Play/Pause, Next, Previous, Shuffle, Repeat (All / One / Off), Timeline Seekbar, Volume Booster*.
- Panel lirik bersinkronisasi waktu (*Time-Synced LRC*) dengan auto-scroll dan penanda baris aktif yang elegan.
- **Click-to-Seek**: Klik pada baris lirik mana saja untuk langsung melompat ke detik audio tersebut.
- Antrian putar (*Playback Queue*) dan pintasan keyboard global (`Space`, `ArrowLeft/Right`, `ArrowUp/Down`).

### 2. Sinkronisasi Playlist YouTube (Git Pull for Music)
- Tautkan playlist lokal ke YouTube Playlist ID / URL.
- Deteksi otomatis lagu baru yang baru saja ditambahkan di YouTube.
- Diff perbandingan status lagu (*Lokal OK* vs *+ Baru*).
- Unduh selektif lagu baru dengan 1 klik saja.

### 3. Downloader Audio Berkualitas Tinggi
- Mendukung tautan playlist YouTube maupun single video.
- Pilihan bitrate MP3: **192 kbps**, **256 kbps**, **320 kbps**, dan **128 kbps**.
- Template penamaan file kustom (`{num}. {title}-{id}.mp3`, `{artist} - {title}.mp3`, dll).
- Real-time progress bar, kecepatan unduh, perkiraan sisa waktu (ETA), dan log aktivitas SSE.

### 4. ID3v2 Metadata & Album Unity
- Otomatis memotong (*center-crop*) cover art resolusi tinggi menjadi rasio 1:1.
- Menulis metadata ID3v2 lengkap: Track Number (`TRCK`), Judul (`TIT2`), Artis (`TPE1`), Album (`TALB`), Artis Album (`TPE2`), dan Tahun rilis (`TDRC`).
- Menggabungkan lagu dalam 1 playlist menjadi 1 album utuh di Windows Media Player / Groove Music / Apple Music / Head Unit Mobil.

### 5. Manajer Tag & Perbaikan Folder Lokal (Repair Toolkit)
- Inspeksi kesehatan metadata folder musik: deteksi lagu tanpa artis (*Unknown Artist*), tanpa cover art, atau tanpa lirik.
- Perbaikan massal 1-klik untuk menyematkan `cover.jpg` dan mengambil lirik otomatis dari database LRCLIB.

---

## Cara Menjalankan untuk Developer (Source Code)

### 1. Clone Repository
```bash
git clone https://github.com/naufalpratomo/yt-playlist-downloader.git
cd yt-playlist-downloader
```

### 2. Install Dependensi
```bash
pip install -r requirements.txt
```

> **Catatan FFmpeg**: Pastikan `ffmpeg.exe` telah terpasang di sistem Anda atau berada di PATH sistem (`winget install Gyan.FFmpeg`), atau letakkan file `ffmpeg.exe` di folder root project.

### 3. Jalankan Aplikasi
- **Opsi A (Windows Batch)**: Double-click file `start.bat`.
- **Opsi B (Terminal)**:
  ```bash
  python run.py
  ```

---

## Struktur Proyek

```
yt-playlist-downloader/
├── backend/
│   ├── app.py                # Server FastAPI & endpoint REST / SSE
│   ├── library_manager.py    # Pemindai library musik, .musicgit metadata, & LRC parser
│   ├── cover_processor.py    # Pemrosesan & cropping cover art 1:1
│   ├── downloader.py         # Engine download yt-dlp & sync playlist
│   ├── lyrics_fetcher.py     # Integrasi API LRCLIB (lirik plain & .lrc)
│   ├── metadata_tagger.py    # Penulisan tag ID3v2 & album unity
│   └── utils.py              # Helper dialog Windows, sanitasi path, dll.
├── frontend/
│   ├── assets/
│   │   └── MusicGit-logo.png # Logo resmi MusicGit
│   ├── app.js                # Logika audio player, LRC lyrics loop, sync UI, & SSE stream
│   ├── index.html            # Layout desktop 4-panel (Sidebar, Main View, Lyrics, Player)
│   └── style.css             # Desain UI modern dark navy glassmorphism (100% SVG)
├── public/image/             # Aset gambar & logo master
├── tests/                    # Unit testing (ID3 tagging, Library manager, API endpoints)
├── build_exe.bat             # Skrip otomatis build PyInstaller ke .exe & .zip
├── fix_existing_tags.py      # Skrip CLI perbaikan ID3 tags folder lokal
├── requirements.txt          # Dependensi Python
├── run.py                    # Launcher aplikasi desktop (pywebview + server)
└── start.bat                 # Skrip launcher cepat untuk development
```

---

## Creator & License

Developed by **[Naufal Pratomo](https://naufalpratomo.my.id)**

Didistribusikan di bawah lisensi MIT. Silakan gunakan, pelajari, dan kembangkan sesuai kebutuhan.
