<div align="center">

# YouTube Playlist Downloader HD & Metadata

Unduh playlist atau lagu YouTube menjadi file MP3 berkualitas tinggi lengkap dengan metadata ID3v2, cover art 1:1, dan lirik lagu otomatis ke dalam folder terorganisir.

[![Download Windows (.exe)](https://img.shields.io/badge/Download_Aplikasi-Windows_(.exe)-4f46e5?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/naufalpratomo/yt-playlist-downloader/releases/latest)
[![Website](https://img.shields.io/badge/Author-Naufal_Pratomo-10b981?style=for-the-badge&logo=googlechrome&logoColor=white)](https://naufalpratomo.my.id)

<br/>

[![Python](https://img.shields.io/badge/Python-3.10%2B-blue?style=flat-square&logo=python)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![yt-dlp](https://img.shields.io/badge/Engine-yt--dlp-red?style=flat-square)](https://github.com/yt-dlp/yt-dlp)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

</div>

---

## 📥 Download Aplikasi Langsung (Siap Pakai)

Bagi pengguna yang ingin langsung memakai aplikasi tanpa perlu menginstall Python:

1. Klik tombol download di bawah untuk mengunduh versi terbaru:
   
   [![Download Windows (.exe)](https://img.shields.io/badge/📥_Download_YT_Playlist_Downloader_(ZIP)-4f46e5?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/naufalpratomo/yt-playlist-downloader/releases/latest)

2. Ekstrak file zip yang didownload.
3. Jalankan **`YTPlaylistDownloader.exe`**.
4. Browser akan otomatis terbuka dan aplikasi siap digunakan!

---

## Fitur Utama

- **Pengorganisasian Folder per Playlist Otomatis**:
  - Setiap playlist otomatis dibuatkan subfolder rapi di folder musik Anda (contoh: `Music\throwback`).
- **Penyematan Cover Art (1:1 Square)**:
  - Otomatis memotong dan menyematkan gambar thumbnail resolusi tinggi ke dalam file MP3 (tampil di Windows Media Player, Spotify Local Files, Apple Music, Head Unit mobil, dll).
  - Opsi menyimpan file `cover.jpg` di dalam folder playlist.
- **ID3v2 Metadata Lengkap**:
  - Track Number (`#`), Judul (`Title`), Nama Penyanyi (`Artist`), Nama Album (`Album`), Tahun rilis.
- **Pengambilan Lirik Lagu Otomatis**:
  - Terintegrasi dengan database lirik tersinkronisasi waktu (`.lrc`) dan plain lyrics (`USLT`).
- **Kualitas Audio Tinggi**:
  - Pilihan bitrate: 192 kbps (Standard HD), 256 kbps (High Quality), 320 kbps (Extreme Ultra).
- **Web UI Modern & Responsif**:
  - Live real-time progress bar, kecepatan download, dan sisa waktu (ETA).
  - Tabel playlist interaktif (edit judul/artis sebelum download, checklist pilih lagu).
  - Tombol instan *"Buka Folder di File Explorer"*.
  - Mini audio player untuk preview lagu yang telah selesai diunduh.

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

> **Catatan FFmpeg**: Pastikan `ffmpeg` telah terpasang di sistem Anda atau berada di PATH sistem (`winget install Gyan.FFmpeg`).

### 3. Jalankan Server
- **Opsi A (Windows Batch)**: Double-click file `start.bat`.
- **Opsi B (Terminal)**:
  ```bash
  python run.py
  ```
Buka browser di `http://127.0.0.1:8585`.

---

## Format Penamaan File yang Didukung

Anda dapat memilih format penamaan file sesuai kebutuhan di menu Pengaturan:
- `{num}. {title}-{id}.mp3` *(Contoh: `1. lowkey-HaZRGYd9mh4.mp3`)*
- `{num}. {title}.mp3` *(Contoh: `1. lowkey.mp3`)*
- `{num2}. {title}.mp3` *(Contoh: `01. lowkey.mp3` - 2 digit)*
- `{artist} - {title}.mp3` *(Contoh: `NIKI - lowkey.mp3`)*
- `{num}. {artist} - {title}.mp3` *(Contoh: `1. NIKI - lowkey.mp3`)*

---

## Membangun File Executable (.exe) Sendiri

Untuk mengompilasi ulang menjadi file `.exe` mandiri kapan saja, cukup jalankan:
```bash
build_exe.bat
```
Hasil build akan otomatis tersedia di folder `dist/YTPlaylistDownloader/`.

---

## Creator & License

Developed with ❤️ by **[Naufal Pratomo](https://naufalpratomo.my.id)**

Didistribusikan di bawah lisensi MIT. Silakan gunakan, pelajari, dan kembangkan sesuai kebutuhan.
