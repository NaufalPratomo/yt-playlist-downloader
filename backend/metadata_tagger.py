"""
Metadata Tagger Module for YouTube Playlist Downloader.
Parses, cleans, and embeds ID3v2 tags into MP3 files for Windows File Explorer and music players.
"""

import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import mutagen
from mutagen.id3 import (
    ID3,
    APIC,
    TALB,
    TCMP,
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
        album_artist: Optional[str] = None,
        is_compilation: bool = True,
        total_tracks: Optional[int] = None,
        year: Optional[str] = None,
        genre: Optional[str] = None,
        cover_bytes: Optional[bytes] = None,
        lyrics_text: Optional[str] = None,
    ) -> bool:
        """
        Apply complete ID3v2.3 tags to an MP3 file using Mutagen.
        Ensures perfect compatibility with Windows File Explorer, Windows Media Player,
        Groove Music, iTunes, and mobile players without splitting into separate albums.
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

            # 1. Track Number (#) with total tracks if available (e.g., 1/14)
            if total_tracks and total_tracks > 1:
                track_str = f"{track_number}/{total_tracks}"
            else:
                track_str = str(track_number)
            tags.add(TRCK(encoding=3, text=track_str))

            # 2. Title
            tags.add(TIT2(encoding=3, text=title))

            # 3. Contributing artists / Track Artist
            tags.add(TPE1(encoding=3, text=[artist]))

            # 4. Album (Playlist Name or Album Name)
            tags.add(TALB(encoding=3, text=album))

            # 5. Album Artist (TPE2)
            # If multiple artists in playlist/compilation, Album Artist MUST be 'Various Artists'
            # (or unified name) so Windows Media Player groups all songs into a SINGLE album card.
            resolved_album_artist = album_artist
            if not resolved_album_artist:
                resolved_album_artist = "Various Artists" if is_compilation else artist
            tags.add(TPE2(encoding=3, text=[resolved_album_artist]))

            # 6. Compilation Flag (TCMP) - Crucial for Windows Media Player & iTunes
            if is_compilation or (resolved_album_artist and resolved_album_artist.lower() in ["various artists", "various"]):
                tags.add(TCMP(encoding=3, text="1"))

            # 7. Release Year / Date
            if year:
                tags.add(TDRC(encoding=3, text=str(year)))

            # 8. Genre
            if genre:
                tags.add(TCON(encoding=3, text=genre))

            # 9. Embedded Cover Art
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

            # 10. Embedded Lyrics
            if lyrics_text:
                tags.add(
                    USLT(
                        encoding=3,
                        lang="eng",
                        desc="",
                        text=lyrics_text,
                    )
                )

            # Save tags with ID3v2.3 compatibility (safest for Windows Explorer and Media Player)
            audio.save(v2_version=3)
            logger.info(f"Successfully applied ID3 tags to {file_path}")
            return True
        except Exception as e:
            logger.error(f"Error applying ID3 tags to {file_path}: {e}")
            return False

    @staticmethod
    def retag_folder(
        folder_path: str,
        album_name: Optional[str] = None,
        album_artist: str = "Various Artists",
        is_compilation: bool = True,
    ) -> Dict[str, Any]:
        """
        Retag all existing MP3 files in a directory to fix album grouping in Windows Media Player.
        Updates Album Name, Album Artist (TPE2='Various Artists'), and sets Compilation Flag (TCMP=1).
        """
        if not os.path.exists(folder_path):
            return {"success": False, "error": f"Folder tidak ditemukan: {folder_path}", "updated_files": 0}

        mp3_files = [f for f in os.listdir(folder_path) if f.lower().endswith(".mp3")]
        if not mp3_files:
            return {"success": False, "error": "Tidak ada file MP3 di folder ini.", "updated_files": 0}

        # Natural sort if filename starts with numbers
        def sort_key(name):
            match = re.match(r"^(\d+)", name)
            return (int(match.group(1)), name) if match else (9999, name)

        mp3_files.sort(key=sort_key)
        total_files = len(mp3_files)
        target_album = album_name or os.path.basename(os.path.normpath(folder_path))

        updated_count = 0
        details = []

        for idx, filename in enumerate(mp3_files, start=1):
            file_path = os.path.join(folder_path, filename)
            try:
                audio = MP3(file_path, ID3=ID3)
                if audio.tags is None:
                    audio.add_tags()
                tags = audio.tags

                # Read existing title and artist if available
                existing_title = str(tags.get("TIT2", os.path.splitext(filename)[0]))
                existing_artist = str(tags.get("TPE1", "Unknown Artist"))

                # 1. Album
                tags.add(TALB(encoding=3, text=target_album))
                # 2. Album Artist
                tags.add(TPE2(encoding=3, text=[album_artist]))
                # 3. Compilation Flag
                if is_compilation or (album_artist and album_artist.lower() in ["various artists", "various"]):
                    tags.add(TCMP(encoding=3, text="1"))
                # 4. Track Number
                existing_trck = tags.get("TRCK")
                track_num = idx
                if existing_trck:
                    trck_val = str(existing_trck).split("/")[0]
                    if trck_val.isdigit():
                        track_num = int(trck_val)
                tags.add(TRCK(encoding=3, text=f"{track_num}/{total_files}"))

                audio.save(v2_version=3)
                updated_count += 1
                details.append({
                    "file": filename,
                    "title": existing_title,
                    "artist": existing_artist,
                    "album": target_album,
                    "album_artist": album_artist,
                    "track": f"{track_num}/{total_files}",
                })
            except Exception as e:
                logger.error(f"Failed to retag {filename}: {e}")

        return {
            "success": True,
            "folder": folder_path,
            "album": target_album,
            "album_artist": album_artist,
            "total_files": total_files,
            "updated_files": updated_count,
            "details": details,
        }


metadata_tagger = MetadataTagger()
