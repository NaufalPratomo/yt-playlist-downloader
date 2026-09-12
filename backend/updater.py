"""
In-App Auto-Update Engine for MusicGit (Windows & Android).
Checks GitHub Releases API, downloads release assets with real-time progress,
and executes silent updates on Windows or delivers APK path to Android.
"""

import os
import re
import sys
import json
import time
import shutil
import logging
import tempfile
import threading
import subprocess
import urllib.request
import urllib.error
from typing import Tuple, Dict, Any, Optional

logger = logging.getLogger("musicgit.updater")

CURRENT_VERSION = "2.3.1"
GITHUB_REPO = "naufalpratomo/yt-playlist-downloader"


def get_installed_exe_path() -> str:
    """Resolve the true path to MusicGit.exe on Windows."""
    if getattr(sys, 'frozen', False) and sys.executable:
        return sys.executable
    if sys.platform == "win32":
        try:
            import winreg
            for root in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
                try:
                    with winreg.OpenKey(root, r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{D37E84B1-2E9E-4B07-A961-A768F80BB872}_is1") as key:
                        install_dir, _ = winreg.QueryValueEx(key, "InstallLocation")
                        candidate = os.path.join(install_dir, "MusicGit.exe")
                        if os.path.exists(candidate):
                            return candidate
                except OSError:
                    pass
        except Exception:
            pass
    return os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "MusicGit", "MusicGit.exe")


def parse_version(v: str) -> Tuple[int, ...]:
    """
    Parse a version string (e.g. 'v2.3.1', 'V2.3.1', '2.3', 'v2.3.10') into a tuple of integers.
    Handles semantic versioning comparison accurately.
    """
    if not v:
        return (0,)
    cleaned = re.sub(r'^[vV]', '', str(v).strip())
    main_part = cleaned.split('-')[0].split('+')[0]
    parts = re.findall(r'\d+', main_part)
    return tuple(int(p) for p in parts) if parts else (0,)


def is_update_available(latest_tag: str, current_ver: str = CURRENT_VERSION) -> bool:
    """
    Check if latest_tag from GitHub is strictly newer than current_ver.
    (2, 3, 1) > (2, 3, 0) -> True
    (2, 3, 10) > (2, 3, 9) -> True
    (2, 3, 0) > (2, 3, 0) -> False
    """
    r_ver = parse_version(latest_tag)
    l_ver = parse_version(current_ver)
    max_len = max(len(r_ver), len(l_ver))
    r_padded = r_ver + (0,) * (max_len - len(r_ver))
    l_padded = l_ver + (0,) * (max_len - len(l_ver))
    return r_padded > l_padded


