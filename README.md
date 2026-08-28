# YouTube Playlist Downloader HD & Metadata Suite

Aplikasi **YouTube Playlist Downloader** lengkap dengan Web UI modern yang berjalan secara lokal di Windows. Dirancang khusus untuk mengunduh lagu per-playlist ke dalam subfolder tersendiri, dilengkapi ID3 Metadata detail (Artis, Judul, No. Urut, Album), Cover Art HD ter-embed, Lirik (.lrc & embedded), dan kualitas audio HD 192 kbps+.

---

## Fitur Unggulan

1. **Pengorganisasian Folder per Playlist Otomatis**:
   - Setiap playlist akan dibuatkan subfolder khusus di dalam direktori Music Anda (contoh: `Music\throwback`).
2. **Metadata ID3 Lengkap Sesuai Windows File Explorer**:
   - Kolom `#` (Track Number / TRCK)
   - Kolom `Title` (Judul lagu bersih tanpa noise `(Official Video)`)
   - Kolom `Contributing artists` (Nama penyanyi/artis)
   - Kolom `Album` (Nama playlist atau album asli)
   - Kolom `Year` & `Genre`
3. **High-Resolution Cover Art (APIC)**:
   - Thumbnail YouTube diproses ke rasio persegi 1:1 dan di-embed langsung ke file MP3.
   - Opsi menyimpan `cover.jpg` di folder playlist agar ikon folder Windows menampilkan thumbnail.
4. **Pengambilan Lirik Lagu (Synced .lrc & Embedded)**:
   - Terintegrasi dengan database LRCLIB untuk lirik tersinkronisasi waktu (`.lrc`) dan plain lyrics (`USLT`).
5. **Kualitas Audio Tinggi**:
   - Pilihan bitrate: 192 kbps (Standard HD), 256 kbps, 320 kbps (Extreme MP3).
6. **Web UI Glassmorphism Modern**:
   - Live real-time download progress bar, kecepatan download, sisa waktu/ETA.
   - Tabel playlist interaktif (bisa edit judul/artis sebelum download, checklist pilih lagu).
   - Tombol instan *"Buka Folder di File Explorer"*.
   - Mini audio player untuk mendengarkan lagu yang selesai didownload langsung di web UI.

---

## Cara Menjalankan

### Cara 1: Double Klik `start.bat` (Termudah di Windows)
Cukup double-click file `start.bat` di folder project ini. Browser akan otomatis terbuka ke `http://127.0.0.1:8585`.

### Cara 2: Melalui Terminal / Command Prompt
```bash
python run.py
```

---

## Format Penamaan File yang Didukung
Anda dapat memilih atau menyesuaikan template penamaan file di menu Pengaturan:
- `{num}. {title}-{id}.mp3` (Contoh: `1. lowkey-HaZRGYd9mh4.mp3` - persis seperti di Windows Explorer)
- `{num}. {title}.mp3` (Contoh: `1. lowkey.mp3`)
- `{num2}. {title}.mp3` (Contoh: `01. lowkey.mp3`)
- `{artist} - {title}.mp3` (Contoh: `NIKI - lowkey.mp3`)
