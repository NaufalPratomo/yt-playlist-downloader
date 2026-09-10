"""
Base Provider Interface for MusicGit Downloader Engine.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict


class BaseProvider(ABC):
    name: str = "base"
    display_name: str = "Base"

    @abstractmethod
    def can_handle(self, url: str) -> bool:
        """Check if this provider can handle the given URL."""
        pass

    @abstractmethod
    def extract_tracklist(self, url: str) -> Dict[str, Any]:
        """
        Extract playlist or track information from the given URL.
        Returns a dict:
        {
            "provider": str,
            "title": str,
            "type": "playlist" | "album" | "track",
            "count": int,
            "tracks": [
                {
                    "index": int,
                    "id": str,
                    "title": str,
                    "artist": str,
                    "album": str,
                    "duration": float (in seconds),
                    "thumbnail": str,
                    "provider": str,
                    "search_query": str,
                    "url": str
                },
                ...
            ]
        }
        """
        pass
