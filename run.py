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

# Set explicit AppUserModelID on Windows so the taskbar groups and shows the correct icon
if sys.platform == "win32":
    try:
        import ctypes
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("MusicGit.PlaylistSync.Player.2.3")
    except Exception:
        pass

# Unify WebView2 persistent user data folder across python.exe and MusicGit.exe
PROFILE_DIR = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "MusicGit", "profile")
os.makedirs(PROFILE_DIR, exist_ok=True)
os.environ["WEBVIEW2_USER_DATA_FOLDER"] = PROFILE_DIR


import json
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


def is_window_position_valid(x: int, y: int, width: int = 200, height: int = 200) -> bool:
    """
    Ensure the window position is actually visible on at least one connected display.
    In Windows, minimized windows have coordinates like (-32000, -32000).
    Also prevents windows from opening offscreen if an external monitor was unplugged.
    """
    if x is None or y is None:
        return False
    # Check Windows minimized window coordinates (-32000) or absurd values
    if x <= -10000 or y <= -10000 or x >= 50000 or y >= 50000:
        return False

    # Check against active monitors via pywebview screens if available
    try:
        import webview
        screens = getattr(webview, "screens", None)
        if screens:
            for s in screens:
                overlap_w = max(0, min(x + width, s.x + s.width) - max(x, s.x))
                overlap_h = max(0, min(y + height, s.y + s.height) - max(y, s.y))
                if overlap_w >= 100 and overlap_h >= 100:
                    return True
            return False
    except Exception:
        pass

    # Windows API fallback
    try:
        import ctypes
        user32 = ctypes.windll.user32
        vx = user32.GetSystemMetrics(76)  # SM_XVIRTUALSCREEN
        vy = user32.GetSystemMetrics(77)  # SM_YVIRTUALSCREEN
        vw = user32.GetSystemMetrics(78)  # SM_CXVIRTUALSCREEN
        vh = user32.GetSystemMetrics(79)  # SM_CYVIRTUALSCREEN
        if vw > 0 and vh > 0:
            overlap_w = max(0, min(x + width, vx + vw) - max(x, vx))
            overlap_h = max(0, min(y + height, vy + vh) - max(y, vy))
            return overlap_w >= 100 and overlap_h >= 100
    except Exception:
        pass

    return -50 <= x <= 10000 and -50 <= y <= 10000


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
                    if isinstance(w, int) and 640 <= w <= 8000:
                        default_state["width"] = w
                    if isinstance(h, int) and 480 <= h <= 8000:
                        default_state["height"] = h

                    x = data.get("x")
                    y = data.get("y")
                    if isinstance(x, int) and isinstance(y, int):
                        if is_window_position_valid(x, y, default_state["width"], default_state["height"]):
                            default_state["x"] = x
                            default_state["y"] = y

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
        is_minimized = False

        # Keep track of last known valid bounds (normal state)
        last_valid_bounds = {
            "width": state.get("width", 1240),
            "height": state.get("height", 820),
            "x": state.get("x"),
            "y": state.get("y"),
        }

        def on_maximized():
            nonlocal is_maximized, is_minimized
            is_maximized = True
            is_minimized = False

        def on_minimized():
            nonlocal is_minimized
            is_minimized = True

        def on_restored():
            nonlocal is_maximized, is_minimized
            is_maximized = False
            is_minimized = False

        def on_resized(*args, **kwargs):
            nonlocal is_maximized, is_minimized
            if not is_maximized and not is_minimized:
                try:
                    w = int(window.width) if window.width else None
                    h = int(window.height) if window.height else None
                    if w and 640 <= w <= 8000:
                        last_valid_bounds["width"] = w
                    if h and 480 <= h <= 8000:
                        last_valid_bounds["height"] = h
                except Exception:
                    pass

        def on_moved(*args, **kwargs):
            nonlocal is_maximized, is_minimized
            if not is_maximized and not is_minimized:
                try:
                    if window.x is not None and window.y is not None:
                        wx, wy = int(window.x), int(window.y)
                        if is_window_position_valid(wx, wy, last_valid_bounds["width"], last_valid_bounds["height"]):
                            last_valid_bounds["x"] = wx
                            last_valid_bounds["y"] = wy
                except Exception:
                    pass

        def on_closing():
            nonlocal is_maximized, is_minimized
            try:
                new_state = {
                    "maximized": is_maximized,
                    "width": last_valid_bounds.get("width", 1240),
                    "height": last_valid_bounds.get("height", 820),
                    "x": last_valid_bounds.get("x"),
                    "y": last_valid_bounds.get("y"),
                }
                # If currently normal (not minimized or maximized), capture latest position
                if not is_maximized and not is_minimized:
                    if window.width and 640 <= int(window.width) <= 8000:
                        new_state["width"] = int(window.width)
                    if window.height and 480 <= int(window.height) <= 8000:
                        new_state["height"] = int(window.height)
                    if window.x is not None and window.y is not None:
                        wx, wy = int(window.x), int(window.y)
                        if is_window_position_valid(wx, wy, new_state["width"], new_state["height"]):
                            new_state["x"] = wx
                            new_state["y"] = wy
                save_window_state(new_state)
            except Exception:
                pass

        def on_shown():
            if state.get("maximized"):
                try:
                    window.maximize()
                except Exception:
                    pass
            else:
                # Sanity check: ensure window is not positioned offscreen
                try:
                    if window.x is not None and window.y is not None:
                        wx, wy = int(window.x), int(window.y)
                        w = int(window.width or 1240)
                        h = int(window.height or 820)
                        if not is_window_position_valid(wx, wy, w, h):
                            window.move(100, 100)
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
        window.events.minimized += on_minimized
        window.events.restored += on_restored
        window.events.resized += on_resized
        window.events.moved += on_moved
        window.events.closing += on_closing
        window.events.shown += on_shown

        # Resolve path to app_icon.ico for native window & taskbar
        if getattr(sys, "frozen", False):
            base_icon_dir = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
        else:
            base_icon_dir = os.path.dirname(os.path.abspath(__file__))

        icon_path = os.path.join(base_icon_dir, "app_icon.ico")
        if not os.path.isfile(icon_path):
            icon_path = os.path.join(os.path.dirname(sys.executable), "app_icon.ico")
        if not os.path.isfile(icon_path):
            icon_path = None

        # Blocks until the desktop window is closed by the user
        is_dev = not getattr(sys, "frozen", False)
        webview.start(debug=is_dev, private_mode=False, storage_path=PROFILE_DIR, icon=icon_path)
    except BaseException:
        use_fallback = True

    if use_fallback:
        open_app_window_fallback(url)

    # Force complete termination so no background processes or port locks linger
    os._exit(0)


if __name__ == "__main__":
    main()

