"""
Test mutagen ID3 tagging and reading.
"""

import os
import sys

# Set standard streams to UTF-8
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.metadata_tagger import metadata_tagger
from mutagen.mp3 import MP3
from mutagen.id3 import ID3


def test_id3_tagging():
    print("Testing ID3 tagging on dummy MP3 file...")
    dummy_mp3 = os.path.join(os.path.dirname(__file__), "test_sample.mp3")
    
    # Generate minimal valid MP3 frame (silent) or small valid mp3 header
    # Let's generate a minimal 1-sec mp3 using ffmpeg
    import subprocess
    cmd = [
        "ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-t", "1", "-b:a", "192k", dummy_mp3
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

    dummy_cover = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.' \",#\x1c\x1c(7),01444\x1f'9=82<.342\xff\xc0\x00\x0b\x08\x00\x01\x00\x01\x01\x01\x11\x00\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xbf\x00\xff\xd9"

    # Apply ID3 tags
    success = metadata_tagger.apply_id3_tags(
        file_path=dummy_mp3,
        track_number=1,
        title="lowkey",
        artist="NIKI",
        album="throwback",
        year="2023",
        genre="R&B",
        cover_bytes=dummy_cover,
        lyrics_text="[00:07.97] Wonder what I'll do when the cops come through",
    )
    assert success, "apply_id3_tags returned False"

    # Inspect written tags
    audio = MP3(dummy_mp3, ID3=ID3)
    tags = audio.tags

    print(f"  [OK] TRCK (#): {tags.get('TRCK')}")
    print(f"  [OK] TIT2 (Title): {tags.get('TIT2')}")
    print(f"  [OK] TPE1 (Contributing artists): {tags.get('TPE1')}")
    print(f"  [OK] TALB (Album): {tags.get('TALB')}")
    print(f"  [OK] APIC (Cover art): {'Found (' + str(len(tags.get('APIC:Cover').data)) + ' bytes)' if 'APIC:Cover' in tags else 'Not found'}")
    print(f"  [OK] USLT (Lyrics): {'Found' if 'USLT::eng' in tags else 'Not found'}")

    assert str(tags.get("TRCK")) == "1"
    assert str(tags.get("TIT2")) == "lowkey"
    assert "NIKI" in str(tags.get("TPE1"))
    assert str(tags.get("TALB")) == "throwback"

    # Cleanup
    if os.path.exists(dummy_mp3):
        os.remove(dummy_mp3)

    print("\nID3 TAGGING VERIFICATION PASSED!")


if __name__ == "__main__":
    test_id3_tagging()
