/**
 * MusicGit - Frontend Application Core
 * Complete Audio Player, Real-Time Synchronized LRC Lyrics, and YouTube Playlist Git Sync Engine.
 * Strictly 100% SVG Icons and Zero Unicode Emojis.
 */

// =============================================================================
// GLOBAL APPLICATION STATE
// =============================================================================
const MusicGitState = {
  config: {
    defaultMusicDir: "",
    defaultBitrate: "192",
    defaultTemplate: "{num}. {title}-{id}.mp3",
  },
  playlists: [],
  currentPlaylist: null,
  activeView: "view-library",
  downloadJobId: null,
  eventSource: null,
  analyzedData: null,
};

// Universal Cross-Platform Clipboard API (Supports Android WebView Native Bridge & Standard Web API)
window.getClipboardText = async function () {
  // 1. Android Native Java-JS Bridge (MainActivity AndroidBridge)
  if (window.AndroidBridge && typeof window.AndroidBridge.getClipboardText === "function") {
    try {
      const text = window.AndroidBridge.getClipboardText();
      if (text) return text.trim();
    } catch (e) {
      console.warn("AndroidBridge getClipboardText error:", e);
    }
  }

  // 2. Standard Web Clipboard API
  if (navigator.clipboard && navigator.clipboard.readText) {
    try {
      const text = await navigator.clipboard.readText();
      if (text) return text.trim();
    } catch (e) {
      console.warn("navigator.clipboard.readText error:", e);
    }
  }

  return "";
};

window.setClipboardText = async function (text) {
  if (window.AndroidBridge && typeof window.AndroidBridge.setClipboardText === "function") {
    try {
      window.AndroidBridge.setClipboardText(text);
      return true;
    } catch (e) {
      console.warn("AndroidBridge setClipboardText error:", e);
    }
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.warn("navigator.clipboard.writeText error:", e);
    }
  }

  return false;
};

// =============================================================================
// 1. AUDIO PLAYER ENGINE
// =============================================================================
class AudioPlayerEngine {
  constructor() {
    this.audio = document.getElementById("musicgit-audio-element");
    this.queue = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.isShuffle = false;
    this.repeatMode = "all"; // 'off', 'all', 'one'
    this.volume = 1.0;
    this.isMuted = false;

    // DOM Elements
    this.playPauseBtn = document.getElementById("btn-player-play-pause");
    this.iconPlay = document.getElementById("icon-player-play");
    this.iconPause = document.getElementById("icon-player-pause");
    this.prevBtn = document.getElementById("btn-player-prev");
    this.nextBtn = document.getElementById("btn-player-next");
    this.shuffleBtn = document.getElementById("btn-player-shuffle");
    this.repeatBtn = document.getElementById("btn-player-repeat");
    this.repeatOneIndicator = this.repeatBtn.querySelector(".repeat-one-indicator");

    this.seekSlider = document.getElementById("player-seek-slider");
    this.seekFill = document.getElementById("player-seek-fill");
    this.currentTimeLabel = document.getElementById("player-current-time");
    this.totalTimeLabel = document.getElementById("player-total-time");

    this.volumeSlider = document.getElementById("player-volume-slider");
    this.volumeFill = document.getElementById("player-volume-fill");
    this.muteBtn = document.getElementById("btn-player-mute");
    this.iconVolumeHigh = document.getElementById("icon-volume-high");
    this.iconVolumeMuted = document.getElementById("icon-volume-muted");

    this.barTitle = document.getElementById("player-bar-title");
    this.barArtist = document.getElementById("player-bar-artist");
    this.barThumb = document.getElementById("player-bar-thumb");

    this.queueContainer = document.getElementById("player-queue-items");
    this.queueCountBadge = document.getElementById("queue-count-badge");
    this.timelineWrap = document.querySelector(".timeline-slider-wrap");

    this.isSeeking = false;

    this._initListeners();
    this.setVolume(1.0);
  }

  _initListeners() {
    // Audio events
    this.audio.addEventListener("play", () => {
      this.isPlaying = true;
      this._updatePlayButtonState();
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
      }
    });

