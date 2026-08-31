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

import subprocess
import uvicorn
import webbrowser

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


def open_app_window_fallback(url):
    """
    Seamless zero-dependency fallback for Windows:
    Opens a dedicated standalone Chromium App Window (via Edge/Chrome) with no address bar or tabs.
    Works instantly on 100% of Windows 10/11 machines without requiring .NET or DLL unblocking.
    """
    # Store profile permanently in LocalAppData so localStorage and user settings are never lost
    profile_dir = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "MusicGit", "profile")
    os.makedirs(profile_dir, exist_ok=True)

    candidates = [
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%LocalAppData%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe"),
    ]
    for exe in candidates:
        if os.path.isfile(exe):
            try:
                proc = subprocess.Popen([
                    exe,
                    f"--app={url}",
                    f"--user-data-dir={profile_dir}",
                    "--window-size=1240,820",
                    "--disable-extensions",
                ])
                proc.wait()
                return
            except Exception:
                pass

    # Final fallback: open in default browser
    webbrowser.open(url)
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass


def main():
    multiprocessing.freeze_support()

    # Start FastAPI backend in background daemon thread
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # Wait briefly for backend server to be ready
    time.sleep(0.8)

    url = f"http://{HOST}:{PORT}"

    use_fallback = False
    try:
        import webview
        # Create and display native standalone desktop window
        webview.create_window(
            title="MusicGit - Music Player & Playlist Sync",
            url=url,
            width=1240,
            height=820,
            min_size=(960, 640),
            text_select=True,
        )

        # Blocks until the desktop window is closed by the user
        is_dev = not getattr(sys, "frozen", False)
        webview.start(debug=is_dev, private_mode=False)
    except BaseException:
        use_fallback = True

    if use_fallback:
        open_app_window_fallback(url)


if __name__ == "__main__":
    main()

