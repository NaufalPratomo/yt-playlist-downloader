"""
FastAPI Server for YouTube Playlist Downloader.
Provides REST and SSE endpoints for analysis, downloading, live progress, and Windows Explorer actions.
"""

import asyncio
import json
import logging
import os
import sys
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .downloader import ACTIVE_JOBS, downloader
from .metadata_tagger import metadata_tagger
from .utils import (
    browse_folder_dialog,
    get_default_music_dir,
    open_in_explorer,
    sanitize_filename,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("app")

app = FastAPI(title="YouTube Playlist Downloader API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Pydantic Request Models
class AnalyzeRequest(BaseModel):
    url: str


class DownloadOptions(BaseModel):
    folder_name: Optional[str] = None
    bitrate: Optional[str] = "192"
    filename_template: Optional[str] = "{num}. {title}-{id}.mp3"
    embed_cover: Optional[bool] = True
    save_cover_file: Optional[bool] = True
    fetch_lyrics: Optional[bool] = True
    save_lrc_file: Optional[bool] = True
    album_name: Optional[str] = None
    album_artist: Optional[str] = None


class FixFolderTagsRequest(BaseModel):
    folder_path: str
    album_name: Optional[str] = None
    album_artist: Optional[str] = "Various Artists"


class BrowseFolderRequest(BaseModel):
    initial_dir: Optional[str] = None


class ScanFolderRequest(BaseModel):
    folder_path: str


class RepairFolderRequest(BaseModel):
    folder_path: str
    album_name: Optional[str] = None
    album_artist: Optional[str] = "Various Artists"
    is_compilation: Optional[bool] = True
    auto_fix_artists: Optional[bool] = True
    embed_local_cover: Optional[bool] = True
    fetch_missing_lyrics: Optional[bool] = True


class SyncPlaylistRequest(BaseModel):
    playlist_url: str
    folder_path: str


class TrackItem(BaseModel):
    index: int
    id: str
    url: Optional[str] = None
    title: str
    artist: str
    duration: Optional[float] = 0
    duration_formatted: Optional[str] = "--:--"
    thumbnail: Optional[str] = ""
    selected: Optional[bool] = True


class StartDownloadRequest(BaseModel):
    tracks: List[TrackItem]
    playlist_title: str
    output_base_dir: Optional[str] = None
    options: DownloadOptions


class OpenFolderRequest(BaseModel):
    path: str


# Endpoints
@app.get("/api/config")
async def get_config():
    """Get system default config and paths."""
    default_dir = get_default_music_dir()
    return {
        "default_music_dir": default_dir,
        "default_template": "{num}. {title}-{id}.mp3",
        "available_templates": [
            {"label": "1. Judul-VideoID.mp3", "value": "{num}. {title}-{id}.mp3"},
            {"label": "1. Judul.mp3", "value": "{num}. {title}.mp3"},
            {"label": "01. Judul.mp3 (2 Digit)", "value": "{num2}. {title}.mp3"},
            {"label": "Artis - Judul.mp3", "value": "{artist} - {title}.mp3"},
            {"label": "1. Artis - Judul.mp3", "value": "{num}. {artist} - {title}.mp3"},
        ],
        "available_bitrates": [
            {"label": "192 kbps (Standard HD)", "value": "192"},
            {"label": "256 kbps (High Quality)", "value": "256"},
            {"label": "320 kbps (Extreme Ultra)", "value": "320"},
            {"label": "128 kbps (Standar)", "value": "128"},
        ],
    }


@app.post("/api/analyze")
async def analyze_url(req: AnalyzeRequest):
    """Analyze YouTube Playlist or Video URL."""
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL tidak boleh kosong.")

    try:
        data = await asyncio.to_thread(downloader.analyze_url, url)
        return data
    except Exception as e:
        logger.error(f"Failed to analyze URL {url}: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/download")
async def start_download(req: StartDownloadRequest):
    """Start background download job."""
    selected_tracks = [t.model_dump() for t in req.tracks if t.selected]
    if not selected_tracks:
        raise HTTPException(status_code=400, detail="Tidak ada lagu yang dipilih untuk didownload.")

    base_dir = req.output_base_dir or get_default_music_dir()
    job_id = str(uuid.uuid4())[:8]

    try:
        downloader.start_download_job(
            job_id=job_id,
            tracks=selected_tracks,
            playlist_title=req.playlist_title,
            output_base_dir=base_dir,
            options=req.options.model_dump(),
        )
        return {"job_id": job_id, "status": "started", "total_tracks": len(selected_tracks)}
    except Exception as e:
        logger.error(f"Failed to start download job: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/job/{job_id}")
async def get_job_status(job_id: str):
    """Get snapshot of job status."""
    job = ACTIVE_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job tidak ditemukan.")
    return job


@app.get("/api/job/{job_id}/stream")
async def stream_job_progress(request: Request, job_id: str):
    """SSE endpoint for live real-time job progress."""
    job = ACTIVE_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job tidak ditemukan.")

    async def event_generator():
        last_log_count = 0
        while True:
            if await request.is_disconnected():
                break

            current_job = ACTIVE_JOBS.get(job_id)
            if not current_job:
                break

            data = {
                "status": current_job["status"],
                "overall_percent": current_job["overall_percent"],
                "speed": current_job["speed"],
                "eta": current_job["eta"],
                "completed_tracks": current_job["completed_tracks"],
                "failed_tracks": current_job["failed_tracks"],
                "total_tracks": current_job["total_tracks"],
                "current_track_index": current_job["current_track_index"],
                "current_track_title": current_job["current_track_title"],
                "tracks_status": current_job["tracks_status"],
                "target_dir": current_job["target_dir"],
                "new_logs": current_job["logs"][last_log_count:],
            }
            last_log_count = len(current_job["logs"])

            yield f"data: {json.dumps(data)}\n\n"

            if current_job["status"] in ("completed", "failed", "cancelled"):
                break

            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/open-folder")
async def open_folder(req: OpenFolderRequest):
    """Open folder in Windows File Explorer."""
    path = req.path.strip()
    if not path:
        raise HTTPException(status_code=400, detail="Path folder kosong.")

    success = open_in_explorer(path)
    return {"success": success, "path": path}


@app.post("/api/browse-folder")
async def browse_folder(req: Optional[BrowseFolderRequest] = None):
    """Open native Windows folder dialog to choose a folder."""
    initial = req.initial_dir if req else None
    selected = await asyncio.to_thread(browse_folder_dialog, initial_dir=initial)
    return {"selected_path": selected}


@app.post("/api/scan-folder")
async def scan_folder(req: ScanFolderRequest):
    """Scan and inspect local music folder for metadata issues."""
    folder = req.folder_path.strip()
    if not folder or not os.path.exists(folder):
        raise HTTPException(status_code=400, detail="Folder tidak ditemukan.")

    res = await asyncio.to_thread(metadata_tagger.scan_folder, folder_path=folder)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Gagal memindai folder."))
    return res


@app.post("/api/repair-folder")
async def repair_folder(req: RepairFolderRequest):
    """Smart repair for local music folder (tags, album unity, cover, lyrics)."""
    folder = req.folder_path.strip()
    if not folder or not os.path.exists(folder):
        raise HTTPException(status_code=400, detail="Folder tidak ditemukan.")

    res = await asyncio.to_thread(
        metadata_tagger.repair_folder_metadata,
        folder_path=folder,
        album_name=req.album_name,
        album_artist=req.album_artist or "Various Artists",
        is_compilation=req.is_compilation if req.is_compilation is not None else True,
        auto_fix_artists=req.auto_fix_artists if req.auto_fix_artists is not None else True,
        embed_local_cover=req.embed_local_cover if req.embed_local_cover is not None else True,
        fetch_missing_lyrics=req.fetch_missing_lyrics if req.fetch_missing_lyrics is not None else True,
    )
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Gagal memperbaiki folder."))
    return res


@app.post("/api/sync-playlist")
async def sync_playlist(req: SyncPlaylistRequest):
    """Compare a YouTube playlist with local folder to detect missing/new songs."""
    url = req.playlist_url.strip()
    folder = req.folder_path.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL Playlist tidak boleh kosong.")
    if not folder or not os.path.exists(folder):
        raise HTTPException(status_code=400, detail="Folder lokal tidak ditemukan.")

    try:
        res = await asyncio.to_thread(
            downloader.sync_playlist_with_folder,
            playlist_url=url,
            folder_path=folder,
        )
        return res
    except Exception as e:
        logger.error(f"Failed to sync playlist with folder: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/fix-tags")
async def fix_folder_tags(req: FixFolderTagsRequest):
    """Fix ID3 tags for existing folder so Windows Media Player groups it as a single album."""
    folder = req.folder_path.strip()
    if not folder or not os.path.exists(folder):
        raise HTTPException(status_code=400, detail="Folder tidak ditemukan.")

    res = await asyncio.to_thread(
        metadata_tagger.retag_folder,
        folder_path=folder,
        album_name=req.album_name,
        album_artist=req.album_artist or "Various Artists",
    )
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error", "Gagal memperbarui tag."))
    return res


@app.get("/api/audio-stream")
async def stream_audio(file_path: str):
    """Stream downloaded audio file for mini player."""
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File audio tidak ditemukan.")
    return FileResponse(file_path, media_type="audio/mpeg")


# Serve Frontend Static Assets (Supports PyInstaller frozen bundle and standard dev)
if getattr(sys, "frozen", False):
    frontend_dir = Path(sys._MEIPASS) / "frontend"
else:
    frontend_dir = Path(__file__).parent.parent / "frontend"

if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")
