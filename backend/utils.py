"""
Utility functions for YouTube Playlist Downloader.
Handles path normalization, Windows file explorer integration, and string sanitization.
"""

import os
import platform
import re
import subprocess
from pathlib import Path
from typing import Optional


def get_default_music_dir() -> str:
    """Get the user's default Music folder."""
    user_home = Path.home()
    music_dir = user_home / "Music"
    if music_dir.exists():
        return str(music_dir)
    return str(user_home)


def sanitize_filename(name: str) -> str:
    """
    Remove or replace invalid characters for Windows and Unix filenames.
    Invalid characters in Windows: < > : " / \\ | ? *
    """
    if not name:
        return "unnamed"
    # Replace illegal characters with empty or hyphen
    sanitized = re.sub(r'[<>:"/\\|?*]', "", name)
    # Remove control characters
    sanitized = re.sub(r"[\x00-\x1f\x7f]", "", sanitized)
    # Strip leading/trailing dots and spaces
    sanitized = sanitized.strip(" .")
    return sanitized if sanitized else "unnamed"


def open_in_explorer(folder_path: str) -> bool:
    """Open folder in Windows File Explorer or native OS file manager."""
    try:
        abs_path = os.path.abspath(folder_path)
        if not os.path.exists(abs_path):
            os.makedirs(abs_path, exist_ok=True)

        if platform.system() == "Windows":
            os.startfile(abs_path)
            return True
        elif platform.system() == "Darwin":
            subprocess.run(["open", abs_path], check=True)
            return True
        else:
            subprocess.run(["xdg-open", abs_path], check=True)
            return True
    except Exception as e:
        print(f"Error opening folder {folder_path}: {e}")
        return False


def get_ffmpeg_path() -> Optional[str]:
    """Find the path or directory of ffmpeg binary."""
    import sys

    # 1. Check next to executable (for PyInstaller frozen app)
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(sys.executable)
        ffmpeg_exe = os.path.join(exe_dir, "ffmpeg.exe" if os.name == "nt" else "ffmpeg")
        if os.path.exists(ffmpeg_exe):
            return ffmpeg_exe
        if hasattr(sys, "_MEIPASS"):
            meipass_ffmpeg = os.path.join(sys._MEIPASS, "ffmpeg.exe" if os.name == "nt" else "ffmpeg")
            if os.path.exists(meipass_ffmpeg):
                return meipass_ffmpeg

    # 2. Check project root directory
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    root_ffmpeg = os.path.join(base_dir, "ffmpeg.exe" if os.name == "nt" else "ffmpeg")
    if os.path.exists(root_ffmpeg):
        return root_ffmpeg

    return None

