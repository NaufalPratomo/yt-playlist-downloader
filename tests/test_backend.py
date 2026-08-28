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


if __name__ == "__main__":
    test_metadata_cleaning()
    test_lyrics_fetching()
    test_paths()
    print("\nALL TESTS PASSED SUCCESSFULLY!")