    this.audio.addEventListener("pause", () => {
      this.isPlaying = false;
      this._updatePlayButtonState();
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "paused";
      }
    });

    this.audio.addEventListener("timeupdate", () => {
      this._onTimeUpdate();
    });

    this.audio.addEventListener("loadedmetadata", () => {
      this.totalTimeLabel.textContent = this._formatTime(this.audio.duration || 0);
      this.seekSlider.max = this.audio.duration || 100;
    });

    this.audio.addEventListener("ended", () => {
      this._onTrackEnded();
    });

    // Control buttons
    this.playPauseBtn.addEventListener("click", () => this.togglePlayPause());
    this.prevBtn.addEventListener("click", () => this.prev());
    this.nextBtn.addEventListener("click", () => this.next());
    this.shuffleBtn.addEventListener("click", () => this.toggleShuffle());
    this.repeatBtn.addEventListener("click", () => this.toggleRepeat());

    // Seek slider & timeline scrub interactions (instant, smooth & glitch-free)
    const startSeek = () => {
      this.isSeeking = true;
    };

    const updateSeekPreview = (val) => {
      const dur = this.audio.duration || 100;
      const clampedVal = Math.max(0, Math.min(val, dur));
      this.seekSlider.value = clampedVal;
      this.seekFill.style.width = `${(clampedVal / dur) * 100}%`;
      this.currentTimeLabel.textContent = this._formatTime(clampedVal);
    };

    const commitSeek = (val) => {
      this.isSeeking = false;
      const dur = this.audio.duration || 100;
      const targetTime = Math.max(0, Math.min(val, dur));
      this.seek(targetTime);
    };

    this.seekSlider.addEventListener("pointerdown", startSeek);
    this.seekSlider.addEventListener("mousedown", startSeek);
    this.seekSlider.addEventListener("touchstart", startSeek, { passive: true });

    this.seekSlider.addEventListener("input", (e) => {
      this.isSeeking = true;
      updateSeekPreview(parseFloat(e.target.value));
    });

    this.seekSlider.addEventListener("change", (e) => {
      commitSeek(parseFloat(e.target.value));
    });

    this.seekSlider.addEventListener("pointerup", (e) => {
      if (this.isSeeking) commitSeek(parseFloat(e.target.value));
    });
    this.seekSlider.addEventListener("mouseup", (e) => {
      if (this.isSeeking) commitSeek(parseFloat(e.target.value));
    });
    this.seekSlider.addEventListener("touchend", (e) => {
      if (this.isSeeking) commitSeek(parseFloat(e.target.value));
    });

    if (this.timelineWrap) {
      this.timelineWrap.addEventListener("click", (e) => {
        if (e.target === this.seekSlider) return;
        const rect = this.timelineWrap.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const targetTime = ratio * (this.audio.duration || 0);
        commitSeek(targetTime);
      });
    }

    // Volume slider
    this.volumeSlider.addEventListener("input", (e) => {
      this.setVolume(parseFloat(e.target.value));
    });

    this.muteBtn.addEventListener("click", () => {
      this.toggleMute();
    });

    // Keyboard Shortcuts (Space, ArrowLeft/Right, ArrowUp/Down)
    window.addEventListener("keydown", (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        this.togglePlayPause();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        this.seek(Math.max(0, this.audio.currentTime - 5));
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        this.seek(Math.min(this.audio.duration || 0, this.audio.currentTime + 5));
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        this.setVolume(Math.min(1, this.audio.volume + 0.05));
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        this.setVolume(Math.max(0, this.audio.volume - 0.05));
      }
    });
  }

  playTrack(track, queueList = null, index = 0) {
    if (queueList) {
      this.queue = [...queueList];
      this.currentIndex = index;
    }

    if (!track) return;

    this.barTitle.textContent = track.title || "Judul Lagu";
    this.barArtist.textContent = track.artist || "Unknown Artist";

    this.currentTrack = track;

    // Set thumbnail
    if (track.cover_url) {
      this.barThumb.src = track.cover_url;
      this.barThumb.onerror = () => {
        this.barThumb.src = ThemeManager.getLogoUrl();
      };
    } else {
      this.barThumb.src = ThemeManager.getLogoUrl();
    }

    // Set audio source
    this.audio.src = track.stream_url;
    this.audio.load();
    this.audio.play().catch((err) => {
      console.warn("Playback error:", err);
    });

    this._updateTrackTableHighlight();
    this._renderQueue();

    // Trigger Android lock screen and system media controls
    this._updateMediaSession(track);

    // Trigger lyrics load
    LyricsEngine.loadLyrics(track);
  }

  togglePlayPause() {
    if (!this.audio.src) {
      if (this.queue.length > 0) {
        this.playTrack(this.queue[0], this.queue, 0);
      }
      return;
    }

    if (this.audio.paused) {
      this.audio.play().catch(console.warn);
    } else {
      this.audio.pause();
    }
  }

  next() {
    if (this.queue.length === 0) return;

    if (this.isShuffle) {
      this.currentIndex = Math.floor(Math.random() * this.queue.length);
    } else {
      this.currentIndex = (this.currentIndex + 1) % this.queue.length;
    }

    this.playTrack(this.queue[this.currentIndex]);
  }

  prev() {
    if (this.queue.length === 0) return;

    if (this.audio.currentTime > 3) {
      this.seek(0);
      return;
    }

    if (this.isShuffle) {
      this.currentIndex = Math.floor(Math.random() * this.queue.length);
    } else {
      this.currentIndex = (this.currentIndex - 1 + this.queue.length) % this.queue.length;
    }

    this.playTrack(this.queue[this.currentIndex]);
  }

  seek(seconds) {
    const dur = this.audio.duration || 0;
    if (dur > 0) {
      const targetTime = Math.max(0, Math.min(seconds, dur));
      this.audio.currentTime = targetTime;
      this.seekSlider.value = targetTime;
      this.seekFill.style.width = `${(targetTime / dur) * 100}%`;
      this.currentTimeLabel.textContent = this._formatTime(targetTime);
      LyricsEngine.onAudioTimeUpdate(targetTime);
    }
  }

  setVolume(val) {
    this.volume = val;
    this.audio.volume = val;
    this.volumeSlider.value = val;
    this.volumeFill.style.width = `${val * 100}%`;
    this.isMuted = val === 0;
    this._updateVolumeIcons();
  }

  toggleMute() {
    if (this.isMuted) {
      this.setVolume(this.volume || 1.0);
    } else {
      this.audio.volume = 0;
      this.volumeSlider.value = 0;
      this.volumeFill.style.width = "0%";
      this.isMuted = true;
      this._updateVolumeIcons();
    }
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    this.shuffleBtn.classList.toggle("active", this.isShuffle);
  }

  toggleRepeat() {
    if (this.repeatMode === "all") {
      this.repeatMode = "one";
      this.repeatBtn.classList.add("active");
      this.repeatOneIndicator.classList.remove("hidden");
    } else if (this.repeatMode === "one") {
      this.repeatMode = "off";
      this.repeatBtn.classList.remove("active");
      this.repeatOneIndicator.classList.add("hidden");
    } else {
      this.repeatMode = "all";
      this.repeatBtn.classList.add("active");
      this.repeatOneIndicator.classList.add("hidden");
    }
  }

  _onTimeUpdate() {
    const cur = this.audio.currentTime || 0;
    const dur = this.audio.duration || 100;

    // Only update progress UI if the user is not actively scrubbing/seeking
    if (!this.isSeeking) {
      this.currentTimeLabel.textContent = this._formatTime(cur);
      this.seekSlider.value = cur;
      this.seekFill.style.width = `${(cur / dur) * 100}%`;
    }

    // Sync lyrics line
    LyricsEngine.onAudioTimeUpdate(cur);

    // Sync MediaSession position for Android Lock Screen
    this._updateMediaSessionPosition();
  }

  _updateMediaSession(track) {
    if (!("mediaSession" in navigator)) return;
    try {
      const title = track.title || "Judul Lagu";
      const artist = track.artist || "Unknown Artist";
      const album = track.album || "MusicGit";
      const artwork = [];

      if (track.cover_url) {
        artwork.push({
          src: new URL(track.cover_url, window.location.href).href,
          sizes: "512x512",
          type: "image/jpeg",
        });
      }

      navigator.mediaSession.metadata = new MediaMetadata({
        title: title,
        artist: artist,
        album: album,
        artwork: artwork,
      });

      navigator.mediaSession.setActionHandler("play", () => this.togglePlayPause());
      navigator.mediaSession.setActionHandler("pause", () => this.togglePlayPause());
      navigator.mediaSession.setActionHandler("previoustrack", () => this.prev());
      navigator.mediaSession.setActionHandler("nexttrack", () => this.next());

      try {
        navigator.mediaSession.setActionHandler("seekto", (details) => {
          if (details.seekTime !== undefined) {
            this.seek(details.seekTime);
          }
        });
      } catch (e) {}

      try {
        navigator.mediaSession.setActionHandler("seekbackward", (details) => {
          const skipTime = details.seekOffset || 10;
          this.seek(Math.max(0, this.audio.currentTime - skipTime));
        });
      } catch (e) {}

      try {
        navigator.mediaSession.setActionHandler("seekforward", (details) => {
          const skipTime = details.seekOffset || 10;
          this.seek(Math.min(this.audio.duration || 0, this.audio.currentTime + skipTime));
        });
      } catch (e) {}
    } catch (err) {
      console.warn("MediaSession update error:", err);
    }
  }

  _updateMediaSessionPosition() {
    if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
    try {
      if (this.audio.duration && !isNaN(this.audio.duration)) {
        navigator.mediaSession.setPositionState({
          duration: this.audio.duration,
          playbackRate: this.audio.playbackRate || 1.0,
          position: Math.min(this.audio.currentTime, this.audio.duration),
        });
      }
    } catch (e) {}
  }

  _onTrackEnded() {
    if (this.repeatMode === "one") {
      this.audio.currentTime = 0;
      this.audio.play().catch(console.warn);
    } else if (this.repeatMode === "all") {
      this.next();
    } else {
      if (this.currentIndex < this.queue.length - 1) {
        this.next();
      }
    }
  }

  _updatePlayButtonState() {
    if (this.isPlaying) {
      this.iconPlay.classList.add("hidden");
      this.iconPause.classList.remove("hidden");
    } else {
      this.iconPlay.classList.remove("hidden");
      this.iconPause.classList.add("hidden");
    }
    this._updateTrackTableHighlight();
  }

  _updateVolumeIcons() {
    if (this.isMuted || this.audio.volume === 0) {
      this.iconVolumeHigh.classList.add("hidden");
      this.iconVolumeMuted.classList.remove("hidden");
    } else {
      this.iconVolumeHigh.classList.remove("hidden");
      this.iconVolumeMuted.classList.add("hidden");
    }
  }

  _updateTrackTableHighlight() {
    const currentTrack = this.queue[this.currentIndex];
    const rows = document.querySelectorAll(".track-row");
    rows.forEach((row) => {
      const path = row.dataset.filePath;
      if (currentTrack && path === currentTrack.file_path) {
        row.classList.add("playing");
      } else {
        row.classList.remove("playing");
      }
    });
  }

  _renderQueue() {
    this.queueCountBadge.textContent = this.queue.length;
    if (this.queue.length === 0) {
      const emptyMsg = typeof I18nManager !== "undefined" ? I18nManager.t("queue_empty") : "Antrian kosong.";
      this.queueContainer.innerHTML = `<div class="queue-empty-msg" data-i18n="queue_empty">${emptyMsg}</div>`;
      return;
    }

    this.queueContainer.innerHTML = this.queue
      .map((t, idx) => {
        const isActive = idx === this.currentIndex ? "active" : "";
        return `
          <div class="queue-item ${isActive}" data-idx="${idx}">
            <div class="queue-item-text">
              <span class="queue-item-title">${this._escape(t.title)}</span>
              <span class="queue-item-artist">${this._escape(t.artist)}</span>
            </div>
            <span class="text-muted" style="font-size: 0.75rem;">${t.duration_formatted || ""}</span>
          </div>
        `;
      })
      .join("");

    this.queueContainer.querySelectorAll(".queue-item").forEach((item) => {
      item.addEventListener("click", () => {
        const idx = parseInt(item.dataset.idx, 10);
        this.currentIndex = idx;
        this.playTrack(this.queue[idx]);
      });
    });
  }

  _formatTime(secs) {
    if (!secs || isNaN(secs)) return "0:00";
    const s = Math.floor(secs);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? "0" : ""}${rem}`;
  }

  _escape(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

// =============================================================================
// 2. REAL-TIME SYNCHRONIZED LRC LYRICS ENGINE (DRAWER & FULL PAGE VIEW)
// =============================================================================
class LyricsSyncEngine {
  constructor() {
    this.drawer = document.getElementById("lyrics-drawer");
    this.titleEl = document.getElementById("lyrics-track-title");
    this.artistEl = document.getElementById("lyrics-track-artist");
    this.sourceBadge = document.getElementById("lyrics-source-badge");
    this.container = document.getElementById("lyrics-lines-container");
    this.refetchBtn = document.getElementById("btn-fetch-missing-lyrics");

    // Full page view elements
    this.fullContainer = document.getElementById("lyrics-full-lines-container");
    this.fullTitle = document.getElementById("lyrics-full-title");
    this.fullArtist = document.getElementById("lyrics-full-artist");
    this.fullAlbum = document.getElementById("lyrics-full-album");
    this.fullCoverImg = document.getElementById("lyrics-full-cover-img");
    this.fullCoverFallback = document.getElementById("lyrics-full-cover-fallback");
    this.fullSourceBadge = document.getElementById("lyrics-full-source-badge");
    this.fullRefetchBtn = document.getElementById("btn-lyrics-full-refetch");
    this.fullBackBtn = document.getElementById("btn-lyrics-full-back");

    this.currentTrack = null;
    this.lines = [];
    this.activeLineIdx = -1;
    this.isSynced = false;
    this.offset = 0;

    this._initListeners();
  }

  _initListeners() {
    if (this.refetchBtn) {
      this.refetchBtn.addEventListener("click", () => {
        if (this.currentTrack) this.loadLyrics(this.currentTrack, true);
      });
    }

    if (this.fullRefetchBtn) {
      this.fullRefetchBtn.addEventListener("click", () => {
        if (this.currentTrack) this.loadLyrics(this.currentTrack, true);
      });
    }

    if (this.fullBackBtn) {
      this.fullBackBtn.addEventListener("click", () => {
        ViewController.switchView(ViewController.previousView || "view-library");
      });
    }

    // Lyrics Calibration Buttons
    const btnSlower05 = document.getElementById("btn-offset-slower-05");
    if (btnSlower05) btnSlower05.addEventListener("click", () => this.adjustOffset(-0.5));

    const btnSlower01 = document.getElementById("btn-offset-slower-01");
    if (btnSlower01) btnSlower01.addEventListener("click", () => this.adjustOffset(-0.1));

    const btnReset = document.getElementById("btn-offset-reset");
    if (btnReset) btnReset.addEventListener("click", () => this.adjustOffset(0, true));

    const btnFaster01 = document.getElementById("btn-offset-faster-01");
    if (btnFaster01) btnFaster01.addEventListener("click", () => this.adjustOffset(+0.1));

    const btnFaster05 = document.getElementById("btn-offset-faster-05");
    if (btnFaster05) btnFaster05.addEventListener("click", () => this.adjustOffset(+0.5));
  }

  adjustOffset(diff, isReset = false) {
    if (isReset) {
      this.offset = 0;
    } else {
      this.offset = Math.round((this.offset + diff) * 10) / 10;
    }

    if (this.currentTrack && this.currentTrack.file_path) {
      localStorage.setItem("musicgit_lrc_offset_" + this.currentTrack.file_path, this.offset.toString());
    }

    this._updateOffsetBadge();
    if (window.MusicPlayer && window.MusicPlayer.audio) {
      this.onAudioTimeUpdate(window.MusicPlayer.audio.currentTime);
    }
  }

  _updateOffsetBadge() {
    const badge = document.getElementById("lyrics-offset-val");
    if (badge) {
      const sign = this.offset > 0 ? "+" : "";
      badge.textContent = `${sign}${this.offset.toFixed(1)}s`;
      badge.classList.toggle("offset-active", this.offset !== 0);
    }
  }

  async loadLyrics(track, forceOnline = false) {
    this.currentTrack = track;

    // Load saved per-track offset if exists
    const savedOffset = track.file_path ? localStorage.getItem("musicgit_lrc_offset_" + track.file_path) : null;
    this.offset = savedOffset !== null ? parseFloat(savedOffset) : 0;
    this._updateOffsetBadge();

    // Update Text & Meta
    const title = track.title || "Judul Lagu";
    const artist = track.artist || "Unknown Artist";
    const album = track.album || "";

    if (this.titleEl) this.titleEl.textContent = title;
    if (this.artistEl) this.artistEl.textContent = artist;
    if (this.fullTitle) this.fullTitle.textContent = title;
    if (this.fullArtist) this.fullArtist.textContent = artist;
    if (this.fullAlbum) this.fullAlbum.textContent = album ? `Album: ${album}` : "";

    // Update Full Page Cover
    if (this.fullCoverImg && this.fullCoverFallback) {
      if (track.has_cover && track.file_path) {
        this.fullCoverImg.src = `/api/library/track-cover?file_path=${encodeURIComponent(track.file_path)}&t=${Date.now()}`;
        this.fullCoverImg.classList.remove("hidden");
        this.fullCoverFallback.classList.add("hidden");
      } else {
        this.fullCoverImg.classList.add("hidden");
        this.fullCoverFallback.classList.remove("hidden");
      }
    }

    const loadingHtml = `<div class="lyrics-empty-state"><span class="spinner"></span><p>Mencari lirik lagu...</p></div>`;
    if (this.container) this.container.innerHTML = loadingHtml;
    if (this.fullContainer) this.fullContainer.innerHTML = loadingHtml;

    try {
      const url = `/api/library/track-lyrics?file_path=${encodeURIComponent(track.file_path)}&auto_fetch=${forceOnline ? "true" : "true"}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Gagal mengambil lirik");
      const data = await res.json();

      this.isSynced = data.synced;
      this.lines = data.lines || [];
      this.activeLineIdx = -1;

      // Source badge text
      const srcMap = {
        local_lrc: "Local .LRC",
        id3_uslt: "ID3 Tag",
        online_synced: "LRCLIB Synced",
        online_plain: "Plain Text",
        none: "Tidak Ada",
      };
      const srcLabel = srcMap[data.source] || "LRC";
      if (this.sourceBadge) this.sourceBadge.textContent = srcLabel;
      if (this.fullSourceBadge) this.fullSourceBadge.textContent = srcLabel;

      if (this.lines.length === 0) {
        const emptyHtml = `
          <div class="lyrics-empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="8" y1="12" x2="16" y2="12"></line>
            </svg>
            <p>Lirik belum tersedia untuk lagu ini.</p>
          </div>
        `;
        if (this.container) this.container.innerHTML = emptyHtml;
        if (this.fullContainer) this.fullContainer.innerHTML = emptyHtml;
        return;
      }

      this._renderLines();

      // Trigger instant initial highlight
      const curTime = window.MusicPlayer ? (window.MusicPlayer.audio.currentTime || 0) : 0;
      this.onAudioTimeUpdate(curTime);
    } catch (err) {
      console.warn("Failed to load lyrics:", err);
      const errHtml = `
        <div class="lyrics-empty-state">
          <p>Lirik tidak ditemukan untuk lagu ini.</p>
        </div>
      `;
      if (this.container) this.container.innerHTML = errHtml;
      if (this.fullContainer) this.fullContainer.innerHTML = errHtml;
    }
  }

  _renderLines() {
    const renderLineHtml = (line, idx, isFull) => {
      const clsName = isFull ? "lyric-line-full" : "lyric-line";
      return `<div class="${clsName}" data-idx="${idx}" data-time="${line.time}">${this._escape(line.text || "•••")}</div>`;
    };

    // 1. Render Drawer lines
    if (this.container) {
      this.container.innerHTML = this.lines.map((l, idx) => renderLineHtml(l, idx, false)).join("");
      this._attachLineEvents(this.container);
    }

    // 2. Render Full Page Main Viewport lines
    if (this.fullContainer) {
      this.fullContainer.innerHTML = this.lines.map((l, idx) => renderLineHtml(l, idx, true)).join("");
      this._attachLineEvents(this.fullContainer);
    }
  }

  _attachLineEvents(parentEl) {
    parentEl.querySelectorAll(".lyric-line, .lyric-line-full").forEach((lineEl) => {
      lineEl.addEventListener("click", () => {
        const t = parseFloat(lineEl.dataset.time);
        if (!isNaN(t) && window.MusicPlayer) window.MusicPlayer.seek(t);
      });
    });
  }

  onAudioTimeUpdate(currentTime) {
    if (!this.isSynced || !this.lines || this.lines.length === 0) return;

    const effectiveTime = currentTime + (this.offset || 0);
    let matchIdx = -1;
    for (let i = 0; i < this.lines.length; i++) {
      if (effectiveTime >= this.lines[i].time) {
        matchIdx = i;
      } else {
        break;
      }
    }

    // Update active line highlighting and smooth scrolling
    if (matchIdx !== this.activeLineIdx && matchIdx !== -1) {
      this.activeLineIdx = matchIdx;

      // Update Drawer lines
      if (this.container) {
        const allEls = this.container.querySelectorAll(".lyric-line");
        allEls.forEach((el, idx) => {
          if (idx === matchIdx) {
            el.classList.add("active");
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          } else {
            el.classList.remove("active");
          }
        });
      }

      // Update Full Page Main Viewport lines
      if (this.fullContainer) {
        const fullEls = this.fullContainer.querySelectorAll(".lyric-line-full");
        fullEls.forEach((el, idx) => {
          if (idx === matchIdx) {
            el.classList.add("active");
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          } else {
            el.classList.remove("active");
          }
        });
      }
    }
  }

  _escape(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

// =============================================================================
// 3. LIBRARY & PLAYLIST GIT SYNC ENGINE
// =============================================================================
class LibraryEngine {
  constructor() {
    this.masterView = document.getElementById("library-master-view");
    this.detailView = document.getElementById("library-detail-view");
    this.playlistsGrid = document.getElementById("playlists-grid");
    this.sidebarPlaylistsList = document.getElementById("sidebar-playlists-list");

    // Detail hero elements
    this.detailTitle = document.getElementById("detail-title");
    this.detailPath = document.getElementById("detail-path");
    this.detailCount = document.getElementById("detail-count-badge");
    this.detailDuration = document.getElementById("detail-duration-badge");
    this.detailCoverImg = document.getElementById("detail-cover-img");
    this.detailCoverFallback = document.getElementById("detail-cover-fallback");
    this.heroRemoteBadge = document.getElementById("hero-remote-badge");
    this.detailSyncDate = document.getElementById("detail-sync-date");
    this.detailSyncDot = document.getElementById("detail-sync-dot");
    this.tracksTbody = document.getElementById("detail-tracks-tbody");
    this.trackStats = document.getElementById("playlist-track-stats");
    this.trackFilterInput = document.getElementById("playlist-track-filter");

    // Modal elements
    this.modalLink = document.getElementById("modal-link-remote");
    this.modalSyncDiff = document.getElementById("modal-sync-diff");
    this.currentPlaylistPath = null;

    this._initListeners();
  }

  _initListeners() {
    // Back button
    document.getElementById("btn-back-to-playlists").addEventListener("click", () => {
      this.showMaster();
    });

    // Refresh buttons
    document.getElementById("btn-refresh-library-grid").addEventListener("click", () => this.loadPlaylists());
    document.getElementById("btn-sidebar-refresh-library").addEventListener("click", () => this.loadPlaylists());

    // Filter inside playlist
    this.trackFilterInput.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      const rows = this.tracksTbody.querySelectorAll(".track-row");
      rows.forEach((r) => {
        const text = r.textContent.toLowerCase();
        r.style.display = text.includes(q) ? "" : "none";
      });
    });

    // Hero buttons
    document.getElementById("btn-hero-play-all").addEventListener("click", () => {
      if (MusicGitState.currentPlaylist && MusicGitState.currentPlaylist.tracks.length > 0) {
        window.MusicPlayer.playTrack(MusicGitState.currentPlaylist.tracks[0], MusicGitState.currentPlaylist.tracks, 0);
      }
    });

    document.getElementById("btn-hero-shuffle").addEventListener("click", () => {
      if (MusicGitState.currentPlaylist && MusicGitState.currentPlaylist.tracks.length > 0) {
        window.MusicPlayer.isShuffle = true;
        document.getElementById("btn-player-shuffle").classList.add("active");
        const rnd = Math.floor(Math.random() * MusicGitState.currentPlaylist.tracks.length);
        window.MusicPlayer.playTrack(MusicGitState.currentPlaylist.tracks[rnd], MusicGitState.currentPlaylist.tracks, rnd);
      }
    });

    document.getElementById("btn-hero-open-folder").addEventListener("click", () => {
      if (MusicGitState.currentPlaylist) {
        fetch("/api/open-folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: MusicGitState.currentPlaylist.folder_path }),
        });
      }
    });

    document.getElementById("btn-hero-link-remote").addEventListener("click", () => {
      if (MusicGitState.currentPlaylist) {
        this.openLinkRemoteModal(MusicGitState.currentPlaylist);
      }
    });

    const btnSyncLyrics = document.getElementById("btn-hero-sync-lyrics");
    if (btnSyncLyrics) {
      btnSyncLyrics.addEventListener("click", () => this.syncCurrentPlaylistLyrics());
    }

    document.getElementById("btn-hero-git-sync").addEventListener("click", () => {
      if (MusicGitState.currentPlaylist) {
        if (!MusicGitState.currentPlaylist.remote_url) {
          this.openLinkRemoteModal(MusicGitState.currentPlaylist);
        } else {
          this.openSyncDiffModal(MusicGitState.currentPlaylist);
        }
      }
    });

    // Form Link Remote
    document.getElementById("form-link-remote").addEventListener("submit", async (e) => {
      e.preventDefault();
      const folder = document.getElementById("modal-link-folder").value;
      const url = document.getElementById("modal-link-url").value.trim();
      const title = document.getElementById("modal-link-title").value.trim();

      try {
        const res = await fetch("/api/library/link-remote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder_path: folder, remote_url: url, playlist_title: title }),
        });
        if (!res.ok) throw new Error("Gagal menautkan remote");
        this.modalLink.classList.add("hidden");
        this.openPlaylist(folder);
        this.loadPlaylists();
      } catch (err) {
        alert(err.message);
      }
    });

    document.getElementById("btn-close-modal-link").addEventListener("click", () => {
      this.modalLink.classList.add("hidden");
    });
    document.getElementById("btn-cancel-modal-link").addEventListener("click", () => {
      this.modalLink.classList.add("hidden");
    });

    const closeSyncModal = () => {
      if (this.activeSyncEvt) {
        this.activeSyncEvt.close();
        this.activeSyncEvt = null;
      }
      const progBox = document.getElementById("modal-sync-progress-box");
      if (progBox) progBox.classList.add("hidden");
      this.modalSyncDiff.classList.add("hidden");
    };

    document.getElementById("btn-close-modal-sync").addEventListener("click", closeSyncModal);
    document.getElementById("btn-cancel-modal-sync").addEventListener("click", closeSyncModal);
  }

  async loadPlaylists() {
    try {
      const res = await fetch(`/api/library/playlists`);
      if (!res.ok) throw new Error("Gagal memuat library");
      const list = await res.json();
      MusicGitState.playlists = list;
      this._renderSidebarPlaylists(list);
      this._renderMasterGrid(list);
    } catch (err) {
      console.warn("Error loading playlists:", err);
      this.playlistsGrid.innerHTML = `<div class="sidebar-empty-state">Tidak dapat memuat folder musik.</div>`;
    }
  }

  _renderSidebarPlaylists(list) {
    if (list.length === 0) {
      this.sidebarPlaylistsList.innerHTML = `<div class="sidebar-empty-state">Belum ada playlist.</div>`;
      return;
    }

    this.sidebarPlaylistsList.innerHTML = list
      .map((pl) => {
        const hasRemote = pl.remote_url ? `<span class="sidebar-pl-git-dot" title="Remote Connected"></span>` : "";
        return `
          <div class="sidebar-pl-item" data-path="${this._escape(pl.folder_path)}">
            <span class="sidebar-pl-name">${this._escape(pl.name)}</span>
            ${hasRemote}
          </div>
        `;
      })
      .join("");

    this.sidebarPlaylistsList.querySelectorAll(".sidebar-pl-item").forEach((el) => {
      el.addEventListener("click", () => {
        const path = el.dataset.path;
        ViewController.switchView("view-library");
        this.openPlaylist(path);
      });
    });
  }

  _renderMasterGrid(list) {
    if (list.length === 0) {
      this.playlistsGrid.innerHTML = `
        <div class="sidebar-empty-state" style="grid-column: 1 / -1; padding: 40px; text-align: center;">
          <p>Belum ada folder playlist di direktori musik.</p>
        </div>
      `;
      return;
    }

    this.playlistsGrid.innerHTML = list
      .map((pl) => {
        const coverHtml = pl.cover_url
          ? `<img src="${pl.cover_url}" alt="${this._escape(pl.name)}" class="card-cover-img" onerror="this.style.display='none'">`
          : `
            <div class="card-cover-fallback">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 17 12 22 22 17"></polyline>
                <polyline points="2 12 12 17 22 12"></polyline>
              </svg>
            </div>
          `;

        const gitPill = pl.remote_url ? `<div class="card-git-pill">Connected</div>` : "";

        return `
          <div class="playlist-card" data-path="${this._escape(pl.folder_path)}">
            <div class="card-cover-wrap">
              ${coverHtml}
              ${gitPill}
              <button type="button" class="card-play-overlay" title="Putar Playlist">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              </button>
            </div>
            <div class="card-meta-info">
              <h4 class="card-pl-title" title="${this._escape(pl.name)}">${this._escape(pl.name)}</h4>
              <span class="card-pl-stats">${pl.track_count} Lagu</span>
            </div>
          </div>
        `;
      })
      .join("");

    this.playlistsGrid.querySelectorAll(".playlist-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        const path = card.dataset.path;
        if (e.target.closest(".card-play-overlay")) {
          e.stopPropagation();
          this._playPlaylistDirect(path);
          return;
        }
        this.openPlaylist(path);
      });
    });
  }

  async _playPlaylistDirect(folderPath) {
    try {
      const res = await fetch(`/api/library/playlist?folder_path=${encodeURIComponent(folderPath)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.tracks && data.tracks.length > 0) {
        window.MusicPlayer.playTrack(data.tracks[0], data.tracks, 0);
      }
    } catch (err) {
      console.warn("Direct play failed:", err);
    }
  }

  async openPlaylist(folderPath) {
    this.currentPlaylistPath = folderPath;
    this.masterView.classList.add("hidden");
    this.detailView.classList.remove("hidden");
    this.tracksTbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px;"><span class="spinner"></span> Memuat lagu...</td></tr>`;

    try {
      const res = await fetch(`/api/library/playlist?folder_path=${encodeURIComponent(folderPath)}`);
      if (!res.ok) throw new Error("Gagal memuat detail playlist");
      const data = await res.json();
      MusicGitState.currentPlaylist = data;

      this.detailTitle.textContent = data.name;
      this.detailPath.textContent = data.folder_path;
      this.detailCount.textContent = `${data.total_tracks} Lagu`;
      this.detailDuration.textContent = data.total_duration_formatted;

      if (data.cover_url) {
        this.detailCoverImg.src = data.cover_url;
        this.detailCoverImg.classList.remove("hidden");
        this.detailCoverFallback.classList.add("hidden");
        this.detailCoverImg.onerror = () => {
          this.detailCoverImg.classList.add("hidden");
          this.detailCoverFallback.classList.remove("hidden");
        };
      } else {
        this.detailCoverImg.classList.add("hidden");
        this.detailCoverFallback.classList.remove("hidden");
      }

      if (data.remote_url) {
        this.heroRemoteBadge.classList.remove("hidden");
        document.getElementById("hero-sync-label").textContent = "Sync with YouTube";
      } else {
        this.heroRemoteBadge.classList.add("hidden");
        document.getElementById("hero-sync-label").textContent = "Tautkan & Sync YT";
      }

      if (data.last_sync) {
        this.detailSyncDot.classList.remove("hidden");
        this.detailSyncDate.classList.remove("hidden");
        this.detailSyncDate.textContent = `Sync: ${new Date(data.last_sync).toLocaleDateString()}`;
      } else {
        this.detailSyncDot.classList.add("hidden");
        this.detailSyncDate.classList.add("hidden");
      }

      this._renderTracksTable(data.tracks);
    } catch (err) {
      console.warn("Failed to open playlist:", err);
      this.tracksTbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--accent-danger);">Gagal membuka playlist.</td></tr>`;
    }
  }

  async syncCurrentPlaylistLyrics() {
    if (!MusicGitState.currentPlaylist) return;
    const btn = document.getElementById("btn-hero-sync-lyrics");
    const label = document.getElementById("hero-sync-lyrics-label");
    const originalText = label ? label.textContent : "Update Lirik";

    try {
      if (btn) btn.disabled = true;
      if (label) label.textContent = "Menyinkronkan Lirik...";

      const res = await fetch("/api/library/playlist/sync-lyrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder_path: MusicGitState.currentPlaylist.folder_path,
          force_refresh: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Gagal menyinkronkan lirik playlist.");
      }

      const data = await res.json();
      alert(data.message || `Lirik berhasil disinkronkan (${data.updated_count || 0} lagu diperbarui).`);

      // Refresh current playlist tracks to update LRC badges
      await this.openPlaylist(MusicGitState.currentPlaylist.folder_path);

      // If current track is in this playlist, refresh its lyrics in player
      if (window.MusicPlayer && window.MusicPlayer.currentTrack && window.LyricsEngine) {
        const curPath = window.MusicPlayer.currentTrack.file_path || "";
        if (curPath.startsWith(MusicGitState.currentPlaylist.folder_path)) {
          window.LyricsEngine.loadLyrics(window.MusicPlayer.currentTrack, true);
        }
      }
    } catch (err) {
      console.error("Failed to batch sync lyrics:", err);
      alert(err.message || "Gagal menyinkronkan lirik playlist.");
    } finally {
      if (btn) btn.disabled = false;
      if (label) label.textContent = originalText;
    }
  }

  _renderTracksTable(tracks) {
    this.trackStats.textContent = `${tracks.length} Lagu`;
    if (tracks.length === 0) {
      this.tracksTbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 30px;">Belum ada file audio di folder ini.</td></tr>`;
      return;
    }

    this.tracksTbody.innerHTML = tracks
      .map((t, idx) => {
        const lrcBadge = t.has_lyrics
          ? `<span class="lrc-badge">LRC</span>`
          : `<span class="lrc-badge lrc-badge-missing">--</span>`;

        return `
          <tr class="track-row" data-idx="${idx}" data-file-path="${this._escape(t.file_path)}">
            <td style="text-align: center; font-family: var(--font-mono); font-size: 0.75rem;">${idx + 1}</td>
            <td style="text-align: center;">
              <button type="button" class="btn-track-play" title="Putar Lagu">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              </button>
            </td>
            <td class="track-title-cell">${this._escape(t.title)}</td>
            <td>${this._escape(t.artist)}</td>
            <td>${this._escape(t.album)}</td>
            <td style="text-align: center;">${lrcBadge}</td>
            <td style="text-align: right; font-family: var(--font-mono); font-size: 0.8rem;">${t.duration_formatted}</td>
            <td style="text-align: center;">
              <button type="button" class="btn-icon-xs btn-track-menu" title="Lirik & Tag">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="1"></circle>
                  <circle cx="19" cy="12" r="1"></circle>
                  <circle cx="5" cy="12" r="1"></circle>
                </svg>
              </button>
            </td>
          </tr>
        `;
      })
      .join("");

    this.tracksTbody.querySelectorAll(".track-row").forEach((row) => {
      row.addEventListener("dblclick", () => {
        const idx = parseInt(row.dataset.idx, 10);
        window.MusicPlayer.playTrack(tracks[idx], tracks, idx);
      });

      row.querySelector(".btn-track-play").addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(row.dataset.idx, 10);
        window.MusicPlayer.playTrack(tracks[idx], tracks, idx);
      });

      row.querySelector(".btn-track-menu").addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(row.dataset.idx, 10);
        LyricsEngine.loadLyrics(tracks[idx], true);
        document.getElementById("lyrics-drawer").classList.remove("hidden");
      });
    });
  }

  showMaster() {
    this.detailView.classList.add("hidden");
    this.masterView.classList.remove("hidden");
    this.currentPlaylistPath = null;
    MusicGitState.currentPlaylist = null;
  }

  async refreshCurrentView() {
    await this.loadPlaylists();
    if (this.currentPlaylistPath) {
      await this.openPlaylist(this.currentPlaylistPath);
    }
  }

  openLinkRemoteModal(playlist) {
    document.getElementById("modal-link-folder").value = playlist.folder_path;
    document.getElementById("modal-link-url").value = playlist.remote_url || "";
    document.getElementById("modal-link-title").value = playlist.name || "";
    this.modalLink.classList.remove("hidden");
  }

  async openSyncDiffModal(playlist) {
    if (this.activeSyncEvt) {
      this.activeSyncEvt.close();
      this.activeSyncEvt = null;
    }

    const modal = this.modalSyncDiff;
    const tbody = document.getElementById("modal-sync-diff-tbody");
    const countBtn = document.getElementById("modal-sync-new-count-btn");
    const countExisting = document.getElementById("modal-sync-existing");
    const countNew = document.getElementById("modal-sync-new");
    const downloadBtn = document.getElementById("btn-execute-sync-download");
    const cancelBtn = document.getElementById("btn-cancel-modal-sync");
    const closeBtn = document.getElementById("btn-close-modal-sync");
    const progBox = document.getElementById("modal-sync-progress-box");
    const progTitle = document.getElementById("modal-sync-prog-title");
    const progPercent = document.getElementById("modal-sync-prog-percent");
    const progBar = document.getElementById("modal-sync-prog-bar");

    // Clean reset of all progress elements
    if (progBox) progBox.classList.add("hidden");
    if (progTitle) progTitle.textContent = "Menyiapkan download...";
    if (progPercent) progPercent.textContent = "0%";
    if (progBar) {
      progBar.style.width = "0%";
      progBar.style.backgroundColor = "var(--accent-primary)";
    }
    if (cancelBtn) cancelBtn.disabled = false;
    if (closeBtn) closeBtn.disabled = false;
    if (downloadBtn) downloadBtn.disabled = true;

    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 24px;"><span class="spinner"></span> Menghubungi YouTube dan membandingkan playlist...</td></tr>`;
    modal.classList.remove("hidden");

    try {
      const res = await fetch("/api/sync-playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlist_url: playlist.remote_url, folder_path: playlist.folder_path }),
      });
      if (!res.ok) throw new Error("Gagal melakukan sinkronisasi dengan YouTube.");
      const data = await res.json();

      countExisting.textContent = data.existing_tracks.length;
      countNew.textContent = data.new_tracks.length;
      countBtn.textContent = data.new_tracks.length;

      if (data.new_tracks.length > 0) {
        downloadBtn.disabled = false;
        downloadBtn.onclick = () => {
          this._startSyncDownload(playlist, data.new_tracks);
        };
      }

      tbody.innerHTML = data.all_comparison
        .map((t, idx) => {
          const status = t.is_existing
            ? `<span class="pill pill-primary" style="font-size: 0.65rem;">Lokal OK</span>`
            : `<span class="pill pill-git" style="font-size: 0.65rem; color: #00e676; border-color: #00e676;">+ Baru</span>`;

          return `
            <tr>
              <td style="text-align: center;">${idx + 1}</td>
              <td style="font-weight: 500;">${this._escape(t.title)}</td>
              <td style="color: var(--text-muted);">${this._escape(t.artist)}</td>
              <td style="text-align: center;">${status}</td>
            </tr>
          `;
        })
        .join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 24px; color: var(--accent-danger);">${err.message}</td></tr>`;
    }
  }

  async _startSyncDownload(playlist, newTracks) {
    const downloadBtn = document.getElementById("btn-execute-sync-download");
    const cancelBtn = document.getElementById("btn-cancel-modal-sync");
    const closeBtn = document.getElementById("btn-close-modal-sync");
    const progBox = document.getElementById("modal-sync-progress-box");
    const progTitle = document.getElementById("modal-sync-prog-title");
    const progPercent = document.getElementById("modal-sync-prog-percent");
    const progBar = document.getElementById("modal-sync-prog-bar");

    if (downloadBtn) downloadBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    if (closeBtn) closeBtn.disabled = true;
    if (progBox) progBox.classList.remove("hidden");
    if (progTitle) progTitle.textContent = `Menyiapkan download ${newTracks.length} lagu baru...`;
    if (progPercent) progPercent.textContent = "0%";
    if (progBar) {
      progBar.style.width = "0%";
      progBar.style.backgroundColor = "var(--accent-primary)";
    }

    const options = {
      folder_name: playlist.name,
      folder_path: playlist.folder_path,
      target_folder: playlist.folder_path,
      bitrate: MusicGitState.config.defaultBitrate || "192",
      filename_template: MusicGitState.config.defaultTemplate || "{num2}. {title}.mp3",
      embed_cover: true,
      save_cover_file: true,
      fetch_lyrics: true,
      save_lrc_file: true,
    };

    const existingCount = (playlist.tracks ? playlist.tracks.length : (playlist.track_count || 0));
    const payload = {
      tracks: newTracks.map((t, idx) => ({
        index: existingCount + idx + 1,
        id: t.id,
        url: t.url || `https://www.youtube.com/watch?v=${t.id}`,
        title: t.title,
        artist: t.artist || "Unknown Artist",
        duration: t.duration || 0,
        duration_formatted: t.duration_formatted || "--:--",
        thumbnail: t.thumbnail || "",
        selected: true,
      })),
      playlist_title: playlist.name,
      output_base_dir: playlist.folder_path,
      target_folder: playlist.folder_path,
      options,
      remote_url: playlist.remote_url || null,
    };

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Gagal memulai proses download.");
      const job = await res.json();
      const jobId = job.job_id;

      // Stream progress in-place
      const evt = new EventSource(`/api/job/${jobId}/stream`);
      this.activeSyncEvt = evt;
      evt.onmessage = async (e) => {
        try {
          const data = JSON.parse(e.data);
          const pct = data.overall_percent || 0;
          if (progPercent) progPercent.textContent = `${pct}%`;
          if (progBar) progBar.style.width = `${pct}%`;
          if (progTitle) {
            progTitle.textContent = data.current_track_title
              ? `Mengunduh: ${data.current_track_title} (${data.completed_tracks}/${data.total_tracks})`
              : `Mengunduh ${data.completed_tracks}/${data.total_tracks} lagu...`;
          }

          if (data.status === "completed") {
            evt.close();
            this.activeSyncEvt = null;
            if (data.failed_tracks > 0 && data.completed_tracks === 0) {
              const firstErr = Object.values(data.tracks_status || {}).find(t => t.error)?.error || "Gagal mengunduh lagu.";
              if (progTitle) progTitle.textContent = `❌ Gagal: ${firstErr}`;
              if (cancelBtn) cancelBtn.disabled = false;
              if (closeBtn) closeBtn.disabled = false;
              if (downloadBtn) downloadBtn.disabled = false;
              return;
            }

            if (progTitle) progTitle.textContent = `✅ Selesai! ${data.completed_tracks} lagu baru berhasil ditambahkan.`;
            if (progBar) {
              progBar.style.width = "100%";
              progBar.style.backgroundColor = "var(--accent-success)";
            }
            // Auto refresh playlist table
            await this.openPlaylist(playlist.folder_path);
            await this.loadPlaylists();

            setTimeout(() => {
              this.modalSyncDiff.classList.add("hidden");
              if (progBox) progBox.classList.add("hidden");
              if (downloadBtn) downloadBtn.disabled = false;
              if (cancelBtn) cancelBtn.disabled = false;
              if (closeBtn) closeBtn.disabled = false;
            }, 1400);
          } else if (data.status === "failed" || data.status === "cancelled") {
            evt.close();
            this.activeSyncEvt = null;
            const firstErr = Object.values(data.tracks_status || {}).find(t => t.error)?.error || "Gagal mengunduh lagu.";
            if (progTitle) progTitle.textContent = `❌ Gagal: ${firstErr}`;
            if (cancelBtn) cancelBtn.disabled = false;
            if (closeBtn) closeBtn.disabled = false;
            if (downloadBtn) downloadBtn.disabled = false;
          }
        } catch (parseErr) {
          console.warn("Sync stream parse error:", parseErr);
        }
      };
      evt.onerror = () => {
        evt.close();
        this.activeSyncEvt = null;
        if (cancelBtn) cancelBtn.disabled = false;
        if (closeBtn) closeBtn.disabled = false;
        if (downloadBtn) downloadBtn.disabled = false;
      };
    } catch (err) {
      alert(err.message || "Gagal melakukan download sinkronisasi.");
      if (progBox) progBox.classList.add("hidden");
      if (downloadBtn) downloadBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
      if (closeBtn) closeBtn.disabled = false;
    }
  }

  _escape(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

// =============================================================================
// 4. DOWNLOADER & SSE LOGS ENGINE
// =============================================================================
class DownloaderSyncEngine {
  constructor() {
    this.form = document.getElementById("downloader-analyze-form");
    this.urlInput = document.getElementById("input-yt-url");
    this.spinner = document.getElementById("dl-analyze-spinner");
    this.resultSection = document.getElementById("dl-result-section");
    this.progressCard = document.getElementById("dl-progress-card");
    this.startBtn = document.getElementById("btn-start-download-job");
    this.checkAllBox = document.getElementById("dl-check-all");
    this.tracksTbody = document.getElementById("dl-tracks-tbody");
    this.selectedCountBadge = document.getElementById("dl-selected-count");

    // Live progress elements
    this.fillBar = document.getElementById("dl-progress-fill");
    this.percentText = document.getElementById("dl-percent-text");
    this.speedText = document.getElementById("dl-speed-text");
    this.etaText = document.getElementById("dl-eta-text");
    this.countsText = document.getElementById("dl-counts-text");
    this.currentLabel = document.getElementById("dl-current-label");
    this.queueList = document.getElementById("dl-queue-list");
    this.terminalLogs = document.getElementById("dl-terminal-logs");

    this._initListeners();
  }

  _initListeners() {
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.analyze(this.urlInput.value.trim());
    });

    const pasteBtn = document.getElementById("btn-dl-paste");
    if (pasteBtn) {
      pasteBtn.addEventListener("click", async () => {
        const text = await window.getClipboardText();
        if (text) {
          this.urlInput.value = text;
          this.urlInput.dispatchEvent(new Event("input"));
        }
      });
    }

    const topbarPaste = document.getElementById("btn-topbar-paste-url");
    if (topbarPaste) {
      topbarPaste.addEventListener("click", async () => {
        ViewController.switchView("view-downloader");
        const text = await window.getClipboardText();
        if (text) {
          this.urlInput.value = text;
          this.urlInput.dispatchEvent(new Event("input"));
          this.analyze(text);
        }
      });
    }

    this.checkAllBox.addEventListener("change", (e) => {
      const checked = e.target.checked;
      if (MusicGitState.analyzedData) {
        MusicGitState.analyzedData.tracks.forEach((t) => (t.selected = checked));
        this._renderAnalyzedTracks();
      }
    });

    this.startBtn.addEventListener("click", () => this.startDownload());
    document.getElementById("btn-clear-dl-logs").addEventListener("click", () => {
      this.terminalLogs.innerHTML = `<div class="log-row text-muted">[Sistem] Log dibersihkan.</div>`;
    });
  }

  async analyze(url) {
    if (!url) return;
    this.spinner.classList.remove("hidden");
    this.resultSection.classList.add("hidden");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Gagal menganalisis URL");
      }
      const data = await res.json();
      MusicGitState.analyzedData = data;

      document.getElementById("dl-banner-title").textContent = data.title;
      document.getElementById("dl-banner-author").textContent = data.uploader ? `Channel: ${data.uploader}` : "";
      document.getElementById("dl-banner-count").textContent = `${data.total_tracks} Lagu`;
      document.getElementById("dl-banner-duration").textContent = data.total_duration_formatted || "--:--";
      document.getElementById("input-dl-album").value = data.title;
      document.getElementById("input-dl-subfolder").value = data.title;

      if (data.thumbnail) {
        document.getElementById("dl-banner-thumb").src = data.thumbnail;
      }

      this._renderAnalyzedTracks();
      this.resultSection.classList.remove("hidden");
    } catch (err) {
      alert(err.message);
    } finally {
      this.spinner.classList.add("hidden");
    }
  }

  _renderAnalyzedTracks() {
    const tracks = MusicGitState.analyzedData.tracks;
    const selected = tracks.filter((t) => t.selected).length;
    this.selectedCountBadge.textContent = selected;

    this.tracksTbody.innerHTML = tracks
      .map((t, idx) => {
        const isChecked = t.selected ? "checked" : "";
        return `
          <tr>
            <td style="text-align: center;">
              <input type="checkbox" class="track-select-box" data-idx="${idx}" ${isChecked}>
            </td>
            <td style="text-align: center;">${idx + 1}</td>
            <td><img src="${t.thumbnail || ""}" alt="" style="width: 32px; height: 32px; border-radius: 4px; object-fit: cover;"></td>
            <td style="font-weight: 500;">${this._escape(t.title)}</td>
            <td>${this._escape(t.artist)}</td>
            <td style="text-align: right;">${t.duration_formatted}</td>
          </tr>
        `;
      })
      .join("");

    this.tracksTbody.querySelectorAll(".track-select-box").forEach((box) => {
      box.addEventListener("change", (e) => {
        const idx = parseInt(box.dataset.idx, 10);
        tracks[idx].selected = e.target.checked;
        const selCount = tracks.filter((t) => t.selected).length;
        this.selectedCountBadge.textContent = selCount;
      });
    });
  }

  async startDownload() {
    const tracks = MusicGitState.analyzedData.tracks.filter((t) => t.selected);
    if (tracks.length === 0) {
      alert("Pilih minimal 1 lagu.");
      return;
    }

    const options = {
      folder_name: document.getElementById("input-dl-subfolder").value.trim() || MusicGitState.analyzedData.title,
      bitrate: document.getElementById("select-dl-bitrate").value,
      filename_template: document.getElementById("select-dl-template").value,
      album_name: document.getElementById("input-dl-album").value.trim(),
      album_artist: document.getElementById("input-dl-album-artist").value.trim(),
      embed_cover: document.getElementById("toggle-dl-cover").checked,
      save_cover_file: document.getElementById("toggle-dl-save-cover").checked,
      fetch_lyrics: document.getElementById("toggle-dl-lyrics").checked,
      save_lrc_file: document.getElementById("toggle-dl-lrc").checked,
    };

    const payload = {
      tracks,
      playlist_title: MusicGitState.analyzedData.title,
      output_base_dir: MusicGitState.config.defaultMusicDir || null,
      options,
      remote_url: this.urlInput.value.trim(),
    };

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Gagal memulai proses download");
      const job = await res.json();
      MusicGitState.downloadJobId = job.job_id;

      // Auto-link .musicgit metadata
      const targetFolder = `${MusicGitState.config.defaultMusicDir}\\${options.folder_name}`;
      if (this.urlInput.value.includes("playlist")) {
        fetch("/api/library/link-remote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            folder_path: targetFolder,
            remote_url: this.urlInput.value.trim(),
            playlist_title: MusicGitState.analyzedData.title,
          }),
        }).catch(console.warn);
      }

      this.subscribeToProgress(job.job_id);
    } catch (err) {
      alert(err.message);
    }
  }

  async startDownloadCustom(newTracks, playlistTitle, targetFolderPath, remoteUrl = null) {
    if (remoteUrl && this.urlInput) {
      this.urlInput.value = remoteUrl;
    }
    const subfolderInput = document.getElementById("input-dl-subfolder");
    if (subfolderInput) subfolderInput.value = playlistTitle;
    const albumInput = document.getElementById("input-dl-album");
    if (albumInput) albumInput.value = playlistTitle;

    const options = {
      folder_name: playlistTitle,
      folder_path: targetFolderPath || null,
      target_folder: targetFolderPath || null,
      bitrate: "192",
      filename_template: "{num}. {title}-{id}.mp3",
      embed_cover: true,
      save_cover_file: true,
      fetch_lyrics: true,
      save_lrc_file: true,
    };

    const payload = {
      tracks: newTracks.map((t, idx) => ({ ...t, selected: true, index: idx + 1 })),
      playlist_title: playlistTitle,
      output_base_dir: targetFolderPath || null,
      target_folder: targetFolderPath || null,
      options,
      remote_url: remoteUrl || (this.urlInput ? this.urlInput.value.trim() : null),
    };

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Gagal memulai download lagu baru");
      const job = await res.json();
      this.subscribeToProgress(job.job_id);
    } catch (err) {
      alert(err.message);
    }
  }

  subscribeToProgress(jobId) {
    this.progressCard.classList.remove("hidden");
    if (MusicGitState.eventSource) {
      MusicGitState.eventSource.close();
    }

    const badge = document.getElementById("badge-download-active");
    badge.classList.remove("hidden");
    badge.textContent = "Syncing";

    const evt = new EventSource(`/api/job/${jobId}/stream`);
    MusicGitState.eventSource = evt;

    evt.onmessage = (e) => {
      const data = JSON.parse(e.data);
      this._updateProgressUI(data);

      if (["completed", "failed", "cancelled"].includes(data.status)) {
        evt.close();
        badge.classList.add("hidden");
        // Live auto-refresh library and active playlist when completed
        if (data.status === "completed") {
          if (window.LibraryManagerEngine) {
            window.LibraryManagerEngine.refreshCurrentView();
          }
        }
      }
    };
  }

  _updateProgressUI(data) {
    const pct = Math.round(data.overall_percent || 0);
    this.fillBar.style.width = `${pct}%`;
    this.percentText.textContent = `${pct}%`;
    this.speedText.textContent = `Kecepatan: ${data.speed || "--"}`;
    this.etaText.textContent = `Sisa: ${data.eta || "--"}`;
    this.countsText.textContent = `${data.completed_tracks || 0} / ${data.total_tracks || 0} Selesai`;
    this.currentLabel.textContent = data.current_track_title ? `Mendownload: ${data.current_track_title}` : "Memproses...";

    // Append logs
    if (data.new_logs && data.new_logs.length > 0) {
      data.new_logs.forEach((log) => {
        const row = document.createElement("div");
        row.className = "log-row";
        if (log.includes("[BERHASIL]")) row.classList.add("text-success");
        if (log.includes("[ERROR]")) row.classList.add("text-error");
        row.textContent = log;
        this.terminalLogs.appendChild(row);
      });
      this.terminalLogs.scrollTop = this.terminalLogs.scrollHeight;
    }

    // Update queue list
    if (data.tracks_status) {
      this.queueList.innerHTML = data.tracks_status
        .map((t) => {
          let statusPill = `<span class="pill pill-xs">${t.status}</span>`;
          if (t.status === "completed") statusPill = `<span class="pill pill-xs" style="color: #00e676;">OK</span>`;
          if (t.status === "downloading") statusPill = `<span class="pill pill-xs" style="color: #64b5f6;">${t.percent}%</span>`;
          return `
            <div class="queue-item">
              <span class="queue-item-title">${this._escape(t.title)}</span>
              ${statusPill}
            </div>
          `;
        })
        .join("");
    }
  }

  _escape(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

// =============================================================================
// 5. TAG MANAGER & SYNC DIFF CONTROLLER
// =============================================================================
class TagManagerEngine {
  constructor() {
    this.folderInput = document.getElementById("tagmgr-folder-input");
    this.resultCard = document.getElementById("tagmgr-result-card");
    this.statTitle = document.getElementById("tagmgr-stat-title");
    this.statPath = document.getElementById("tagmgr-stat-path");
    this.chipTotal = document.getElementById("tagmgr-chip-total");
    this.chipCover = document.getElementById("tagmgr-chip-cover");
    this.chipArtists = document.getElementById("tagmgr-chip-artists");
    this.chipLyrics = document.getElementById("tagmgr-chip-lyrics");
    this.filesTbody = document.getElementById("tagmgr-files-tbody");

    this._initListeners();
  }

  _initListeners() {
    document.getElementById("btn-tagmgr-browse").addEventListener("click", async () => {
      const res = await fetch("/api/browse-folder", { method: "POST" });
      const data = await res.json();
      if (data.selected_path) {
        this.folderInput.value = data.selected_path;
        this.scan(data.selected_path);
      }
    });

    document.getElementById("btn-tagmgr-scan").addEventListener("click", () => {
      this.scan(this.folderInput.value.trim());
    });

    document.getElementById("btn-tagmgr-open").addEventListener("click", () => {
      const folder = this.folderInput.value.trim();
      if (folder) {
        fetch("/api/open-folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: folder }),
        });
      }
    });

    // Tab switching
    document.getElementById("tagtab-btn-repair").addEventListener("click", () => {
      document.getElementById("tagtab-btn-repair").classList.add("active");
      document.getElementById("tagtab-btn-sync").classList.remove("active");
      document.getElementById("tab-repair-pane").classList.add("active");
      document.getElementById("tab-repair-pane").classList.remove("hidden");
      document.getElementById("tab-sync-pane").classList.add("hidden");
    });

    document.getElementById("tagtab-btn-sync").addEventListener("click", () => {
      document.getElementById("tagtab-btn-sync").classList.add("active");
      document.getElementById("tagtab-btn-repair").classList.remove("active");
      document.getElementById("tab-sync-pane").classList.remove("hidden");
      document.getElementById("tab-sync-pane").classList.add("active");
      document.getElementById("tab-repair-pane").classList.add("hidden");
    });

    // Run repair
    document.getElementById("tagmgr-fix-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const folder = this.folderInput.value.trim();
      const album = document.getElementById("tagmgr-album-name").value.trim();
      const artist = document.getElementById("tagmgr-album-artist").value.trim();
      const status = document.getElementById("tagmgr-fix-status");

      status.textContent = "Memperbaiki tag...";
      status.classList.remove("hidden");

      try {
        const res = await fetch("/api/repair-folder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            folder_path: folder,
            album_name: album || null,
            album_artist: artist || "Various Artists",
            auto_fix_artists: document.getElementById("chk-repair-artist").checked,
            embed_local_cover: document.getElementById("chk-repair-cover").checked,
            fetch_missing_lyrics: document.getElementById("chk-repair-lyrics").checked,
          }),
        });
        const data = await res.json();
        status.textContent = `Berhasil! ${data.fixed_count || data.updated_files || 0} file diperbarui.`;
        this.scan(folder);
      } catch (err) {
        status.textContent = `Gagal: ${err.message}`;
      }
    });

    // Paste sync URL button
    const tagmgrPaste = document.getElementById("btn-tagmgr-sync-paste");
    if (tagmgrPaste) {
      tagmgrPaste.addEventListener("click", async () => {
        const syncInput = document.getElementById("tagmgr-sync-url");
        const text = await window.getClipboardText();
        if (text && syncInput) {
          syncInput.value = text;
          syncInput.dispatchEvent(new Event("input"));
        }
      });
    }

    // Run sync diff
    document.getElementById("btn-tagmgr-run-sync-diff").addEventListener("click", async () => {
      const url = document.getElementById("tagmgr-sync-url").value.trim();
      const folder = this.folderInput.value.trim();
      if (!url || !folder) return;

      const spinner = document.getElementById("tagmgr-sync-spinner");
      const resultCard = document.getElementById("tagmgr-sync-result");
      spinner.classList.remove("hidden");

      try {
        const res = await fetch("/api/sync-playlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playlist_url: url, folder_path: folder }),
        });
        const data = await res.json();
        document.getElementById("tagmgr-diff-existing-count").textContent = data.existing_tracks.length;
        document.getElementById("tagmgr-diff-new-count").textContent = data.new_tracks.length;
        document.getElementById("tagmgr-diff-btn-num").textContent = data.new_tracks.length;

        document.getElementById("tagmgr-diff-tbody").innerHTML = data.all_comparison
          .map((t, idx) => {
            const status = t.is_existing
              ? `<span class="pill pill-primary" style="font-size: 0.65rem;">Lokal OK</span>`
              : `<span class="pill pill-git" style="font-size: 0.65rem; color: #00e676; border-color: #00e676;">+ Baru</span>`;
            return `
              <tr>
                <td style="text-align: center;">${idx + 1}</td>
                <td>${t.title}</td>
                <td>${t.artist}</td>
                <td style="text-align: center;">${status}</td>
              </tr>
            `;
          })
          .join("");

        resultCard.classList.remove("hidden");

        if (data.new_tracks.length > 0) {
          document.getElementById("btn-tagmgr-download-new-only").onclick = () => {
            ViewController.switchView("view-downloader");
            DownloaderEngine.startDownloadCustom(data.new_tracks, "Sync Playlist", folder);
          };
        }
      } catch (err) {
        alert(err.message);
      } finally {
        spinner.classList.add("hidden");
      }
    });
  }

  async scan(folderPath) {
    if (!folderPath) return;
    try {
      const res = await fetch("/api/scan-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_path: folderPath }),
      });
      if (!res.ok) throw new Error("Gagal memindai folder");
      const data = await res.json();

      this.statTitle.textContent = data.folder_name;
      this.statPath.textContent = data.folder_path;
      this.chipTotal.textContent = `${data.total_files} Lagu`;
      this.chipCover.textContent = data.has_cover_art ? "Cover: Ada" : "Cover: Tidak Ada";

      if (data.missing_artist_count > 0) {
        this.chipArtists.textContent = `${data.missing_artist_count} Unknown Artist`;
        this.chipArtists.classList.remove("hidden");
      } else {
        this.chipArtists.classList.add("hidden");
      }

      if (data.missing_lyrics_count > 0) {
        this.chipLyrics.textContent = `${data.missing_lyrics_count} Tanpa Lirik`;
        this.chipLyrics.classList.remove("hidden");
      } else {
        this.chipLyrics.classList.add("hidden");
      }

      document.getElementById("tagmgr-album-name").value = data.folder_name;

      this.filesTbody.innerHTML = data.files
        .map((f, idx) => {
          return `
            <tr>
              <td style="text-align: center;">${idx + 1}</td>
              <td style="font-size: 0.8rem;">${f.file}</td>
              <td>${f.artist || "Unknown"}</td>
              <td>${f.title || "Unknown"}</td>
              <td style="text-align: center;">${f.has_cover ? "Ada" : "--"}</td>
              <td style="text-align: center;">${f.has_lyrics ? "LRC" : "--"}</td>
            </tr>
          `;
        })
        .join("");

      this.resultCard.classList.remove("hidden");
    } catch (err) {
      alert(err.message);
    }
  }
}

