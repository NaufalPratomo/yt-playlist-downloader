"""
Launcher for YouTube Playlist Downloader.
Starts FastAPI backend server on port 8585 and opens web browser automatically.
Compatible with PyInstaller standalone .exe builds.
"""

import io
import multiprocessing
import os
import sys
import threading
import time

# Fix for PyInstaller windowed/noconsole mode where sys.stdout, sys.stderr, sys.stdin are None
class NullWriter:
    def write(self, text):
        pass

    def flush(self):
        pass

    def isatty(self):
        return False

if sys.stdout is None:
    sys.stdout = NullWriter()
if sys.stderr is None:
    sys.stderr = NullWriter()
if sys.stdin is None:
    sys.stdin = io.StringIO()

# Ensure application directory is in PATH for finding bundled ffmpeg.exe
if getattr(sys, "frozen", False):
    exe_dir = os.path.dirname(sys.executable)
    if exe_dir not in os.environ.get("PATH", ""):
        os.environ["PATH"] = exe_dir + os.pathsep + os.environ.get("PATH", "")

import uvicorn
import webview

PORT = 8585
HOST = "127.0.0.1"


def run_server():
    """Run uvicorn server in background thread."""
    if getattr(sys, "frozen", False):
        base_dir = sys._MEIPASS
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))

    if base_dir not in sys.path:
        sys.path.insert(0, base_dir)

    from backend.app import app

    config = uvicorn.Config(
        app=app,
        host=HOST,
        port=PORT,
        log_level="warning",
        reload=False,
    )
    server = uvicorn.Server(config)
    server.run()


def main():
    multiprocessing.freeze_support()

    # Start FastAPI backend in background daemon thread
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # Wait briefly for backend server to be ready
    time.sleep(0.8)

    url = f"http://{HOST}:{PORT}"

    # Create and display native standalone desktop window
    webview.create_window(
        title="MusicGit - Music Player & Playlist Sync",
        url=url,
        width=1240,
        height=820,
        min_size=(960, 640),
        text_select=True,
    )

    # Blocks until the desktop window is closed by the user (debug=True enables F12 DevTools & F5 reload)
    is_dev = not getattr(sys, "frozen", False)
    webview.start(debug=is_dev, private_mode=False)


if __name__ == "__main__":
    main()

