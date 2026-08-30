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
    print("Testing MusicGit API Endpoints...")

    # 1. Test /api/config
    res = client.get("/api/config")
    assert res.status_code == 200
    data = res.json()
    assert "default_music_dir" in data
    print("  [OK] /api/config passed.")

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
        print("  [OK] GET /api/library/playlists passed.")

        # Test GET /api/library/playlist
        res = client.get(f"/api/library/playlist?folder_path={pl}")
        assert res.status_code == 200
        pl_details = res.json()
        assert pl_details["total_tracks"] == 1
        print("  [OK] GET /api/library/playlist passed.")

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
        print("  [OK] POST /api/library/link-remote passed.")

    print("\nALL API ENDPOINT TESTS PASSED!")


if __name__ == "__main__":
    test_api_routes()
