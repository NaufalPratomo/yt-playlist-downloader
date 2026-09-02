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
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.library_manager import LibraryManager


def test_library_manager_basic():
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

        # Test link_playlist_remote
        link_res = manager.link_playlist_remote(
            folder_path=str(pl2),
            remote_url="https://www.youtube.com/playlist?list=PLROCK999",
            playlist_title="Best of Rock",
        )
        assert link_res["success"] is True, "link_playlist_remote returned False"
        assert link_res["metadata"]["title"] == "Best of Rock"
        assert (pl2 / ".musicgit.json").exists(), ".musicgit.json was not created"

        # Test get_playlist_details
        details = manager.get_playlist_details(str(pl1))
        assert details["total_tracks"] == 1
        assert details["tracks"][0]["has_lyrics"] is True

        # Test get_track_lyrics
        lyric_res = manager.get_track_lyrics(str(pl1 / "01. Judul Lagu - ID123.mp3"), auto_fetch_online=False)
        assert lyric_res["synced"] is True
        assert len(lyric_res["lines"]) == 2
        assert lyric_res["lines"][0]["text"] == "Hello world"
        assert abs(lyric_res["lines"][0]["time"] - 10.50) < 0.01


def test_lrc_parser():
    manager = LibraryManager()
    raw_lrc = "[00:12.34] First lyric\n[01:05.50] Second lyric\nInvalid line\n[01:30.00] Third lyric"
    lines = manager.parse_lrc(raw_lrc)
    assert len(lines) == 3
    assert abs(lines[0]["time"] - 12.34) < 0.01
    assert lines[0]["text"] == "First lyric"
    assert abs(lines[1]["time"] - 65.50) < 0.01
    assert lines[1]["text"] == "Second lyric"
    assert abs(lines[2]["time"] - 90.00) < 0.01


def test_heal_nested_playlist_folder():
    """
    Test that an accidentally nested playlist folder (e.g. Playlist/Playlist/)
    is automatically healed by moving tracks and metadata into parent,
    and removing the nested directory.
    """
    manager = LibraryManager()

    with tempfile.TemporaryDirectory() as tmpdir:
        base = Path(tmpdir)
        parent_pl = base / "indo sesi galau"
        parent_pl.mkdir()

        # Existing tracks in parent
        (parent_pl / "01. Lagu Lama.mp3").write_bytes(b"old track 1")
        (parent_pl / "02. Lagu Lawas.mp3").write_bytes(b"old track 2")

        # Nested folder created by sync bug
        nested_pl = parent_pl / "indo sesi galau"
        nested_pl.mkdir()
        (nested_pl / "14. Yang Patah Tumbuh.mp3").write_bytes(b"new track 14")
        (nested_pl / "14. Yang Patah Tumbuh.lrc").write_text("[00:01.00] Lirik lagu 14", encoding="utf-8")
        (nested_pl / "15. Dunia Tipu-Tipu.mp3").write_bytes(b"new track 15")
        (nested_pl / "cover.jpg").write_bytes(b"dummy image")
        with open(nested_pl / ".musicgit.json", "w", encoding="utf-8") as f:
            json.dump({
                "remote_url": "https://www.youtube.com/playlist?list=PL_TEST",
                "last_sync": "2026-09-02T01:00:00Z"
            }, f)

        # Trigger get_playlist_details which runs auto-healing
        details = manager.get_playlist_details(str(parent_pl))

        # Check that nested folder is removed
        assert not nested_pl.exists(), "Nested folder should have been removed after healing"

        # Check all files are now in parent_pl
        assert (parent_pl / "14. Yang Patah Tumbuh.mp3").exists()
        assert (parent_pl / "14. Yang Patah Tumbuh.lrc").exists()
        assert (parent_pl / "15. Dunia Tipu-Tipu.mp3").exists()
        assert (parent_pl / "cover.jpg").exists()
        assert (parent_pl / ".musicgit.json").exists()

        # Check metadata was merged
        meta = manager._read_musicgit_meta(parent_pl)
        assert meta.get("remote_url") == "https://www.youtube.com/playlist?list=PL_TEST"
        assert meta.get("last_sync") == "2026-09-02T01:00:00Z"

        # Total tracks should be 4 (2 old + 2 newly moved)
        assert details["total_tracks"] == 4

