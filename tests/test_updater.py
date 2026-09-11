import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.updater import parse_version, is_update_available


def test_parse_version():
    assert parse_version("2.3.0") == (2, 3, 0)
    assert parse_version("v2.3.1") == (2, 3, 1)
    assert parse_version("V2.3.1") == (2, 3, 1)
    assert parse_version("2.3") == (2, 3)
    assert parse_version("v2.3.10") == (2, 3, 10)
    assert parse_version("v2.4.0-beta1") == (2, 4, 0)
    assert parse_version("") == (0,)
    assert parse_version(None) == (0,)


def test_is_update_available_patch():
    # Patch updates should be detected
    assert is_update_available("v2.3.1", "2.3.0") is True
    assert is_update_available("V2.3.1", "2.3.0") is True
    assert is_update_available("2.3.1", "2.3.0") is True
    assert is_update_available("v2.3.10", "2.3.9") is True


def test_is_update_available_minor_and_major():
    # Minor and major updates
    assert is_update_available("v2.4.0", "2.3.1") is True
    assert is_update_available("v3.0.0", "2.3.0") is True


def test_is_update_available_same_or_older():
    # Same version
    assert is_update_available("v2.3.0", "2.3.0") is False
    assert is_update_available("2.3.0", "v2.3.0") is False
    assert is_update_available("V2.3", "2.3.0") is False

    # Older version
    assert is_update_available("v2.2.0", "2.3.0") is False
    assert is_update_available("v2.3.0", "2.3.1") is False


def test_update_progress_default():
    from backend.updater import app_updater
    prog = app_updater.get_progress()
    assert "status" in prog
    assert "percentage" in prog
    assert "download_speed" in prog
