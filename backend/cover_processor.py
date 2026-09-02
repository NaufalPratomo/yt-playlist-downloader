"""
Cover Art Processor for YouTube Playlist Downloader.
Downloads, resizes, and crops thumbnails to high quality 1:1 square JPEG for ID3 APIC embedding.
"""

import io
import logging
import os
import ssl
import urllib.request
from typing import Optional
from PIL import Image

logger = logging.getLogger("cover_processor")


def _fetch_image_bytes(url: str, timeout: int = 15) -> Optional[bytes]:
    """Fetch image bytes from URL supporting SSL fallback on Android/Chaquopy."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
    }
    # 1. Try requests
    try:
        import requests
        resp = requests.get(url, headers=headers, timeout=timeout, verify=False)
        if resp.status_code == 200 and resp.content:
            return resp.content
    except Exception as e:
        logger.debug(f"requests failed for image {url}: {e}")

    # 2. Try standard urllib
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as response:
            if response.status == 200:
                return response.read()
    except Exception as e:
        logger.debug(f"urllib standard failed for image {url}: {e}")

    # 3. Try urllib with unverified SSL context (crucial for Android Chaquopy)
    try:
        ctx = ssl._create_unverified_context()
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as response:
            if response.status == 200:
                return response.read()
    except Exception as e:
        logger.error(f"All download attempts failed for image {url}: {e}")

    return None


class CoverProcessor:
    def __init__(self, target_size: int = 600):
        self.target_size = target_size

    def process_thumbnail(self, thumbnail_url: str, output_path: Optional[str] = None) -> Optional[bytes]:
        """
        Download thumbnail from URL, center-crop to 1:1 square, resize to target_size,
        optionally save to output_path, and return JPEG bytes.
        """
        if not thumbnail_url:
            return None

        try:
            image_data = _fetch_image_bytes(thumbnail_url)
            if not image_data:
                return None

            image = Image.open(io.BytesIO(image_data))
            
            # Convert RGBA / P to RGB
            if image.mode in ("RGBA", "P", "LA"):
                background = Image.new("RGB", image.size, (0, 0, 0))
                if image.mode == "P":
                    image = image.convert("RGBA")
                background.paste(image, mask=image.split()[-1] if image.mode == "RGBA" else None)
                image = background
            elif image.mode != "RGB":
                image = image.convert("RGB")

            # Center-crop to 1:1 square
            width, height = image.size
            min_dim = min(width, height)
            left = (width - min_dim) // 2
            top = (height - min_dim) // 2
            right = left + min_dim
            bottom = top + min_dim

            cropped_image = image.crop((left, top, right, bottom))
            resample_filter = getattr(Image, "Resampling", Image).LANCZOS if hasattr(Image, "Resampling") else getattr(Image, "LANCZOS", Image.BICUBIC)
            resized_image = cropped_image.resize(
                (self.target_size, self.target_size), resample_filter
            )

            # Output buffer
            buf = io.BytesIO()
            resized_image.save(buf, format="JPEG", quality=92, optimize=True)
            jpeg_bytes = buf.getvalue()

            # Save to file if path is specified
            if output_path:
                os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
                with open(output_path, "wb") as f:
                    f.write(jpeg_bytes)

            return jpeg_bytes
        except Exception as e:
            logger.error(f"Error processing thumbnail ({thumbnail_url}): {e}")
            if image_data:
                if output_path:
                    try:
                        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
                        with open(output_path, "wb") as f:
                            f.write(image_data)
                    except Exception:
                        pass
                return image_data
            return None


cover_processor = CoverProcessor()