// =============================================================================
// 6. I18N (INTERNATIONALIZATION) DICTIONARY & MANAGER
// =============================================================================
const I18N_DICTIONARY = {
  id: {
    nav_menu_main: "MENU UTAMA",
    nav_library: "Library Musik",
    nav_downloader: "Downloader & Queue",
    nav_tag_manager: "Tag & Sync Manager",
    nav_lyrics: "Lirik Lagu",
    nav_settings: "Pengaturan",
    nav_local_playlists: "PLAYLIST LOKAL",
    nav_empty_playlists: "Memuat playlist...",
    search_placeholder: "Cari lagu, artis, atau playlist di library...",
    theme_btn_label: "Tema",
    theme_dark_label: "Gelap",
    theme_light_label: "Terang",

    lib_title: "Library Musik Lokal",
    lib_desc: "Koleksi playlist dan lagu tersinkronisasi di komputer Anda",
    lib_btn_scan: "Pindai Library",
    lib_btn_new_dl: "Download Playlist Baru",
    lib_all_songs_tab: "Semua Lagu",
    lib_playlists_tab: "Daftar Playlist",
    lib_empty_tracks: "Belum ada lagu di library.",
    lib_btn_sync_diff: "Cek Sync Git Diff",
    lib_btn_play_all: "Putar Semua",
    lib_btn_edit_tags: "Edit Tag Playlist",

    dl_title: "Download & Sinkronisasi Playlist",
    dl_desc: "Tempelkan URL YouTube Playlist untuk mendownload atau menyinkronkan lagu baru",
    dl_url_label: "URL YouTube Playlist / Video",
    dl_btn_paste: "Tempel",
    dl_btn_analyze: "Analisis Playlist",
    dl_folder_label: "Nama Folder Playlist (Subfolder)",
    dl_bitrate_label: "Kualitas Bitrate MP3",
    dl_format_label: "Format Penamaan File",
    dl_cb_sync: "Mode Sinkronisasi Git (Hanya unduh lagu yang belum ada di lokal)",
    dl_cb_lyrics: "Download & Sisipkan Lirik (.lrc / ID3 USLT) otomatis",
    dl_cb_id3: "Sisipkan Metadata ID3 Tag & Cover Art otomatis",
    dl_btn_download_selected: "Download Lagu Terpilih",

    tag_title: "Tag & Sync Manager (ID3)",
    tag_desc: "Kelola metadata ID3, nomor trek, cover art, dan sinkronisasi lirik",
    tag_select_folder: "Pilih Folder Playlist Lokal",
    tag_btn_refresh: "Refresh Data",
    tag_btn_apply_tags: "Terapkan Tag ID3",
    tag_btn_fetch_lyrics: "Download Lirik (LRC)",

    settings_title: "Pengaturan MusicGit",
    settings_desc: "Konfigurasi direktori penyimpanan musik, preferensi unduhan, dan tampilan antarmuka",
    settings_dir_label: "Direktori Penyimpanan Musik",
    settings_btn_choose_dir: "Pilih Folder",
    settings_btn_open_dir: "Buka",
    settings_bitrate_label: "Bitrate Default",
    settings_template_label: "Format Template Default",
    settings_theme_label: "Mode Tampilan (Tema)",
    settings_theme_dark: "Mode Gelap (Dark Navy Solid)",
    settings_theme_light: "Mode Terang (Clean Light Slate)",
    settings_lang_label: "Bahasa (Language)",
    settings_btn_save: "Simpan Pengaturan",
    settings_saved_alert: "Pengaturan MusicGit berhasil disimpan.",

    lyrics_title: "Lirik Lagu",
    lyrics_select_prompt: "Pilih Lagu untuk Diputar",
    lyrics_empty_prompt: "Putar sebuah lagu untuk melihat lirik karaoke bersinkronisasi.",
    lyrics_btn_refetch: "Ambil Ulang Lirik Online",
    lyrics_btn_back: "Kembali",
    lyrics_offset_title: "Kalibrasi Waktu Lirik",
    lyrics_offset_hint: "Gunakan tombol jika vokal lagu dan teks lirik tidak pas.",

    player_default_title: "MusicGit Player",
    player_default_artist: "Pilih lagu untuk mulai memutar",
    player_shuffle_title: "Acak Lagu (Shuffle)",
    player_prev_title: "Lagu Sebelumnya",
    player_play_pause_title: "Putar / Jeda (Spasi)",
    player_next_title: "Lagu Berikutnya",
    player_repeat_title: "Ulangi (Repeat)",
    player_lyrics_title: "Lirik Bersinkronisasi (Karaoke)",
    player_mute_title: "Mute / Unmute",
    queue_title: "Antrian Putar",
    queue_empty: "Antrian kosong.",
    queue_close_title: "Tutup Antrian"
  },
  en: {
    nav_menu_main: "MAIN MENU",
    nav_library: "Music Library",
    nav_downloader: "Downloader & Queue",
    nav_tag_manager: "Tag & Sync Manager",
    nav_lyrics: "Song Lyrics",
    nav_settings: "Settings",
    nav_local_playlists: "LOCAL PLAYLISTS",
    nav_empty_playlists: "Loading playlists...",
    search_placeholder: "Search songs, artists, or playlists...",
    theme_btn_label: "Theme",
    theme_dark_label: "Dark",
    theme_light_label: "Light",

    lib_title: "Local Music Library",
    lib_desc: "Your synced playlists and songs collection on this device",
    lib_btn_scan: "Scan Library",
    lib_btn_new_dl: "Download New Playlist",
    lib_all_songs_tab: "All Songs",
    lib_playlists_tab: "Playlists",
    lib_empty_tracks: "No songs in library yet.",
    lib_btn_sync_diff: "Check Git Sync Diff",
    lib_btn_play_all: "Play All",
    lib_btn_edit_tags: "Edit Playlist Tags",

    dl_title: "Download & Sync Playlists",
    dl_desc: "Paste YouTube Playlist URL to download or synchronize new tracks",
    dl_url_label: "YouTube Playlist / Video URL",
    dl_btn_paste: "Paste",
    dl_btn_analyze: "Analyze Playlist",
    dl_folder_label: "Playlist Subfolder Name",
    dl_bitrate_label: "MP3 Bitrate Quality",
    dl_format_label: "Filename Output Format",
    dl_cb_sync: "Git Sync Mode (Only download new songs missing locally)",
    dl_cb_lyrics: "Auto-fetch & embed lyrics (.lrc / ID3 USLT)",
    dl_cb_id3: "Auto-embed ID3 Tags & Album Cover Art",
    dl_btn_download_selected: "Download Selected Songs",

    tag_title: "Tag & Sync Manager (ID3)",
    tag_desc: "Manage ID3 metadata, track numbers, cover art, and lyrics synchronization",
    tag_select_folder: "Select Local Playlist Folder",
    tag_btn_refresh: "Refresh Data",
    tag_btn_apply_tags: "Apply ID3 Tags",
    tag_btn_fetch_lyrics: "Download Lyrics (LRC)",

    settings_title: "MusicGit Settings",
    settings_desc: "Configure music storage directory, download preferences, and interface appearance",
    settings_dir_label: "Music Storage Directory",
    settings_btn_choose_dir: "Choose Folder",
    settings_btn_open_dir: "Open",
    settings_bitrate_label: "Default Bitrate",
    settings_template_label: "Default Template Format",
    settings_theme_label: "Appearance Theme",
    settings_theme_dark: "Dark Mode (Solid Dark)",
    settings_theme_light: "Light Mode (Clean Light)",
    settings_lang_label: "Language",
    settings_btn_save: "Save Settings",
    settings_saved_alert: "MusicGit settings saved successfully.",

    lyrics_title: "Song Lyrics",
    lyrics_select_prompt: "Select a Song to Play",
    lyrics_empty_prompt: "Play a song to view real-time synchronized karaoke lyrics.",
    lyrics_btn_refetch: "Refetch Lyrics Online",
    lyrics_btn_back: "Back",
    lyrics_offset_title: "Lyrics Timing Calibration",
    lyrics_offset_hint: "Use buttons if song vocals and lyrics timing don't match.",

    player_default_title: "MusicGit Player",
    player_default_artist: "Select a song to start playing",
    player_shuffle_title: "Shuffle Playback",
    player_prev_title: "Previous Track",
    player_play_pause_title: "Play / Pause (Space)",
    player_next_title: "Next Track",
    player_repeat_title: "Repeat (Off / All / One)",
    player_lyrics_title: "Synchronized Lyrics (Karaoke)",
    player_mute_title: "Mute / Unmute",
    queue_title: "Play Queue",
    queue_empty: "Queue is empty.",
    queue_close_title: "Close Queue"
  }
};

