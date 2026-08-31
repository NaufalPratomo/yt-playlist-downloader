"""MusicGit Android Embedded Server Runner

Launches uvicorn ASGI server hosting backend.app on 127.0.0.1:8585
within the Android process via Chaquopy.
"""

import sys
import os
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MusicGitAndroid")


def start_server():
    try:
        current_dir = str(Path(__file__).parent.resolve())
        if current_dir not in sys.path:
            sys.path.insert(0, current_dir)

        import uvicorn
        from backend.app import app

        logger.info("Initializing MusicGit FastAPI server on Android on 127.0.0.1:8585...")
        uvicorn.run(app, host="127.0.0.1", port=8585, log_level="info", access_log=False)
    except Exception as e:
        logger.error(f"Error launching Android uvicorn server: {e}", exc_info=True)


if __name__ == "__main__":
    start_server()
