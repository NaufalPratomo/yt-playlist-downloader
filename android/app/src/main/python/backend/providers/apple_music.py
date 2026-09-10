"""
Apple Music Provider for MusicGit Downloader Engine.
Extracts playlist, album, and song metadata directly from Apple Music web catalog.
No developer account or API keys required.
"""

import json
import logging
import re
from typing import Any, Dict, List
import requests

from .base import BaseProvider

logger = logging.getLogger("provider.apple_music")

APPLE_MUSIC_REGEX = re.compile(
    r"https?://music\.apple\.com/(?:[a-zA-Z]{2}/)?(playlist|album|song)/([^/?#]+)(?:/([0-9]+))?"
)

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}


class AppleMusicProvider(BaseProvider):
    name = "apple_music"
    display_name = "Apple Music"

    def can_handle(self, url: str) -> bool:
        return bool(APPLE_MUSIC_REGEX.search(url))

    def extract_tracklist(self, url: str) -> Dict[str, Any]:
        match = APPLE_MUSIC_REGEX.search(url)
        if not match:
            raise ValueError("URL Apple Music tidak valid.")

        logger.info(f"Fetching Apple Music metadata from {url}...")
        try:
            resp = requests.get(url, headers=DEFAULT_HEADERS, timeout=12)
            resp.raise_for_status()
            html = resp.text
        except Exception as e:
            raise ValueError(f"Gagal menghubungi Apple Music: {e}")

        # 1. Extract Title & Cover
        title_match = re.search(r"<title>(.*?)(?: - Playlist)? - Apple Music</title>", html)
        title = title_match.group(1).replace("\u200e", "").replace("\u200f", "").strip() if title_match else "Apple Music Playlist"

        cover_url = ""
        og_img_match = re.search(r'<meta property="og:image" content="(.*?)"', html)
        if og_img_match:
            cover_url = og_img_match.group(1).replace("1200x630bb.jpg", "1000x1000bb.jpg")

        tracks: List[Dict[str, Any]] = []

        # 2. Extract tracklockup items via JSON stream decoding
        key = '"itemKind":"trackLockup"'
        idx = html.find(key)
        if idx != -1:
            items_key = '"items":['
            arr_idx = html.find(items_key, idx)
            if arr_idx != -1:
                start_bracket = arr_idx + len('"items":')
                try:
                    decoder = json.JSONDecoder()
                    raw_items, _ = decoder.raw_decode(html[start_bracket:])

                    for i, it in enumerate(raw_items, start=1):
                        t_title = it.get("title", f"Track {i}")
                        sub_links = it.get("subtitleLinks", [])
                        t_artist = sub_links[0].get("title", "Unknown Artist") if sub_links else "Unknown Artist"

                        tert_links = it.get("tertiaryLinks", [])
                        t_album = tert_links[0].get("title", title) if tert_links else title

                        dur_sec = float(it.get("duration", 0)) / 1000.0

                        # High-resolution artwork
                        art_dict = it.get("artwork", {}).get("dictionary", {})
                        t_cover = art_dict.get("url", "").replace("{w}x{h}bb.{f}", "1000x1000bb.jpg")
                        if not t_cover:
                            t_cover = cover_url

                        t_id = str(it.get("contentDescriptor", {}).get("identifiers", {}).get("storeAdamID", i))
                        search_query = f"{t_artist} - {t_title}".strip(" -")

                        tracks.append({
                            "index": i,
                            "id": t_id,
                            "title": t_title,
                            "artist": t_artist,
                            "album": t_album,
                            "duration": dur_sec,
                            "thumbnail": t_cover,
                            "provider": "apple_music",
                            "search_query": search_query,
                            "url": it.get("contentDescriptor", {}).get("url", url),
                        })
                except Exception as e:
                    logger.warning(f"Error parsing Apple Music trackLockup JSON: {e}")

        # 3. Fallback: Check application/ld+json schema if trackLockup failed
        if not tracks:
            ld_match = re.search(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.DOTALL)
            if ld_match:
                try:
                    ld_data = json.loads(ld_match.group(1))
                    raw_tracks = ld_data.get("track", [])
                    if isinstance(raw_tracks, dict):
                        raw_tracks = [raw_tracks]

                    for i, tr in enumerate(raw_tracks, start=1):
                        t_title = tr.get("name", f"Track {i}")
                        t_artist = tr.get("byArtist", {}).get("name", "Unknown Artist")
                        dur_str = tr.get("duration", "")
                        # Parse ISO 8601 duration e.g. PT3M29S
                        dur_sec = 0.0
                        dur_m = re.search(r"PT(?:(\d+)M)?(?:(\d+)S)?", dur_str)
                        if dur_m:
                            mins = int(dur_m.group(1) or 0)
                            secs = int(dur_m.group(2) or 0)
                            dur_sec = float(mins * 60 + secs)

                        t_cover = tr.get("audio", {}).get("thumbnailUrl", cover_url)
                        if t_cover:
                            t_cover = t_cover.replace("1200x630bb.jpg", "1000x1000bb.jpg")

                        search_query = f"{t_artist} - {t_title}".strip(" -")
                        tracks.append({
                            "index": i,
                            "id": f"am_{i}",
                            "title": t_title,
                            "artist": t_artist,
                            "album": title,
                            "duration": dur_sec,
                            "thumbnail": t_cover,
                            "provider": "apple_music",
                            "search_query": search_query,
                            "url": tr.get("url", url),
                        })
                except Exception as e:
                    logger.warning(f"Error parsing Apple Music ld+json: {e}")

        if not tracks:
            raise ValueError("Tidak dapat menemukan daftar lagu pada link Apple Music ini.")

        return {
            "provider": "apple_music",
            "title": title,
            "type": "playlist",
            "count": len(tracks),
            "cover_url": cover_url,
            "tracks": tracks,
        }
