"""
Test suite for YouTube Playlist Downloader components.
"""

import os
import sys

# Set standard streams to UTF-8
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.cover_processor import cover_processor
from backend.lyrics_fetcher import lyrics_fetcher
from backend.metadata_tagger import metadata_tagger
from backend.utils import get_default_music_dir, sanitize_filename


def test_metadata_cleaning():
    print("Testing metadata cleaning...")
    t1, a1 = metadata_tagger.clean_title_and_artist("NIKI - lowkey (Official Video)")
    assert t1 == "lowkey", f"Expected 'lowkey', got '{t1}'"
    assert a1 == "NIKI", f"Expected 'NIKI', got '{a1}'"
    print(f"  [OK] Sample 1: [{a1}] - [{t1}]")

    t2, a2 = metadata_tagger.clean_title_and_artist("Dipha Barus - All Good ft. Nadin Amizah (Official Music Video)")
    assert "All Good" in t2, f"Expected 'All Good', got '{t2}'"
    assert "Dipha Barus" in a2, f"Expected 'Dipha Barus', got '{a2}'"
    print(f"  [OK] Sample 2: [{a2}] - [{t2}]")

    t3, a3 = metadata_tagger.clean_title_and_artist("Sweet Talk", raw_uploader="Fitz Leland - Topic")
    assert a3 == "Fitz Leland", f"Expected 'Fitz Leland', got '{a3}'"
    assert t3 == "Sweet Talk", f"Expected 'Sweet Talk', got '{t3}'"
    print(f"  [OK] Sample 3: [{a3}] - [{t3}]")

    t4, a4 = metadata_tagger.clean_title_and_artist("Green Velvet – Booty Call (Vip Remix)")
    assert a4 == "Green Velvet", f"Expected 'Green Velvet', got '{a4}'"
    assert "Booty Call" in t4, f"Expected 'Booty Call', got '{t4}'"
    print(f"  [OK] Sample 4 (En-dash): [{a4}] - [{t4}]")

    t5, a5 = metadata_tagger.clean_title_and_artist("Fisher | Losing It")
    assert a5 == "Fisher", f"Expected 'Fisher', got '{a5}'"
    assert "Losing It" in t5, f"Expected 'Losing It', got '{t5}'"
    print(f"  [OK] Sample 5 (Pipe separator): [{a5}] - [{t5}]")

    t6, a6 = metadata_tagger.clean_title_and_artist("Pop Like This by Alok")
    assert a6 == "Alok", f"Expected 'Alok', got '{a6}'"
    assert "Pop Like This" in t6, f"Expected 'Pop Like This', got '{t6}'"
    print(f"  [OK] Sample 6 (By pattern): [{a6}] - [{t6}]")

    fn = metadata_tagger.format_filename("{num}. {title}-{id}.mp3", 1, "lowkey", "NIKI", "HaZRGYd9mh4")
    assert fn == "1. lowkey-HaZRGYd9mh4.mp3", f"Expected '1. lowkey-HaZRGYd9mh4.mp3', got '{fn}'"
    print(f"  [OK] Filename template format: {fn}")


def test_lyrics_fetching():
    print("\nTesting LRCLIB lyrics fetching...")
    res = lyrics_fetcher.fetch_lyrics(title="lowkey", artist="NIKI")
    assert res.get("synced_lyrics") is not None, "Synced lyrics should not be None"
    print(f"  [OK] Synced lyrics retrieved successfully (Length: {len(res['synced_lyrics'])} chars)")
    print(f"  [OK] First line snippet: {res['synced_lyrics'].splitlines()[0] if res['synced_lyrics'] else ''}")


def test_paths():
    print("\nTesting path and filename sanitization...")
    music_dir = get_default_music_dir()
    print(f"  [OK] Detected Music directory: {music_dir}")
    assert os.path.exists(music_dir)

    sanitized = sanitize_filename('throwback / hits: 2024? *super* "mix"')
    print(f"  [OK] Sanitized folder name: {sanitized}")
    assert "/" not in sanitized and ":" not in sanitized and "?" not in sanitized


def test_scan_and_repair_folder():
    import shutil
    import subprocess
    import tempfile
    from mutagen.id3 import ID3, TIT2, TPE1
    from mutagen.mp3 import MP3

    print("\nTesting folder scanning & repair...")
    temp_dir = tempfile.mkdtemp(prefix="yt_test_music_")
    try:
        f1_path = os.path.join(temp_dir, "01. NIKI - lowkey-HaZRGYd9mh4.mp3")
        f2_path = os.path.join(temp_dir, "02. Green Velvet – Booty Call (Vip Remix)-abc12345678.mp3")

        cmd1 = [
            "ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
            "-t", "1", "-b:a", "192k", f1_path
        ]
        subprocess.run(cmd1, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        shutil.copy(f1_path, f2_path)

        a1 = MP3(f1_path, ID3=ID3)
        if a1.tags is None:
            a1.add_tags()
        a1.tags.add(TIT2(encoding=3, text="lowkey"))
        a1.tags.add(TPE1(encoding=3, text=["NIKI"]))
        a1.save(v2_version=3)

        a2 = MP3(f2_path, ID3=ID3)
        if a2.tags is None:
            a2.add_tags()
        a2.tags.add(TIT2(encoding=3, text="Booty Call (Vip Remix)"))
        a2.tags.add(TPE1(encoding=3, text=["Unknown Artist"]))
        a2.save(v2_version=3)

        # 1. Test scan_folder
        scan_res = metadata_tagger.scan_folder(temp_dir)
        assert scan_res["success"] is True
        assert scan_res["total_files"] == 2
        assert scan_res["issues_summary"]["missing_artists"] >= 1
        print(f"  [OK] Scan detected {scan_res['total_files']} files, {scan_res['issues_summary']['missing_artists']} unknown artist")

        # 2. Test repair_folder_metadata
        repair_res = metadata_tagger.repair_folder_metadata(
            folder_path=temp_dir,
            album_name="Dance Party",
            album_artist="Various Artists",
            auto_fix_artists=True,
            embed_local_cover=False,
            fetch_missing_lyrics=False,
        )
        assert repair_res["success"] is True
        assert repair_res["updated_files"] == 2
        print(f"  [OK] Repair updated {repair_res['updated_files']} files to album '{repair_res['album']}'")

        # Verify repaired tags on f2
        rechecked_a2 = MP3(f2_path, ID3=ID3)
        assert str(rechecked_a2.tags.get("TPE1")) == "Green Velvet"
        assert str(rechecked_a2.tags.get("TALB")) == "Dance Party"
        assert str(rechecked_a2.tags.get("TPE2")) == "Various Artists"
        print("  [OK] Unknown Artist successfully auto-fixed to 'Green Velvet' and album unified!")

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    test_metadata_cleaning()
    test_lyrics_fetching()
    test_paths()
    test_scan_and_repair_folder()
    print("\nALL TESTS PASSED SUCCESSFULLY!")