const I18nManager = {
  currentLang: "id",

  init() {
    const saved = localStorage.getItem("musicgit_language");
    if (saved === "id" || saved === "en") {
      this.currentLang = saved;
    } else {
      this.currentLang = "id";
    }
    this.applyLanguage(this.currentLang);

    const langSelect = document.getElementById("settings-lang-select");
    if (langSelect) {
      langSelect.value = this.currentLang;
      langSelect.addEventListener("change", (e) => {
        this.applyLanguage(e.target.value);
      });
    }
  },

  t(key) {
    const dict = I18N_DICTIONARY[this.currentLang] || I18N_DICTIONARY.id;
    return dict[key] || key;
  },

  applyLanguage(lang) {
    if (!I18N_DICTIONARY[lang]) lang = "id";
    this.currentLang = lang;
    localStorage.setItem("musicgit_language", lang);
    if (MusicGitState.config) {
      MusicGitState.config.language = lang;
    }

    const dict = I18N_DICTIONARY[lang];

    // 1. Translate all data-i18n elements
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (dict[key]) el.textContent = dict[key];
    });

    // 2. Translate placeholders
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.dataset.i18nPlaceholder;
      if (dict[key]) el.placeholder = dict[key];
    });

    // 3. Translate titles / tooltips
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.dataset.i18nTitle;
      if (dict[key]) el.title = dict[key];
    });

    // 4. Update dropdown
    const langSelect = document.getElementById("settings-lang-select");
    if (langSelect && langSelect.value !== lang) {
      langSelect.value = lang;
    }

    // 5. Update global search placeholder
    const globalSearch = document.getElementById("global-search-input");
    if (globalSearch && dict.search_placeholder) {
      globalSearch.placeholder = dict.search_placeholder;
    }

    // 6. Update theme toggle label
    const themeLabel = document.getElementById("theme-btn-label");
    if (themeLabel) {
      themeLabel.textContent = ThemeManager.currentTheme === "light" 
        ? dict.theme_light_label || "Terang" 
        : dict.theme_dark_label || "Gelap";
    }

    // 7. Update empty queue message if currently active
    const emptyQueue = document.querySelector("#player-queue-items .queue-empty-msg");
    if (emptyQueue && dict.queue_empty) {
      emptyQueue.textContent = dict.queue_empty;
    }

    // 8. Update player bottom bar default texts when no song is active
    if (!window.MusicPlayer || !window.MusicPlayer.currentTrack) {
      const barTitle = document.getElementById("player-bar-title");
      const barArtist = document.getElementById("player-bar-artist");
      if (barTitle && dict.player_default_title) barTitle.textContent = dict.player_default_title;
      if (barArtist && dict.player_default_artist) barArtist.textContent = dict.player_default_artist;
    }
  }
};

