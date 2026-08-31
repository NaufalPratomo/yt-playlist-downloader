"""
Core Downloader Engine for YouTube Playlist Downloader.
Clean & Professional Edition.
"""

import asyncio
import logging
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Dict, List, Optional

import yt_dlp

from .cover_processor import cover_processor
from .lyrics_fetcher import lyrics_fetcher
from .metadata_tagger import metadata_tagger
from .utils import get_ffmpeg_path, sanitize_filename

logger = logging.getLogger("downloader")

ACTIVE_JOBS: Dict[str, Dict[str, Any]] = {}

DEFAULT_EXTRACTOR_ARGS = {
    "youtube": {
        "player_client": ["android", "ios", "mweb", "web"],
    }
}


class PlaylistDownloader:
    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=2)

    def analyze_url(self, url: str) -> Dict[str, Any]:
        """
        Analyze YouTube URL (Playlist or Single Video) and extract tracklist and metadata.
        """
        ydl_opts = {
            "extract_flat": True,
            "skip_download": True,
            "quiet": True,
            "no_warnings": True,
            "ignoreerrors": True,
            "nocheckcertificate": True,
            "geo_bypass": True,
            "extractor_args": DEFAULT_EXTRACTOR_ARGS,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        if not info:
            raise ValueError("Tidak dapat menemukan informasi playlist atau video.")

        is_playlist = info.get("_type") == "playlist" or "entries" in info
        playlist_title = info.get("title", "YouTube Playlist")
        
        if not is_playlist:
            tracks_raw = [info]
            playlist_title = info.get("title", "Downloads")
        else:
            entries = info.get("entries", [])
            tracks_raw = [e for e in entries if e]

        tracks = []
        for idx, entry in enumerate(tracks_raw, start=1):
            raw_title = entry.get("title", "Unknown Title")
            raw_artist = (
                entry.get("artist")
                or entry.get("creator")
                or entry.get("uploader")
                or entry.get("channel")
            )
            raw_uploader = entry.get("uploader") or entry.get("channel")
            
            clean_title, clean_artist = metadata_tagger.clean_title_and_artist(
                raw_title, raw_artist=raw_artist, raw_uploader=raw_uploader
            )

            thumbnail = entry.get("thumbnail") or ""
            if not thumbnail and entry.get("thumbnails"):
                thumbs = entry.get("thumbnails", [])
                thumbnail = thumbs[-1].get("url", "")

            video_id = entry.get("id") or ""
            if not thumbnail and video_id:
                thumbnail = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"

            duration = entry.get("duration") or 0
            
            tracks.append({
                "index": idx,
                "id": video_id,
                "url": f"https://www.youtube.com/watch?v={video_id}" if video_id else entry.get("url", ""),
                "raw_title": raw_title,
                "title": clean_title,
                "artist": clean_artist,
                "duration": duration,
                "duration_formatted": self._format_duration(duration),
                "thumbnail": thumbnail,
                "selected": True,
            })

        unique_artists = list(dict.fromkeys(t["artist"] for t in tracks if t.get("artist") and t["artist"] != "Unknown Artist"))
        if len(unique_artists) == 1:
            suggested_album_artist = unique_artists[0]
            is_compilation = False
        else:
            suggested_album_artist = "Various Artists"
            is_compilation = len(tracks) > 1

        return {
            "is_playlist": is_playlist,
            "playlist_id": info.get("id", ""),
            "title": playlist_title,
            "uploader": info.get("uploader") or info.get("channel") or "YouTube",
            "track_count": len(tracks),
            "thumbnail": tracks[0]["thumbnail"] if tracks else "",
            "album_artist": suggested_album_artist,
            "is_compilation": is_compilation,
            "tracks": tracks,
        }

    def start_download_job(
        self,
        job_id: str,
        tracks: List[Dict[str, Any]],
        playlist_title: str,
        output_base_dir: str,
        options: Dict[str, Any],
    ) -> str:
        """
        Start a background download job for selected tracks.
        """
        folder_name = sanitize_filename(options.get("folder_name") or playlist_title)
        target_dir = os.path.join(output_base_dir, folder_name)
        os.makedirs(target_dir, exist_ok=True)

        job_state = {
            "job_id": job_id,
            "playlist_title": playlist_title,
            "folder_name": folder_name,
            "target_dir": target_dir,
            "status": "running",
            "total_tracks": len(tracks),
            "completed_tracks": 0,
            "failed_tracks": 0,
            "current_track_index": 0,
            "current_track_title": "",
            "overall_percent": 0.0,
            "speed": "0 KB/s",
            "eta": "0s",
            "logs": [],
            "tracks_status": {
                t["id"]: {
                    "index": t["index"],
                    "title": t["title"],
                    "artist": t["artist"],
                    "status": "queued",
                    "progress": 0.0,
                    "file_path": None,
                    "error": None,
                }
                for t in tracks
            },
        }

        ACTIVE_JOBS[job_id] = job_state

        thread = threading.Thread(
            target=self._run_download_process,
            args=(job_id, tracks, target_dir, options),
            daemon=True,
        )
        thread.start()
        return job_id

    def _run_download_process(
        self,
        job_id: str,
        tracks: List[Dict[str, Any]],
        target_dir: str,
        options: Dict[str, Any],
    ):
        job = ACTIVE_JOBS[job_id]
        bitrate = str(options.get("bitrate", "192"))
        filename_template = options.get("filename_template", "{num}. {title}-{id}.mp3")
        embed_cover = options.get("embed_cover", True)
        save_cover_file = options.get("save_cover_file", True)
        fetch_lyrics = options.get("fetch_lyrics", True)
        save_lrc_file = options.get("save_lrc_file", True)
        album_name = options.get("album_name") or job["playlist_title"]
        album_artist = options.get("album_artist")
        if not album_artist:
            unique_artists = {t.get("artist") for t in tracks if t.get("artist")}
            album_artist = "Various Artists" if len(unique_artists) > 1 else (list(unique_artists)[0] if unique_artists else "Various Artists")
        is_compilation = options.get("is_compilation", True if len(tracks) > 1 else False)

        self._add_log(job, f"[Download] Memulai proses {len(tracks)} lagu ke: {target_dir}")
        self._add_log(job, f"[Konfigurasi] Format: MP3 {bitrate} kbps | Album: '{album_name}' | Artis Album: '{album_artist}'")

        playlist_cover_saved = False

        for idx, track in enumerate(tracks, start=1):
            track_id = track["id"]
            track_num = track.get("index", idx)
            title = track.get("title", "Unknown Title")
            artist = track.get("artist", "Unknown Artist")
            video_url = track.get("url") or f"https://www.youtube.com/watch?v={track_id}"
            thumb_url = track.get("thumbnail", "")

            job["current_track_index"] = idx
            job["current_track_title"] = f"{artist} - {title}"
            track_state = job["tracks_status"][track_id]
            track_state["status"] = "downloading"
            self._update_overall_progress(job)

            self._add_log(job, f"[{idx}/{len(tracks)}] Mengunduh: {artist} - {title} ({track_id})")

            final_filename = metadata_tagger.format_filename(
                template=filename_template,
                track_number=track_num,
                title=title,
                artist=artist,
                video_id=track_id,
            )
            final_mp3_path = os.path.join(target_dir, final_filename)
            raw_out_path = os.path.join(target_dir, f"{track_id}.%(ext)s")
            expected_intermediate_mp3 = os.path.join(target_dir, f"{track_id}.mp3")

            try:
                def progress_hook(d):
                    if d["status"] == "downloading":
                        p_str = d.get("_percent_str", "0%").strip()
                        p_str = re.sub(r"\x1b\[[0-9;]*m", "", p_str)
                        try:
                            val = float(p_str.replace("%", "").strip())
                            track_state["progress"] = val
                        except Exception:
                            pass
                        
                        speed_str = d.get("_speed_str", "").strip()
                        if speed_str:
                            job["speed"] = re.sub(r"\x1b\[[0-9;]*m", "", speed_str)
                        
                        eta_str = d.get("_eta_str", "").strip()
                        if eta_str:
                            job["eta"] = re.sub(r"\x1b\[[0-9;]*m", "", eta_str)

                        self._update_overall_progress(job)
                    elif d["status"] == "finished":
                        track_state["status"] = "converting"

                ydl_opts = {
                    "format": "bestaudio/best",
                    "outtmpl": raw_out_path,
                    "postprocessors": [
                        {
                            "key": "FFmpegExtractAudio",
                            "preferredcodec": "mp3",
                            "preferredquality": bitrate,
                        }
                    ],
                    "progress_hooks": [progress_hook],
                    "quiet": True,
                    "no_warnings": True,
                    "nocheckcertificate": True,
                    "geo_bypass": True,
                    "socket_timeout": 30,
                    "retries": 10,
                    "fragment_retries": 10,
                    "extractor_args": DEFAULT_EXTRACTOR_ARGS,
                    "http_headers": {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
                        "Accept-Language": "en-US,en;q=0.9",
                    },
                }

                ffmpeg_path = get_ffmpeg_path()
                if ffmpeg_path:
                    ydl_opts["ffmpeg_location"] = ffmpeg_path

                info_dict = None
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info_dict = ydl.extract_info(video_url, download=True)

                # Auto-resolve artist / title if Unknown Artist
                if (not artist or artist.lower() in ["unknown artist", "unknown", ""]) and info_dict:
                    fetched_artist = (
                        info_dict.get("artist")
                        or info_dict.get("creator")
                        or info_dict.get("channel")
                        or info_dict.get("uploader")
                    )
                    if fetched_artist:
                        clean_fetched = metadata_tagger.strip_video_tags(fetched_artist)
                        clean_fetched = re.sub(r"\s*-\s*Topic$", "", clean_fetched, flags=re.IGNORECASE).strip()
                        if clean_fetched:
                            artist = clean_fetched
                            track_state["artist"] = artist
                            job["current_track_title"] = f"{artist} - {title}"
                            self._add_log(job, f"[Metadata] Menemukan artis otomatis: {artist}")

                # Update final filename with resolved metadata
                final_filename = metadata_tagger.format_filename(
                    template=filename_template,
                    track_number=track_num,
                    title=title,
                    artist=artist,
                    video_id=track_id,
                )
                final_mp3_path = os.path.join(target_dir, final_filename)

                if not os.path.exists(expected_intermediate_mp3):
                    found = False
                    for f in os.listdir(target_dir):
                        if track_id in f and f.lower().endswith(".mp3"):
                            expected_intermediate_mp3 = os.path.join(target_dir, f)
                            found = True
                            break
                    if not found:
                        raise FileNotFoundError(f"File MP3 hasil konversi tidak ditemukan untuk {video_url}")

                if os.path.abspath(expected_intermediate_mp3) != os.path.abspath(final_mp3_path):
                    if os.path.exists(final_mp3_path):
                        try:
                            os.remove(final_mp3_path)
                        except Exception:
                            pass
                    os.rename(expected_intermediate_mp3, final_mp3_path)

                # 2. Process Cover Art
                cover_bytes = None
                if embed_cover and thumb_url:
                    track_state["status"] = "tagging"
                    cover_save_path = None
                    if save_cover_file and not playlist_cover_saved:
                        cover_save_path = os.path.join(target_dir, "cover.jpg")
                        playlist_cover_saved = True

                    cover_bytes = cover_processor.process_thumbnail(
                        thumb_url, output_path=cover_save_path
                    )

                # 3. Fetch Lyrics
                lyrics_text = None
                if fetch_lyrics:
                    track_state["status"] = "lyrics"
                    lyrics_res = lyrics_fetcher.fetch_lyrics(
                        title=title,
                        artist=artist,
                        album=album_name,
                        duration=track.get("duration"),
                    )

                    synced_lrc = lyrics_res.get("synced_lyrics")
                    plain_lyrics = lyrics_res.get("plain_lyrics")

                    if synced_lrc or plain_lyrics:
                        self._add_log(job, f"[Lirik] Ditemukan ({lyrics_res.get('source')})")
                        lyrics_text = plain_lyrics or synced_lrc

                        if save_lrc_file and synced_lrc:
                            lrc_filename = os.path.splitext(final_filename)[0] + ".lrc"
                            lrc_path = os.path.join(target_dir, lrc_filename)
                            try:
                                with open(lrc_path, "w", encoding="utf-8") as f_lrc:
                                    f_lrc.write(synced_lrc)
                            except Exception as e:
                                logger.error(f"Failed to save .lrc: {e}")

                # 4. Apply complete ID3 Metadata
                track_state["status"] = "tagging"
                metadata_tagger.apply_id3_tags(
                    file_path=final_mp3_path,
                    track_number=track_num,
                    title=title,
                    artist=artist,
                    album=album_name,
                    album_artist=album_artist,
                    is_compilation=is_compilation,
                    total_tracks=len(tracks),
                    year=time.strftime("%Y"),
                    genre="Music",
                    cover_bytes=cover_bytes,
                    lyrics_text=lyrics_text,
                )

                track_state["status"] = "completed"
                track_state["progress"] = 100.0
                track_state["file_path"] = final_mp3_path
                job["completed_tracks"] += 1
                self._add_log(job, f"[Selesai] [{idx}/{len(tracks)}]: {final_filename}")

            except Exception as e:
                logger.error(f"Error downloading track {track_id}: {e}", exc_info=True)
                track_state["status"] = "failed"
                track_state["error"] = str(e)
                job["failed_tracks"] += 1
                self._add_log(job, f"[Gagal] [{title}]: {e}")

            self._update_overall_progress(job)

        job["status"] = "completed"
        job["overall_percent"] = 100.0
        job["speed"] = "Selesai"
        job["eta"] = "0s"
        self._add_log(
            job,
            f"[Selesai Semua] Berhasil: {job['completed_tracks']}, Gagal: {job['failed_tracks']}. Lokasi: {target_dir}",
        )

    def _update_overall_progress(self, job: Dict[str, Any]):
        total = job["total_tracks"]
        if total == 0:
            job["overall_percent"] = 100.0
            return

        total_progress = 0.0
        for t_state in job["tracks_status"].values():
            if t_state["status"] == "completed":
                total_progress += 100.0
            elif t_state["status"] == "failed":
                total_progress += 100.0
            else:
                total_progress += t_state.get("progress", 0.0)

        job["overall_percent"] = round(total_progress / total, 1)

    def _add_log(self, job: Dict[str, Any], message: str):
        timestamp = time.strftime("%H:%M:%S")
        log_entry = f"[{timestamp}] {message}"
        job["logs"].append(log_entry)
        if len(job["logs"]) > 200:
            job["logs"].pop(0)

    def _format_duration(self, seconds: Optional[float]) -> str:
        if not seconds:
            return "--:--"
        mins = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{mins}:{secs:02d}"

    def sync_playlist_with_folder(self, playlist_url: str, folder_path: str) -> Dict[str, Any]:
        """
        Compare a YouTube Playlist with an existing local music folder.
        Identifies which songs already exist locally and which are new and missing.
        """
        playlist_data = self.analyze_url(playlist_url)
        folder_scan = metadata_tagger.scan_folder(folder_path)

        if not folder_scan.get("success"):
            raise ValueError(folder_scan.get("error", "Gagal memindai folder lokal."))

        local_files = folder_scan.get("files", [])
        
        # Build lookup set of existing video IDs and normalized title strings
        existing_ids = set()
        local_titles = []

        for f in local_files:
            if f.get("youtube_id"):
                existing_ids.add(f["youtube_id"])
            # Normalize title for fallback matching
            clean_t = re.sub(r"[^a-zA-Z0-9]", "", (f.get("title") or f.get("file") or "").lower())
            if clean_t:
                local_titles.append((clean_t, f["file"]))

        new_tracks = []
        existing_tracks = []
        all_comparison = []

        playlist_tracks = playlist_data.get("tracks", [])
        for track in playlist_tracks:
            v_id = track.get("id")
            norm_title = re.sub(r"[^a-zA-Z0-9]", "", (track.get("title") or "").lower())
            
            is_existing = False
            matching_file = None

            # 1. Match by YouTube ID
            if v_id and v_id in existing_ids:
                is_existing = True
                for f in local_files:
                    if f.get("youtube_id") == v_id:
                        matching_file = f["file"]
                        break
            
            # 2. Match by normalized title if ID not matched
            if not is_existing and norm_title and len(norm_title) >= 4:
                for lt, fname in local_titles:
                    if norm_title in lt or lt in norm_title:
                        is_existing = True
                        matching_file = fname
                        break

            item_info = {
                **track,
                "is_existing": is_existing,
                "matching_file": matching_file,
            }

            all_comparison.append(item_info)
            if is_existing:
                existing_tracks.append(item_info)
            else:
                new_tracks.append(item_info)

        return {
            "success": True,
            "playlist_title": playlist_data.get("title", "YouTube Playlist"),
            "playlist_uploader": playlist_data.get("uploader", "YouTube"),
            "playlist_thumbnail": playlist_data.get("thumbnail", ""),
            "folder_path": folder_path,
            "folder_name": folder_scan.get("folder_name", ""),
            "total_playlist_tracks": len(playlist_tracks),
            "total_local_tracks": len(local_files),
            "existing_count": len(existing_tracks),
            "new_count": len(new_tracks),
            "new_tracks": new_tracks,
            "existing_tracks": existing_tracks,
            "all_comparison": all_comparison,
            "album_artist": playlist_data.get("album_artist", "Various Artists"),
        }


downloader = PlaylistDownloader()

