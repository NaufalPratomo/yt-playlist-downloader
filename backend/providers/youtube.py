"""
YouTube Provider for MusicGit Downloader Engine.
Extracts YouTube playlists, music albums, and single videos using yt-dlp.
"""

import logging
import re
from typing import Any, Dict, List
import yt_dlp

from .base import BaseProvider
from ..metadata_tagger import metadata_tagger

logger = logging.getLogger("provider.youtube")

YOUTUBE_REGEX = re.compile(
    r"(https?://)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)/(watch\?v=|playlist\?list=|embed/|v/|shorts/)?([a-zA-Z0-9_-]+)"
)

DEFAULT_EXTRACTOR_ARGS = {
    "youtube": {
        "player_client": ["android", "ios", "mweb", "web"],
    }
}


class YouTubeProvider(BaseProvider):
    name = "youtube"
    display_name = "YouTube"

    def can_handle(self, url: str) -> bool:
        return bool(YOUTUBE_REGEX.search(url)) or "youtube.com" in url or "youtu.be" in url

    def extract_tracklist(self, url: str) -> Dict[str, Any]:
        logger.info(f"Extracting YouTube metadata from {url}...")
        ydl_opts = {
            "extract_flat": True,
            "skip_download": True,
            "quiet": True,
            "no_warnings": True,
            "ignoreerrors": True,
            "nocheckcertificate": True,
            "geo_bypass": True,
            "extractor_args": DEFAULT_EXTRACTOR_ARGS,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        if not info:
            raise ValueError("Tidak dapat menemukan informasi playlist atau video YouTube.")

        is_playlist = info.get("_type") == "playlist" or "entries" in info
        playlist_title = info.get("title", "YouTube Playlist")

        if not is_playlist:
            tracks_raw = [info]
            playlist_title = info.get("title", "YouTube Downloads")
        else:
            entries = info.get("entries", [])
            tracks_raw = [e for e in entries if e]

        tracks: List[Dict[str, Any]] = []
        for idx, entry in enumerate(tracks_raw, start=1):
            raw_title = entry.get("title", "Unknown Title")
            raw_artist = (
                entry.get("artist")
                or entry.get("creator")
                or entry.get("uploader")
                or entry.get("channel")
            )
            raw_uploader = entry.get("uploader") or entry.get("channel")

            clean_title, clean_artist = metadata_tagger.clean_title_and_artist(
                raw_title, raw_artist=raw_artist, raw_uploader=raw_uploader
            )

            thumbnail = entry.get("thumbnail") or ""
            if not thumbnail and entry.get("thumbnails"):
                thumbs = entry.get("thumbnails", [])
                if thumbs:
                    thumbnail = thumbs[-1].get("url", "")

            video_id = entry.get("id") or ""
            if not thumbnail and video_id:
                thumbnail = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"

            duration = float(entry.get("duration") or 0)
            track_url = f"https://www.youtube.com/watch?v={video_id}" if video_id else entry.get("url", "")

            tracks.append({
                "index": idx,
                "id": video_id,
                "url": track_url,
                "raw_title": raw_title,
                "title": clean_title,
                "artist": clean_artist,
                "album": playlist_title,
                "duration": duration,
                "thumbnail": thumbnail,
                "provider": "youtube",
                "search_query": None,  # Direct download
            })

        return {
            "provider": "youtube",
            "title": playlist_title,
            "type": "playlist" if is_playlist else "track",
            "count": len(tracks),
            "cover_url": tracks[0]["thumbnail"] if tracks else "",
            "tracks": tracks,
        }
