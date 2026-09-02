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
        Fetch synchronized (.lrc) and plain text lyrics from LRCLIB.
        Enforces strict artist and title verification to prevent attaching lyrics
        from another song that happens to have the same title.
        """
        clean_title = self._clean_query(title)
        clean_artist = self._clean_query(artist)
        if clean_artist.lower() in ["unknown artist", "unknown", "various artists", ""]:
            clean_artist = ""

        # 1. Try exact match if artist is provided
        if clean_artist and clean_title:
            result = self._get_exact(clean_title, clean_artist, album, duration)
            if result and (result.get("syncedLyrics") or result.get("plainLyrics")):
                return {
                    "synced_lyrics": result.get("syncedLyrics"),
                    "plain_lyrics": result.get("plainLyrics"),
                    "source": "lrclib_exact",
                    "matched_artist": result.get("artistName"),
                    "matched_title": result.get("trackName"),
                }

        # 2. Try search with track_name and artist_name
        if clean_artist and clean_title:
            result = self._search_filtered(clean_title, clean_artist, duration)
            if result and (result.get("syncedLyrics") or result.get("plainLyrics")):
                return {
                    "synced_lyrics": result.get("syncedLyrics"),
                    "plain_lyrics": result.get("plainLyrics"),
                    "source": "lrclib_search_filtered",
                    "matched_artist": result.get("artistName"),
                    "matched_title": result.get("trackName"),
                }

        # 3. Fallback search query: "{artist} {title}"
        if clean_title:
            search_query = f"{clean_artist} {clean_title}".strip() if clean_artist else clean_title
            result = self._search_general(search_query, clean_artist, clean_title, duration)
            if result and (result.get("syncedLyrics") or result.get("plainLyrics")):
                return {
                    "synced_lyrics": result.get("syncedLyrics"),
                    "plain_lyrics": result.get("plainLyrics"),
                    "source": "lrclib_search_verified",
                    "matched_artist": result.get("artistName"),
                    "matched_title": result.get("trackName"),
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

    def _search_filtered(
        self,
        title: str,
        artist: str,
        duration: Optional[float] = None,
    ) -> Optional[dict]:
        params = {"track_name": title, "artist_name": artist}
        url = f"{self.base_url}/search?{urllib.parse.urlencode(params)}"
        items = self._make_request(url)
        if isinstance(items, list) and items:
            return self._pick_best_match(items, target_artist=artist, target_title=title, duration=duration)
        return None

    def _search_general(
        self,
        query: str,
        target_artist: str,
        target_title: str,
        duration: Optional[float] = None,
    ) -> Optional[dict]:
        params = {"q": query}
        url = f"{self.base_url}/search?{urllib.parse.urlencode(params)}"
        items = self._make_request(url)
        if isinstance(items, list) and items:
            return self._pick_best_match(items, target_artist=target_artist, target_title=target_title, duration=duration)
        return None

    def _pick_best_match(
        self,
        items: list,
        target_artist: str,
        target_title: str,
        duration: Optional[float] = None,
    ) -> Optional[dict]:
        valid_items = [it for it in items if it.get("syncedLyrics") or it.get("plainLyrics")]
        if not valid_items:
            return None

        # Filter by artist match if target_artist is known
        if target_artist:
            matched_by_artist = [
                it for it in valid_items
                if self._is_artist_match(target_artist, it.get("artistName", ""))
            ]
            if not matched_by_artist:
                # Do NOT assign random lyrics from a completely different artist!
                return None
            valid_items = matched_by_artist

        # If duration is provided, find the closest duration match within strict tolerance
        if duration:
            best_item = None
            min_diff = float("inf")
            for item in valid_items:
                item_dur = item.get("duration")
                if item_dur:
                    diff = abs(item_dur - duration)
                    if diff < min_diff:
                        min_diff = diff
                        best_item = item
            # Tolerance: within 8 seconds
            if best_item and min_diff <= 8:
                return best_item
            elif target_artist and best_item and min_diff <= 15:
                return best_item
            elif not target_artist:
                # Without artist confirmation and without close duration, do not guess
                return None

        return valid_items[0] if target_artist else None

    def _is_artist_match(self, target_artist: str, candidate_artist: str) -> bool:
        if not target_artist or not candidate_artist:
            return False
        t = re.sub(r"[^a-zA-Z0-9]", "", target_artist.lower())
        c = re.sub(r"[^a-zA-Z0-9]", "", candidate_artist.lower())
        return t in c or c in t


    def _make_request(self, url: str) -> Optional[any]:
        headers = {"User-Agent": self.user_agent, "Accept": "application/json"}
        # 1. Try requests
        try:
            import requests
            resp = requests.get(url, headers=headers, timeout=8, verify=False)
            if resp.status_code == 200 and resp.text:
                return resp.json()
        except Exception as e:
            logger.debug(f"requests failed for lyrics ({url}): {e}")

        # 2. Try standard urllib
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=8) as response:
                if response.status == 200:
                    data = response.read().decode("utf-8")
                    return json.loads(data)
        except Exception as e:
            logger.debug(f"urllib standard failed for lyrics ({url}): {e}")

        # 3. Try urllib with unverified SSL context (crucial for Android Chaquopy)
        try:
            import ssl
            ctx = ssl._create_unverified_context()
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=8, context=ctx) as response:
                if response.status == 200:
                    data = response.read().decode("utf-8")
                    return json.loads(data)
        except Exception as e:
            logger.error(f"All lyrics request attempts failed ({url}): {e}")

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
