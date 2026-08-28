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
from .utils import get_default_music_dir, open_in_explorer, sanitize_filename

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
