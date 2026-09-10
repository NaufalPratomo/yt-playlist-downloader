import os
import sys
import json
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from run import is_window_position_valid, load_window_state, get_window_state_path


def test_is_window_position_valid():
    # Minimized Windows coordinates must be rejected
    assert not is_window_position_valid(-32000, -32000)
    assert not is_window_position_valid(-10001, 100)
    assert not is_window_position_valid(100, -10001)

    # None coordinates must be rejected
    assert not is_window_position_valid(None, None)
    assert not is_window_position_valid(100, None)
    assert not is_window_position_valid(None, 100)

    # Completely absurd out of bounds coordinates
    assert not is_window_position_valid(99999, 99999)

    # Valid coordinates on screen
    assert is_window_position_valid(0, 0)
    assert is_window_position_valid(100, 100)


def test_load_window_state_sanitizes_minimized_coordinates(tmp_path, monkeypatch):
    test_file = tmp_path / "window_state.json"
    corrupt_state = {
        "maximized": False,
        "width": 1707,
        "height": 958,
        "x": -32000,
        "y": -32000,
    }
    test_file.write_text(json.dumps(corrupt_state), encoding="utf-8")

    monkeypatch.setattr("run.get_window_state_path", lambda: str(test_file))

    state = load_window_state()
    # Coordinates must be reset to None so OS centers window
    assert state["x"] is None
    assert state["y"] is None
    assert state["width"] == 1707
    assert state["height"] == 958
    assert state["maximized"] is False
