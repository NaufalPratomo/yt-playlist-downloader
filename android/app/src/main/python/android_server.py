"""MusicGit Android Server Runner

Launches the FastAPI backend on 127.0.0.1:8585 within Chaquopy.
If the full backend fails to start, falls back to a minimal diagnostic
HTTP server that displays the actual error in the WebView so the user
(and developer) can see what went wrong.
"""

import asyncio
import http.server
import json
import logging
import os
import sys
import traceback
from pathlib import Path

logging.basicConfig(level=logging.DEBUG, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("MusicGitAndroid")

HOST = "127.0.0.1"
PORT = 8585


def _start_diagnostic_server(error_message: str):
    """Start a minimal HTTP server that shows the startup error in the WebView."""

    class DiagnosticHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MusicGit - Startup Error</title>
<style>
body {{ font-family: -apple-system, sans-serif; background: #0f1923; color: #e0e0e0; padding: 20px; margin: 0; }}
h1 {{ color: #ff6b6b; font-size: 1.4em; }}
h2 {{ color: #ffa94d; font-size: 1.1em; }}
pre {{ background: #1a2634; color: #69db7c; padding: 16px; border-radius: 8px;
       overflow-x: auto; white-space: pre-wrap; word-break: break-all; font-size: 0.85em;
       border: 1px solid #2c3e50; }}
.info {{ color: #74c0fc; margin-top: 20px; font-size: 0.9em; }}
</style></head><body>
<h1>⚠️ MusicGit Engine Failed to Start</h1>
<h2>Error Details:</h2>
<pre>{error_message}</pre>
<div class="info">
<p><b>Python version:</b> {sys.version}</p>
<p><b>Platform:</b> {sys.platform}</p>
<p><b>sys.path:</b></p>
<pre>{chr(10).join(sys.path)}</pre>
</div>
</body></html>"""
            self.wfile.write(html.encode("utf-8"))

        def log_message(self, format, *args):
            pass  # suppress access logs

    try:
        server = http.server.HTTPServer((HOST, PORT), DiagnosticHandler)
        logger.error(f"Diagnostic server started on {HOST}:{PORT}")
        server.serve_forever()
    except Exception as e2:
        logger.error(f"Even diagnostic server failed: {e2}")


def start_server():
    error_message = ""

    # --- Phase 1: Setup sys.path ---
    try:
        current_dir = str(Path(__file__).parent.resolve())
        if current_dir not in sys.path:
            sys.path.insert(0, current_dir)
        logger.info(f"Working directory: {current_dir}")
        logger.info(f"sys.path: {sys.path}")
        logger.info(f"Directory listing: {os.listdir(current_dir)}")

        backend_dir = os.path.join(current_dir, "backend")
        if os.path.isdir(backend_dir):
            logger.info(f"backend/ contents: {os.listdir(backend_dir)}")
        else:
            logger.error(f"backend/ directory NOT FOUND at {backend_dir}")
    except Exception as e:
        error_message = f"Phase 1 (sys.path setup):\n{traceback.format_exc()}"
        logger.error(error_message)
        _start_diagnostic_server(error_message)
        return

    # --- Phase 2: Setup asyncio event loop ---
    try:
        try:
            loop = asyncio.get_event_loop()
            if loop.is_closed():
                raise RuntimeError("Event loop is closed")
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        logger.info("asyncio event loop ready")
    except Exception as e:
        error_message = f"Phase 2 (asyncio setup):\n{traceback.format_exc()}"
        logger.error(error_message)
        _start_diagnostic_server(error_message)
        return

    # --- Phase 3: Import uvicorn ---
    try:
        import uvicorn
        logger.info(f"uvicorn imported OK (version {getattr(uvicorn, '__version__', 'unknown')})")
    except Exception as e:
        error_message = f"Phase 3 (import uvicorn):\n{traceback.format_exc()}"
        logger.error(error_message)
        _start_diagnostic_server(error_message)
        return

    # --- Phase 4: Import backend.app ---
    try:
        from backend.app import app
        logger.info("backend.app imported OK")
    except Exception as e:
        error_message = f"Phase 4 (import backend.app):\n{traceback.format_exc()}"
        logger.error(error_message)
        _start_diagnostic_server(error_message)
        return

    # --- Phase 5: Start uvicorn server ---
    try:
        class AndroidUvicornServer(uvicorn.Server):
            def install_signal_handlers(self) -> None:
                pass

        config = uvicorn.Config(
            app=app,
            host=HOST,
            port=PORT,
            log_level="info",
            access_log=False,
            loop="asyncio",
        )
        server = AndroidUvicornServer(config=config)

        logger.info(f"Starting MusicGit FastAPI server on {HOST}:{PORT}...")
        server.run()
    except Exception as e:
        error_message = f"Phase 5 (uvicorn.run):\n{traceback.format_exc()}"
        logger.error(error_message)
        _start_diagnostic_server(error_message)


if __name__ == "__main__":
    start_server()
