"""
Test API endpoints for MusicGit.
"""

import os
import sys
import tempfile
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from backend.app import app

client = TestClient(app)


def test_api_routes():
    # 1. Test /api/config
    res = client.get("/api/config")
    assert res.status_code == 200
    data = res.json()
    assert "default_music_dir" in data

    # 2. Test /api/library/playlists with temporary folder
    with tempfile.TemporaryDirectory() as tmpdir:
        base = Path(tmpdir)
        pl = base / "Pop Indo Hits"
        pl.mkdir()
        (pl / "01. Judul.mp3").write_bytes(b"dummy mp3")

        res = client.get(f"/api/library/playlists?base_dir={tmpdir}")
        assert res.status_code == 200
        playlists = res.json()
        assert len(playlists) == 1
        assert playlists[0]["name"] == "Pop Indo Hits"

        # Test GET /api/library/playlist
        res = client.get(f"/api/library/playlist?folder_path={pl}")
        assert res.status_code == 200
        pl_details = res.json()
        assert pl_details["total_tracks"] == 1

        # Test POST /api/library/link-remote
        res = client.post(
            "/api/library/link-remote",
            json={
                "folder_path": str(pl),
                "remote_url": "https://www.youtube.com/playlist?list=PLTEST123",
                "playlist_title": "Indo Hits 2026",
            },
        )
        assert res.status_code == 200
        assert res.json()["success"] is True


def test_download_target_folder_no_nesting(monkeypatch):
    """
    Ensure that downloading / syncing to an existing playlist folder
    never creates a nested folder (e.g. Playlist/Playlist).
    """
    from backend.downloader import downloader, ACTIVE_JOBS

    # Mock _run_download_process so it doesn't actually download
    monkeypatch.setattr(downloader, "_run_download_process", lambda *args, **kwargs: None)

    with tempfile.TemporaryDirectory() as tmpdir:
        base = Path(tmpdir)
        pl = base / "indo sesi galau"
        pl.mkdir()

        # 1. Test with explicit target_folder
        job_id1 = downloader.start_download_job(
            job_id="test1",
            tracks=[{"id": "abc1", "index": 1, "title": "Song 1", "artist": "Artist 1"}],
            playlist_title="indo sesi galau",
            output_base_dir=str(pl),
            options={
                "target_folder": str(pl),
                "folder_path": str(pl),
                "folder_name": "indo sesi galau",
            },
        )
        assert ACTIVE_JOBS[job_id1]["target_dir"] == str(pl)
        assert not (pl / "indo sesi galau").exists()

        # 2. Test with output_base_dir pointing directly to the playlist folder
        job_id2 = downloader.start_download_job(
            job_id="test2",
            tracks=[{"id": "abc2", "index": 2, "title": "Song 2", "artist": "Artist 2"}],
            playlist_title="indo sesi galau",
            output_base_dir=str(pl),
            options={
                "folder_name": "indo sesi galau",
            },
        )
        assert ACTIVE_JOBS[job_id2]["target_dir"] == str(pl)
        assert not (pl / "indo sesi galau").exists()

        # 3. Test API endpoint /api/download preserves target_folder
        res = client.post(
            "/api/download",
            json={
                "tracks": [{"id": "abc3", "index": 3, "title": "Song 3", "artist": "Artist 3", "selected": True}],
                "playlist_title": "indo sesi galau",
                "output_base_dir": str(pl),
                "target_folder": str(pl),
                "options": {
                    "folder_name": "indo sesi galau",
                    "target_folder": str(pl),
                    "folder_path": str(pl),
                },
            },
        )
        assert res.status_code == 200
        job_id3 = res.json()["job_id"]
        assert ACTIVE_JOBS[job_id3]["target_dir"] == str(pl)
        assert not (pl / "indo sesi galau").exists()

