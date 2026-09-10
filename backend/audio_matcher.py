"""
Smart Audio Matcher for MusicGit Downloader Engine.
Finds and scores YouTube/YouTube Music audio streams for tracks extracted
from metadata providers (Spotify, Deezer, Apple Music).
"""

import logging
import re
from typing import Any, Dict, Optional
import yt_dlp

logger = logging.getLogger("audio_matcher")

# In-memory cache: search_query -> matched YouTube URL
MATCH_CACHE: Dict[str, str] = {}


class AudioMatcher:
    @staticmethod
    def _clean_str(s: str) -> str:
        return re.sub(r"[^\w\s]", "", s.lower()).strip()

    @classmethod
    def match_track(cls, track: Dict[str, Any]) -> str:
        """
        Finds best YouTube URL for a track from Spotify/Deezer/Apple Music.
        Returns YouTube URL e.g. 'https://www.youtube.com/watch?v=...'
        """
        search_query = track.get("search_query")
        if not search_query:
            artist = track.get("artist", "")
            title = track.get("title", "")
            search_query = f"{artist} - {title}".strip(" -")

        if not search_query:
            # Fallback to direct url if available
            return track.get("url", "")

        # Check cache first
        cache_key = search_query.lower()
        if cache_key in MATCH_CACHE:
            logger.info(f"AudioMatcher cache hit for '{search_query}' -> {MATCH_CACHE[cache_key]}")
            return MATCH_CACHE[cache_key]

        target_dur = float(track.get("duration") or 0)
        target_title_clean = cls._clean_str(track.get("title", ""))
        target_artist_clean = cls._clean_str(track.get("artist", ""))

        ydl_opts = {
            "extract_flat": True,
            "skip_download": True,
            "quiet": True,
            "no_warnings": True,
            "ignoreerrors": True,
            "geo_bypass": True,
        }

        # Search YouTube with audio bias
        query = f"ytsearch5:{search_query} audio"
        logger.info(f"AudioMatcher searching: {query} (target dur: {target_dur}s)")

        best_url = None
        best_score = -999999.0

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                res = ydl.extract_info(query, download=False)
                entries = res.get("entries", []) if res else []
        except Exception as e:
            logger.warning(f"AudioMatcher search failed for '{query}': {e}")
            entries = []

        if not entries:
            # Fallback retry without 'audio' keyword
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    res = ydl.extract_info(f"ytsearch3:{search_query}", download=False)
                    entries = res.get("entries", []) if res else []
            except Exception:
                entries = []

        for candidate in entries:
            if not candidate or not candidate.get("id"):
                continue

            c_title = candidate.get("title", "")
            c_title_clean = cls._clean_str(c_title)
            c_uploader = candidate.get("uploader") or candidate.get("channel") or ""
            c_uploader_clean = cls._clean_str(c_uploader)
            c_dur = float(candidate.get("duration") or 0)

            score = 100.0

            # 1. Duration Scoring
            if target_dur > 0 and c_dur > 0:
                delta = abs(c_dur - target_dur)
                if delta <= 2:
                    score += 60.0
                elif delta <= 5:
                    score += 40.0
                elif delta <= 12:
                    score += 15.0
                elif delta <= 25:
                    score -= 20.0
                elif delta > 40:
                    # Likely a loop, long version, or podcast
                    score -= 100.0

            # 2. Channel / Topic Bonus (YouTube Music Topic Channels are highest audio quality)
            if c_uploader.endswith(" - Topic") or "- Topic" in c_uploader:
                score += 50.0
            elif target_artist_clean and target_artist_clean in c_uploader_clean:
                score += 35.0

            # 3. Title Keywords Bonus & Penalties
            if "official audio" in c_title.lower():
                score += 25.0
            if "official music video" in c_title.lower() or "official video" in c_title.lower():
                score += 15.0

            # Penalize unwanted variants unless requested in target title
            unwanted = ["cover", "remix", "karaoke", "instrumental", "live", "reaction", "slowed", "reverb", "8d"]
            for bad in unwanted:
                if bad in c_title_clean and bad not in target_title_clean:
                    score -= 60.0

            # 4. Text Matching
            target_words = set(target_title_clean.split())
            if target_words:
                cand_words = set(c_title_clean.split())
                overlap = len(target_words.intersection(cand_words)) / len(target_words)
                score += overlap * 40.0

            c_id = candidate.get("id")
            c_url = f"https://www.youtube.com/watch?v={c_id}"

            if score > best_score:
                best_score = score
                best_url = c_url

        if not best_url:
            # Last ditch fallback: original url or first entry
            if entries and entries[0].get("id"):
                best_url = f"https://www.youtube.com/watch?v={entries[0]['id']}"
            else:
                best_url = track.get("url", "")

        logger.info(f"AudioMatcher selected '{best_url}' (score: {best_score}) for '{search_query}'")
        MATCH_CACHE[cache_key] = best_url
        return best_url


audio_matcher = AudioMatcher()
