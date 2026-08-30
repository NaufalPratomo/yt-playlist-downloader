# MusicGit - Built-in Music Player, Synchronized Lyrics, and YouTube Playlist Sync Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the application into MusicGit with an integrated desktop-grade music player, real-time synchronized LRC lyrics viewer, and Git-inspired remote playlist sync ("Git Pull") for YouTube playlists.

**Architecture:** A FastAPI backend managing local library discovery, `.musicgit.json` playlist remote tracking, and audio/lyrics streaming, coupled with a modern vanilla JS/CSS frontend featuring a 4-panel desktop shell (Sidebar, Main Library/Views, Lyrics Drawer, and Persistent Audio Player Bar).

**Tech Stack:** Python 3.10+, FastAPI, Mutagen (ID3 tags), yt-dlp, LRCLIB API, HTML5 Web Audio API, Vanilla CSS (Glassmorphism, CSS Grid/Flexbox), SVG icon system.

## Global Constraints

- Absolutely NO Unicode emoji icons in any HTML, CSS, or JS files (only clean SVG icons and text labels).
- Brand name throughout the application is **MusicGit**.
- All local playlist directories store remote YouTube playlist state in a `.musicgit.json` file.
- Audio playback must continue uninterrupted when switching between sidebar tabs and views.

---

### Task 1: Setup Brand Assets & Backend Library Manager

**Files:**
- Create: `frontend/assets/MusicGit-logo.png`
- Create: `backend/library_manager.py`
- Test: `tests/test_library_manager.py`

**Interfaces:**
- Produces: `LibraryManager.scan_library(base_dir: str) -> List[Dict]`
- Produces: `LibraryManager.get_playlist_details(folder_path: str) -> Dict`
- Produces: `LibraryManager.link_playlist_remote(folder_path: str, remote_url: str, playlist_title: str) -> Dict`
- Produces: `LibraryManager.get_track_lyrics(file_path: str) -> Dict`

- [ ] **Step 1: Copy logo file to frontend assets**
- [ ] **Step 2: Write tests for `LibraryManager`**
- [ ] **Step 3: Implement `backend/library_manager.py`**
- [ ] **Step 4: Run tests to verify passing**
- [ ] **Step 5: Commit**

---

### Task 2: Backend API Endpoints for Library, Lyrics, and Audio Streaming

**Files:**
- Modify: `backend/app.py`
- Test: `tests/test_api_endpoints.py`

**Interfaces:**
- Produces: `GET /api/library/playlists`
- Produces: `GET /api/library/playlist?folder_path=...`
- Produces: `POST /api/library/link-remote`
- Produces: `GET /api/library/track-lyrics?file_path=...`
- Produces: `GET /api/library/track-cover?file_path=...`

- [ ] **Step 1: Write API endpoint tests**
- [ ] **Step 2: Implement FastAPI endpoints in `backend/app.py`**
- [ ] **Step 3: Run tests and verify endpoint responses**
- [ ] **Step 4: Commit**

---

### Task 3: MusicGit UI Structure & CSS Design System (Zero Emojis, Pure SVG)

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/style.css`

**Interfaces:**
- Layout: Sidebar navigation, Main View (Library, Playlist detail, Downloader, Tag manager, Settings), Collapsible Lyrics drawer, Bottom audio bar.
- Design: Deep navy/blue glassmorphic theme matching the MusicGit logo, with pure SVG iconography.

- [ ] **Step 1: Rewrite `frontend/index.html` with modern 4-panel layout and clean SVG icons**
- [ ] **Step 2: Update `frontend/style.css` with dark theme, responsive grid, and player styling**
- [ ] **Step 3: Commit**

---

### Task 4: Frontend Core Modules - Audio Player & Real-Time LRC Lyrics Engine

**Files:**
- Modify: `frontend/app.js`

**Interfaces:**
- Produces: `PlayerController` (Play, pause, next, prev, seek, volume, queue, shuffle, repeat)
- Produces: `LyricsController` (LRC parser, timestamp matching, auto-scroll, click-to-seek)

- [ ] **Step 1: Implement `LyricsController` with LRC timestamp parser and seek bindings**
- [ ] **Step 2: Implement `PlayerController` with queue management and bottom bar bindings**
- [ ] **Step 3: Test audio playback and LRC scrolling**
- [ ] **Step 4: Commit**

---

### Task 5: Frontend Library Management & YouTube Playlist Sync ("Git Pull")

**Files:**
- Modify: `frontend/app.js`

**Interfaces:**
- Produces: `LibraryController` (Playlist grid, tracklist table, remote linking dialog, "Sync with YouTube" diff & auto-download)

- [ ] **Step 1: Implement playlist scanning and rendering in Library view**
- [ ] **Step 2: Implement "Sync with YouTube" diff dialog and 1-click download of new tracks**
- [ ] **Step 3: Connect downloader view and settings view**
- [ ] **Step 4: Verify end-to-end integration and ensure zero emoji icons appear**
- [ ] **Step 5: Commit**
