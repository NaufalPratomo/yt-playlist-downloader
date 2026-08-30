"""
Library Manager for MusicGit.
Manages local playlists, tracks metadata, .musicgit.json remote repository bindings,
and synchronized lyrics parsing for the music player.
"""

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import mutagen
from mutagen.id3 import ID3, APIC, USLT

from .lyrics_fetcher import lyrics_fetcher
from .utils import get_default_music_dir, sanitize_filename

logger = logging.getLogger("library_manager")

COVER_FILENAMES = ["cover.jpg", "cover.png", "folder.jpg", "folder.png", "album.jpg", "album.png", "thumb.jpg"]


class LibraryManager:
    """Manages local music library, playlist folders, and .musicgit bindings."""

    def __init__(self):
        pass

    def scan_library(self, base_dir: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Scan base music folder and discover playlist folders and root songs.
        Returns a list of playlist objects with metadata and track count.
        """
        if not base_dir:
            base_dir = get_default_music_dir()

        base_path = Path(base_dir)
        if not base_path.exists() or not base_path.is_dir():
            return []

        playlists = []

        # 1. Discover subdirectories as playlists
        try:
            subdirs = [p for p in base_path.iterdir() if p.is_dir() and not p.name.startswith(".")]
        except Exception as e:
            logger.error(f"Failed to list directory {base_dir}: {e}")
            return []

        for folder in sorted(subdirs, key=lambda p: p.name.lower()):
            pl_info = self._get_folder_summary(folder)
            if pl_info["track_count"] > 0 or pl_info["remote_url"]:
                playlists.append(pl_info)

        # 2. Check root directory for loose MP3 files
        root_mp3s = list(base_path.glob("*.mp3"))
        if root_mp3s:
            root_meta = self._read_musicgit_meta(base_path)
            cover_path = self._find_cover_in_dir(base_path)
            playlists.insert(
                0,
                {
                    "id": "_root_",
                    "name": root_meta.get("title") or "All Tracks (Root Folder)",
                    "folder_path": str(base_path),
                    "track_count": len(root_mp3s),
                    "has_cover": bool(cover_path),
                    "cover_url": f"/api/library/playlist-cover?folder_path={quote(str(base_path))}" if cover_path else None,
                    "remote_url": root_meta.get("remote_url"),
                    "last_sync": root_meta.get("last_sync"),
                    "auto_sync": root_meta.get("auto_sync", False),
                },
            )

        return playlists

    def _get_folder_summary(self, folder_path: Path) -> Dict[str, Any]:
        """Summarize a single playlist folder."""
        meta = self._read_musicgit_meta(folder_path)
        mp3_files = list(folder_path.glob("*.mp3"))
        cover_path = self._find_cover_in_dir(folder_path)

        return {
            "id": folder_path.name,
            "name": meta.get("title") or folder_path.name,
            "folder_path": str(folder_path),
            "track_count": len(mp3_files),
            "has_cover": bool(cover_path),
            "cover_url": f"/api/library/playlist-cover?folder_path={quote(str(folder_path))}" if cover_path else None,
            "remote_url": meta.get("remote_url"),
            "last_sync": meta.get("last_sync"),
            "auto_sync": meta.get("auto_sync", False),
        }

    def _read_musicgit_meta(self, folder_path: Path) -> Dict[str, Any]:
        """Read .musicgit.json or return empty dict."""
        meta_file = folder_path / ".musicgit.json"
        if meta_file.exists():
            try:
                with open(meta_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to read .musicgit.json in {folder_path}: {e}")
        return {}

    def _write_musicgit_meta(self, folder_path: Path, meta_data: Dict[str, Any]) -> bool:
        """Write .musicgit.json to playlist directory."""
        meta_file = folder_path / ".musicgit.json"
        try:
            with open(meta_file, "w", encoding="utf-8") as f:
                json.dump(meta_data, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            logger.error(f"Failed to write .musicgit.json in {folder_path}: {e}")
            return False

    def _find_cover_in_dir(self, folder_path: Path) -> Optional[Path]:
        """Find local album cover image in directory."""
        for name in COVER_FILENAMES:
            img = folder_path / name
            if img.exists() and img.is_file():
                return img
        return None

    def get_playlist_details(self, folder_path_str: str) -> Dict[str, Any]:
        """
        Get full playlist details including track items with ID3 metadata.
        """
        folder_path = Path(folder_path_str)
        if not folder_path.exists() or not folder_path.is_dir():
            raise FileNotFoundError(f"Folder not found: {folder_path_str}")

        meta = self._read_musicgit_meta(folder_path)
        cover_path = self._find_cover_in_dir(folder_path)
        mp3_files = sorted(folder_path.glob("*.mp3"), key=lambda f: f.name.lower())

        tracks = []
        total_duration = 0

        for idx, mp3 in enumerate(mp3_files, start=1):
            track_data = self._read_track_metadata(mp3, default_idx=idx)
            tracks.append(track_data)
            if track_data.get("duration"):
                total_duration += track_data["duration"]

        return {
            "id": folder_path.name,
            "name": meta.get("title") or folder_path.name,
            "folder_path": str(folder_path),
            "cover_url": f"/api/library/playlist-cover?folder_path={quote(str(folder_path))}" if cover_path else None,
            "remote_url": meta.get("remote_url"),
            "last_sync": meta.get("last_sync"),
            "auto_sync": meta.get("auto_sync", False),
            "total_tracks": len(tracks),
            "total_duration": total_duration,
            "total_duration_formatted": self._format_seconds(total_duration),
            "tracks": tracks,
        }

    def _read_track_metadata(self, file_path: Path, default_idx: int = 1) -> Dict[str, Any]:
        """Read ID3 tags and lyrics status for a single MP3 file."""
        title = file_path.stem
        artist = "Unknown Artist"
        album = file_path.parent.name
        track_num = default_idx
        duration = 0
        has_embedded_cover = False
        has_lyrics = False

        # Check sibling .lrc file
        lrc_file = file_path.with_suffix(".lrc")
        if lrc_file.exists():
            has_lyrics = True

        try:
            audio = mutagen.File(str(file_path))
            if audio:
                if audio.info and hasattr(audio.info, "length"):
                    duration = audio.info.length

                if audio.tags:
                    tags = audio.tags
                    if "TIT2" in tags and str(tags["TIT2"]).strip():
                        title = str(tags["TIT2"]).strip()
                    if "TPE1" in tags and str(tags["TPE1"]).strip():
                        artist = str(tags["TPE1"]).strip()
                    if "TALB" in tags and str(tags["TALB"]).strip():
                        album = str(tags["TALB"]).strip()
                    if "TRCK" in tags:
                        trck_val = str(tags["TRCK"]).split("/")[0]
                        if trck_val.isdigit():
                            track_num = int(trck_val)

                    # Check APIC cover
                    if any(k.startswith("APIC") for k in tags.keys()):
                        has_embedded_cover = True

                    # Check USLT lyrics
                    if any(k.startswith("USLT") for k in tags.keys()):
                        has_lyrics = True
        except Exception as e:
            logger.debug(f"Could not read full tags for {file_path.name}: {e}")

        # Fallback regex parse: "01. Artist - Title" or "Artist - Title"
        if artist == "Unknown Artist":
            match = re.match(r"^(?:\d+[\.\s_-]+)?([^\-]+)\s*-\s*(.+)$", file_path.stem)
            if match:
                artist = match.group(1).strip()
                title = match.group(2).strip()

        return {
            "index": default_idx,
            "track_num": track_num,
            "file_name": file_path.name,
            "file_path": str(file_path),
            "title": title,
            "artist": artist,
            "album": album,
            "duration": duration,
            "duration_formatted": self._format_seconds(duration),
            "has_cover": has_embedded_cover,
            "has_lyrics": has_lyrics,
            "stream_url": f"/api/audio-stream?file_path={quote(str(file_path))}",
            "cover_url": f"/api/library/track-cover?file_path={quote(str(file_path))}",
        }

    def link_playlist_remote(
        self,
        folder_path: str,
        remote_url: str,
        playlist_title: Optional[str] = None,
        auto_sync: bool = True,
    ) -> Dict[str, Any]:
        """Link a local playlist folder with a remote YouTube playlist."""
        path = Path(folder_path)
        if not path.exists() or not path.is_dir():
            raise FileNotFoundError(f"Folder not found: {folder_path}")

        meta = self._read_musicgit_meta(path)
        meta["remote_url"] = remote_url.strip()
        if playlist_title:
            meta["title"] = playlist_title.strip()
        elif "title" not in meta:
            meta["title"] = path.name
        meta["auto_sync"] = auto_sync
        meta["updated_at"] = meta.get("updated_at")

        success = self._write_musicgit_meta(path, meta)
        return {"success": success, "folder_path": str(path), "metadata": meta}

    def update_sync_timestamp(self, folder_path: str, timestamp: str) -> None:
        """Update last_sync field in .musicgit.json."""
        path = Path(folder_path)
        if path.exists():
            meta = self._read_musicgit_meta(path)
            meta["last_sync"] = timestamp
            self._write_musicgit_meta(path, meta)

    def get_track_lyrics(
        self,
        file_path_str: str,
        auto_fetch_online: bool = True,
    ) -> Dict[str, Any]:
        """
        Retrieve synchronized lyrics for an audio file.
        Checks:
        1. Local .lrc file.
        2. ID3 embedded USLT tag.
        3. Online fetcher (LRCLIB) if not found.
        """
        file_path = Path(file_path_str)
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path_str}")

        # 1. Check local .lrc file
        lrc_file = file_path.with_suffix(".lrc")
        if lrc_file.exists():
            try:
                raw_text = lrc_file.read_text(encoding="utf-8", errors="replace")
                lines = self.parse_lrc(raw_text)
                if lines:
                    return {
                        "synced": True,
                        "raw": raw_text,
                        "lines": lines,
                        "source": "local_lrc",
                        "title": file_path.stem,
                    }
            except Exception as e:
                logger.warning(f"Failed to read .lrc file: {e}")

        # 2. Check ID3 USLT tag
        title = file_path.stem
        artist = ""
        try:
            audio = ID3(str(file_path))
            if "TIT2" in audio:
                title = str(audio["TIT2"])
            if "TPE1" in audio:
                artist = str(audio["TPE1"])

            for key in audio.keys():
                if key.startswith("USLT"):
                    uslt_text = audio[key].text
                    lines = self.parse_lrc(uslt_text)
                    is_synced = len(lines) > 0
                    return {
                        "synced": is_synced,
                        "raw": uslt_text,
                        "lines": lines if is_synced else [{"time": 0, "text": l} for l in uslt_text.splitlines() if l.strip()],
                        "source": "id3_uslt",
                        "title": title,
                        "artist": artist,
                    }
        except Exception:
            pass

        # 3. Online fetcher fallback
        if auto_fetch_online:
            try:
                online_res = lyrics_fetcher.fetch_lyrics(title=title, artist=artist)
                synced_lrc = online_res.get("synced_lyrics")
                plain_lrc = online_res.get("plain_lyrics")

                if synced_lrc:
                    lines = self.parse_lrc(synced_lrc)
                    # Automatically save sibling .lrc file for next time
                    try:
                        lrc_file.write_text(synced_lrc, encoding="utf-8")
                    except Exception:
                        pass

                    return {
                        "synced": True,
                        "raw": synced_lrc,
                        "lines": lines,
                        "source": "online_synced",
                        "title": title,
                        "artist": artist,
                    }
                elif plain_lrc:
                    return {
                        "synced": False,
                        "raw": plain_lrc,
                        "lines": [{"time": 0, "text": l} for l in plain_lrc.splitlines() if l.strip()],
                        "source": "online_plain",
                        "title": title,
                        "artist": artist,
                    }
            except Exception as e:
                logger.error(f"Failed online lyrics fetch: {e}")

        return {
            "synced": False,
            "raw": "",
            "lines": [],
            "source": "none",
            "title": title,
            "artist": artist,
        }

    def parse_lrc(self, lrc_text: str) -> List[Dict[str, Any]]:
        """
        Parse LRC format string into ordered list of time/text objects.
        Format: [mm:ss.xx] or [mm:ss:xx] or [mm:ss]
        """
        lines = []
        time_pattern = re.compile(r"\[(\d{1,2}):(\d{2})(?:[\.:](\d{2,3}))?\]")

        for raw_line in lrc_text.splitlines():
            raw_line = raw_line.strip()
            if not raw_line:
                continue

            matches = list(time_pattern.finditer(raw_line))
            if not matches:
                continue

            # Strip all timestamp tags to get pure lyric text
            lyric_text = time_pattern.sub("", raw_line).strip()

            for m in matches:
                minutes = int(m.group(1))
                seconds = int(m.group(2))
                frac_str = m.group(3) or "0"
                if len(frac_str) == 2:
                    fraction = int(frac_str) / 100.0
                elif len(frac_str) == 3:
                    fraction = int(frac_str) / 1000.0
                else:
                    fraction = 0.0

                total_seconds = minutes * 60 + seconds + fraction
                lines.append({"time": round(total_seconds, 2), "text": lyric_text})

        # Sort chronologically
        lines.sort(key=lambda x: x["time"])
        return lines

    def _format_seconds(self, seconds: float) -> str:
        """Format seconds as mm:ss or hh:mm:ss."""
        if not seconds or seconds < 0:
            return "0:00"
        s = int(seconds)
        m, sec = divmod(s, 60)
        h, m = divmod(m, 60)
        if h > 0:
            return f"{h}:{m:02d}:{sec:02d}"
        return f"{m}:{sec:02d}"


library_manager = LibraryManager()
