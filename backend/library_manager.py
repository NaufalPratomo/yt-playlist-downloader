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
AUDIO_EXTENSIONS = {".mp3", ".m4a", ".aac", ".opus", ".webm", ".flac", ".ogg", ".wav"}


class LibraryManager:
    """Manages local music library, playlist folders, and .musicgit bindings."""

    def __init__(self):
        pass

    def _get_audio_files(self, folder_path: Path) -> List[Path]:
        """List all supported audio files in a directory."""
        if not folder_path.exists() or not folder_path.is_dir():
            return []
        return [f for f in folder_path.iterdir() if f.is_file() and f.suffix.lower() in AUDIO_EXTENSIONS]

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

        # 2. Check root directory for loose audio files
        root_audios = self._get_audio_files(base_path)
        if root_audios:
            root_meta = self._read_musicgit_meta(base_path)
            cover_path = self._find_cover_in_dir(base_path)
            playlists.insert(
                0,
                {
                    "id": "_root_",
                    "name": root_meta.get("title") or "All Tracks (Root Folder)",
                    "folder_path": str(base_path),
                    "track_count": len(root_audios),
                    "has_cover": bool(cover_path),
                    "cover_url": f"/api/library/playlist-cover?folder_path={quote(str(base_path))}" if cover_path else None,
                    "remote_url": root_meta.get("remote_url"),
                    "last_sync": root_meta.get("last_sync"),
                    "auto_sync": root_meta.get("auto_sync", False),
                },
            )

        return playlists

    def heal_nested_playlist_folder(self, folder_path: Path) -> None:
        """
        Detect and heal accidentally nested playlist folders (e.g. from previous sync bugs
        where 'Music/Playlist/Playlist' was created).
        Moves tracks, cover, lrc, and merges .musicgit.json back into the parent playlist folder.
        """
        if not folder_path.exists() or not folder_path.is_dir():
            return

        try:
            for sub in list(folder_path.iterdir()):
                if sub.is_dir() and not sub.name.startswith("."):
                    if (
                        sub.name.lower() == folder_path.name.lower()
                        or sub.name.lower() == sanitize_filename(folder_path.name).lower()
                    ):
                        logger.info(f"Detected nested folder '{sub.name}' inside '{folder_path.name}'. Auto-healing...")
                        nested_meta = self._read_musicgit_meta(sub)
                        parent_meta = self._read_musicgit_meta(folder_path)

                        # Merge metadata
                        if nested_meta.get("remote_url") and not parent_meta.get("remote_url"):
                            parent_meta["remote_url"] = nested_meta["remote_url"]
                        if nested_meta.get("last_sync"):
                            parent_meta["last_sync"] = nested_meta["last_sync"]
                        if nested_meta.get("title") and not parent_meta.get("title"):
                            parent_meta["title"] = nested_meta["title"]
                        if parent_meta:
                            self._write_musicgit_meta(folder_path, parent_meta)

                        # Move files from nested folder to parent folder
                        for item in list(sub.iterdir()):
                            if item.is_file():
                                dest = folder_path / item.name
                                if item.name == ".musicgit.json":
                                    try:
                                        item.unlink()
                                    except Exception:
                                        pass
                                elif not dest.exists():
                                    try:
                                        item.rename(dest)
                                    except Exception as e:
                                        logger.warning(f"Could not move {item} to {dest}: {e}")
                                else:
                                    try:
                                        if item.name.lower().endswith((".mp3", ".lrc")):
                                            item.replace(dest)
                                        else:
                                            item.unlink()
                                    except Exception as e:
                                        logger.warning(f"Could not resolve file {item}: {e}")

                        # Remove empty subfolder
                        try:
                            sub.rmdir()
                            logger.info(f"Successfully healed and removed nested folder: {sub}")
                        except Exception as e:
                            logger.warning(f"Could not remove subfolder {sub}: {e}")
        except Exception as e:
            logger.warning(f"Error during heal_nested_playlist_folder for {folder_path}: {e}")

    def _get_folder_summary(self, folder_path: Path) -> Dict[str, Any]:
        """Summarize a single playlist folder."""
        self.heal_nested_playlist_folder(folder_path)
        meta = self._read_musicgit_meta(folder_path)
        audio_files = self._get_audio_files(folder_path)
        cover_path = self._find_cover_in_dir(folder_path)

        return {
            "id": folder_path.name,
            "name": meta.get("title") or folder_path.name,
            "folder_path": str(folder_path),
            "track_count": len(audio_files),
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
        Get full playlist details including track items with ID3/MP4 metadata.
        """
        folder_path = Path(folder_path_str)
        if not folder_path.exists() or not folder_path.is_dir():
            raise FileNotFoundError(f"Folder not found: {folder_path_str}")

        self.heal_nested_playlist_folder(folder_path)
        meta = self._read_musicgit_meta(folder_path)
        cover_path = self._find_cover_in_dir(folder_path)
        audio_files = sorted(self._get_audio_files(folder_path), key=lambda f: f.name.lower())

        tracks = []
        total_duration = 0

        for idx, audio_f in enumerate(audio_files, start=1):
            track_data = self._read_track_metadata(audio_f, default_idx=idx)
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
        """Read ID3/MP4 tags and lyrics status for an audio file."""
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
                    # ID3 Tags (MP3)
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

                    # MP4 / M4A Tags
                    if "\xa9nam" in tags and tags["\xa9nam"]:
                        title = str(tags["\xa9nam"][0]).strip()
                    if "\xa9ART" in tags and tags["\xa9ART"]:
                        artist = str(tags["\xa9ART"][0]).strip()
                    elif "aART" in tags and tags["aART"]:
                        artist = str(tags["aART"][0]).strip()
                    if "\xa9alb" in tags and tags["\xa9alb"]:
                        album = str(tags["\xa9alb"][0]).strip()
                    if "trkn" in tags and tags["trkn"]:
                        try:
                            track_num = int(tags["trkn"][0][0])
                        except Exception:
                            pass

                    # Check APIC or covr cover
                    if any(k.startswith("APIC") for k in tags.keys()) or "covr" in tags:
                        has_embedded_cover = True

                    # Check USLT or \xa9lyr lyrics
                    if any(k.startswith("USLT") for k in tags.keys()) or "\xa9lyr" in tags:
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
        remote_url: Optional[str] = None,
        playlist_title: Optional[str] = None,
        auto_sync: bool = True,
    ) -> Dict[str, Any]:
        """Link a local playlist folder with a remote YouTube playlist."""
        path = Path(folder_path)
        if not path.exists() or not path.is_dir():
            raise FileNotFoundError(f"Folder not found: {folder_path}")

        meta = self._read_musicgit_meta(path)
        if remote_url is not None and remote_url.strip():
            meta["remote_url"] = remote_url.strip()
        if playlist_title:
            meta["title"] = playlist_title.strip()
        elif "title" not in meta:
            meta["title"] = path.name
        meta["auto_sync"] = auto_sync

        success = self._write_musicgit_meta(path, meta)
        return {"success": success, "folder_path": str(path), "metadata": meta}

    def update_sync_timestamp(self, folder_path: str, timestamp: Optional[str] = None) -> bool:
        """Update last_sync timestamp in .musicgit.json of playlist."""
        path = Path(folder_path)
        if not path.exists() or not path.is_dir():
            return False
        meta = self._read_musicgit_meta(path)
        import time
        meta["last_sync"] = timestamp or time.strftime("%Y-%m-%dT%H:%M:%SZ")
        return self._write_musicgit_meta(path, meta)

    def sync_playlist_lyrics(
        self,
        folder_path_str: str,
        force_refresh: bool = False,
    ) -> Dict[str, Any]:
        """
        Batch sync and download/upgrade synchronized LRC lyrics for all tracks in a playlist folder.
        """
        folder_path = Path(folder_path_str)
        if not folder_path.exists() or not folder_path.is_dir():
            raise FileNotFoundError(f"Folder not found: {folder_path_str}")

        audio_files = sorted(
            [f for f in folder_path.iterdir() if f.is_file() and f.suffix.lower() in [".mp3", ".m4a", ".flac", ".ogg", ".wav"]]
        )

        total_tracks = len(audio_files)
        updated_count = 0
        already_synced = 0
        not_found_count = 0

        for audio_file in audio_files:
            lrc_file = audio_file.with_suffix(".lrc")
            has_valid_lrc = False

            if lrc_file.exists() and not force_refresh:
                try:
                    raw_text = lrc_file.read_text(encoding="utf-8", errors="replace")
                    parsed = self.parse_lrc(raw_text)
                    if parsed and len(parsed) > 0:
                        has_valid_lrc = True
                        already_synced += 1
                except Exception:
                    pass

            if not has_valid_lrc:
                # Fetch lyrics
                title = audio_file.stem
                artist = ""
                try:
                    audio = ID3(str(audio_file))
                    if "TIT2" in audio:
                        title = str(audio["TIT2"])
                    if "TPE1" in audio:
                        artist = str(audio["TPE1"])
                except Exception:
                    pass

                try:
                    online_res = lyrics_fetcher.fetch_lyrics(title=title, artist=artist)
                    synced_lrc = online_res.get("synced_lyrics")
                    if synced_lrc:
                        lrc_file.write_text(synced_lrc, encoding="utf-8")
                        updated_count += 1
                    else:
                        not_found_count += 1
                except Exception as e:
                    logger.warning(f"Failed to fetch lyrics for {audio_file.name}: {e}")
                    not_found_count += 1

        return {
            "success": True,
            "folder_path": str(folder_path),
            "total_tracks": total_tracks,
            "updated_count": updated_count,
            "already_synced": already_synced,
            "not_found_count": not_found_count,
            "message": f"Berhasil menyinkronkan lirik untuk {updated_count + already_synced} dari {total_tracks} lagu.",
        }

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
        Parse LRC & Enhanced LRC format string into ordered list of time/text/words objects.
        Supports:
        1. Enhanced LRC (<mm:ss.xx>word) for precise word timestamps.
        2. Standard line LRC ([mm:ss.xx]line) with intelligent syllable/char-weighted word timing.
        """
        lines = []
        line_time_pattern = re.compile(r"\[(\d{1,2}):(\d{2})(?:[\.:](\d{2,3}))?\]")
        word_time_pattern = re.compile(r"<(\d{1,2}):(\d{2})(?:[\.:](\d{2,3}))?>")

        def _to_seconds(m_str, s_str, f_str):
            minutes = int(m_str)
            seconds = int(s_str)
            frac_str = f_str or "0"
            if len(frac_str) == 2:
                fraction = int(frac_str) / 100.0
            elif len(frac_str) == 3:
                fraction = int(frac_str) / 1000.0
            else:
                fraction = 0.0
            return round(minutes * 60 + seconds + fraction, 2)

        for raw_line in lrc_text.splitlines():
            raw_line = raw_line.strip()
            if not raw_line:
                continue

            matches = list(line_time_pattern.finditer(raw_line))
            if not matches:
                continue

            # Check if this line has word-level timestamps <mm:ss.xx>
            raw_content = line_time_pattern.sub("", raw_line).strip()
            clean_lyric_text = word_time_pattern.sub("", raw_content).strip()

            for m in matches:
                total_seconds = _to_seconds(m.group(1), m.group(2), m.group(3))

                # Extract word timestamps if enhanced LRC
                words = []
                if word_time_pattern.search(raw_content):
                    # Format: <00:12.34>Word1 <00:13.00>Word2
                    parts = re.split(r"(<\d{1,2}:\d{2}(?:[\.:]\d{2,3})?>)", raw_content)
                    current_w_time = total_seconds
                    for p in parts:
                        p = p.strip()
                        if not p:
                            continue
                        wm = word_time_pattern.match(p)
                        if wm:
                            current_w_time = _to_seconds(wm.group(1), wm.group(2), wm.group(3))
                        else:
                            words.append({
                                "time": current_w_time,
                                "text": p,
                            })

                lines.append({
                    "time": total_seconds,
                    "text": clean_lyric_text,
                    "words": words,
                })

        # Sort chronologically
        lines.sort(key=lambda x: x["time"])

        # Compute endTime and word-level timings for all lines
        for i, line in enumerate(lines):
            t_start = line["time"]
            t_next = lines[i + 1]["time"] if (i + 1 < len(lines)) else (t_start + 4.0)
            line_duration = max(0.6, min(14.0, t_next - t_start))
            line["endTime"] = round(t_start + line_duration, 2)

            # If words not explicitly tagged (standard LRC), apply smart syllable/char weighting
            if not line.get("words"):
                raw_words = line["text"].split()
                if raw_words:
                    total_chars = sum(max(1, len(w)) for w in raw_words)
                    curr_time = t_start
                    word_objs = []
                    for w in raw_words:
                        w_weight = max(1, len(w)) / total_chars
                        w_dur = max(0.12, w_weight * line_duration)
                        w_start = round(curr_time, 2)
                        w_end = round(curr_time + w_dur, 2)
                        word_objs.append({
                            "time": w_start,
                            "endTime": w_end,
                            "text": w,
                        })
                        curr_time += w_dur
                    line["words"] = word_objs
                else:
                    line["words"] = []
            else:
                # Ensure each word has endTime
                for wi, w in enumerate(line["words"]):
                    if "endTime" not in w:
                        w_next_time = line["words"][wi + 1]["time"] if (wi + 1 < len(line["words"])) else line["endTime"]
                        w["endTime"] = round(max(w["time"] + 0.1, w_next_time), 2)

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
