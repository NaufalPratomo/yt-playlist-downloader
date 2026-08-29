"""
Skrip Perbaikan ID3 Metadata untuk Folder Lagu yang Sudah Didownload.
Memperbaiki masalah album terpecah di Windows Media Player dengan menyetel:
- Album Artist (TPE2) = 'Various Artists'
- Compilation Flag (TCMP) = '1'
- Track Numbering (TRCK) = '1/n', '2/n', dst.

Penggunaan:
    python fix_existing_tags.py
    atau
    python fix_existing_tags.py "C:\\Users\\USER\\Music\\MELOW MELOWWWW" "C:\\Users\\USER\\Music\\old but fun 😊"
"""

import os
import sys
from pathlib import Path

# Configure UTF-8 streams for Windows console/terminal
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.metadata_tagger import metadata_tagger
from backend.utils import get_default_music_dir


def fix_folder(folder_path: str, album_name: str = None, album_artist: str = "Various Artists"):
    abs_path = os.path.abspath(folder_path)
    if not os.path.exists(abs_path):
        print(f"❌ Folder tidak ditemukan: {abs_path}")
        return

    print(f"\n📂 Memproses folder: {abs_path}")
    res = metadata_tagger.retag_folder(
        folder_path=abs_path,
        album_name=album_name,
        album_artist=album_artist,
    )

    if res.get("success"):
        print(f"✅ Berhasil! {res['updated_files']} lagu telah digabungkan ke dalam 1 album:")
        print(f"   • Nama Album (TALB) : {res['album']}")
        print(f"   • Artis Album (TPE2): {res['album_artist']}")
        print(f"   • Compilation (TCMP): 1 (Aktif)")
        for item in res.get("details", []):
            print(f"     [{item['track']}] {item['artist']} - {item['title']} ({item['file']})")
    else:
        print(f"❌ Gagal: {res.get('error')}")


def main():
    print("=" * 65)
    print("  YouTube Playlist Downloader - Media Player Album Grouping Fixer")
    print("=" * 65)

    if len(sys.argv) > 1:
        folders = sys.argv[1:]
        for f in folders:
            fix_folder(f)
        return

    default_music = get_default_music_dir()
    print(f"\nFolder Musik Default: {default_music}\n")

    # List subfolders in default music dir if any
    subdirs = []
    if os.path.exists(default_music):
        subdirs = [
            os.path.join(default_music, d)
            for d in os.listdir(default_music)
            if os.path.isdir(os.path.join(default_music, d))
        ]

    if subdirs:
        print("Folder playlist yang terdeteksi di folder Musik Anda:")
        for idx, s in enumerate(subdirs, 1):
            print(f"  [{idx}] {os.path.basename(s)} ({s})")
        print("  [A] Perbaiki SEMUA folder di atas")
        print("  [M] Masukkan path folder secara manual")
        print("  [Q] Keluar")

        choice = input("\nPilih opsi [1-{}, A, M, Q]: ".format(len(subdirs))).strip()

        if choice.lower() == "q":
            print("Dibatalkan.")
            return
        elif choice.lower() == "a":
            for s in subdirs:
                fix_folder(s)
            print("\n🎉 Semua folder selesai diperbaiki! Buka Windows Media Player untuk melihat hasilnya.")
            return
        elif choice.isdigit() and 1 <= int(choice) <= len(subdirs):
            selected = subdirs[int(choice) - 1]
            fix_folder(selected)
            print("\n🎉 Selesai! Buka Windows Media Player untuk melihat hasilnya.")
            return

    # Manual input
    manual_path = input("Masukkan path folder yang ingin diperbaiki: ").strip(' "\'')
    if manual_path:
        fix_folder(manual_path)
    else:
        print("Path folder tidak valid.")


if __name__ == "__main__":
    main()
