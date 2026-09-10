"""
Spotify Provider for MusicGit Downloader Engine.
Extracts playlist, album, and track metadata via Spotify public embed endpoints.
No developer accounts or API keys required.
"""

import json
import logging
import re
from typing import Any, Dict, List
import requests

from .base import BaseProvider

logger = logging.getLogger("provider.spotify")

SPOTIFY_URL_REGEX = re.compile(
    r"https?://(?:open\.)?spotify\.com/(?:[a-zA-Z]{2}(?:-[a-zA-Z]{2})?/)?(playlist|album|track)/([a-zA-Z0-9]+)"
)

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
}


class SpotifyProvider(BaseProvider):
    name = "spotify"
    display_name = "Spotify"

    def can_handle(self, url: str) -> bool:
        return bool(SPOTIFY_URL_REGEX.search(url))

    def _extract_cover_url(self, entity: Dict[str, Any]) -> str:
        # 1. Check visualIdentity images (highest resolution)
        vis_images = entity.get("visualIdentity", {}).get("image", [])
        if vis_images:
            sorted_img = sorted(vis_images, key=lambda x: x.get("maxWidth", 0), reverse=True)
            if sorted_img and sorted_img[0].get("url"):
                return sorted_img[0]["url"]

        # 2. Check coverArt sources
        cover_sources = entity.get("coverArt", {}).get("sources", [])
        if cover_sources:
            return cover_sources[0].get("url", "")

        # 3. Check visual url
        vis_url = entity.get("visual", {}).get("url")
        if vis_url:
            return vis_url

        return ""

    def extract_tracklist(self, url: str) -> Dict[str, Any]:
        match = SPOTIFY_URL_REGEX.search(url)
        if not match:
            raise ValueError("URL Spotify tidak valid.")

        media_type = match.group(1).lower()  # 'playlist', 'album', or 'track'
        media_id = match.group(2)

        embed_url = f"https://open.spotify.com/embed/{media_type}/{media_id}"
        logger.info(f"Fetching Spotify metadata from {embed_url}...")

        try:
            resp = requests.get(embed_url, headers=DEFAULT_HEADERS, timeout=12)
            resp.raise_for_status()
        except Exception as e:
            raise ValueError(f"Gagal menghubungi server Spotify: {e}")

        m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', resp.text)
        if not m:
            raise ValueError("Tidak dapat mengekstrak data dari halaman Spotify.")

        try:
            data = json.loads(m.group(1))
            entity = (
                data.get("props", {})
                .get("pageProps", {})
                .get("state", {})
                .get("data", {})
                .get("entity", {})
            )
        except Exception as e:
            raise ValueError(f"Format data Spotify tidak sesuai: {e}")

        if not entity:
            raise ValueError("Konten Spotify tidak ditemukan atau bersifat privat.")

        title = entity.get("name") or entity.get("title") or f"Spotify {media_type.capitalize()}"
        cover_url = self._extract_cover_url(entity)

        tracks: List[Dict[str, Any]] = []

        if media_type == "track":
            # Single track
            track_name = entity.get("title") or entity.get("name") or "Unknown Title"
            artists_list = entity.get("artists", [])
            if artists_list:
                artist_name = ", ".join([a.get("name", "") for a in artists_list if a.get("name")])
            else:
                artist_name = entity.get("subtitle") or "Unknown Artist"

            duration_sec = (entity.get("duration") or 0) / 1000.0
            search_query = f"{artist_name} - {track_name}".strip(" -")

            tracks.append({
                "index": 1,
                "id": media_id,
                "title": track_name,
                "artist": artist_name,
                "album": title,
                "duration": duration_sec,
                "thumbnail": cover_url,
                "provider": "spotify",
                "search_query": search_query,
                "url": url,
            })
        else:
            # Playlist or Album
            raw_tracklist = entity.get("trackList", [])
            if not raw_tracklist:
                raise ValueError("Playlist atau album ini kosong.")

            for idx, item in enumerate(raw_tracklist, start=1):
                track_title = item.get("title") or f"Track {idx}"
                track_artist = item.get("subtitle") or "Unknown Artist"
                duration_sec = (item.get("duration") or 0) / 1000.0
                track_id = item.get("id") or item.get("uri") or f"sp_{idx}"
                search_query = f"{track_artist} - {track_title}".strip(" -")

                tracks.append({
                    "index": idx,
                    "id": str(track_id).replace("spotify:track:", ""),
                    "title": track_title,
                    "artist": track_artist,
                    "album": title,
                    "duration": duration_sec,
                    "thumbnail": cover_url,
                    "provider": "spotify",
                    "search_query": search_query,
                    "url": f"https://open.spotify.com/track/{track_id}" if "spotify:track:" not in str(track_id) else f"https://open.spotify.com/track/{str(track_id).replace('spotify:track:', '')}",
                })

        return {
            "provider": "spotify",
            "title": title,
            "type": media_type,
            "count": len(tracks),
            "cover_url": cover_url,
            "tracks": tracks,
        }
