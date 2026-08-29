<div align="center">

# YouTube Playlist Downloader HD & Desktop App

Unduh playlist atau video YouTube menjadi file MP3 berkualitas tinggi lengkap dengan metadata ID3v2, cover art 1:1, lirik lagu otomatis (.lrc), serta fitur inspeksi, perbaikan metadata folder lokal, dan sinkronisasi playlist.

[![Download Windows (.exe)](https://img.shields.io/badge/Download_Aplikasi-Windows_(.exe)-4f46e5?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/naufalpratomo/yt-playlist-downloader/releases/latest)
[![Website](https://img.shields.io/badge/Author-Naufal_Pratomo-10b981?style=for-the-badge&logo=googlechrome&logoColor=white)](https://naufalpratomo.my.id)

<br/>

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue?style=flat-square&logo=python)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![pywebview](https://img.shields.io/badge/GUI-pywebview-4B0082?style=flat-square)](https://pywebview.flowrl.com/)
[![yt-dlp](https://img.shields.io/badge/Engine-yt--dlp-red?style=flat-square)](https://github.com/yt-dlp/yt-dlp)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

</div>

---

## Download Aplikasi Langsung (Siap Pakai)

Bagi pengguna yang ingin langsung memakai aplikasi di Windows tanpa perlu menginstall Python:

1. Unduh paket rilis versi terbaru:
   
   [![Download Windows (.exe)](https://img.shields.io/badge/Download_YT_Playlist_Downloader_(ZIP)-4f46e5?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/naufalpratomo/yt-playlist-downloader/releases/latest)

2. Ekstrak file `.zip` yang telah didownload.
3. Jalankan **`YTPlaylistDownloader.exe`**.
4. Jendela aplikasi desktop akan langsung terbuka dan siap digunakan!

---

## Fitur Unggulan

### 1. Aplikasi Desktop Native & UI Modern
- Tampilan antarmuka desktop mandiri yang elegan menggunakan **pywebview** dan **FastAPI**.
- Dialog pemilihan folder bawaan Windows (*Native File Explorer Folder Picker*).
- Live real-time progress bar, kecepatan download, sisa waktu (ETA), antrian per lagu, dan live log aktivitas.
- Mini audio player terintegrasi untuk mendengarkan preview lagu yang telah selesai diunduh.

### 2. Download Playlist & Single Video YouTube
- Mendukung tautan playlist YouTube maupun single video/musik.
- Pilihan kualitas audio bitrate:
  - **192 kbps** (Standard HD - Default)
  - **256 kbps** (High Quality)
  - **320 kbps** (Extreme Ultra)
  - **128 kbps** (Standar)
- Tabel preview interaktif: checklist pemilihan lagu, pencarian cepat (filter judul/artis), dan pengeditan judul/artis langsung sebelum diunduh.

### 3. Organisasi Folder & Cover Art 1:1
- Setiap playlist otomatis dibuatkan subfolder rapi di folder musik Anda (contoh: `Music\Nama Playlist`).
- Otomatis memotong (*center-crop*) thumbnail resolusi tinggi menjadi rasio 1:1 dan menyematkannya ke tag MP3 (tampil sempurna di Windows Media Player, Groove Music, Spotify Local Files, Apple Music, Head Unit mobil, dll).
- Opsi menyimpan file `cover.jpg` tersendiri di dalam folder playlist.

### 4. ID3v2 Metadata Lengkap & Album Unity
- Menyematkan metadata ID3v2: Track Number (`TRCK`), Judul (`TIT2`), Artis (`TPE1`), Album (`TALB`), Artis Album (`TPE2`), dan Tahun rilis (`TDRC`).
- Otomatis menyetel Album Artist ke `Various Artists` dan Compilation Flag (`TCMP=1`) agar aplikasi pemutar musik seperti Windows Media Player tidak memecah playlist menjadi banyak album terpisah.

### 5. Pengambilan Lirik Otomatis (Synced .lrc & USLT)
- Terintegrasi dengan database **LRCLIB** dengan validasi durasi dan artis yang akurat.
- Menyematkan lirik plain ke dalam metadata MP3 (`USLT`).
- Menyimpan file lirik tersinkronisasi waktu (`.lrc`) di dalam folder lagu untuk pemutar musik yang mendukung synchronized lyrics.

### 6. Manajer & Perbaikan Folder Musik Lokal (Repair Toolkit)
- **Folder Health Scan**: Pindai folder musik lokal yang sudah ada untuk mendeteksi lagu tanpa nama artis (*Unknown Artist*), lagu tanpa cover art, dan lagu tanpa lirik.
- **1-Click Repair**: Perbaiki ID3 tag, satukan playlist menjadi 1 album di Media Player, sematkan `cover.jpg` ke seluruh lagu, dan ambil lirik lagu yang hilang secara massal.
- **CLI Repair Script**: Tersedia skrip `fix_existing_tags.py` untuk perbaikan metadata cepat langsung melalui terminal.

### 7. Sinkronisasi Playlist YouTube (Smart Sync)
- Bandingkan playlist YouTube terbaru dengan isi folder musik lokal Anda.
- Aplikasi secara cerdas mendeteksi lagu mana yang sudah ada dan lagu mana yang baru ditambahkan ke playlist YouTube.
- Tombol satu-klik **"Download Lagu Baru Saja"** untuk mengunduh lagu-lagu baru tanpa perlu mendownload ulang seluruh playlist.

---

## Format Penamaan File yang Didukung

Anda dapat memilih format penamaan file sesuai kebutuhan di menu konfigurasi:
- `{num}. {title}-{id}.mp3` *(Contoh: `1. lowkey-HaZRGYd9mh4.mp3` - Default)*
- `{num}. {title}.mp3` *(Contoh: `1. lowkey.mp3`)*
- `{num2}. {title}.mp3` *(Contoh: `01. lowkey.mp3` - Format 2 digit)*
- `{artist} - {title}.mp3` *(Contoh: `NIKI - lowkey.mp3`)*
- `{num}. {artist} - {title}.mp3` *(Contoh: `1. NIKI - lowkey.mp3`)*

---

## Cara Menjalankan untuk Developer (Source Code)

Jika Anda ingin menjalankan atau memodifikasi kode sumber menggunakan Python:

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

### 4. Menjalankan Alat Perbaikan Metadata via CLI (Opsional)
Untuk memperbaiki metadata folder lokal secara interaktif via CLI:
```bash
python fix_existing_tags.py
```
Atau tentukan path folder secara langsung:
```bash
python fix_existing_tags.py "C:\Users\USER\Music\Nama Folder"
```

---

## Membangun File Executable (.exe) Sendiri

Untuk mengompilasi aplikasi menjadi file executable mandiri (`.exe`) dan membuat paket rilis `.zip`:

```bash
build_exe.bat
```

Skrip ini akan:
1. Membersihkan cache build lama.
2. Mengompilasi aplikasi menggunakan PyInstaller dengan dependensi `pywebview` dan `FastAPI`.
3. Menyalin binary `ffmpeg.exe` dan icon ke dalam folder rilis.
4. Menghasilkan paket zip siap distribusi di `dist/YTPlaylistDownloader.zip`.

---

## Struktur Proyek

```
yt-playlist-downloader/
├── backend/
│   ├── app.py                # Server FastAPI & endpoint REST / SSE
│   ├── cover_processor.py    # Pemrosesan & cropping cover art 1:1
│   ├── downloader.py         # Engine download yt-dlp & sync playlist
│   ├── lyrics_fetcher.py     # Integrasi API LRCLIB (lirik plain & .lrc)
│   ├── metadata_tagger.py    # Penulisan tag ID3v2 & album unity
│   └── utils.py              # Helper dialog Windows, sanitasi path, dll.
├── frontend/
│   ├── app.js                # Logika antarmuka, SSE stream, & event handler
│   ├── index.html            # Struktur tampilan aplikasi
│   └── style.css             # Desain UI modern dark theme
├── app_icon.ico              # Ikon aplikasi
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
