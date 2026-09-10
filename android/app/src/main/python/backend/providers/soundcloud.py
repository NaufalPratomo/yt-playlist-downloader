"""
SoundCloud Provider for MusicGit Downloader Engine.
Extracts tracks and sets directly using yt-dlp native extraction.
"""

import logging
import re
from typing import Any, Dict, List
import yt_dlp

from .base import BaseProvider

logger = logging.getLogger("provider.soundcloud")

SOUNDCLOUD_REGEX = re.compile(r"https?://(?:www\.)?soundcloud\.com/[^/]+/(?:sets/)?[^/?#]+")


class SoundCloudProvider(BaseProvider):
    name = "soundcloud"
    display_name = "SoundCloud"

    def can_handle(self, url: str) -> bool:
        return bool(SOUNDCLOUD_REGEX.search(url))

    def extract_tracklist(self, url: str) -> Dict[str, Any]:
        logger.info(f"Extracting SoundCloud metadata from {url}...")
        ydl_opts = {
            "extract_flat": True,
            "skip_download": True,
            "quiet": True,
            "no_warnings": True,
            "ignoreerrors": True,
            "nocheckcertificate": True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        if not info:
            raise ValueError("Tidak dapat menemukan informasi lagu atau playlist SoundCloud.")

        is_playlist = info.get("_type") == "playlist" or "entries" in info
        title = info.get("title", "SoundCloud Playlist")

        if not is_playlist:
            tracks_raw = [info]
            title = info.get("title", "SoundCloud Track")
        else:
            entries = info.get("entries", [])
            tracks_raw = [e for e in entries if e]

        if not tracks_raw:
            raise ValueError("Playlist SoundCloud ini kosong atau tidak dapat diakses.")

        cover_url = info.get("thumbnail") or ""
        tracks: List[Dict[str, Any]] = []

        for idx, entry in enumerate(tracks_raw, start=1):
            raw_title = entry.get("title") or f"Track {idx}"
            raw_artist = entry.get("uploader") or entry.get("artist") or "SoundCloud Artist"
            duration_sec = float(entry.get("duration") or 0)
            track_url = entry.get("url") or entry.get("webpage_url") or url
            track_thumb = entry.get("thumbnail") or cover_url
            track_id = str(entry.get("id") or f"sc_{idx}")

            tracks.append({
                "index": idx,
                "id": track_id,
                "title": raw_title,
                "artist": raw_artist,
                "album": title if is_playlist else "SoundCloud",
                "duration": duration_sec,
                "thumbnail": track_thumb,
                "provider": "soundcloud",
                "search_query": None,  # Direct download via yt-dlp
                "url": track_url,
            })

        return {
            "provider": "soundcloud",
            "title": title,
            "type": "playlist" if is_playlist else "track",
            "count": len(tracks),
            "cover_url": cover_url,
            "tracks": tracks,
        }
