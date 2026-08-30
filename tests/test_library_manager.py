"""
Unit tests for LibraryManager in MusicGit.
"""

import json
import os
import sys
import tempfile
from pathlib import Path

# Set standard streams to UTF-8
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.library_manager import LibraryManager


def run_tests():
    print("Testing LibraryManager...")
    manager = LibraryManager()

    with tempfile.TemporaryDirectory() as tmpdir:
        base = Path(tmpdir)

        # 1. Create a playlist folder with a dummy .musicgit.json
        pl1 = base / "Indo Pop"
        pl1.mkdir()
        meta = {
            "title": "Indo Pop Top 50",
            "remote_url": "https://www.youtube.com/playlist?list=PL12345",
            "last_sync": "2026-08-30T00:00:00Z",
            "auto_sync": True,
        }
        with open(pl1 / ".musicgit.json", "w", encoding="utf-8") as f:
            json.dump(meta, f)

        # Create dummy mp3 and lrc
        (pl1 / "01. Judul Lagu - ID123.mp3").write_bytes(b"dummy mp3 data")
        (pl1 / "01. Judul Lagu - ID123.lrc").write_text("[00:10.50] Hello world\n[00:15.00] Second line\n", encoding="utf-8")

        # 2. Create a second playlist without .musicgit.json
        pl2 = base / "Rock Classics"
        pl2.mkdir()
        (pl2 / "Queen - Bohemian Rhapsody.mp3").write_bytes(b"dummy mp3 data 2")

        # Test scan_library
        playlists = manager.scan_library(str(base))
        assert len(playlists) == 2, f"Expected 2 playlists, got {len(playlists)}"
        names = [p["name"] for p in playlists]
        assert "Indo Pop Top 50" in names, "Indo Pop Top 50 not found in scan results"
        assert "Rock Classics" in names, "Rock Classics not found in scan results"
        print("  [OK] scan_library passed.")

        # Test link_playlist_remote
        link_res = manager.link_playlist_remote(
            folder_path=str(pl2),
            remote_url="https://www.youtube.com/playlist?list=PLROCK999",
            playlist_title="Best of Rock",
        )
        assert link_res["success"] is True, "link_playlist_remote returned False"
        assert link_res["metadata"]["title"] == "Best of Rock"
        assert (pl2 / ".musicgit.json").exists(), ".musicgit.json was not created"
        print("  [OK] link_playlist_remote passed.")

        # Test get_playlist_details
        details = manager.get_playlist_details(str(pl1))
        assert details["total_tracks"] == 1
        assert details["tracks"][0]["has_lyrics"] is True
        print("  [OK] get_playlist_details passed.")

        # Test get_track_lyrics
        lyric_res = manager.get_track_lyrics(str(pl1 / "01. Judul Lagu - ID123.mp3"), auto_fetch_online=False)
        assert lyric_res["synced"] is True
        assert len(lyric_res["lines"]) == 2
        assert lyric_res["lines"][0]["text"] == "Hello world"
        assert abs(lyric_res["lines"][0]["time"] - 10.50) < 0.01
        print("  [OK] get_track_lyrics passed.")

    # Test LRC parser
    raw_lrc = "[00:12.34] First lyric\n[01:05.50] Second lyric\nInvalid line\n[01:30.00] Third lyric"
    lines = manager.parse_lrc(raw_lrc)
    assert len(lines) == 3
    assert abs(lines[0]["time"] - 12.34) < 0.01
    assert lines[0]["text"] == "First lyric"
    assert abs(lines[1]["time"] - 65.50) < 0.01
    assert lines[1]["text"] == "Second lyric"
    assert abs(lines[2]["time"] - 90.00) < 0.01
    print("  [OK] parse_lrc passed.")

    print("\nALL LIBRARY MANAGER TESTS PASSED!")


if __name__ == "__main__":
    run_tests()
