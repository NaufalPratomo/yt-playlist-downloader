"""
Provider Registry for MusicGit Downloader Engine.
Routes incoming URLs to appropriate platform provider.
"""

from typing import List, Optional
from .base import BaseProvider
from .spotify import SpotifyProvider
from .deezer import DeezerProvider
from .apple_music import AppleMusicProvider
from .soundcloud import SoundCloudProvider
from .youtube import YouTubeProvider

PROVIDERS: List[BaseProvider] = [
    SpotifyProvider(),
    DeezerProvider(),
    AppleMusicProvider(),
    SoundCloudProvider(),
    YouTubeProvider(),
]


def get_provider_for_url(url: str) -> BaseProvider:
    """Find the provider that can handle the given URL."""
    clean_url = url.strip()
    for provider in PROVIDERS:
        if provider.can_handle(clean_url):
            return provider
    # Default fallback to YouTubeProvider
    return YouTubeProvider()


def detect_provider_name(url: str) -> str:
    """Return the provider name ('spotify', 'deezer', 'apple_music', 'soundcloud', 'youtube')"""
    provider = get_provider_for_url(url)
    return provider.name