class AppUpdater:
    def __init__(self):
        self._lock = threading.Lock()
        self._download_thread: Optional[threading.Thread] = None
        self._progress = {
            "status": "idle",  # "idle" | "downloading" | "ready" | "error"
            "percentage": 0,
            "downloaded_bytes": 0,
            "total_bytes": 0,
            "download_speed": "0 KB/s",
            "file_path": "",
            "target_version": "",
            "error_message": "",
        }
        self._cached_release_info: Optional[Dict[str, Any]] = None
        self._last_check_time: float = 0

    def get_platform(self) -> str:
        """Detect operating system platform ('android' or 'windows')."""
        if "ANDROID_ROOT" in os.environ or "CHAQUOPY" in os.environ:
            return "android"
        if sys.platform == "win32":
            return "windows"
        return sys.platform

    def check_for_updates(self, force: bool = False) -> Dict[str, Any]:
        """
        Check GitHub Releases API for the latest published release.
        Caches response for 60 seconds unless force=True.
        """
        now = time.time()
        if not force and self._cached_release_info and (now - self._last_check_time < 60):
            return self._cached_release_info

        url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "MusicGit-App-Updater",
                "Accept": "application/vnd.github.v3+json",
            },
        )

        try:
            with urllib.request.urlopen(req, timeout=8.0) as resp:
                if resp.status != 200:
                    raise Exception(f"HTTP status {resp.status}")
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return {
                    "update_available": False,
                    "current_version": CURRENT_VERSION,
                    "latest_version": CURRENT_VERSION,
                    "message": "Belum ada rilis resmi di GitHub.",
                }
            raise Exception(f"Gagal memeriksa update (HTTP {e.code})")
        except Exception as e:
            logger.warning(f"Error checking updates from GitHub: {e}")
            raise Exception(f"Tidak dapat terhubung ke server GitHub: {str(e)}")

        latest_tag = data.get("tag_name", "")
        update_available = is_update_available(latest_tag, CURRENT_VERSION)
        platform = self.get_platform()

        # Filter relevant assets for Windows or Android
        assets = data.get("assets", [])
        matched_asset = None

        if platform == "android":
            for a in assets:
                name = a.get("name", "").lower()
                if name.endswith(".apk"):
                    matched_asset = a
                    break
        else:
            # Windows: Prefer Setup.exe installer, fallback to Windows.zip
            for a in assets:
                name = a.get("name", "").lower()
                if "setup" in name and name.endswith(".exe"):
                    matched_asset = a
                    break
            if not matched_asset:
                for a in assets:
                    name = a.get("name", "").lower()
                    if name.endswith(".exe") or ("windows" in name and name.endswith(".zip")):
                        matched_asset = a
                        break

        result = {
            "update_available": update_available,
            "current_version": CURRENT_VERSION,
            "latest_version": latest_tag,
            "release_name": data.get("name") or latest_tag,
            "release_notes": data.get("body") or "Tidak ada catatan rilis.",
            "published_at": data.get("published_at") or "",
            "html_url": data.get("html_url") or f"https://github.com/{GITHUB_REPO}/releases",
            "platform": platform,
            "asset_name": matched_asset.get("name") if matched_asset else "",
            "asset_url": matched_asset.get("browser_download_url") if matched_asset else "",
            "asset_size": matched_asset.get("size", 0) if matched_asset else 0,
        }

        self._cached_release_info = result
        self._last_check_time = now
        return result

    def start_download(self, asset_url: str, filename: str, target_version: str) -> bool:
        """Start downloading the update asset in a daemon background thread."""
        with self._lock:
            if self._progress["status"] == "downloading":
                return False

            self._progress = {
                "status": "downloading",
                "percentage": 0,
                "downloaded_bytes": 0,
                "total_bytes": 0,
                "download_speed": "0 KB/s",
                "file_path": "",
                "target_version": target_version,
                "error_message": "",
            }

        thread = threading.Thread(
            target=self._download_worker,
            args=(asset_url, filename, target_version),
            daemon=True,
            name="AppUpdaterDownloadWorker"
        )
        self._download_thread = thread
        thread.start()
        return True

    def _download_worker(self, asset_url: str, filename: str, target_version: str):
        """Worker thread for downloading asset with progressive chunk writing."""
        platform = self.get_platform()
        if platform == "android":
            cache_dir = os.environ.get("EXTERNAL_STORAGE", "/storage/emulated/0")
            dest_dir = os.path.join(cache_dir, "Android", "data", "com.naufalpratomo.musicgit", "cache")
            if not os.path.exists(dest_dir):
                dest_dir = tempfile.gettempdir()
        else:
            dest_dir = os.path.join(tempfile.gettempdir(), "MusicGit_Update")

        try:
            os.makedirs(dest_dir, exist_ok=True)
            target_path = os.path.join(dest_dir, filename)

            if os.path.exists(target_path):
                try:
                    os.remove(target_path)
                except Exception:
                    pass

            req = urllib.request.Request(
                asset_url,
                headers={"User-Agent": "MusicGit-App-Updater"},
            )

            with urllib.request.urlopen(req, timeout=30.0) as resp:
                total_bytes = int(resp.headers.get("Content-Length", 0))
                with self._lock:
                    self._progress["total_bytes"] = total_bytes

                downloaded = 0
                chunk_size = 64 * 1024  # 64 KB chunks
                last_time = time.time()
                bytes_since_last = 0

                with open(target_path, "wb") as f:
                    while True:
                        chunk = resp.read(chunk_size)
                        if not chunk:
                            break
                        f.write(chunk)
                        downloaded += len(chunk)
                        bytes_since_last += len(chunk)

                        now = time.time()
                        time_diff = now - last_time
                        if time_diff >= 0.5:
                            speed = (bytes_since_last / time_diff) / 1024  # KB/s
                            speed_str = f"{speed / 1024:.1f} MB/s" if speed >= 1024 else f"{int(speed)} KB/s"
                            pct = int((downloaded / total_bytes * 100)) if total_bytes > 0 else 0

                            with self._lock:
                                self._progress["downloaded_bytes"] = downloaded
                                self._progress["percentage"] = min(pct, 99)
                                self._progress["download_speed"] = speed_str

                            last_time = now
                            bytes_since_last = 0

            with self._lock:
                self._progress["status"] = "ready"
                self._progress["percentage"] = 100
                self._progress["downloaded_bytes"] = downloaded
                self._progress["total_bytes"] = downloaded
                self._progress["download_speed"] = "Selesai"
                self._progress["file_path"] = target_path

            logger.info(f"Update asset successfully downloaded to: {target_path}")

        except Exception as e:
            logger.error(f"Download failed: {e}")
            with self._lock:
                self._progress["status"] = "error"
                self._progress["error_message"] = str(e)

    def get_progress(self) -> Dict[str, Any]:
        """Get the current download progress state."""
        with self._lock:
            return dict(self._progress)

    def apply_update(self) -> Dict[str, Any]:
        """
        Execute the update.
        - Windows: Executes setup.exe in silent mode and terminates MusicGit.
        - Android: Returns file_path to frontend so AndroidBridge can trigger intent.
        """
        with self._lock:
            status = self._progress["status"]
            file_path = self._progress["file_path"]

        if status != "ready" or not file_path or not os.path.exists(file_path):
            raise Exception("File pembaruan belum siap atau belum diunduh.")

        platform = self.get_platform()

        if platform == "android":
            return {
                "success": True,
                "platform": "android",
                "apk_path": file_path,
                "message": "File APK siap dipasang via package installer.",
            }

        # Windows execution
        if platform == "windows":
            # Flags to completely prevent any cmd.exe console window from appearing on desktop
            DETACHED_PROCESS = 0x00000008
            CREATE_NO_WINDOW = 0x08000000
            creationflags = CREATE_NO_WINDOW | DETACHED_PROCESS

            if file_path.lower().endswith(".exe"):
                bat_path = os.path.join(tempfile.gettempdir(), "musicgit_installer.bat")
                pid = os.getpid()
                app_exe = get_installed_exe_path()
                # /SILENT displays a sleek Inno Setup progress bar without wizard questions;
                # cmd.exe runs detached with CREATE_NO_WINDOW so no black terminal is shown.
                bat_content = f"""@echo off
ping 127.0.0.1 -n 2 >nul
taskkill /F /PID {pid} >nul 2>&1
ping 127.0.0.1 -n 2 >nul
start /wait "" "{file_path}" /SILENT /SUPPRESSMSGBOXES /CLOSEAPPLICATIONS
if exist "{app_exe}" (
    start "" "{app_exe}"
)
del "%~f0"
"""
                try:
                    with open(bat_path, "w", encoding="utf-8") as f:
                        f.write(bat_content)
                    subprocess.Popen(
                        ["cmd.exe", "/c", bat_path],
                        shell=False,
                        creationflags=creationflags,
                        close_fds=True
                    )
                    threading.Timer(1.0, lambda: os._exit(0)).start()
                    return {
                        "success": True,
                        "platform": "windows",
                        "message": "Pembaruan sedang dipasang. Aplikasi akan restart otomatis.",
                    }
                except Exception as e:
                    raise Exception(f"Gagal menjalankan installer pembaruan: {e}")

            elif file_path.lower().endswith(".zip"):
                app_dir = os.path.dirname(os.path.abspath(sys.executable if getattr(sys, 'frozen', False) else __file__))
                if not getattr(sys, 'frozen', False):
                    app_dir = os.path.dirname(app_dir)

                bat_path = os.path.join(tempfile.gettempdir(), "musicgit_updater.bat")
                pid = os.getpid()
                bat_content = f"""@echo off
ping 127.0.0.1 -n 2 >nul
taskkill /F /PID {pid} >nul 2>&1
ping 127.0.0.1 -n 2 >nul
powershell -Command "Expand-Archive -Path '{file_path}' -DestinationPath '{app_dir}' -Force"
del /f /q "{file_path}"
start "" "{os.path.join(app_dir, 'MusicGit.exe')}"
del "%~f0"
"""
                with open(bat_path, "w") as f:
                    f.write(bat_content)
                subprocess.Popen(
                    ["cmd.exe", "/c", bat_path],
                    shell=False,
                    creationflags=creationflags,
                    close_fds=True
                )
                threading.Timer(1.0, lambda: os._exit(0)).start()
                return {
                    "success": True,
                    "platform": "windows",
                    "message": "Pembaruan portable ZIP sedang diekstrak. Aplikasi akan restart otomatis.",
                }

        raise Exception(f"Platform {platform} tidak mendukung auto-installer otomatis.")


# Global updater singleton
app_updater = AppUpdater()
