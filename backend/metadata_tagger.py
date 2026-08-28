"""
Metadata Tagger Module for YouTube Playlist Downloader.
Parses, cleans, and embeds ID3v2 tags into MP3 files for Windows File Explorer and music players.
"""

import logging
import os
import re
from typing import Dict, List, Optional, Tuple

import mutagen
from mutagen.id3 import (
    ID3,
    APIC,
    TALB,
    TCON,
    TDRC,
    TIT2,
    TPE1,
    TPE2,
    TRCK,
    USLT,
    ID3NoHeaderError,
)
from mutagen.mp3 import MP3

from .cover_processor import cover_processor
from .lyrics_fetcher import lyrics_fetcher
from .utils import sanitize_filename

logger = logging.getLogger("metadata_tagger")


class MetadataTagger:
    @staticmethod
    def clean_title_and_artist(
        raw_title: str,
        raw_artist: Optional[str] = None,
        raw_uploader: Optional[str] = None,
    ) -> Tuple[str, str]:
        """
        Extract and clean title and artist from YouTube video title and metadata.
        Handles formats like:
        - "NIKI - lowkey (Official Video)" -> Artist: "NIKI", Title: "lowkey"
        - "Dipha Barus - All Good ft. Nadin Amizah" -> Artist: "Dipha Barus", Title: "All Good"
        - Title only with uploader: "Sweet Talk" + Uploader "Fitz Leland - Topic" -> Artist: "Fitz Leland", Title: "Sweet Talk"
        """
        title = raw_title or "Unknown Title"
        artist = raw_artist or ""

        # Remove " - Topic" from uploader
        clean_uploader = ""
        if raw_uploader:
            clean_uploader = re.sub(r"\s*-\s*Topic$", "", raw_uploader, flags=re.IGNORECASE).strip()

        # If artist is not provided or generic, try extracting from "Artist - Title" pattern
        if " - " in title:
            parts = title.split(" - ", 1)
            candidate_artist = parts[0].strip()
            candidate_title = parts[1].strip()
            
            # Use candidate artist if not already present
            if not artist or artist.lower() in ["unknown", "various artists", ""]:
                artist = candidate_artist
            title = candidate_title
        elif not artist and clean_uploader:
            artist = clean_uploader

        # Clean extraneous video tags from title
        title = MetadataTagger.strip_video_tags(title)
        
        # Clean artist if needed
        if artist:
            artist = MetadataTagger.strip_video_tags(artist)
            artist = re.sub(r"\s*-\s*Topic$", "", artist, flags=re.IGNORECASE).strip()
        else:
            artist = "Unknown Artist"

        return title.strip(), artist.strip()

    @staticmethod
    def strip_video_tags(text: str) -> str:
        """Removes common YouTube title noise like [Official Video], (4K), etc."""
        if not text:
            return ""

        patterns = [
            r"\s*[\(\[\{](?:official\s*(?:video|audio|music\s*video|lyric\s*video|hd\s*video|visualizer|4k|mv)?|lyrics?|audio|video|remastered|hd|4k|mv|ft\..*?|feat\..*?|live|clip\s*officiel)[\)\]\}]",
            r"\s*[\(\[\{]\s*(?:4k|1080p|60fps|hq|full\s*hd)\s*[\)\]\}]",
            r"\s*\|\s*(?:official\s*(?:music\s*video|video|audio)|lyrics?).*$",
            r"\s*-\s*(?:official\s*(?:music\s*video|video|audio)|lyrics?).*$",
            r"\s*//\s*(?:official\s*video|audio).*$",
        ]

        cleaned = text
        for pat in patterns:
            cleaned = re.sub(pat, "", cleaned, flags=re.IGNORECASE)

        # Remove stray brackets or quotes at ends
        cleaned = re.sub(r'^[\s"\'\-–—]+|[\s"\'\-–—]+$', "", cleaned)
        return cleaned.strip()

    @staticmethod
    def format_filename(
        template: str,
        track_number: int,
        title: str,
        artist: str,
        video_id: str,
    ) -> str:
        """
        Format output filename according to template.
        Supported tokens:
        - {num} or {#}: Track number (1, 2, 3)
        - {num2}: Track number with 2 digits (01, 02, 03)
        - {title}: Clean title
        - {artist}: Artist name
        - {id}: YouTube Video ID
        """
        clean_title = sanitize_filename(title)
        clean_artist = sanitize_filename(artist)

        filename = template
        filename = filename.replace("{num}", str(track_number))
        filename = filename.replace("{#}", str(track_number))
        filename = filename.replace("{num2}", f"{track_number:02d}")
        filename = filename.replace("{title}", clean_title)
        filename = filename.replace("{artist}", clean_artist)
        filename = filename.replace("{id}", video_id)

        if not filename.lower().endswith(".mp3"):
            filename += ".mp3"

        return sanitize_filename(filename)

    @staticmethod
    def apply_id3_tags(
        file_path: str,
        track_number: int,
        title: str,
        artist: str,
        album: str,
        year: Optional[str] = None,
        genre: Optional[str] = None,
        cover_bytes: Optional[bytes] = None,
        lyrics_text: Optional[str] = None,
    ) -> bool:
        """
        Apply complete ID3v2.3 / ID3v2.4 tags to an MP3 file using Mutagen.
        Ensures compatibility with Windows File Explorer columns (#, Title, Contributing artists, Album).
        """
        if not os.path.exists(file_path):
            logger.error(f"File not found for tagging: {file_path}")
            return False

        try:
            # Ensure ID3 header exists
            try:
                audio = MP3(file_path, ID3=ID3)
            except Exception:
                audio = MP3(file_path)
                audio.add_tags()

            if audio.tags is None:
                audio.add_tags()

            tags = audio.tags

            # 1. Track Number (#)
            tags.add(TRCK(encoding=3, text=str(track_number)))

            # 2. Title
            tags.add(TIT2(encoding=3, text=title))

            # 3. Contributing artists / Artist
            tags.add(TPE1(encoding=3, text=[artist]))

            # 4. Album (Playlist Name)
            tags.add(TALB(encoding=3, text=album))

            # 5. Album Artist
            tags.add(TPE2(encoding=3, text=[artist]))

            # 6. Release Year / Date
            if year:
                tags.add(TDRC(encoding=3, text=str(year)))

            # 7. Genre
            if genre:
                tags.add(TCON(encoding=3, text=genre))

            # 8. Embedded Cover Art
            if cover_bytes:
                tags.add(
                    APIC(
                        encoding=3,
                        mime="image/jpeg",
                        type=3,  # Front cover
                        desc="Cover",
                        data=cover_bytes,
                    )
                )

            # 9. Embedded Lyrics
            if lyrics_text:
                tags.add(
                    USLT(
                        encoding=3,
                        lang="eng",
                        desc="",
                        text=lyrics_text,
                    )
                )

            # Save tags with ID3v2.3 compatibility (safest for Windows Explorer)
            audio.save(v2_version=3)
            logger.info(f"Successfully applied ID3 tags to {file_path}")
            return True
        except Exception as e:
            logger.error(f"Error applying ID3 tags to {file_path}: {e}")
            return False


metadata_tagger = MetadataTagger()
