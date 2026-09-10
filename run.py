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

import socket
import subprocess
import uvicorn
import webbrowser

HOST = "127.0.0.1"


def find_available_port(start_port: int = 8585, max_attempts: int = 50) -> int:
    """Find a free TCP port starting from start_port to prevent [Errno 10048]."""
    for port in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind((HOST, port))
                return port
            except OSError:
                continue
    return start_port


def run_server(port: int):
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
        port=port,
        log_level="warning",
        reload=False,
    )
    server = uvicorn.Server(config)
    server.run()


import json

def get_window_state_path() -> str:
    folder = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "MusicGit")
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, "window_state.json")


def load_window_state() -> dict:
    default_state = {
        "width": 1240,
        "height": 820,
        "x": None,
        "y": None,
        "maximized": False,
    }
    path = get_window_state_path()
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    w = data.get("width")
                    h = data.get("height")
                    if isinstance(w, int) and w >= 640:
                        default_state["width"] = w
                    if isinstance(h, int) and h >= 480:
                        default_state["height"] = h
                    if isinstance(data.get("x"), int):
                        default_state["x"] = data["x"]
                    if isinstance(data.get("y"), int):
                        default_state["y"] = data["y"]
                    if isinstance(data.get("maximized"), bool):
                        default_state["maximized"] = data["maximized"]
        except Exception:
            pass
    return default_state


def save_window_state(state: dict):
    path = get_window_state_path()
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
    except Exception:
        pass


def open_app_window_fallback(url):
    """
    Seamless zero-dependency fallback for Windows:
    Opens a dedicated standalone Chromium App Window (via Edge/Chrome) with no address bar or tabs.
    Works instantly on 100% of Windows 10/11 machines without requiring .NET or DLL unblocking.
    """
    # Store profile permanently in LocalAppData so localStorage and user settings are never lost
    profile_dir = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "MusicGit", "profile")
    os.makedirs(profile_dir, exist_ok=True)

    state = load_window_state()
    w = state.get("width", 1240)
    h = state.get("height", 820)

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
                cmd = [
                    exe,
                    f"--app={url}",
                    f"--user-data-dir={profile_dir}",
                    f"--window-size={w},{h}",
                    "--disable-extensions",
                    "--enable-features=WindowControlsOverlay",
                ]
                if state.get("maximized"):
                    cmd.append("--start-maximized")
                proc = subprocess.Popen(cmd)
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


def wait_for_server(host: str, port: int, timeout: float = 6.0) -> bool:
    """Wait until backend server is actively accepting connections."""
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            with socket.create_connection((host, port), timeout=0.2):
                return True
        except (OSError, ConnectionRefusedError):
            time.sleep(0.1)
    return False


def main():
    multiprocessing.freeze_support()

    # Find free port to avoid Errno 10048 port conflicts
    port = find_available_port(8585)

    # Start FastAPI backend in background daemon thread
    server_thread = threading.Thread(target=run_server, args=(port,), daemon=True)
    server_thread.start()

    # Wait until FastAPI server is fully ready and accepting connections
    wait_for_server(HOST, port, timeout=6.0)

    url = f"http://{HOST}:{port}"

    use_fallback = False
    try:
        import webview
        state = load_window_state()
        is_maximized = state.get("maximized", False)

        def on_maximized():
            nonlocal is_maximized
            is_maximized = True

        def on_restored():
            nonlocal is_maximized
            is_maximized = False

        def on_closing():
            nonlocal is_maximized
            try:
                new_state = {
                    "maximized": is_maximized,
                    "width": state.get("width", 1240),
                    "height": state.get("height", 820),
                    "x": state.get("x"),
                    "y": state.get("y"),
                }
                # If not maximized, update width, height and coordinates
                if not is_maximized:
                    if window.width and window.width >= 640:
                        new_state["width"] = int(window.width)
                    if window.height and window.height >= 480:
                        new_state["height"] = int(window.height)
                    if window.x is not None and window.y is not None:
                        new_state["x"] = int(window.x)
                        new_state["y"] = int(window.y)
                save_window_state(new_state)
            except Exception:
                pass

        def on_shown():
            if state.get("maximized"):
                try:
                    window.maximize()
                except Exception:
                    pass

        # Create and display native standalone desktop window
        window = webview.create_window(
            title="MusicGit - Music Player & Playlist Sync",
            url=url,
            width=state.get("width", 1240),
            height=state.get("height", 820),
            x=state.get("x"),
            y=state.get("y"),
            min_size=(960, 640),
            text_select=True,
            background_color="#181818",
            easy_drag=True,
        )

        window.events.maximized += on_maximized
        window.events.restored += on_restored
        window.events.closing += on_closing
        window.events.shown += on_shown

        # Blocks until the desktop window is closed by the user
        is_dev = not getattr(sys, "frozen", False)
        webview.start(debug=is_dev, private_mode=False)
    except BaseException:
        use_fallback = True

    if use_fallback:
        open_app_window_fallback(url)


if __name__ == "__main__":
    main()