// =============================================================================
// 7. THEME MANAGER (DARK & LIGHT SOLID MODES)
// =============================================================================
const ThemeManager = {
  currentTheme: "dark",

  getLogoUrl(theme = this.currentTheme) {
    return theme === "light"
      ? "assets/logo-lightmode.jpg"
      : "assets/logo-darkmode.jpg";
  },

  init() {
    const saved = localStorage.getItem("musicgit_theme");
    if (saved === "light" || saved === "dark") {
      this.currentTheme = saved;
    } else {
      this.currentTheme = "dark";
    }
    this.applyTheme(this.currentTheme);

    const toggleBtn = document.getElementById("btn-toggle-theme");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        const next = this.currentTheme === "dark" ? "light" : "dark";
        this.applyTheme(next);
      });
    }

    const themeSelect = document.getElementById("settings-theme-select");
    if (themeSelect) {
      themeSelect.value = this.currentTheme;
      themeSelect.addEventListener("change", (e) => {
        this.applyTheme(e.target.value);
      });
    }
  },

  applyTheme(theme) {
    this.currentTheme = theme;
    document.body.classList.remove("theme-dark", "theme-light");
    document.body.classList.add(`theme-${theme}`);
    document.documentElement.setAttribute("data-theme", theme);
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem("musicgit_theme", theme);

    // Update browser / desktop titlebar theme-color dynamically
    let metaTheme = document.getElementById("meta-theme-color");
    if (!metaTheme) {
      metaTheme = document.createElement("meta");
      metaTheme.id = "meta-theme-color";
      metaTheme.name = "theme-color";
      document.head.appendChild(metaTheme);
    }
    metaTheme.setAttribute("content", theme === "light" ? "#ffffff" : "#181818");

    const sunIcon = document.getElementById("icon-theme-sun");
    const moonIcon = document.getElementById("icon-theme-moon");
    const themeLabel = document.getElementById("theme-btn-label");
    const themeSelect = document.getElementById("settings-theme-select");

    if (sunIcon && moonIcon) {
      if (theme === "light") {
        sunIcon.classList.remove("hidden");
        moonIcon.classList.add("hidden");
        if (themeLabel) themeLabel.textContent = I18nManager.t("theme_light_label") || "Terang";
      } else {
        sunIcon.classList.add("hidden");
        moonIcon.classList.remove("hidden");
        if (themeLabel) themeLabel.textContent = I18nManager.t("theme_dark_label") || "Gelap";
      }
    }

    if (themeSelect && themeSelect.value !== theme) {
      themeSelect.value = theme;
    }

    // Switch in-app logos dynamically based on active theme
    const logoUrl = this.getLogoUrl(theme);
    const reactiveLogos = document.querySelectorAll(".theme-reactive-logo");
    reactiveLogos.forEach((img) => {
      img.src = logoUrl;
    });

    const brandLogo = document.getElementById("app-brand-logo");
    if (brandLogo) brandLogo.src = logoUrl;

    const aboutLogo = document.getElementById("app-about-logo");
    if (aboutLogo) aboutLogo.src = logoUrl;

    // Update bottom player bar fallback thumbnail if it is currently displaying the logo
    const playerThumb = document.getElementById("player-bar-thumb");
    if (playerThumb) {
      const currentSrc = playerThumb.getAttribute("src") || "";
      if (
        currentSrc.includes("logo-") ||
        currentSrc.includes("MusicGit-logo") ||
        !Player.currentTrack ||
        !Player.currentTrack.cover_url
      ) {
        playerThumb.src = logoUrl;
      }
    }
  },
};

