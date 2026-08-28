"""
Lyrics Fetcher Module for YouTube Playlist Downloader.
Fetches synchronized (.lrc) and plain text lyrics from LRCLIB API with fallbacks.
"""

import json
import logging
import re
import urllib.parse
import urllib.request
from typing import Dict, Optional, Tuple

logger = logging.getLogger("lyrics_fetcher")


class LyricsFetcher:
    def __init__(self, user_agent: str = "YTPlaylistDownloader/1.0"):
        self.user_agent = user_agent
        self.base_url = "https://lrclib.net/api"

    def fetch_lyrics(
        self,
        title: str,
        artist: str = "",
        album: str = "",
        duration: Optional[float] = None,
    ) -> Dict[str, Optional[str]]:
        """
        Fetch lyrics from LRCLIB.
        Returns a dict:
        {
            'synced_lyrics': '[00:12.34] ...' or None,
            'plain_lyrics': 'Line 1\nLine 2...' or None,
            'source': 'lrclib' or None
        }
        """
        clean_title = self._clean_query(title)
        clean_artist = self._clean_query(artist)

        # 1. Try exact match if artist is provided
        if clean_artist and clean_title:
            result = self._get_exact(clean_title, clean_artist, album, duration)
            if result and (result.get("syncedLyrics") or result.get("plainLyrics")):
                return {
                    "synced_lyrics": result.get("syncedLyrics"),
                    "plain_lyrics": result.get("plainLyrics"),
                    "source": "lrclib_exact",
                }

        # 2. Try search endpoint
        search_query = f"{clean_artist} {clean_title}".strip() if clean_artist else clean_title
        if search_query:
            result = self._search(search_query, duration)
            if result and (result.get("syncedLyrics") or result.get("plainLyrics")):
                return {
                    "synced_lyrics": result.get("syncedLyrics"),
                    "plain_lyrics": result.get("plainLyrics"),
                    "source": "lrclib_search",
                }

        return {"synced_lyrics": None, "plain_lyrics": None, "source": None}

    def _get_exact(
        self,
        title: str,
        artist: str,
        album: str = "",
        duration: Optional[float] = None,
    ) -> Optional[dict]:
        params = {
            "track_name": title,
            "artist_name": artist,
        }
        if album:
            params["album_name"] = album
        if duration:
            params["duration"] = int(duration)

        url = f"{self.base_url}/get?{urllib.parse.urlencode(params)}"
        return self._make_request(url)

    def _search(self, query: str, duration: Optional[float] = None) -> Optional[dict]:
        params = {"q": query}
        url = f"{self.base_url}/search?{urllib.parse.urlencode(params)}"
        items = self._make_request(url)
        if isinstance(items, list) and items:
            # If duration is available, find the closest match
            if duration:
                best_item = None
                min_diff = float("inf")
                for item in items:
                    item_dur = item.get("duration")
                    if item_dur:
                        diff = abs(item_dur - duration)
                        if diff < min_diff and (item.get("syncedLyrics") or item.get("plainLyrics")):
                            min_diff = diff
                            best_item = item
                if best_item and min_diff < 15:  # Within 15 seconds
                    return best_item

            # Otherwise return the first item with lyrics
            for item in items:
                if item.get("syncedLyrics") or item.get("plainLyrics"):
                    return item
            return items[0]
        return None

    def _make_request(self, url: str) -> Optional[any]:
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": self.user_agent, "Accept": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=6) as response:
                if response.status == 200:
                    data = response.read().decode("utf-8")
                    return json.loads(data)
        except Exception as e:
            logger.debug(f"Lyrics request failed ({url}): {e}")
        return None

    def _clean_query(self, text: str) -> str:
        if not text:
            return ""
        # Remove parentheses / brackets with common extraneous text
        cleaned = re.sub(
            r"\s*[\(\[\{](?:official\s*(?:video|audio|music video|lyric video)?|lyrics?|audio|video|remastered|hd|4k|mv|ft\..*?|feat\..*?)[\)\]\}]",
            "",
            text,
            flags=re.IGNORECASE,
        )
        # Strip trailing extra punctuation
        cleaned = re.sub(r'[\"\'\-–—]+$', "", cleaned).strip()
        return cleaned


lyrics_fetcher = LyricsFetcher()
