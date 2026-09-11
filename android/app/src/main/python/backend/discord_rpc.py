"""
Discord Rich Presence (RPC) Manager for MusicGit.
Provides seamless 'Listening to MusicGit' presence on Discord Desktop via local IPC named pipe.
Zero external dependencies (uses standard library struct, json, and named pipe).
"""

import json
import logging
import os
import struct
import sys
import threading
import time
import urllib.parse
import urllib.request
import uuid
from typing import Any, Dict, Optional

logger = logging.getLogger("discord_rpc")

OP_HANDSHAKE = 0
OP_FRAME = 1
OP_CLOSE = 2
OP_PING = 3
OP_PONG = 4

DEFAULT_CLIENT_ID = "1547603041497387099"
DEFAULT_ASSET_KEY = "logo-darkmode-v2"
PUBLIC_LOGO_URL = "https://raw.githubusercontent.com/naufalpratomo/yt-playlist-downloader/main/public/image/logo-darkmode-v2.jpg"

_COVER_CACHE: Dict[str, Optional[str]] = {}


def _is_public_http_url(url: Optional[str]) -> bool:
    if not url:
        return False
    u = url.strip().lower()
    if not (u.startswith("http://") or u.startswith("https://")):
        return False
    local_hosts = ("localhost", "127.0.0.1", "0.0.0.0", "::1", "192.168.", "10.", "172.16.")
    return not any(h in u for h in local_hosts)


def _resolve_online_cover(title: str, artist: str = "") -> Optional[str]:
    """
    Search online public music directories (iTunes / Deezer) for high-resolution album artwork.
    Cached in memory to ensure fast and non-blocking playback.
    """
    clean_title = (title or "").strip()
    clean_artist = (artist or "").strip()
    if not clean_title:
        return None

    cache_key = f"{clean_artist.lower()} - {clean_title.lower()}"
    if cache_key in _COVER_CACHE:
        return _COVER_CACHE[cache_key]

    term = f"{clean_artist} {clean_title}".strip() if clean_artist else clean_title

    # 1. Try iTunes Search API (returns crisp 512x512 official album artwork)
    try:
        query_url = f"https://itunes.apple.com/search?term={urllib.parse.quote(term)}&entity=song&limit=1"
        req = urllib.request.Request(
            query_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
        )
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                results = data.get("results", [])
                if results and "artworkUrl100" in results[0]:
                    art_100 = results[0]["artworkUrl100"]
                    art_512 = art_100.replace("100x100bb.jpg", "512x512bb.jpg")
                    _COVER_CACHE[cache_key] = art_512
                    return art_512
    except Exception as e:
        logger.debug(f"iTunes artwork lookup failed for '{term}': {e}")

    # 2. Try Deezer Search API fallback
    try:
        query_url = f"https://api.deezer.com/search?q={urllib.parse.quote(term)}&limit=1"
        req = urllib.request.Request(
            query_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
        )
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                tracks = data.get("data", [])
                if tracks and "album" in tracks[0]:
                    cover_url = tracks[0]["album"].get("cover_big") or tracks[0]["album"].get("cover_medium")
                    if cover_url:
                        _COVER_CACHE[cache_key] = cover_url
                        return cover_url
    except Exception as e:
        logger.debug(f"Deezer artwork lookup failed for '{term}': {e}")

    _COVER_CACHE[cache_key] = None
    return None