// =============================================================================
// 8. VIEW CONTROLLER & APP INITIALIZATION
// =============================================================================
const ViewController = {
  previousView: "view-library",

  init() {
    I18nManager.init();
    ThemeManager.init();

    // Nav menu switching (Desktop Sidebar & Mobile Bottom Nav)
    document.querySelectorAll(".nav-item, .mobile-nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const viewId = btn.dataset.view;
        this.switchView(viewId);
      });
    });

    // Lyrics Full-Page Toggle (Topbar & Player Bar buttons)
    const toggleLyrics = () => {
      if (MusicGitState.activeView === "view-lyrics") {
        this.switchView(this.previousView || "view-library");
      } else {
        this.switchView("view-lyrics");
      }
    };

    const topbarLyricsBtn = document.getElementById("btn-toggle-lyrics-panel");
    if (topbarLyricsBtn) topbarLyricsBtn.addEventListener("click", toggleLyrics);
    const footerLyricsBtn = document.getElementById("btn-toggle-lyrics-footer");
    if (footerLyricsBtn) footerLyricsBtn.addEventListener("click", toggleLyrics);

    // Queue drawer toggle
    const queueDrawer = document.getElementById("queue-drawer");
    const toggleQueue = () => {
      queueDrawer.classList.toggle("hidden");
      document.getElementById("btn-toggle-queue-footer").classList.toggle("active", !queueDrawer.classList.contains("hidden"));
    };

    document.getElementById("btn-toggle-queue-footer").addEventListener("click", toggleQueue);
    document.getElementById("btn-close-queue-drawer").addEventListener("click", () => queueDrawer.classList.add("hidden"));

    // Global Search Bar
    const globalSearch = document.getElementById("global-search-input");
    const clearBtn = document.getElementById("btn-clear-search");

    globalSearch.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      clearBtn.classList.toggle("hidden", !q);
      const cards = document.querySelectorAll(".playlist-card");
      cards.forEach((card) => {
        const title = card.querySelector(".card-pl-title").textContent.toLowerCase();
        card.style.display = title.includes(q) ? "" : "none";
      });
    });

    clearBtn.addEventListener("click", () => {
      globalSearch.value = "";
      clearBtn.classList.add("hidden");
      document.querySelectorAll(".playlist-card").forEach((c) => (c.style.display = ""));
    });

    // Shortcut button in Library view
    document.getElementById("btn-new-download-shortcut").addEventListener("click", () => {
      this.switchView("view-downloader");
    });

    // Sidebar open base folder button (if present)
    const openFolderBtn = document.getElementById("btn-sidebar-open-folder");
    if (openFolderBtn) {
      openFolderBtn.addEventListener("click", () => {
        if (MusicGitState.config.defaultMusicDir) {
          fetch("/api/open-folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: MusicGitState.config.defaultMusicDir }),
          });
        }
      });
    }

    // Settings browse & save
    document.getElementById("btn-settings-browse-dir").addEventListener("click", async () => {
      const res = await fetch("/api/browse-folder", { method: "POST" });
      const data = await res.json();
      if (data.selected_path) {
        document.getElementById("settings-output-dir").value = data.selected_path;
      }
    });

    document.getElementById("btn-save-settings").addEventListener("click", async () => {
      const dir = document.getElementById("settings-output-dir").value.trim();
      const br = document.getElementById("settings-default-bitrate").value;
      const tpl = document.getElementById("settings-default-template").value;
      const thm = document.getElementById("settings-theme-select").value;
      const lang = document.getElementById("settings-lang-select").value;

      MusicGitState.config.defaultMusicDir = dir;
      MusicGitState.config.defaultBitrate = br;
      MusicGitState.config.defaultTemplate = tpl;
      MusicGitState.config.theme = thm;
      MusicGitState.config.language = lang;

      ThemeManager.applyTheme(thm);
      I18nManager.applyLanguage(lang);

      localStorage.setItem("musicgit_config", JSON.stringify(MusicGitState.config));

      // Persist to backend config.json on disk
      try {
        await fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            default_music_dir: dir,
            default_bitrate: br,
            default_template: tpl,
            theme: thm,
            language: lang,
          }),
        });
      } catch (err) {
        console.warn("Failed to persist config to backend disk:", err);
      }

      LibraryManagerEngine.loadPlaylists();
      alert(I18nManager.t("settings_saved_alert"));
    });
  },

  switchView(viewId) {
    if (MusicGitState.activeView && MusicGitState.activeView !== "view-lyrics" && MusicGitState.activeView !== viewId) {
      this.previousView = MusicGitState.activeView;
    }

    document.querySelectorAll(".nav-item, .mobile-nav-item").forEach((n) => {
      n.classList.toggle("active", n.dataset.view === viewId);
    });

    document.querySelectorAll(".view-container").forEach((v) => {
      v.classList.toggle("active", v.id === viewId);
    });

    const isLyrics = viewId === "view-lyrics";
    const footerLyricsBtn = document.getElementById("btn-toggle-lyrics-footer");
    if (footerLyricsBtn) footerLyricsBtn.classList.toggle("active", isLyrics);

    MusicGitState.activeView = viewId;

    // Live auto-refresh library when navigating to Library View
    if (viewId === "view-library" && window.LibraryManagerEngine) {
      window.LibraryManagerEngine.loadPlaylists();
      if (window.LibraryManagerEngine.currentPlaylistPath) {
        window.LibraryManagerEngine.openPlaylist(window.LibraryManagerEngine.currentPlaylistPath);
      }
    }
  },
};

