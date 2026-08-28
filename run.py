"""
Launcher for YouTube Playlist Downloader.
Starts FastAPI backend server on port 8585 and opens web browser automatically.
Compatible with PyInstaller standalone .exe builds.
"""

import multiprocessing
import os
import sys
import threading
import time
import webbrowser
import uvicorn

PORT = 8585
HOST = "127.0.0.1"


def open_browser():
    """Wait for server to start, then open the UI in default browser."""
    time.sleep(1.2)
    url = f"http://{HOST}:{PORT}"
    print(f"\n========================================================")
    print(f" YouTube Playlist Downloader siap dibuka di:")
    print(f" {url}")
    print(f"========================================================\n")
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"Tidak dapat membuka browser secara otomatis: {e}")


def main():
    multiprocessing.freeze_support()

    # Ensure base directory is in sys.path
    if getattr(sys, "frozen", False):
        base_dir = sys._MEIPASS
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))

    if base_dir not in sys.path:
        sys.path.insert(0, base_dir)

    from backend.app import app

    print("Memulai YouTube Playlist Downloader Server...")
    threading.Thread(target=open_browser, daemon=True).start()

    uvicorn.run(
        app,
        host=HOST,
        port=PORT,
        log_level="info",
        reload=False,
    )


if __name__ == "__main__":
    main()
