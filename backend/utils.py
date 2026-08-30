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
    """Get the user's default Music folder (Windows, Mac, Linux, Android)."""
    # Android storage check
    android_music = Path("/storage/emulated/0/Music")
    if android_music.exists() and android_music.is_dir():
        return str(android_music)

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

def browse_folder_dialog(initial_dir: Optional[str] = None) -> Optional[str]:
    """
    Open native OS folder selection dialog (Tkinter with PowerShell fallback on Windows).
    Returns the selected folder path, or None if cancelled.
    """
    # 1. Try Tkinter
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        folder = filedialog.askdirectory(
            initialdir=initial_dir or get_default_music_dir(),
            title="Pilih Folder Musik",
        )
        root.destroy()
        if folder:
            return os.path.normpath(folder)
    except Exception:
        pass

    # 2. Windows PowerShell FolderBrowserDialog fallback
    if platform.system() == "Windows":
        try:
            ps_script = """
            Add-Type -AssemblyName System.Windows.Forms
            $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
            $dialog.Description = 'Pilih Folder Musik'
            $dialog.ShowNewFolderButton = $true
            if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
                [Console]::Out.Write($dialog.SelectedPath)
            }
            """
            res = subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps_script],
                capture_output=True,
                text=True,
                timeout=60,
            )
            selected = res.stdout.strip()
            if selected and os.path.exists(selected):
                return os.path.normpath(selected)
        except Exception:
            pass

    return None