window.ViewController = ViewController;

// Global Handler for Android & Browser System Back Navigation
window.handleAppBack = function () {
  // 1. Close any visible modal dialogs
  const openModals = document.querySelectorAll(".modal:not(.hidden)");
  if (openModals && openModals.length > 0) {
    openModals.forEach((m) => m.classList.add("hidden"));
    return true;
  }

  // 2. Close queue drawer if open
  const queueDrawer = document.getElementById("queue-drawer");
  if (queueDrawer && !queueDrawer.classList.contains("hidden")) {
    queueDrawer.classList.add("hidden");
    const queueBtn = document.getElementById("btn-toggle-queue-footer");
    if (queueBtn) queueBtn.classList.remove("active");
    return true;
  }

  // 3. If in full-screen lyrics view, return to previous view
  if (MusicGitState.activeView === "view-lyrics") {
    if (window.ViewController) {
      window.ViewController.switchView(window.ViewController.previousView || "view-library");
      return true;
    }
  }

  // 4. If in Library view and viewing playlist detail, go back to master playlist grid
  if (MusicGitState.activeView === "view-library") {
    const detailView = document.getElementById("library-detail-view");
    if (detailView && !detailView.classList.contains("hidden")) {
      if (window.LibraryManagerEngine) {
        window.LibraryManagerEngine.showMaster();
        return true;
      }
    }
  }

  // 5. If in another view (Downloader, Tag Sync, Settings), switch back to Library
  if (MusicGitState.activeView && MusicGitState.activeView !== "view-library") {
    if (window.ViewController) {
      window.ViewController.switchView("view-library");
      return true;
    }
  }

  // At top-level home/library grid
  return false;
};