class DiscordRPC:
    def __init__(self):
        self.client_id = DEFAULT_CLIENT_ID
        self.enabled = True
        self._pipe = None
        self._pipe_name = None
        self._connected = False
        self._lock = threading.Lock()
        self._queue = []
        self._worker_thread = None
        self._running = False
        self._last_activity = None
        self._last_update_time = 0
        self._is_windows = sys.platform == "win32"

    def configure(self, client_id: Optional[str] = None, enabled: Optional[bool] = None):
        """Update client ID and enabled state."""
        with self._lock:
            need_reconnect = False
            if client_id is not None:
                clean_id = client_id.strip()
                if clean_id and clean_id != self.client_id:
                    self.client_id = clean_id
                    need_reconnect = True

            if enabled is not None and enabled != self.enabled:
                self.enabled = enabled
                if not self.enabled:
                    self._clear_activity_internal()
                    self._close_pipe()
                    return
                else:
                    need_reconnect = True

            if need_reconnect and self.enabled:
                self._close_pipe()
                if self._last_activity:
                    self._queue.append(self._last_activity)

    def start(self):
        """Start the background worker thread."""
        if not self._is_windows:
            logger.info("Discord RPC is only supported on Windows Desktop.")
            return

        if self._running:
            return

        self._running = True
        self._worker_thread = threading.Thread(target=self._worker_loop, daemon=True, name="DiscordRPCWorker")
        self._worker_thread.start()
        logger.info("Discord RPC background worker started.")

    def stop(self):
        """Stop worker and close connection."""
        self._running = False
        with self._lock:
            self._clear_activity_internal()
            self._close_pipe()

    def update_track(
        self,
        title: str,
        artist: str,
        album: Optional[str] = None,
        duration: Optional[float] = 0,
        current_time: Optional[float] = 0,
        is_playing: bool = True,
        thumbnail: Optional[str] = None,
    ):
        """Queue a track activity update."""
        if not self.enabled or not self._is_windows:
            return

        payload = {
            "title": title or "Music Track",
            "artist": artist or "Various Artists",
            "album": album or "MusicGit",
            "duration": float(duration or 0),
            "current_time": float(current_time or 0),
            "is_playing": bool(is_playing),
            "thumbnail": thumbnail or "",
            "action": "update",
        }

        with self._lock:
            self._last_activity = payload
            self._queue.append(payload)

    def clear(self):
        """Clear the current Discord activity."""
        if not self._is_windows:
            return

        with self._lock:
            self._last_activity = None
            self._queue.append({"action": "clear"})

    # --- Internal IPC implementation ---

    def _find_pipe(self) -> Optional[str]:
        """Locate open Discord named pipe on Windows."""
        for i in range(10):
            pipe_path = rf"\\.\pipe\discord-ipc-{i}"
            if os.path.exists(pipe_path):
                return pipe_path
        return None

    def _connect(self) -> bool:
        """Establish handshake with Discord IPC."""
        if self._connected and self._pipe:
            return True

        self._close_pipe()
        pipe_path = self._find_pipe()
        if not pipe_path:
            return False

        try:
            # Open named pipe with unbuffered binary I/O
            self._pipe = open(pipe_path, "w+b", buffering=0)
            self._pipe_name = pipe_path

            # Send OP_HANDSHAKE
            handshake_payload = json.dumps({"v": 1, "client_id": self.client_id}).encode("utf-8")
            self._send_frame(OP_HANDSHAKE, handshake_payload)

            # Read handshake response
            op, data = self._read_frame(timeout=2.0)
            user_info = data.get("data", {}).get("user", {}) or data.get("user", {})
            if op == OP_FRAME and (user_info or data.get("cmd") == "DISPATCH"):
                self._connected = True
                username = user_info.get("username", "Unknown")
                logger.info(f"Connected to Discord user: {username} via {pipe_path}")
                return True
            else:
                logger.warning(f"Handshake failed with op={op}: {data}")
                self._close_pipe()
                return False
        except Exception as e:
            logger.debug(f"Failed connecting to Discord pipe: {e}")
            self._close_pipe()
            return False

    def _close_pipe(self):
        """Safely close pipe handle."""
        self._connected = False
        if self._pipe:
            try:
                self._pipe.close()
            except Exception:
                pass
            self._pipe = None

    def _send_frame(self, op: int, payload: bytes):
        """Pack and send frame header <II (op, length) + payload."""
        header = struct.pack("<II", op, len(payload))
        self._pipe.write(header + payload)
        self._pipe.flush()

    def _read_frame(self, timeout: float = 1.0) -> tuple:
        """Read frame header and decode JSON payload."""
        if not self._pipe:
            return -1, {}

        # Set read timeout using small loop or direct read
        header = self._pipe.read(8)
        if len(header) < 8:
            return -1, {}

        op, length = struct.unpack("<II", header)
        payload_bytes = self._pipe.read(length)
        if len(payload_bytes) < length:
            return -1, {}

        try:
            return op, json.loads(payload_bytes.decode("utf-8"))
        except Exception:
            return op, {}

    def _send_activity(self, activity_dict: Optional[Dict[str, Any]]) -> bool:
        """Dispatch SET_ACTIVITY command."""
        if not self._connect():
            return False

        try:
            msg = {
                "cmd": "SET_ACTIVITY",
                "args": {
                    "pid": os.getpid(),
                    "activity": activity_dict,
                },
                "nonce": str(uuid.uuid4()),
            }
            payload = json.dumps(msg, ensure_ascii=False).encode("utf-8")
            self._send_frame(OP_FRAME, payload)
            # Read confirmation frame
            op, data = self._read_frame(timeout=1.0)
            return op == OP_FRAME
        except Exception as e:
            logger.warning(f"Error sending Discord activity: {e}")
            self._close_pipe()
            return False

    def _clear_activity_internal(self):
        """Send empty activity to clear status."""
        try:
            if self._connected:
                self._send_activity(None)
        except Exception:
            pass

    def _format_activity_payload(self, item: Dict[str, Any]) -> Dict[str, Any]:
        """Convert track payload into Discord Listening Rich Presence schema."""
        title = item.get("title", "")[:128]
        artist = item.get("artist", "")[:128]
        album = item.get("album", "")[:128]
        duration = item.get("duration", 0)
        current_time = item.get("current_time", 0)
        is_playing = item.get("is_playing", True)
        thumbnail = item.get("thumbnail", "")

        activity = {
            "type": 2,  # ActivityType.LISTENING (2)
            "details": title,
            "state": f"by {artist}" if artist else "MusicGit",
            "instance": True,
        }

        # Handle Timestamps
        now = int(time.time())
        if is_playing:
            start_ts = int(now - current_time) if current_time > 0 else now
            timestamps = {"start": start_ts}
            if duration > 0 and duration > current_time:
                remaining_sec = duration - current_time
                timestamps["end"] = int(now + remaining_sec)
            activity["timestamps"] = timestamps

        # Handle Assets (Cover Art & Tooltips)
        assets = {
            "large_text": f"{title} - {album}" if album else title,
        }

        # Resolve cover image:
        # Check if incoming thumbnail is already a public HTTP/HTTPS URL
        cover_image_url = None
        if _is_public_http_url(thumbnail):
            cover_image_url = thumbnail
        else:
            # Query online music directory for official album artwork
            cover_image_url = _resolve_online_cover(title, artist)

        if cover_image_url:
            # Display song's album art as large_image, and MusicGit logo as small_image badge (Spotify style)
            assets["large_image"] = cover_image_url
            assets["small_image"] = DEFAULT_ASSET_KEY
            assets["small_text"] = "MusicGit"
        else:
            # Fallback if offline or artwork not found: MusicGit logo as large_image
            assets["large_image"] = DEFAULT_ASSET_KEY

        activity["assets"] = assets

        return activity

    def _worker_loop(self):
        """Worker loop processing activity updates in the background."""
        while self._running:
            item = None
            with self._lock:
                if self._queue:
                    # Keep latest item to prevent lag when seeking rapidly
                    item = self._queue.pop(0)

            if item:
                action = item.get("action")
                if action == "clear":
                    self._send_activity(None)
                elif action == "update" and self.enabled:
                    act = self._format_activity_payload(item)
                    success = self._send_activity(act)
                    if not success:
                        # If failed, retry after a short delay
                        time.sleep(1.0)
            else:
                time.sleep(0.3)


# Global singleton instance
discord_rpc = DiscordRPC()
