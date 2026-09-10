"""
Deezer Provider for MusicGit Downloader Engine.
Extracts playlist, album, and track metadata via Deezer's free public REST API.
No developer registration or API keys required.
"""

import logging
import re
from typing import Any, Dict, List
import requests

from .base import BaseProvider

logger = logging.getLogger("provider.deezer")

DEEZER_URL_REGEX = re.compile(
    r"https?://(?:www\.)?deezer\.com/(?:[a-zA-Z]{2}/)?(playlist|album|track)/([0-9]+)"
)
DEEZER_SHORT_REGEX = re.compile(r"https?://deezer\.page\.link/[a-zA-Z0-9]+")

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}


class DeezerProvider(BaseProvider):
    name = "deezer"
    display_name = "Deezer"

    def can_handle(self, url: str) -> bool:
        return bool(DEEZER_URL_REGEX.search(url) or DEEZER_SHORT_REGEX.search(url))

    def _resolve_short_url(self, url: str) -> str:
        if DEEZER_SHORT_REGEX.search(url):
            try:
                resp = requests.head(url, headers=DEFAULT_HEADERS, allow_redirects=True, timeout=8)
                return resp.url
            except Exception as e:
                logger.warning(f"Failed to resolve Deezer short link: {e}")
        return url

    def extract_tracklist(self, url: str) -> Dict[str, Any]:
        resolved_url = self._resolve_short_url(url)
        match = DEEZER_URL_REGEX.search(resolved_url)
        if not match:
            raise ValueError("URL Deezer tidak valid.")

        media_type = match.group(1).lower()  # 'playlist', 'album', or 'track'
        media_id = match.group(2)

        api_url = f"https://api.deezer.com/{media_type}/{media_id}"
        logger.info(f"Fetching Deezer metadata from {api_url}...")

        try:
            resp = requests.get(api_url, headers=DEFAULT_HEADERS, timeout=12)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            raise ValueError(f"Gagal menghubungi server Deezer: {e}")

        if "error" in data:
            err_msg = data["error"].get("message", "Item tidak ditemukan.")
            raise ValueError(f"Deezer: {err_msg}")

        title = data.get("title") or f"Deezer {media_type.capitalize()}"
        cover_url = (
            data.get("picture_xl")
            or data.get("cover_xl")
            or data.get("album", {}).get("cover_xl")
            or data.get("picture_big")
            or data.get("cover_big")
            or ""
        )

        tracks: List[Dict[str, Any]] = []

        if media_type == "track":
            track_title = data.get("title", "Unknown Title")
            artist_name = data.get("artist", {}).get("name", "Unknown Artist")
            album_name = data.get("album", {}).get("title", title)
            duration_sec = float(data.get("duration", 0))
            search_query = f"{artist_name} - {track_title}".strip(" -")

            tracks.append({
                "index": 1,
                "id": str(media_id),
                "title": track_title,
                "artist": artist_name,
                "album": album_name,
                "duration": duration_sec,
                "thumbnail": cover_url,
                "provider": "deezer",
                "search_query": search_query,
                "url": data.get("link") or url,
            })
        else:
            raw_tracks = data.get("tracks", {}).get("data", [])
            if not raw_tracks:
                raise ValueError("Playlist atau album Deezer ini kosong.")

            for idx, item in enumerate(raw_tracks, start=1):
                track_title = item.get("title", f"Track {idx}")
                artist_name = item.get("artist", {}).get("name", "Unknown Artist")
                album_name = title if media_type == "album" else item.get("album", {}).get("title", title)
                duration_sec = float(item.get("duration", 0))
                track_cover = item.get("album", {}).get("cover_xl") or cover_url
                track_id = str(item.get("id", idx))
                search_query = f"{artist_name} - {track_title}".strip(" -")

                tracks.append({
                    "index": idx,
                    "id": track_id,
                    "title": track_title,
                    "artist": artist_name,
                    "album": album_name,
                    "duration": duration_sec,
                    "thumbnail": track_cover,
                    "provider": "deezer",
                    "search_query": search_query,
                    "url": item.get("link") or f"https://www.deezer.com/track/{track_id}",
                })

        return {
            "provider": "deezer",
            "title": title,
            "type": media_type,
            "count": len(tracks),
            "cover_url": cover_url,
            "tracks": tracks,
        }
