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

        # Normalize unicode dashes and quotes in title
        normalized_title = re.sub(r"[\u2010\u2012\u2013\u2014\u2015\u2212\ufe63\uff0d]", "-", title)

        candidate_artist = ""
        candidate_title = normalized_title

        # Check for common separators: " - ", " | ", " ~ ", " • ", " // ", " : "
        sep_match = re.search(r"\s+(?:-+|\||~|•|//|:)\s+", normalized_title)
        if sep_match:
            parts = normalized_title.split(sep_match.group(0), 1)
            candidate_artist = parts[0].strip()
            candidate_title = parts[1].strip()
        elif re.search(r"\s+by\s+", normalized_title, re.IGNORECASE):
            parts = re.split(r"\s+by\s+", normalized_title, maxsplit=1, flags=re.IGNORECASE)
            candidate_title = parts[0].strip()
            candidate_artist = parts[1].strip()

        # Use candidate artist if not already present or if artist is generic
        if candidate_artist and (not artist or artist.lower() in ["unknown", "unknown artist", "various artists", ""]):
            artist = candidate_artist
            title = candidate_title
        elif not artist and clean_uploader:
            artist = clean_uploader
        else:
            title = normalized_title

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
        ext: str = "mp3",
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

        clean_ext = ext.lstrip(".") if ext else "mp3"
        if filename.lower().endswith(f".{clean_ext}"):
            pass
        elif re.search(r"\.[a-zA-Z0-9]{3,4}$", filename):
            filename = re.sub(r"\.[a-zA-Z0-9]{3,4}$", f".{clean_ext}", filename)
        else:
            filename += f".{clean_ext}"

        return sanitize_filename(filename)

    @staticmethod
    def apply_mp4_tags(
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
        """Apply complete MP4/M4A metadata tags using Mutagen."""
        if not os.path.exists(file_path):
            return False
        try:
            from mutagen.mp4 import MP4, MP4Cover
            audio = MP4(file_path)
            audio["\xa9nam"] = [title]
            audio["\xa9ART"] = [artist]
            audio["\xa9alb"] = [album]
            resolved_album_artist = album_artist or ("Various Artists" if is_compilation else artist)
            audio["aART"] = [resolved_album_artist]
            if is_compilation or (resolved_album_artist and resolved_album_artist.lower() in ["various artists", "various"]):
                audio["cpil"] = True
            if total_tracks and total_tracks > 1:
                audio["trkn"] = [(track_number, total_tracks)]
            else:
                audio["trkn"] = [(track_number, 0)]
            if year:
                audio["\xa9day"] = [str(year)]
            if genre:
                audio["\xa9gen"] = [genre]
            if cover_bytes:
                audio["covr"] = [MP4Cover(cover_bytes, imageformat=MP4Cover.FORMAT_JPEG)]
            if lyrics_text:
                audio["\xa9lyr"] = [lyrics_text]
            audio.save()
            return True
        except Exception as e:
            logger.error(f"Error applying MP4 tags to {file_path}: {e}")
            return False

    @staticmethod
    def apply_tags(
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
        """Universal tagger dispatcher for MP3, M4A, and other formats."""
        if file_path.lower().endswith((".m4a", ".mp4")):
            return MetadataTagger.apply_mp4_tags(
                file_path=file_path,
                track_number=track_number,
                title=title,
                artist=artist,
                album=album,
                album_artist=album_artist,
                is_compilation=is_compilation,
                total_tracks=total_tracks,
                year=year,
                genre=genre,
                cover_bytes=cover_bytes,
                lyrics_text=lyrics_text,
            )
        return MetadataTagger.apply_id3_tags(
            file_path=file_path,
            track_number=track_number,
            title=title,
            artist=artist,
            album=album,
            album_artist=album_artist,
            is_compilation=is_compilation,
            total_tracks=total_tracks,
            year=year,
            genre=genre,
            cover_bytes=cover_bytes,
            lyrics_text=lyrics_text,
        )

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
    def parse_filename_metadata(filename: str) -> Tuple[str, str, Optional[str]]:
        """
        Extract title, artist, and optional YouTube Video ID from filename.
        Example: '01. NIKI - lowkey-HaZRGYd9mh4.mp3' -> ('lowkey', 'NIKI', 'HaZRGYd9mh4')
        """
        base = os.path.splitext(filename)[0]
        yt_id = None

        # Look for 11-char YouTube ID pattern near end
        yt_match = re.search(r"[-_\[\(]([A-Za-z0-9_-]{11})[\]\)]?$", base)
        if yt_match:
            yt_id = yt_match.group(1)
            base = base[:yt_match.start()].strip(" -_()[]")

        # Strip leading numbering like '1. ', '01 - ', '01. '
        clean_base = re.sub(r"^\d+[\.\s\-_]+", "", base).strip()
        clean_title, clean_artist = MetadataTagger.clean_title_and_artist(clean_base)
        return clean_title, clean_artist, yt_id

    @staticmethod
    def scan_folder(folder_path: str) -> Dict[str, Any]:
        """
        Inspect all MP3 files in a folder and return detailed metadata analysis,
        including missing tags, cover art, lyrics, and health score.
        """
        if not os.path.exists(folder_path):
            return {"success": False, "error": f"Folder tidak ditemukan: {folder_path}"}

        try:
            from pathlib import Path
            from .library_manager import library_manager
            library_manager.heal_nested_playlist_folder(Path(folder_path))
        except Exception:
            pass

        mp3_files = [f for f in os.listdir(folder_path) if f.lower().endswith(".mp3")]
        if not mp3_files:
            return {
                "success": True,
                "folder": folder_path,
                "folder_name": os.path.basename(os.path.normpath(folder_path)),
                "total_files": 0,
                "files": [],
                "issues_summary": {
                    "missing_artists": 0,
                    "missing_covers": 0,
                    "missing_lyrics": 0,
                    "inconsistent_album": 0,
                },
                "has_cover_file": False,
                "cover_path": None,
            }

        def sort_key(name):
            match = re.match(r"^(\d+)", name)
            return (int(match.group(1)), name) if match else (9999, name)

        mp3_files.sort(key=sort_key)
        total_files = len(mp3_files)
        folder_name = os.path.basename(os.path.normpath(folder_path))

        # Check for local cover.jpg / folder.jpg
        cover_path = None
        for img_name in ["cover.jpg", "cover.png", "folder.jpg", "folder.png"]:
            candidate = os.path.join(folder_path, img_name)
            if os.path.exists(candidate):
                cover_path = candidate
                break

        files_info = []
        missing_artists_count = 0
        missing_covers_count = 0
        missing_lyrics_count = 0
        inconsistent_album_count = 0

        detected_albums = {}
        detected_album_artists = {}

        for idx, filename in enumerate(mp3_files, start=1):
            file_path = os.path.join(folder_path, filename)
            s_title, s_artist, yt_id = MetadataTagger.parse_filename_metadata(filename)
            
            title = s_title
            artist = s_artist
            album = ""
            album_artist = ""
            track_str = f"{idx}/{total_files}"
            has_cover = False
            has_lyrics = False

            # Check for companion .lrc file
            lrc_candidate = os.path.splitext(file_path)[0] + ".lrc"
            if os.path.exists(lrc_candidate):
                has_lyrics = True

            try:
                audio = MP3(file_path, ID3=ID3)
                if audio.tags:
                    tags = audio.tags
                    if "TIT2" in tags and str(tags["TIT2"]).strip():
                        title = str(tags["TIT2"]).strip()
                    if "TPE1" in tags and str(tags["TPE1"]).strip():
                        artist = str(tags["TPE1"]).strip()
                    if "TALB" in tags:
                        album = str(tags["TALB"]).strip()
                    if "TPE2" in tags:
                        album_artist = str(tags["TPE2"]).strip()
                    if "TRCK" in tags:
                        track_str = str(tags["TRCK"]).strip()
                    if "APIC:" in tags or any(k.startswith("APIC") for k in tags.keys()):
                        has_cover = True
                    if "USLT:" in tags or any(k.startswith("USLT") for k in tags.keys()):
                        has_lyrics = True
            except Exception:
                pass

            if album:
                detected_albums[album] = detected_albums.get(album, 0) + 1
            if album_artist:
                detected_album_artists[album_artist] = detected_album_artists.get(album_artist, 0) + 1

            # Detect issues
            is_unknown_artist = not artist or artist.lower() in ["unknown artist", "unknown", ""]
            if is_unknown_artist:
                missing_artists_count += 1
            if not has_cover:
                missing_covers_count += 1
            if not has_lyrics:
                missing_lyrics_count += 1
            if not album or album != folder_name:
                inconsistent_album_count += 1

            files_info.append({
                "index": idx,
                "file": filename,
                "file_path": file_path,
                "title": title,
                "artist": artist,
                "album": album or folder_name,
                "album_artist": album_artist or "Various Artists",
                "track": track_str,
                "has_cover": has_cover,
                "has_lyrics": has_lyrics,
                "youtube_id": yt_id,
                "suggested_title": s_title if is_unknown_artist else title,
                "suggested_artist": s_artist if is_unknown_artist else artist,
                "is_unknown_artist": is_unknown_artist,
            })

        main_album = max(detected_albums, key=detected_albums.get) if detected_albums else folder_name
        main_album_artist = max(detected_album_artists, key=detected_album_artists.get) if detected_album_artists else "Various Artists"

        return {
            "success": True,
            "folder": folder_path,
            "folder_name": folder_name,
            "total_files": total_files,
            "detected_album": main_album,
            "detected_album_artist": main_album_artist,
            "has_cover_file": bool(cover_path),
            "cover_path": cover_path,
            "issues_summary": {
                "missing_artists": missing_artists_count,
                "missing_covers": missing_covers_count,
                "missing_lyrics": missing_lyrics_count,
                "inconsistent_album": inconsistent_album_count,
            },
            "files": files_info,
        }

    @staticmethod
    def repair_folder_metadata(
        folder_path: str,
        album_name: Optional[str] = None,
        album_artist: str = "Various Artists",
        is_compilation: bool = True,
        auto_fix_artists: bool = True,
        embed_local_cover: bool = True,
        fetch_missing_lyrics: bool = True,
    ) -> Dict[str, Any]:
        """
        Perform smart comprehensive repair on all MP3 files in a directory:
        - Unifies Album Name, Album Artist (TPE2='Various Artists'), and sets Compilation Flag (TCMP=1).
        - Fixes Unknown Artist & Title by parsing filename patterns.
        - Embeds local cover.jpg if MP3 lacks embedded APIC.
        - Fetches synchronized lyrics from LRCLIB if missing.
        """
        if not os.path.exists(folder_path):
            return {"success": False, "error": f"Folder tidak ditemukan: {folder_path}", "updated_files": 0}

        mp3_files = [f for f in os.listdir(folder_path) if f.lower().endswith(".mp3")]
        if not mp3_files:
            return {"success": False, "error": "Tidak ada file MP3 di folder ini.", "updated_files": 0}

        def sort_key(name):
            match = re.match(r"^(\d+)", name)
            return (int(match.group(1)), name) if match else (9999, name)

        mp3_files.sort(key=sort_key)
        total_files = len(mp3_files)
        target_album = album_name or os.path.basename(os.path.normpath(folder_path))

        # Check local cover image
        cover_bytes = None
        if embed_local_cover:
            for img_name in ["cover.jpg", "cover.png", "folder.jpg", "folder.png"]:
                cand = os.path.join(folder_path, img_name)
                if os.path.exists(cand):
                    try:
                        with open(cand, "rb") as f_img:
                            cover_bytes = f_img.read()
                        break
                    except Exception:
                        pass

        updated_count = 0
        details = []

        for idx, filename in enumerate(mp3_files, start=1):
            file_path = os.path.join(folder_path, filename)
            s_title, s_artist, yt_id = MetadataTagger.parse_filename_metadata(filename)

            try:
                audio = MP3(file_path, ID3=ID3)
                if audio.tags is None:
                    audio.add_tags()
                tags = audio.tags

                existing_title = str(tags.get("TIT2", s_title or os.path.splitext(filename)[0]))
                existing_artist = str(tags.get("TPE1", s_artist or "Unknown Artist"))

                # Auto fix unknown artist/title from parsed filename if enabled
                if auto_fix_artists:
                    if not existing_artist or existing_artist.lower() in ["unknown artist", "unknown", ""]:
                        if s_artist and s_artist.lower() not in ["unknown artist", "unknown", ""]:
                            existing_artist = s_artist
                    if not existing_title or existing_title.lower() in ["unknown title", ""]:
                        if s_title:
                            existing_title = s_title

                # 1. Title & Artist
                tags.add(TIT2(encoding=3, text=existing_title))
                tags.add(TPE1(encoding=3, text=[existing_artist]))

                # 2. Album & Album Artist
                tags.add(TALB(encoding=3, text=target_album))
                tags.add(TPE2(encoding=3, text=[album_artist]))

                # 3. Compilation Flag
                if is_compilation or (album_artist and album_artist.lower() in ["various artists", "various"]):
                    tags.add(TCMP(encoding=3, text="1"))

                # 4. Track Number (1/N, 2/N)
                existing_trck = tags.get("TRCK")
                track_num = idx
                if existing_trck:
                    trck_val = str(existing_trck).split("/")[0]
                    if trck_val.isdigit():
                        track_num = int(trck_val)
                tags.add(TRCK(encoding=3, text=f"{track_num}/{total_files}"))

                # 5. Embed cover if missing and available
                has_apic = any(k.startswith("APIC") for k in tags.keys())
                if not has_apic and cover_bytes:
                    tags.add(
                        APIC(
                            encoding=3,
                            mime="image/jpeg",
                            type=3,
                            desc="Cover",
                            data=cover_bytes,
                        )
                    )

                # 6. Fetch lyrics if missing
                has_lyrics = any(k.startswith("USLT") for k in tags.keys())
                if fetch_missing_lyrics and not has_lyrics and existing_title:
                    try:
                        lrc_res = lyrics_fetcher.fetch_lyrics(title=existing_title, artist=existing_artist)
                        synced_lrc = lrc_res.get("synced_lyrics")
                        plain_lrc = lrc_res.get("plain_lyrics")
                        if synced_lrc or plain_lrc:
                            tags.add(
                                USLT(
                                    encoding=3,
                                    lang="eng",
                                    desc="",
                                    text=plain_lrc or synced_lrc,
                                )
                            )
                            # Save companion .lrc file if synced
                            if synced_lrc:
                                lrc_path = os.path.splitext(file_path)[0] + ".lrc"
                                if not os.path.exists(lrc_path):
                                    with open(lrc_path, "w", encoding="utf-8") as f_lrc:
                                        f_lrc.write(synced_lrc)
                    except Exception as e_lrc:
                        logger.warning(f"Failed to fetch lyrics for {existing_title}: {e_lrc}")

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
                logger.error(f"Failed to repair metadata for {filename}: {e}")

        return {
            "success": True,
            "folder": folder_path,
            "album": target_album,
            "album_artist": album_artist,
            "total_files": total_files,
            "updated_files": updated_count,
            "details": details,
        }

    @staticmethod
    def retag_folder(
        folder_path: str,
        album_name: Optional[str] = None,
        album_artist: str = "Various Artists",
        is_compilation: bool = True,
    ) -> Dict[str, Any]:
        """Backwards compatibility alias for repair_folder_metadata."""
        return MetadataTagger.repair_folder_metadata(
            folder_path=folder_path,
            album_name=album_name,
            album_artist=album_artist,
            is_compilation=is_compilation,
            auto_fix_artists=True,
            embed_local_cover=True,
            fetch_missing_lyrics=False,
        )


metadata_tagger = MetadataTagger()

