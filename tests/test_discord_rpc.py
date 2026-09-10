"""
Tests for Discord Rich Presence (RPC) in MusicGit.
Zero Unicode emojis.
"""

import os
import sys
import pytest
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from backend.app import app
from backend.discord_rpc import DiscordRPC, discord_rpc

client = TestClient(app)


def test_discord_rpc_unit():
    rpc = DiscordRPC()
    assert rpc.enabled is True
    assert rpc.client_id == "1547603041497387099"

    # Test format activity payload
    payload = {
        "title": "Bohemian Rhapsody",
        "artist": "Queen",
        "album": "A Night at the Opera",
        "duration": 354,
        "current_time": 60,
        "is_playing": True,
        "thumbnail": "https://example.com/cover.jpg",
    }
    activity = rpc._format_activity_payload(payload)
    assert activity["type"] == 2  # ActivityType.LISTENING
    assert activity["details"] == "Bohemian Rhapsody"
    assert activity["state"] == "by Queen"
    assert activity["assets"]["large_image"] == "https://example.com/cover.jpg"
    assert "timestamps" in activity
    assert "start" in activity["timestamps"]
    assert "end" in activity["timestamps"]
    assert activity["timestamps"]["end"] > activity["timestamps"]["start"]

    # Test local / empty thumbnail fallback to registered Discord asset key
    payload["thumbnail"] = "http://localhost:8585/local.jpg"
    activity_local = rpc._format_activity_payload(payload)
    assert activity_local["assets"]["large_image"] == "logo-lightmode"

    # Test paused formatting
    payload["is_playing"] = False
    activity_paused = rpc._format_activity_payload(payload)
    assert "timestamps" not in activity_paused

    # Test configure
    rpc.configure(client_id="999999999999999999", enabled=False)
    assert rpc.client_id == "999999999999999999"
    assert rpc.enabled is False


def test_discord_rpc_api_endpoints():
    # 1. Test POST /api/discord-rpc/update
    res = client.post(
        "/api/discord-rpc/update",
        json={
            "title": "Komang",
            "artist": "Raim Laode",
            "album": "Komang - Single",
            "duration": 210,
            "current_time": 45,
            "is_playing": True,
            "thumbnail": "https://lh3.googleusercontent.com/test",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"

    # 2. Test POST /api/discord-rpc/clear
    res = client.post("/api/discord-rpc/clear")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"


def test_discord_rpc_config_integration():
    # Test GET /api/config contains Discord settings
    res = client.get("/api/config")
    assert res.status_code == 200
    cfg = res.json()
    assert "discord_rpc_enabled" in cfg
    assert "discord_client_id" in cfg

    # Test POST /api/config persists Discord settings
    res = client.post(
        "/api/config",
        json={
            "discord_rpc_enabled": True,
            "discord_client_id": "1547603041497387099",
        },
    )
    assert res.status_code == 200
    saved = res.json()
    assert saved["status"] == "ok"
    assert saved["config"]["discord_rpc_enabled"] is True