// =============================================================================
// BOOTSTRAP APPLICATION
// =============================================================================
let LyricsEngine, LibraryManagerEngine, DownloaderEngine, TagManager;

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Initialize Player & Engines
  window.MusicPlayer = new AudioPlayerEngine();
  LyricsEngine = new LyricsSyncEngine();
  LibraryManagerEngine = new LibraryEngine();
  DownloaderEngine = new DownloaderSyncEngine();
  TagManager = new TagManagerEngine();
  ViewController.init();

  // 2. Load Config from Backend and LocalStorage (Dual Persistence)
  try {
    const res = await fetch("/api/config");
    const cfg = await res.json();
    MusicGitState.config.defaultMusicDir = cfg.default_music_dir || "";
    MusicGitState.config.defaultBitrate = cfg.default_bitrate || "192";
    MusicGitState.config.defaultTemplate = cfg.default_template || "{num}. {title}-{id}.mp3";
    MusicGitState.config.theme = cfg.theme || "dark";
    MusicGitState.config.language = cfg.language || "id";

    const saved = localStorage.getItem("musicgit_config");
    if (saved) {
      const parsed = JSON.parse(saved);
      MusicGitState.config = { ...MusicGitState.config, ...parsed };
    }

    if (MusicGitState.config.theme) ThemeManager.applyTheme(MusicGitState.config.theme);
    if (MusicGitState.config.language) I18nManager.applyLanguage(MusicGitState.config.language);

    const isAndroid = cfg.is_android || /android/i.test(navigator.userAgent);
    MusicGitState.config.is_android = isAndroid;

    if (isAndroid) {
      document.body.classList.add("is-android");
    }

    const dirInput = document.getElementById("settings-output-dir");
    if (dirInput) {
      if (isAndroid) {
        dirInput.value = cfg.default_music_dir || "/storage/emulated/0/Music";
        dirInput.setAttribute("readonly", "true");
        dirInput.setAttribute("title", "Direktori Musik Android Standar");
      } else {
        dirInput.value = MusicGitState.config.defaultMusicDir || "";
      }
    }

    const browseBtn = document.getElementById("btn-settings-browse-dir");
    if (browseBtn && isAndroid) {
      browseBtn.style.display = "none";
    }

    const brSelect = document.getElementById("settings-default-bitrate");
    if (brSelect) brSelect.value = MusicGitState.config.defaultBitrate || "192";

    const tplSelect = document.getElementById("settings-default-template");
    if (tplSelect) tplSelect.value = MusicGitState.config.defaultTemplate || "{num}. {title}-{id}.mp3";
  } catch (err) {
    console.warn("Failed to load config:", err);
  }

  // 3. Load Library Playlists
  window.LibraryManagerEngine = LibraryManagerEngine;
  LibraryManagerEngine.loadPlaylists();

  // Auto-refresh when window regains focus (e.g. user returns from Explorer/Browser)
  window.addEventListener("focus", () => {
    if (window.LibraryManagerEngine) {
      window.LibraryManagerEngine.loadPlaylists();
    }
  });
});
