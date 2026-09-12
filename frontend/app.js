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
    this._wakeLock = null;
    this._lastStateSave = 0;

    this._initListeners();
    this._restorePlaybackState();
  }

  _initListeners() {
    // Audio events
    this.audio.addEventListener("play", () => {
      this.isPlaying = true;
      this._updatePlayButtonState();
      this._setScreenWake(true);
      this._notifyAndroidMedia(true);
      this._syncDiscordRPC(true);
      this._savePlaybackState();
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
      }
      if (this.currentTrack && window.LyricsEngine) {
        if (!window.LyricsEngine.currentTrack || window.LyricsEngine.currentTrack.file_path !== this.currentTrack.file_path) {
          window.LyricsEngine.loadLyrics(this.currentTrack);
        }
      }
    });

    this.audio.addEventListener("pause", () => {
      this.isPlaying = false;
      this._updatePlayButtonState();
      this._setScreenWake(false);
      this._notifyAndroidMedia(false);
      this._syncDiscordRPC(false);
      this._savePlaybackState();
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
      this._setScreenWake(false);
      this._notifyAndroidMedia(false);
      this._onTrackEnded();
    });

    this.audio.addEventListener("error", () => {
      this.isPlaying = false;
      this._updatePlayButtonState();
      this._setScreenWake(false);
      this._notifyAndroidMedia(false);
      this._clearDiscordRPC();
    });

    // Clear Discord RPC on page unload/close
    window.addEventListener("beforeunload", () => {
      this._clearDiscordRPC();
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
    this._notifyAndroidMedia(true);

    // Trigger lyrics load
    LyricsEngine.loadLyrics(track);

    // Sync Discord Rich Presence
    this._syncDiscordRPC(true);
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
      if (this.currentTrack && window.LyricsEngine) {
        if (!window.LyricsEngine.currentTrack || window.LyricsEngine.currentTrack.file_path !== this.currentTrack.file_path) {
          window.LyricsEngine.loadLyrics(this.currentTrack);
        }
      }
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
      this._notifyAndroidMedia(!this.audio.paused);
      this._syncDiscordRPC(!this.audio.paused);
    }
  }

  setVolume(val, save = true) {
    this.volume = Math.max(0, Math.min(1, val));
    this.audio.volume = this.volume;
    this.volumeSlider.value = this.volume;
    this.volumeFill.style.width = `${this.volume * 100}%`;
    this.isMuted = this.volume === 0;
    this._updateVolumeIcons();
    if (save) {
      localStorage.setItem("musicgit_player_volume", this.volume.toString());
      localStorage.setItem("musicgit_player_muted", this.isMuted ? "true" : "false");
    }
  }

  toggleMute() {
    if (this.isMuted) {
      const restored = this.volume > 0 ? this.volume : 1.0;
      this.setVolume(restored, true);
    } else {
      this.audio.volume = 0;
      this.volumeSlider.value = 0;
      this.volumeFill.style.width = "0%";
      this.isMuted = true;
      this._updateVolumeIcons();
      localStorage.setItem("musicgit_player_muted", "true");
    }
  }

  setShuffle(val) {
    this.isShuffle = Boolean(val);
    this.shuffleBtn.classList.toggle("active", this.isShuffle);
    localStorage.setItem("musicgit_player_shuffle", this.isShuffle ? "true" : "false");
  }

  toggleShuffle() {
    this.setShuffle(!this.isShuffle);
  }

  setRepeatMode(mode) {
    this.repeatMode = mode;
    if (this.repeatMode === "one") {
      this.repeatBtn.classList.add("active");
      this.repeatOneIndicator.classList.remove("hidden");
    } else if (this.repeatMode === "off") {
      this.repeatBtn.classList.remove("active");
      this.repeatOneIndicator.classList.add("hidden");
    } else {
      this.repeatMode = "all";
      this.repeatBtn.classList.add("active");
      this.repeatOneIndicator.classList.add("hidden");
    }
    localStorage.setItem("musicgit_player_repeat", this.repeatMode);
  }

  toggleRepeat() {
    if (this.repeatMode === "all") {
      this.setRepeatMode("one");
    } else if (this.repeatMode === "one") {
      this.setRepeatMode("off");
    } else {
      this.setRepeatMode("all");
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

    // Periodically save playback position
    const now = Date.now();
    if (!this._lastStateSave || now - this._lastStateSave > 4000) {
      this._lastStateSave = now;
      this._savePlaybackState();
    }
  }

  _savePlaybackState() {
    if (!this.currentTrack) return;
    try {
      const state = {
        track: this.currentTrack,
        queue: this.queue,
        currentIndex: this.currentIndex,
        currentTime: Math.floor(this.audio.currentTime || 0),
        duration: Math.floor(this.audio.duration || this.currentTrack.duration || 0),
      };
      localStorage.setItem("musicgit_last_playback", JSON.stringify(state));
    } catch (e) {
      console.warn("Save playback state error:", e);
    }
  }

  _restorePlaybackState() {
    try {
      // 1. Restore Volume & Mute
      const savedVol = localStorage.getItem("musicgit_player_volume");
      const savedMuted = localStorage.getItem("musicgit_player_muted");
      if (savedVol !== null) {
        const v = parseFloat(savedVol);
        if (!isNaN(v)) {
          this.setVolume(v, false);
        }
      } else {
        this.setVolume(1.0, false);
      }
      if (savedMuted === "true") {
        this.audio.volume = 0;
        this.volumeSlider.value = 0;
        this.volumeFill.style.width = "0%";
        this.isMuted = true;
        this._updateVolumeIcons();
      }

      // 2. Restore Repeat & Shuffle
      const savedRepeat = localStorage.getItem("musicgit_player_repeat");
      if (savedRepeat) {
        this.setRepeatMode(savedRepeat);
      }
      const savedShuffle = localStorage.getItem("musicgit_player_shuffle");
      if (savedShuffle !== null) {
        this.setShuffle(savedShuffle === "true");
      }

      // 3. Restore Last Track & Queue into Player Bar in standby state
      const raw = localStorage.getItem("musicgit_last_playback");
      if (raw) {
        const state = JSON.parse(raw);
        if (state && state.track) {
          const track = state.track;
          this.currentTrack = track;
          this.queue = Array.isArray(state.queue) && state.queue.length > 0 ? state.queue : [track];
          this.currentIndex = typeof state.currentIndex === "number" ? state.currentIndex : 0;

          // Set player bar labels and thumbnail
          this.barTitle.textContent = track.title || "Judul Lagu";
          this.barArtist.textContent = track.artist || "Unknown Artist";
          if (track.cover_url) {
            this.barThumb.src = track.cover_url;
            this.barThumb.onerror = () => {
              this.barThumb.src = ThemeManager.getLogoUrl();
            };
          } else {
            this.barThumb.src = ThemeManager.getLogoUrl();
          }

          // Preload audio src and timeline positions in paused state
          if (track.stream_url) {
            this.audio.src = track.stream_url;
            const targetPos = state.currentTime || 0;
            const dur = state.duration || track.duration || 100;
            this.audio.currentTime = targetPos;
            this.currentTimeLabel.textContent = this._formatTime(targetPos);
            this.totalTimeLabel.textContent = this._formatTime(dur);
            this.seekSlider.max = dur;
            this.seekSlider.value = targetPos;
            this.seekFill.style.width = dur > 0 ? `${(targetPos / dur) * 100}%` : "0%";
          }

          this._renderQueue();
          this._updatePlayButtonState();
          this._updateMediaSession(track);

          // Restore lyrics for restored standby track
          if (window.LyricsEngine) {
            window.LyricsEngine.loadLyrics(track);
          } else if (typeof LyricsEngine !== "undefined" && LyricsEngine) {
            LyricsEngine.loadLyrics(track);
          }
        }
      }
    } catch (e) {
      console.warn("Restore playback state error:", e);
    }
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

  _setScreenWake(keepAwake) {
    // 1. Android Native Java-JS Bridge (MainActivity AndroidBridge)
    if (window.AndroidBridge && typeof window.AndroidBridge.setKeepScreenOn === "function") {
      try {
        window.AndroidBridge.setKeepScreenOn(keepAwake);
      } catch (e) {
        console.warn("AndroidBridge setKeepScreenOn error:", e);
      }
    }

    // 2. Web Screen Wake Lock API (if supported by modern browser / PWA)
    if ("wakeLock" in navigator && navigator.wakeLock.request) {
      if (keepAwake) {
        if (!this._wakeLock) {
          navigator.wakeLock
            .request("screen")
            .then((lock) => {
              this._wakeLock = lock;
              lock.addEventListener("release", () => {
                this._wakeLock = null;
              });
            })
            .catch(() => {});
        }
      } else {
        if (this._wakeLock) {
          try {
            this._wakeLock.release();
          } catch (e) {}
          this._wakeLock = null;
        }
      }
    }
  }

  _notifyAndroidMedia(isPlaying) {
    if (window.AndroidBridge && typeof window.AndroidBridge.updatePlaybackState === "function") {
      try {
        const track = this.currentTrack || {};
        const title = track.title || "Judul Lagu";
        const artist = track.artist || "Unknown Artist";
        const album = track.album || "MusicGit";
        let coverUrl = track.cover_url || "";
        if (coverUrl && !coverUrl.startsWith("http")) {
          coverUrl = new URL(coverUrl, window.location.href).href;
        }
        const duration = this.audio.duration || 0;
        const position = this.audio.currentTime || 0;
        window.AndroidBridge.updatePlaybackState(title, artist, album, coverUrl, duration, position, isPlaying);
      } catch (e) {
        console.warn("AndroidBridge updatePlaybackState error:", e);
      }
    }
  }

  _syncDiscordRPC(isPlaying) {
    if (MusicGitState.config && MusicGitState.config.is_android) return;
    if (this._discordDebounceTimer) {
      clearTimeout(this._discordDebounceTimer);
    }
    this._discordDebounceTimer = setTimeout(() => {
      const track = this.currentTrack;
      if (!track) {
        this._clearDiscordRPC();
        return;
      }
      const title = track.title || "Music Track";
      const artist = track.artist || "";
      const album = track.album || "MusicGit";
      const duration = this.audio.duration || track.duration || 0;
      const currentTime = this.audio.currentTime || 0;
      let thumbnail = "";
      if (track.thumbnail && (track.thumbnail.startsWith("http://") || track.thumbnail.startsWith("https://"))) {
        const u = track.thumbnail.toLowerCase();
        if (!u.includes("localhost") && !u.includes("127.0.0.1")) {
          thumbnail = track.thumbnail;
        }
      } else if (track.cover_url && (track.cover_url.startsWith("http://") || track.cover_url.startsWith("https://"))) {
        const u = track.cover_url.toLowerCase();
        if (!u.includes("localhost") && !u.includes("127.0.0.1")) {
          thumbnail = track.cover_url;
        }
      }

      fetch("/api/discord-rpc/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title,
          artist: artist,
          album: album,
          duration: duration,
          current_time: currentTime,
          is_playing: Boolean(isPlaying),
          thumbnail: thumbnail,
        }),
      }).catch(() => {});
    }, 150);
  }

  _clearDiscordRPC() {
    if (MusicGitState.config && MusicGitState.config.is_android) return;
    fetch("/api/discord-rpc/clear", { method: "POST" }).catch(() => {});
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
      } else {
        this._clearDiscordRPC();
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

  onTrackChanged(track) {
    if (track) {
      this.loadLyrics(track);
    }
  }

  scrollActiveLineIntoView() {
    const curTime = window.MusicPlayer && window.MusicPlayer.audio ? (window.MusicPlayer.audio.currentTime || 0) : 0;
    this.onAudioTimeUpdate(curTime, true);
  }

  _initListeners() {
    if (this.refetchBtn) {
      this.refetchBtn.addEventListener("click", () => {
        const trk = this.currentTrack || (window.MusicPlayer ? window.MusicPlayer.currentTrack : null);
        if (trk) this.loadLyrics(trk, true);
      });
    }

    if (this.fullRefetchBtn) {
      this.fullRefetchBtn.addEventListener("click", () => {
        const trk = this.currentTrack || (window.MusicPlayer ? window.MusicPlayer.currentTrack : null);
        if (trk) this.loadLyrics(trk, true);
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

    const loadingHtml = `<div class="lyrics-empty-state"><span class="spinner"></span><p>${I18nManager.t("lyrics_searching")}</p></div>`;
    if (this.container) this.container.innerHTML = loadingHtml;
    if (this.fullContainer) this.fullContainer.innerHTML = loadingHtml;

    try {
      const url = `/api/library/track-lyrics?file_path=${encodeURIComponent(track.file_path)}&auto_fetch=${forceOnline ? "true" : "true"}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch lyrics");
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
        none: I18nManager.t("lyrics_source_none"),
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
            <p>${I18nManager.t("lyrics_not_available")}</p>
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
          <p>${I18nManager.t("lyrics_not_found")}</p>
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

  onAudioTimeUpdate(currentTime, forceScroll = false) {
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

    if (matchIdx === -1) {
      if (this.activeLineIdx !== -1) {
        this.activeLineIdx = -1;
        if (this.container) {
          this.container.querySelectorAll(".lyric-line.active").forEach((el) => el.classList.remove("active"));
        }
        if (this.fullContainer) {
          this.fullContainer.querySelectorAll(".lyric-line-full.active").forEach((el) => el.classList.remove("active"));
        }
      }
      return;
    }

    // Update active line highlighting and smooth scrolling
    if (matchIdx !== this.activeLineIdx || forceScroll) {
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

    const btnOpenFolder = document.getElementById("btn-hero-open-folder");
    if (btnOpenFolder) {
      btnOpenFolder.addEventListener("click", () => {
        if (MusicGitState.currentPlaylist) {
          fetch("/api/open-folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: MusicGitState.currentPlaylist.folder_path }),
          });
        }
      });
    }

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

    // Subtabs: Local Playlists vs Cloud Backups
    const tabLocal = document.getElementById("tab-lib-local");
    const tabCloud = document.getElementById("tab-lib-cloud");
    const gridLocal = document.getElementById("playlists-grid");
    const gridCloud = document.getElementById("cloud-playlists-grid");

    if (tabLocal && tabCloud && gridLocal && gridCloud) {
      tabLocal.addEventListener("click", () => {
        tabLocal.classList.add("active");
        tabCloud.classList.remove("active");
        gridLocal.classList.remove("hidden");
        gridCloud.classList.add("hidden");
      });

      tabCloud.addEventListener("click", () => {
        tabCloud.classList.add("active");
        tabLocal.classList.remove("active");
        gridCloud.classList.remove("hidden");
        gridLocal.classList.add("hidden");
        this.renderCloudPlaylists();
      });
    }

    // Hero Cloud Sync Button
    const btnHeroCloud = document.getElementById("btn-hero-cloud-sync");
    if (btnHeroCloud) {
      btnHeroCloud.addEventListener("click", async () => {
        if (!MusicGitState.currentPlaylist) return;

        if (!MusicGitState.currentPlaylist.remote_url) {
          alert("Playlist ini belum memiliki tautan remote. Silakan klik 'Tautkan Remote' terlebih dahulu.");
          return;
        }

        if (!window.CloudSyncManager || !window.CloudSyncManager.isLoggedIn()) {
          if (window.AuthUIController) window.AuthUIController.openModal();
          return;
        }

        const btnLabel = document.getElementById("hero-cloud-sync-label");
        const btnIcon = document.getElementById("hero-cloud-sync-icon");
        const isEn = (window.I18nManager && window.I18nManager.currentLang === "en");

        // Loading animation state
        btnHeroCloud.disabled = true;
        if (btnLabel) btnLabel.textContent = isEn ? "Backing up to Cloud..." : "Mencadangkan ke Cloud...";
        if (btnIcon) {
          btnIcon.innerHTML = `<path d="M21 12a9 9 0 1 1-6.219-8.56"></path>`;
          btnIcon.classList.add("spin-icon-update");
        }

        try {
          await window.CloudSyncManager.uploadPlaylist({
            title: MusicGitState.currentPlaylist.name,
            remote_url: MusicGitState.currentPlaylist.remote_url,
            provider: MusicGitState.currentPlaylist.provider || "youtube",
            cover_url: MusicGitState.currentPlaylist.cover_url || null,
            track_count: MusicGitState.currentPlaylist.total_tracks || 0,
            tracks: (MusicGitState.currentPlaylist.tracks || []).slice(0, 100).map((t) => ({
              title: t.title,
              artist: t.artist,
              album: t.album,
            })),
          });

          if (btnLabel) btnLabel.textContent = isEn ? "Synced to Cloud" : "Tersinkron di Cloud";
          if (btnIcon) {
            btnIcon.classList.remove("spin-icon-update");
            btnIcon.innerHTML = `<polyline points="20 6 9 17 4 12"></polyline>`;
          }
          btnHeroCloud.style.borderColor = "var(--accent-primary)";
          btnHeroCloud.style.color = "var(--accent-primary)";
          this.updateCloudBadges();

          // Reset button text after 3.5 seconds
          setTimeout(() => {
            if (btnLabel) btnLabel.textContent = isEn ? "Backup Cloud" : "Backup Cloud";
            if (btnIcon) {
              btnIcon.innerHTML = `
                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>
                <polyline points="12 13 12 7 9 10"></polyline>
                <polyline points="12 7 15 10"></polyline>
              `;
            }
            btnHeroCloud.style.borderColor = "";
            btnHeroCloud.style.color = "";
            btnHeroCloud.disabled = false;
          }, 3500);
        } catch (err) {
          alert((isEn ? "Failed to backup to cloud: " : "Gagal mencadangkan ke cloud: ") + err.message);
          if (btnLabel) btnLabel.textContent = isEn ? "Backup Cloud" : "Backup Cloud";
          if (btnIcon) {
            btnIcon.classList.remove("spin-icon-update");
            btnIcon.innerHTML = `
              <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>
              <polyline points="12 13 12 7 9 10"></polyline>
              <polyline points="12 7 15 10"></polyline>
            `;
          }
          btnHeroCloud.disabled = false;
        }
      });
    }
  }

  async loadPlaylists() {
    try {
      const res = await fetch(`/api/library/playlists`);
      if (!res.ok) throw new Error("Gagal memuat library");
      const list = await res.json();
      MusicGitState.playlists = list;
      this._renderSidebarPlaylists(list);
      this._renderMasterGrid(list);
      this.updateCloudBadges();
    } catch (err) {
      console.warn("Error loading playlists:", err);
      this.playlistsGrid.innerHTML = `<div class="sidebar-empty-state">${I18nManager.t("lib_failed_open")}</div>`;
    }
  }

  _renderSidebarPlaylists(list) {
    if (list.length === 0) {
      this.sidebarPlaylistsList.innerHTML = `<div class="sidebar-empty-state">${I18nManager.t("nav_empty_playlists")}</div>`;
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
          <p>${I18nManager.t("lib_empty_master")}</p>
        </div>
      `;
      return;
    }

    this.playlistsGrid.innerHTML = list
      .map((pl) => {
        const coverHtml = pl.cover_url
          ? `<img src="${pl.cover_url}" alt="${this._escape(pl.name)}" class="card-cover-img" onerror="this.outerHTML='<div class=\\'card-cover-fallback\\'><svg viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\'><polygon points=\\'12 2 2 7 12 12 22 7 12 2\\'></polygon><polyline points=\\'2 17 12 22 22 17\\'></polyline><polyline points=\\'2 12 12 17 22 12\\'></polyline></svg></div>'">`
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
              <button type="button" class="card-play-overlay" title="${I18nManager.t("lib_btn_play_all")}">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              </button>
            </div>
            <div class="card-meta-info">
              <h4 class="card-pl-title" title="${this._escape(pl.name)}">${this._escape(pl.name)}</h4>
              <span class="card-pl-stats">${pl.track_count} ${I18nManager.t("lib_songs_suffix")}</span>
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
    this.tracksTbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px;"><span class="spinner"></span> ${I18nManager.t("lib_loading_tracks")}</td></tr>`;

    try {
      const res = await fetch(`/api/library/playlist?folder_path=${encodeURIComponent(folderPath)}`);
      if (!res.ok) throw new Error("Gagal memuat detail playlist");
      const data = await res.json();
      MusicGitState.currentPlaylist = data;

      this.detailTitle.textContent = data.name;
      this.detailPath.textContent = data.folder_path;
      this.detailCount.textContent = `${data.total_tracks} ${I18nManager.t("lib_songs_suffix")}`;
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
        document.getElementById("hero-sync-label").textContent = I18nManager.t("lib_sync_with_yt");
      } else {
        this.heroRemoteBadge.classList.add("hidden");
        document.getElementById("hero-sync-label").textContent = I18nManager.t("lib_link_and_sync_yt");
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
      this.tracksTbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--accent-danger);">${I18nManager.t("lib_failed_open")}</td></tr>`;
    }
  }

  async syncCurrentPlaylistLyrics() {
    if (!MusicGitState.currentPlaylist) return;
    const btn = document.getElementById("btn-hero-sync-lyrics");
    const label = document.getElementById("hero-sync-lyrics-label");
    const originalText = label ? label.textContent : I18nManager.t("lib_update_lyrics");

    try {
      if (btn) btn.disabled = true;
      if (label) label.textContent = I18nManager.t("lib_syncing_lyrics");

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
      alert(data.message || `${I18nManager.t("lib_sync_lyrics_success")} (${data.updated_count || 0} ${I18nManager.t("lib_songs_suffix")}).`);

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
    this.trackStats.textContent = `${tracks.length} ${I18nManager.t("lib_songs_suffix")}`;
    if (tracks.length === 0) {
      this.tracksTbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 30px;">${I18nManager.t("lib_empty_folder")}</td></tr>`;
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
              <button type="button" class="btn-track-play" title="${I18nManager.t("th_play")}">
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
              <button type="button" class="btn-icon-xs btn-track-menu" title="${I18nManager.t("th_lyrics")}">
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
    this.updateCloudBadges();
  }

  async updateCloudBadges() {
    const badgeLocal = document.getElementById("badge-count-local-playlists");
    if (badgeLocal) {
      badgeLocal.textContent = (MusicGitState.playlists || []).length;
    }

    const badgeCloud = document.getElementById("badge-count-cloud-playlists");
    if (badgeCloud) {
      if (window.CloudSyncManager && window.CloudSyncManager.isLoggedIn()) {
        try {
          const list = await window.CloudSyncManager.getCloudPlaylists();
          badgeCloud.textContent = list.length;
        } catch (e) {
          badgeCloud.textContent = "0";
        }
      } else {
        badgeCloud.textContent = "0";
      }
    }
  }

  async renderCloudPlaylists() {
    const gridCloud = document.getElementById("cloud-playlists-grid");
    if (!gridCloud) return;

    const isEn = (window.I18nManager && window.I18nManager.currentLang === "en");

    if (!window.CloudSyncManager || !window.CloudSyncManager.isLoggedIn()) {
      gridCloud.innerHTML = `
        <div class="cloud-empty-card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>
          </svg>
          <h3>${isEn ? "Guest Mode Active" : "Mode Guest Aktif"}</h3>
          <p>${isEn ? "You are not signed in. Sign in or create an account to view, backup, and restore your playlists on any device." : "Anda belum masuk dengan akun cloud. Masuk atau buat akun untuk melihat, mencadangkan, dan mengunduh kembali playlist Anda di perangkat apa pun."}</p>
          <button type="button" class="btn btn-primary" onclick="window.AuthUIController && window.AuthUIController.openModal()">
            ${isEn ? "Sign In / Create Cloud Account" : "Masuk / Buat Akun Cloud"}
          </button>
        </div>
      `;
      return;
    }

    gridCloud.innerHTML = `<div class="sidebar-empty-state" style="grid-column: 1 / -1; padding: 40px; text-align: center;"><span class="spinner"></span> ${isEn ? "Loading cloud playlists..." : "Memuat playlist dari cloud..."}</div>`;

    try {
      const cloudList = await window.CloudSyncManager.getCloudPlaylists();
      this.updateCloudBadges();

      if (cloudList.length === 0) {
        gridCloud.innerHTML = `
          <div class="cloud-empty-card">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>
            </svg>
            <h3>${isEn ? "No Cloud Playlists Yet" : "Belum Ada Playlist di Cloud"}</h3>
            <p>${isEn ? "Open any local playlist linked to a remote, then click \"Backup Cloud\" to store it here." : "Buka salah satu playlist lokal Anda yang terhubung dengan remote, lalu tekan tombol \"Backup Cloud\" untuk menyimpannya di sini."}</p>
          </div>
        `;
        return;
      }

      const localUrls = new Set((MusicGitState.playlists || []).map((p) => p.remote_url).filter(Boolean));

      gridCloud.innerHTML = cloudList
        .map((cp) => {
          const isLocal = localUrls.has(cp.remote_url);
          const statusBadge = isLocal
            ? `<span class="pill pill-success pill-xs" style="background: rgba(34, 197, 94, 0.15); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.3);">Tersimpan di Lokal</span>`
            : `<span class="pill pill-primary pill-xs">Tersimpan di Cloud Saja</span>`;

          const actionBtn = isLocal
            ? `<button type="button" class="btn btn-secondary btn-sm btn-open-local-pl" data-remote="${this._escape(cp.remote_url)}" style="width: 100%;">Buka Playlist</button>`
            : `<button type="button" class="btn btn-accent btn-sm btn-download-cloud-pl" data-url="${this._escape(cp.remote_url)}" data-title="${this._escape(cp.title)}" style="width: 100%;">Download ke Lokal</button>`;

          const coverHtml = cp.cover_url
            ? `<img src="${cp.cover_url}" alt="${this._escape(cp.title)}" class="card-cover-img" onerror="this.outerHTML='<div class=\\'card-cover-fallback\\'><svg viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\'><polygon points=\\'12 2 2 7 12 12 22 7 12 2\\'></polygon><polyline points=\\'2 17 12 22 22 17\\'></polyline><polyline points=\\'2 12 12 17 22 12\\'></polyline></svg></div>'">`
            : `
              <div class="card-cover-fallback">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>
                </svg>
              </div>
            `;

          return `
            <div class="playlist-card" style="display: flex; flex-direction: column;">
              <div class="card-cover-wrap">
                ${coverHtml}
                <div class="card-git-pill" style="text-transform: uppercase;">${this._escape(cp.provider || "Remote")}</div>
              </div>
              <div class="card-meta-info" style="flex: 1; display: flex; flex-direction: column;">
                <h4 class="card-pl-title" title="${this._escape(cp.title)}">${this._escape(cp.title)}</h4>
                <div style="display: flex; align-items: center; justify-content: space-between; margin: 4px 0 8px 0;">
                  <span class="card-pl-stats">${cp.track_count || 0} Lagu</span>
                  ${statusBadge}
                </div>
                <div style="margin-top: auto; display: flex; gap: 6px;">
                  ${actionBtn}
                  <button type="button" class="btn btn-secondary btn-sm btn-delete-cloud-pl" data-remote="${this._escape(cp.remote_url)}" title="Hapus dari Cloud" style="padding: 6px 10px; color: var(--text-subtle);">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          `;
        })
        .join("");

      // Wire buttons
      gridCloud.querySelectorAll(".btn-open-local-pl").forEach((btn) => {
        btn.addEventListener("click", () => {
          const remoteUrl = btn.dataset.remote;
          const matched = (MusicGitState.playlists || []).find((p) => p.remote_url === remoteUrl);
          if (matched) {
            this.openPlaylist(matched.folder_path);
          }
        });
      });

      gridCloud.querySelectorAll(".btn-download-cloud-pl").forEach((btn) => {
        btn.addEventListener("click", () => {
          const url = btn.dataset.url;
          if (url) {
            ViewController.switchView("view-downloader");
            const urlInput = document.getElementById("input-playlist-url");
            if (urlInput) {
              urlInput.value = url;
              urlInput.focus();
            }
          }
        });
      });

      gridCloud.querySelectorAll(".btn-delete-cloud-pl").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const remoteUrl = btn.dataset.remote;
          if (confirm("Hapus cadangan playlist ini dari cloud?")) {
            await window.CloudSyncManager.deleteCloudPlaylist(remoteUrl);
            this.renderCloudPlaylists();
          }
        });
      });
    } catch (err) {
      gridCloud.innerHTML = `
        <div class="sidebar-empty-state" style="grid-column: 1 / -1; padding: 40px; text-align: center;">
          <p>Gagal memuat playlist dari cloud: ${this._escape(err.message)}</p>
        </div>
      `;
    }
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
    if (progTitle) progTitle.textContent = I18nManager.t("modal_sync_prep");
    if (progPercent) progPercent.textContent = "0%";
    if (progBar) {
      progBar.style.width = "0%";
      progBar.style.backgroundColor = "var(--accent-primary)";
    }
    if (cancelBtn) cancelBtn.disabled = false;
    if (closeBtn) closeBtn.disabled = false;
    if (downloadBtn) downloadBtn.disabled = true;

    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 24px;"><span class="spinner"></span> ${I18nManager.t("modal_sync_comparing")}</td></tr>`;
    modal.classList.remove("hidden");

    try {
      const res = await fetch("/api/sync-playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlist_url: playlist.remote_url, folder_path: playlist.folder_path }),
      });
      if (!res.ok) throw new Error(I18nManager.currentLang === "en" ? "Failed to sync with remote playlist." : "Gagal melakukan sinkronisasi dengan remote playlist.");
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
            ? `<span class="pill pill-primary" style="font-size: 0.65rem;">${I18nManager.t("tag_diff_local_ok")}</span>`
            : `<span class="pill pill-git" style="font-size: 0.65rem; color: #00e676; border-color: #00e676;">${I18nManager.t("tag_diff_new_pill")}</span>`;

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
    if (progTitle) progTitle.textContent = I18nManager.t("modal_sync_prep_count", { count: newTracks.length });
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
      language: I18nManager.currentLang,
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
      if (!res.ok) throw new Error(I18nManager.currentLang === "en" ? "Failed to start download." : "Gagal memulai proses download.");
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
              ? `${I18nManager.t("modal_sync_downloading")}${data.current_track_title} (${data.completed_tracks}/${data.total_tracks})`
              : `${I18nManager.t("modal_sync_downloading")} ${data.completed_tracks}/${data.total_tracks} ${I18nManager.t("lib_songs_suffix")}...`;
          }

          if (data.status === "completed") {
            evt.close();
            this.activeSyncEvt = null;
            if (data.failed_tracks > 0 && data.completed_tracks === 0) {
              const firstErr = Object.values(data.tracks_status || {}).find(t => t.error)?.error || (I18nManager.currentLang === "en" ? "Failed to download songs." : "Gagal mengunduh lagu.");
              if (progTitle) progTitle.textContent = I18nManager.t("modal_sync_failed", { error: firstErr });
              if (cancelBtn) cancelBtn.disabled = false;
              if (closeBtn) closeBtn.disabled = false;
              if (downloadBtn) downloadBtn.disabled = false;
              return;
            }

            if (progTitle) progTitle.textContent = I18nManager.t("modal_sync_completed", { completed: data.completed_tracks });
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
            const firstErr = Object.values(data.tracks_status || {}).find(t => t.error)?.error || (I18nManager.currentLang === "en" ? "Failed to download songs." : "Gagal mengunduh lagu.");
            if (progTitle) progTitle.textContent = I18nManager.t("modal_sync_failed", { error: firstErr });
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
      alert(err.message || (I18nManager.currentLang === "en" ? "Failed to download synced playlist." : "Gagal melakukan download sinkronisasi."));
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
    this.pulse = document.getElementById("dl-active-pulse");
    this.heading = document.getElementById("dl-progress-heading");
    this.fillBar = document.getElementById("dl-progress-fill");
    this.percentText = document.getElementById("dl-percent-text");
    this.speedText = document.getElementById("dl-speed-text");
    this.etaText = document.getElementById("dl-eta-text");
    this.countsText = document.getElementById("dl-counts-text");
    this.currentLabel = document.getElementById("dl-current-label");
    this.queueList = document.getElementById("dl-queue-list");
    this.terminalLogs = document.getElementById("dl-terminal-logs");
    this.completedBanner = document.getElementById("dl-completed-banner");
    this.completedTitle = document.getElementById("dl-completed-title");
    this.completedDesc = document.getElementById("dl-completed-desc");

    this.lastTargetDir = null;

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

    // Options Synchronization Listeners
    const bitrateSelect = document.getElementById("select-dl-bitrate");
    const bitrateBadge = document.getElementById("badge-selected-bitrate");
    if (bitrateSelect) {
      bitrateSelect.addEventListener("change", (e) => {
        const val = e.target.value;
        if (bitrateBadge) bitrateBadge.textContent = `${val} kbps`;
        MusicGitState.config.defaultBitrate = val;
        this._saveLocalOptions();
      });
    }

    const templateSelect = document.getElementById("select-dl-template");
    if (templateSelect) {
      templateSelect.addEventListener("change", (e) => {
        MusicGitState.config.defaultTemplate = e.target.value;
        this._saveLocalOptions();
      });
    }

    ["toggle-dl-cover", "toggle-dl-save-cover", "toggle-dl-lyrics", "toggle-dl-lrc"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", () => this._saveLocalOptions());
    });

    // Open Destination Folder Button
    const openDestBtn = document.getElementById("btn-dl-open-dest");
    if (openDestBtn) {
      openDestBtn.addEventListener("click", () => {
        const target = this.lastTargetDir || MusicGitState.config.defaultMusicDir;
        if (target) {
          fetch("/api/open-folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: target }),
          });
        }
      });
    }

    // Completion Banner Actions
    const gotoLibraryBtn = document.getElementById("btn-dl-goto-library");
    if (gotoLibraryBtn) {
      gotoLibraryBtn.addEventListener("click", async () => {
        ViewController.switchView("view-library");
        if (this.lastTargetDir && window.LibraryManagerEngine) {
          await window.LibraryManagerEngine.loadPlaylists();
          await window.LibraryManagerEngine.openPlaylist(this.lastTargetDir);
        }
      });
    }

    const playDownloadedBtn = document.getElementById("btn-dl-play-downloaded");
    if (playDownloadedBtn) {
      playDownloadedBtn.addEventListener("click", async () => {
        ViewController.switchView("view-library");
        if (this.lastTargetDir && window.LibraryManagerEngine) {
          await window.LibraryManagerEngine.loadPlaylists();
          await window.LibraryManagerEngine.openPlaylist(this.lastTargetDir);
          if (MusicGitState.currentPlaylist && MusicGitState.currentPlaylist.tracks.length > 0) {
            window.MusicPlayer.playTrack(MusicGitState.currentPlaylist.tracks[0], MusicGitState.currentPlaylist.tracks, 0);
          }
        }
      });
    }
  }

  _saveLocalOptions() {
    try {
      localStorage.setItem("musicgit_config", JSON.stringify(MusicGitState.config));
      const opts = {
        embed_cover: document.getElementById("toggle-dl-cover")?.checked,
        save_cover_file: document.getElementById("toggle-dl-save-cover")?.checked,
        fetch_lyrics: document.getElementById("toggle-dl-lyrics")?.checked,
        save_lrc_file: document.getElementById("toggle-dl-lrc")?.checked,
      };
      localStorage.setItem("musicgit_dl_options", JSON.stringify(opts));
    } catch (e) {
      console.warn("Failed to save local dl options:", e);
    }
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

      const providerLabel = (data.provider || "youtube").toUpperCase();
      document.getElementById("dl-banner-title").textContent = data.title;
      document.getElementById("dl-banner-author").textContent = data.uploader ? `[${providerLabel}] ${data.uploader}` : `[${providerLabel}]`;
      document.getElementById("dl-banner-count").textContent = `${data.total_tracks || data.track_count || (data.tracks ? data.tracks.length : 0)} ${I18nManager.t("lib_songs_suffix")}`;
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
      alert(I18nManager.t("dl_alert_select_min_1"));
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
      language: I18nManager.currentLang,
    };

    const payload = {
      tracks,
      playlist_title: MusicGitState.analyzedData.title,
      output_base_dir: MusicGitState.config.defaultMusicDir || null,
      options,
      remote_url: this.urlInput.value.trim(),
    };

    // Pre-render queue list immediately
    this._renderInitialQueue(tracks);

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
      this.lastTargetDir = targetFolder;

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
      bitrate: MusicGitState.config.defaultBitrate || "192",
      filename_template: MusicGitState.config.defaultTemplate || "{num}. {title}-{id}.mp3",
      embed_cover: true,
      save_cover_file: true,
      fetch_lyrics: true,
      save_lrc_file: true,
      language: I18nManager.currentLang,
    };

    const payload = {
      tracks: newTracks.map((t, idx) => ({ ...t, selected: true, index: idx + 1 })),
      playlist_title: playlistTitle,
      output_base_dir: targetFolderPath || null,
      target_folder: targetFolderPath || null,
      options,
      remote_url: remoteUrl || (this.urlInput ? this.urlInput.value.trim() : null),
    };

    this.lastTargetDir = targetFolderPath;
    this._renderInitialQueue(payload.tracks);

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

  _renderInitialQueue(tracks) {
    if (!this.queueList || !tracks) return;
    this.queueList.innerHTML = tracks
      .map((t, idx) => {
        return `
          <div class="queue-item" data-idx="${t.index || idx + 1}">
            <div class="queue-item-info">
              <span class="queue-item-num">#${t.index || idx + 1}</span>
              <div class="queue-item-text">
                <span class="queue-item-title" title="${this._escape(t.title)}">${this._escape(t.title)}</span>
                <span class="queue-item-artist">${this._escape(t.artist || "Unknown Artist")}</span>
              </div>
            </div>
            <span class="pill pill-xs pill-queue-queued">${I18nManager.t("queue_status_queued")}</span>
          </div>
        `;
      })
      .join("");
  }

  subscribeToProgress(jobId) {
    this.progressCard.classList.remove("hidden", "is-completed", "is-failed");
    if (this.completedBanner) this.completedBanner.classList.add("hidden");
    if (this.pulse) this.pulse.className = "active-pulse";
    if (this.heading) this.heading.textContent = I18nManager.t("dl_prog_heading_active");
    if (this.fillBar) {
      this.fillBar.style.width = "0%";
      this.fillBar.style.background = "";
    }

    if (MusicGitState.eventSource) {
      MusicGitState.eventSource.close();
    }

    const badge = document.getElementById("badge-download-active");
    if (badge) {
      badge.classList.remove("hidden");
      badge.textContent = I18nManager.t("badge_syncing");
      badge.style.backgroundColor = "";
    }

    const evt = new EventSource(`/api/job/${jobId}/stream`);
    MusicGitState.eventSource = evt;

    evt.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        this._updateProgressUI(data);

        if (["completed", "failed", "cancelled"].includes(data.status)) {
          evt.close();
          MusicGitState.eventSource = null;

          if (data.status === "completed") {
            // Visual change on complete
            this.progressCard.classList.add("is-completed");
            this.progressCard.classList.remove("is-failed");
            if (this.pulse) this.pulse.className = "active-pulse pulse-completed";
            if (this.heading) this.heading.textContent = I18nManager.t("dl_prog_heading_completed");
            if (this.currentLabel) {
              const countDone = data.completed_tracks || data.total_tracks || 0;
              this.currentLabel.textContent = I18nManager.t("dl_prog_completed_all").replace("{count}", countDone);
            }

            if (this.completedBanner) {
              if (this.completedTitle) {
                this.completedTitle.textContent = I18nManager.t("dl_banner_completed_title_stat")
                  .replace("{completed}", data.completed_tracks || 0)
                  .replace("{total}", data.total_tracks || 0);
              }
              if (this.completedDesc) {
                const defaultDirLabel = I18nManager.currentLang === "en" ? "Music Folder" : "Folder Musik";
                const folderName = data.target_dir ? data.target_dir.split(/[/\\]/).pop() : defaultDirLabel;
                this.completedDesc.textContent = I18nManager.t("dl_banner_saved_in").replace("{folder}", folderName);
              }
              this.completedBanner.classList.remove("hidden");
            }

            if (badge) {
              badge.textContent = I18nManager.t("badge_done");
              badge.style.backgroundColor = "var(--accent-success)";
              setTimeout(() => {
                badge.classList.add("hidden");
              }, 6000);
            }

            // Live auto-refresh library
            if (window.LibraryManagerEngine) {
              window.LibraryManagerEngine.refreshCurrentView();
            }
          } else {
            // Visual change on failed
            this.progressCard.classList.add("is-failed");
            this.progressCard.classList.remove("is-completed");
            if (this.pulse) this.pulse.className = "active-pulse pulse-failed";
            if (this.heading) this.heading.textContent = I18nManager.t("dl_prog_heading_failed");
            if (this.currentLabel) {
              this.currentLabel.textContent = I18nManager.t("dl_prog_failed_count").replace("{count}", data.failed_tracks || 0);
            }
            if (badge) badge.classList.add("hidden");
          }
        }
      } catch (err) {
        console.warn("SSE Stream parse error:", err);
      }
    };

    evt.onerror = () => {
      evt.close();
      MusicGitState.eventSource = null;
    };
  }

  _updateProgressUI(data) {
    if (data.target_dir) {
      this.lastTargetDir = data.target_dir;
    }

    const pct = Math.round(data.overall_percent || 0);
    this.fillBar.style.width = `${pct}%`;
    this.percentText.textContent = `${pct}%`;

    let displaySpeed = data.speed || "--";
    if (displaySpeed === "Selesai" || displaySpeed === "Done") {
      displaySpeed = I18nManager.t("dl_prog_speed_done");
    }
    this.speedText.textContent = `${I18nManager.t("dl_prog_speed_prefix")}${displaySpeed}`;
    this.etaText.textContent = `${I18nManager.t("dl_prog_eta_prefix")}${data.eta || "--"}`;
    this.countsText.textContent = `${data.completed_tracks || 0} / ${data.total_tracks || 0} ${I18nManager.t("dl_prog_counts_done")}`;
    
    if (data.status !== "completed" && data.status !== "failed") {
      this.currentLabel.textContent = data.current_track_title
        ? `${I18nManager.t("dl_prog_downloading")}${data.current_track_title}`
        : I18nManager.t("dl_prog_processing_queue");
    }

    // Append logs
    if (data.new_logs && data.new_logs.length > 0) {
      data.new_logs.forEach((log) => {
        const row = document.createElement("div");
        row.className = "log-row";
        if (log.includes("[BERHASIL]") || log.includes("[Selesai]") || log.includes("[Done]") || log.includes("[All Complete]")) row.classList.add("text-success");
        if (log.includes("[ERROR]") || log.includes("[Gagal]") || log.includes("[Failed]")) row.classList.add("text-error");
        row.textContent = log;
        this.terminalLogs.appendChild(row);
      });
      this.terminalLogs.scrollTop = this.terminalLogs.scrollHeight;
    }

    // Update queue list (supports Dictionary and Array from backend)
    if (data.tracks_status) {
      const trackArray = Array.isArray(data.tracks_status)
        ? data.tracks_status
        : Object.values(data.tracks_status);

      trackArray.sort((a, b) => (a.index || 0) - (b.index || 0));

      this.queueList.innerHTML = trackArray
        .map((t) => {
          let statusHtml = `<span class="pill pill-xs pill-queue-queued">${I18nManager.t("queue_status_queued")}</span>`;
          let rowClass = "";

          if (t.status === "downloading") {
            const prog = Math.round(t.progress || 0);
            statusHtml = `<span class="pill pill-xs pill-queue-downloading">${prog}%</span>`;
            rowClass = "queue-item-active";
          } else if (t.status === "converting") {
            statusHtml = `<span class="pill pill-xs pill-queue-converting">${I18nManager.t("queue_status_converting")}</span>`;
            rowClass = "queue-item-active";
          } else if (t.status === "tagging") {
            statusHtml = `<span class="pill pill-xs pill-queue-tagging">${I18nManager.t("queue_status_tagging")}</span>`;
            rowClass = "queue-item-active";
          } else if (t.status === "lyrics") {
            statusHtml = `<span class="pill pill-xs pill-queue-lyrics">${I18nManager.t("queue_status_lyrics")}</span>`;
            rowClass = "queue-item-active";
          } else if (t.status === "completed") {
            statusHtml = `<span class="pill pill-xs pill-queue-ok">${I18nManager.t("queue_status_ok")}</span>`;
            rowClass = "queue-item-completed";
          } else if (t.status === "failed") {
            statusHtml = `<span class="pill pill-xs pill-queue-failed" title="${this._escape(t.error || '')}">${I18nManager.t("queue_status_failed")}</span>`;
            rowClass = "queue-item-failed";
          }

          return `
            <div class="queue-item ${rowClass}">
              <div class="queue-item-info">
                <span class="queue-item-num">#${t.index}</span>
                <div class="queue-item-text">
                  <span class="queue-item-title" title="${this._escape(t.title)}">${this._escape(t.title)}</span>
                  <span class="queue-item-artist">${this._escape(t.artist || "Unknown Artist")}</span>
                </div>
              </div>
              ${statusHtml}
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

      status.textContent = I18nManager.t("tag_status_repairing");
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
        status.textContent = I18nManager.t("tag_status_repaired", { count: data.fixed_count || data.updated_files || 0 });
        this.scan(folder);
      } catch (err) {
        status.textContent = I18nManager.t("tag_status_failed", { error: err.message });
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
              ? `<span class="pill pill-primary" style="font-size: 0.65rem;">${I18nManager.t("tag_diff_local_ok")}</span>`
              : `<span class="pill pill-git" style="font-size: 0.65rem; color: #00e676; border-color: #00e676;">${I18nManager.t("tag_diff_new_pill")}</span>`;
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
      if (!res.ok) throw new Error(I18nManager.currentLang === "en" ? "Failed to scan folder" : "Gagal memindai folder");
      const data = await res.json();

      this.statTitle.textContent = data.folder_name;
      this.statPath.textContent = data.folder_path;
      this.chipTotal.textContent = `${data.total_files} ${I18nManager.t("lib_songs_suffix")}`;
      this.chipCover.textContent = data.has_cover_art ? I18nManager.t("tag_chip_cover_yes") : I18nManager.t("tag_chip_cover_no");

      if (data.missing_artist_count > 0) {
        this.chipArtists.textContent = `${data.missing_artist_count} Unknown Artist`;
        this.chipArtists.classList.remove("hidden");
      } else {
        this.chipArtists.classList.add("hidden");
      }

      if (data.missing_lyrics_count > 0) {
        this.chipLyrics.textContent = `${data.missing_lyrics_count} ${I18nManager.t("tag_chip_missing_lyrics")}`;
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
              <td style="text-align: center;">${f.has_cover ? I18nManager.t("tag_cell_yes") : "--"}</td>
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
    theme_toggle_title: "Ganti Tema Gelap / Terang",
    btn_cancel: "Batal",
    btn_close: "Tutup",
    update_title: "Pembaruan Aplikasi",
    update_btn_check: "Periksa Pembaruan",
    update_btn_checking: "Memeriksa...",
    update_status_idle: "Periksa ketersediaan versi terbaru di GitHub Releases.",
    update_status_checking: "Menghubungi server GitHub untuk memeriksa pembaruan...",
    update_up_to_date: "Aplikasi Anda sudah menggunakan versi terbaru.",
    update_available_title: "Pembaruan Baru Tersedia!",
    update_btn_download: "Unduh Pembaruan",
    update_downloading: "Mengunduh pembaruan...",
    update_ready_windows: "Pembaruan siap dipasang. Klik tombol di bawah untuk memasang dan me-restart aplikasi.",
    update_ready_android: "File APK pembaruan siap dipasang di perangkat Android Anda.",
    update_btn_install: "Pasang & Restart Sekarang",
    update_btn_install_android: "Pasang Pembaruan APK",
    update_view_release: "Lihat di GitHub",

    th_select: "Pilih",
    th_num: "#",
    th_play: "Putar",
    th_cover: "Cover",
    th_title: "Judul Lagu",
    th_artist: "Artis",
    th_album: "Album",
    th_lyrics: "Lirik",
    th_duration: "Durasi",
    th_actions: "Aksi",
    th_filename: "Nama File",
    th_yt_title: "Judul di Remote",
    th_folder_status: "Status di Folder",
    th_status: "Status",

    lib_title: "Library Musik Lokal",
    lib_desc: "Koleksi playlist dan lagu tersinkronisasi di komputer Anda",
    lib_btn_scan: "Pindai Library",
    lib_btn_new_dl: "Download Playlist Baru",
    lib_all_songs_tab: "Semua Lagu",
    lib_playlists_tab: "Daftar Playlist",
    lib_empty_tracks: "Belum ada lagu di library.",
    lib_empty_master: "Belum ada folder playlist di direktori musik.",
    lib_btn_sync_diff: "Cek Sync Git Diff",
    lib_btn_play_all: "Putar Semua",
    lib_btn_shuffle: "Acak",
    lib_btn_edit_tags: "Edit Tag Playlist",
    lib_btn_back_playlists: "Kembali ke Semua Playlist",
    lib_badge_local: "PLAYLIST LOKAL",
    lib_badge_connected: "Connected to Remote",
    lib_filter_placeholder: "Cari dalam playlist ini...",
    lib_songs_suffix: "Lagu",
    lib_empty_folder: "Belum ada file audio di folder ini.",
    lib_failed_open: "Gagal membuka playlist.",
    lib_loading_tracks: "Memuat lagu...",
    lib_sync_with_yt: "Sync Playlist",
    lib_link_and_sync_yt: "Tautkan & Sync",
    lib_update_lyrics: "Update Lirik",
    lib_syncing_lyrics: "Menyinkronkan Lirik...",
    lib_sync_lyrics_success: "Lirik berhasil disinkronkan",
    lib_link_remote: "Tautkan Remote",
    lib_open_folder: "Buka Folder",

    dl_title: "Download & Sinkronisasi Playlist",
    dl_desc: "Unduh playlist atau video satuan dengan cover art 1:1, ID3 tags lengkap, dan lirik bersinkronisasi.",
    dl_url_label: "URL Playlist / Lagu (YouTube, Spotify, Deezer, Apple Music, SoundCloud)",
    dl_url_placeholder: "Tempel link YouTube, Spotify, Deezer, Apple Music, atau SoundCloud...",
    dl_supported_platforms: "Mendukung:",
    dl_btn_paste_title: "Tempel dari Clipboard",
    dl_btn_paste: "Tempel",
    dl_btn_analyze: "Analisis Link",
    dl_card_options: "Opsi Format & ID3 Tag",
    dl_bitrate_label: "Kualitas Audio (Bitrate MP3)",
    dl_format_label: "Format Penamaan File",
    dl_album_label: "Nama Album (TALB)",
    dl_album_placeholder: "Otomatis nama playlist",
    dl_album_artist_label: "Artis Album (TPE2)",
    dl_folder_label: "Nama Subfolder Playlist",
    dl_folder_placeholder: "Nama folder",
    dl_cb_sync: "Mode Sinkronisasi Git (Hanya unduh lagu yang belum ada di lokal)",
    dl_cb_lyrics: "Download & Sisipkan Lirik (.lrc / ID3 USLT) otomatis",
    dl_cb_id3: "Sisipkan Metadata ID3 Tag & Cover Art otomatis",
    dl_opt_cover_title: "Embed Cover Art",
    dl_opt_cover_sub: "Pasang gambar cover 1:1 ke file MP3",
    dl_opt_save_cover_title: "Simpan cover.jpg",
    dl_opt_save_cover_sub: "Simpan file gambar di folder",
    dl_opt_lyrics_title: "Ambil Lirik Lagu",
    dl_opt_lyrics_sub: "Embed lirik otomatis dari database",
    dl_opt_save_lrc_title: "Simpan File .lrc",
    dl_opt_save_lrc_sub: "Lirik bersinkronisasi waktu",
    dl_btn_start_download: "Unduh",
    dl_btn_download_selected: "Download Lagu Terpilih",
    dl_select_all: "Pilih Semua",
    dl_filter_placeholder: "Saring judul...",
    dl_uploaded_by: "Diupload oleh",
    dl_alert_select_min_1: "Pilih minimal 1 lagu.",

    dl_prog_heading_active: "Proses Download Aktif",
    dl_prog_heading_completed: "Download Selesai!",
    dl_prog_heading_failed: "Download Terhenti / Gagal",
    dl_prog_preparing: "Mempersiapkan antrian...",
    dl_prog_downloading: "Mendownload: ",
    dl_prog_processing_queue: "Memproses antrian...",
    dl_prog_speed_prefix: "Kecepatan: ",
    dl_prog_eta_prefix: "Sisa: ",
    dl_prog_counts_done: "Selesai",
    dl_prog_speed_done: "Selesai",
    dl_prog_completed_all: "Selesai! Semua {count} lagu berhasil diunduh.",
    dl_prog_failed_count: "{count} lagu gagal diunduh.",
    dl_btn_open_dest: "Buka Folder Tujuan",
    dl_banner_completed_title: "Unduhan Selesai & Berhasil!",
    dl_banner_completed_title_stat: "Unduhan Selesai! ({completed}/{total} Lagu Berhasil)",
    dl_banner_completed_desc: "Semua lagu telah berhasil diunduh dengan tag ID3 lengkap dan lirik bersinkronisasi.",
    dl_banner_saved_in: "Tersimpan di \"{folder}\". Tag ID3 & Cover Art telah disematkan.",
    dl_btn_view_lib: "Lihat di Library",
    dl_btn_play_now: "Putar Sekarang",
    dl_queue_header: "Status Antrian Lagu",
    dl_log_header: "Log Aktivitas",
    dl_log_clear: "Bersihkan",
    dl_log_ready: "[Sistem] Siap menerima proses download...",
    badge_syncing: "Syncing",
    badge_done: "Selesai",

    queue_status_queued: "Antri",
    queue_status_downloading: "Unduh",
    queue_status_converting: "Konversi",
    queue_status_tagging: "ID3 Tag",
    queue_status_lyrics: "Lirik",
    queue_status_ok: "OK",
    queue_status_failed: "Gagal",

    tag_title: "Manajer Tag & Sinkronisasi Folder",
    tag_desc: "Inspeksi kesehatan metadata ID3 folder musik, perbaiki cover & lirik, atau bandingkan dengan playlist remote.",
    tag_folder_label: "Path Folder Musik Lokal",
    tag_folder_placeholder: "Pilih folder musik lokal...",
    tag_btn_browse: "Pilih Folder",
    tag_btn_scan: "Scan Folder",
    tag_btn_open: "Buka",
    tag_select_folder: "Pilih Folder Playlist Lokal",
    tag_btn_refresh: "Refresh Data",
    tag_btn_apply_tags: "Terapkan Tag ID3",
    tag_btn_fetch_lyrics: "Download Lirik (LRC)",
    tag_chip_cover_yes: "Cover: Ada",
    tag_chip_cover_no: "Cover: Tidak Ada",
    tag_chip_missing_lyrics: "Tanpa Lirik",
    tag_tab_repair: "Perbaiki Tag & Metadata",
    tag_tab_sync: "Diff & Sinkronisasi Playlist",
    tag_album_name: "Nama Album (TALB)",
    tag_album_placeholder: "Otomatis dari nama folder",
    tag_album_artist: "Artis Album (TPE2)",
    tag_chk_artist: "Perbaiki nama artis/judul dari nama file jika Unknown",
    tag_chk_cover: "Sematkan cover.jpg folder ke seluruh MP3",
    tag_chk_lyrics: "Ambil lirik otomatis (.lrc / USLT) untuk lagu yang belum punya lirik",
    tag_btn_repair_all: "Perbaiki Semua Tag di Folder Ini",
    tag_status_repairing: "Memperbaiki tag...",
    tag_status_repaired: "Berhasil! {count} file diperbarui.",
    tag_status_failed: "Gagal: {error}",
    tag_sync_url_placeholder: "Masukkan Link Playlist (YouTube, Spotify, Deezer, dll)...",
    tag_btn_paste: "Tempel",
    tag_btn_check_new: "Cek Lagu Baru",
    tag_diff_existing: "Sudah Ada di Folder",
    tag_diff_new: "Lagu Baru di Remote",
    tag_diff_btn_download_pre: "Download",
    tag_diff_btn_download_post: "Lagu Baru Saja",
    tag_diff_local_ok: "Lokal OK",
    tag_diff_new_pill: "+ Baru",
    tag_cell_yes: "Ada",

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
    settings_discord_title: "Discord Rich Presence (Status Listening)",
    settings_discord_desc: "Tampilkan status aktivitas 'Listening to MusicGit' di profil Discord Anda secara realtime saat memutar musik.",
    settings_discord_enable: "Aktifkan Discord Rich Presence",
    settings_btn_save: "Simpan Pengaturan",
    settings_saved_alert: "Pengaturan MusicGit berhasil disimpan.",
    settings_developed_by: "Dikembangkan oleh",
    about_tagline: "Sinkronisasi Remote Playlist Multi-Platform & Pemutar Musik",

    lyrics_title: "Lirik Lagu",
    lyrics_select_prompt: "Pilih Lagu untuk Diputar",
    lyrics_empty_prompt: "Putar sebuah lagu untuk melihat lirik karaoke bersinkronisasi.",
    lyrics_btn_refetch: "Ambil Ulang Lirik Online",
    lyrics_btn_back: "Kembali",
    lyrics_offset_title: "Kalibrasi Waktu Lirik",
    lyrics_offset_hint: "Gunakan tombol jika vokal lagu dan teks lirik tidak pas.",
    lyrics_searching: "Mencari lirik lagu...",
    lyrics_not_available: "Lirik belum tersedia untuk lagu ini.",
    lyrics_not_found: "Lirik tidak ditemukan untuk lagu ini.",
    lyrics_source_none: "Tidak Ada",

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
    queue_close_title: "Tutup Antrian",

    modal_link_title: "Tautkan Remote Playlist",
    modal_link_desc: "Hubungkan folder playlist lokal ini ke URL Playlist (YouTube, Spotify, Deezer, Apple Music, SoundCloud) agar Anda dapat menyinkronkan (Git Pull) lagu baru sewaktu-waktu.",
    modal_link_folder_label: "Folder Lokal",
    modal_link_url_label: "URL Playlist Remote",
    modal_link_custom_title: "Judul Playlist Kustom (Opsional)",
    modal_link_title_placeholder: "Nama playlist",
    modal_link_btn_save: "Simpan Remote",
    modal_sync_title: "Sinkronisasi Playlist Remote",
    modal_sync_existing: "Sudah Ada di Lokal",
    modal_sync_new: "Lagu Baru di Remote",
    modal_sync_comparing: "Menghubungi platform dan membandingkan playlist...",
    modal_sync_prep: "Menyiapkan download...",
    modal_sync_prep_count: "Menyiapkan download {count} lagu baru...",
    modal_sync_downloading: "Mengunduh: ",
    modal_sync_completed: "Selesai! {completed} lagu baru berhasil ditambahkan.",
    modal_sync_failed: "Gagal: {error}",
    modal_sync_btn_download_pre: "Download",
    modal_sync_btn_download_post: "Lagu Baru Saja",

    // Cloud & Auth
    account_topbar_title: "Kelola Akun & Cloud Sync",
    account_guest_mode: "Mode Guest",
    account_my_account: "Akun Saya",
    lib_tab_local: "Playlist Lokal",
    lib_tab_cloud: "Cadangan Cloud",
    lib_cloud_backup_btn: "Backup Cloud",
    lib_cloud_synced: "Tersinkron di Cloud",
    lib_cloud_backing_up: "Mencadangkan ke Cloud...",
    settings_cloud_title: "Akun & Sinkronisasi Cloud",
    settings_cloud_desc: "Sinkronkan metadata playlist untuk pencadangan online lintas perangkat",
    settings_cloud_status_label: "Status Akun:",
    settings_cloud_status_guest: "Mode Guest (Lokal saja)",
    settings_cloud_status_connected: "Terhubung:",
    settings_cloud_btn_open_auth: "Kelola Akun",
    auth_modal_title: "Akun & Cloud Sync",
    auth_modal_subtitle: "Cadangkan & sinkronkan playlist ke cloud",
    auth_pill_connected: "Akun Terhubung",
    auth_btn_sync_all: "Cadangkan Semua Playlist Lokal ke Cloud",
    auth_btn_logout: "Keluar dari Akun",
    auth_logout_confirm: "Apakah Anda yakin ingin keluar dari akun?",
    auth_logout_success: "Berhasil keluar dari akun.",
    auth_btn_google: "Lanjutkan dengan Google",
    auth_or_email: "atau gunakan email",
    auth_tab_signin: "Masuk",
    auth_tab_signup: "Daftar Akun Baru",
    auth_email_label: "Alamat Email",
    auth_email_placeholder: "nama@email.com",
    auth_password_label: "Password",
    auth_password_placeholder: "Minimal 6 karakter",
    auth_btn_submit_signin: "Masuk",
    auth_btn_submit_signup: "Daftar Akun Baru",
    auth_guest_note_title: "Mode Guest:",
    auth_guest_note_desc: "Akun ini opsional. Jika tidak login, Anda tetap dapat mengunduh dan memutar lagu seperti biasa secara offline.",
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
    theme_toggle_title: "Toggle Dark / Light Theme",
    btn_cancel: "Cancel",
    btn_close: "Close",
    update_title: "App Updates",
    update_btn_check: "Check for Updates",
    update_btn_checking: "Checking...",
    update_status_idle: "Check for newer versions published on GitHub Releases.",
    update_status_checking: "Connecting to GitHub server to check for updates...",
    update_up_to_date: "You are already using the latest version.",
    update_available_title: "New Update Available!",
    update_btn_download: "Download Update",
    update_downloading: "Downloading update...",
    update_ready_windows: "Update is ready. Click below to install and restart MusicGit.",
    update_ready_android: "APK update package is ready to install on your Android device.",
    update_btn_install: "Install & Restart Now",
    update_btn_install_android: "Install APK Update",
    update_view_release: "View on GitHub",

    th_select: "Select",
    th_num: "#",
    th_play: "Play",
    th_cover: "Cover",
    th_title: "Song Title",
    th_artist: "Artist",
    th_album: "Album",
    th_lyrics: "Lyrics",
    th_duration: "Duration",
    th_actions: "Action",
    th_filename: "Filename",
    th_yt_title: "Remote Title",
    th_folder_status: "Folder Status",
    th_status: "Status",

    lib_title: "Local Music Library",
    lib_desc: "Your synced playlists and songs collection on this device",
    lib_btn_scan: "Scan Library",
    lib_btn_new_dl: "Download New Playlist",
    lib_all_songs_tab: "All Songs",
    lib_playlists_tab: "Playlists",
    lib_empty_tracks: "No songs in library yet.",
    lib_empty_master: "No playlist folders in music directory yet.",
    lib_btn_sync_diff: "Check Git Sync Diff",
    lib_btn_play_all: "Play All",
    lib_btn_shuffle: "Shuffle",
    lib_btn_edit_tags: "Edit Playlist Tags",
    lib_btn_back_playlists: "Back to All Playlists",
    lib_badge_local: "LOCAL PLAYLIST",
    lib_badge_connected: "Connected to Remote",
    lib_filter_placeholder: "Search in this playlist...",
    lib_songs_suffix: "Songs",
    lib_empty_folder: "No audio files in this folder yet.",
    lib_failed_open: "Failed to open playlist.",
    lib_loading_tracks: "Loading songs...",
    lib_sync_with_yt: "Sync Playlist",
    lib_link_and_sync_yt: "Link & Sync",
    lib_update_lyrics: "Update Lyrics",
    lib_syncing_lyrics: "Syncing Lyrics...",
    lib_sync_lyrics_success: "Lyrics synced successfully",
    lib_link_remote: "Link Remote",
    lib_open_folder: "Open Folder",

    dl_title: "Download & Sync Playlists",
    dl_desc: "Download playlists or single tracks with 1:1 cover art, full ID3 tags, and synced lyrics.",
    dl_url_label: "Playlist / Track URL (YouTube, Spotify, Deezer, Apple Music, SoundCloud)",
    dl_url_placeholder: "Paste YouTube, Spotify, Deezer, Apple Music, or SoundCloud link...",
    dl_supported_platforms: "Supported:",
    dl_btn_paste_title: "Paste from Clipboard",
    dl_btn_paste: "Paste",
    dl_btn_analyze: "Analyze Link",
    dl_card_options: "Format & ID3 Tag Options",
    dl_bitrate_label: "Audio Quality (MP3 Bitrate)",
    dl_format_label: "Filename Output Format",
    dl_album_label: "Album Name (TALB)",
    dl_album_placeholder: "Auto playlist name",
    dl_album_artist_label: "Album Artist (TPE2)",
    dl_folder_label: "Playlist Subfolder Name",
    dl_folder_placeholder: "Folder name",
    dl_cb_sync: "Git Sync Mode (Only download new songs missing locally)",
    dl_cb_lyrics: "Auto-fetch & embed lyrics (.lrc / ID3 USLT)",
    dl_cb_id3: "Auto-embed ID3 Tags & Album Cover Art",
    dl_opt_cover_title: "Embed Cover Art",
    dl_opt_cover_sub: "Embed 1:1 cover art into MP3 file",
    dl_opt_save_cover_title: "Save cover.jpg",
    dl_opt_save_cover_sub: "Save image file in folder",
    dl_opt_lyrics_title: "Fetch Lyrics",
    dl_opt_lyrics_sub: "Auto-embed lyrics from database",
    dl_opt_save_lrc_title: "Save .lrc File",
    dl_opt_save_lrc_sub: "Time-synced lyrics file",
    dl_btn_start_download: "Download",
    dl_btn_download_selected: "Download Selected Songs",
    dl_select_all: "Select All",
    dl_filter_placeholder: "Filter titles...",
    dl_uploaded_by: "Uploaded by",
    dl_alert_select_min_1: "Please select at least 1 song.",

    dl_prog_heading_active: "Download in Progress",
    dl_prog_heading_completed: "Download Complete!",
    dl_prog_heading_failed: "Download Stopped / Failed",
    dl_prog_preparing: "Preparing queue...",
    dl_prog_downloading: "Downloading: ",
    dl_prog_processing_queue: "Processing queue...",
    dl_prog_speed_prefix: "Speed: ",
    dl_prog_eta_prefix: "ETA: ",
    dl_prog_counts_done: "Completed",
    dl_prog_speed_done: "Done",
    dl_prog_completed_all: "Done! All {count} songs successfully downloaded.",
    dl_prog_failed_count: "{count} songs failed to download.",
    dl_btn_open_dest: "Open Destination Folder",
    dl_banner_completed_title: "Download Complete & Successful!",
    dl_banner_completed_title_stat: "Download Complete! ({completed}/{total} Songs Successful)",
    dl_banner_completed_desc: "All songs have been downloaded with full ID3 tags and synced lyrics.",
    dl_banner_saved_in: "Saved in \"{folder}\". ID3 Tags & Cover Art embedded.",
    dl_btn_view_lib: "View in Library",
    dl_btn_play_now: "Play Now",
    dl_queue_header: "Song Queue Status",
    dl_log_header: "Activity Log",
    dl_log_clear: "Clear",
    dl_log_ready: "[System] Ready to accept download job...",
    badge_syncing: "Syncing",
    badge_done: "Done",

    queue_status_queued: "Queued",
    queue_status_downloading: "Downloading",
    queue_status_converting: "Converting",
    queue_status_tagging: "ID3 Tag",
    queue_status_lyrics: "Lyrics",
    queue_status_ok: "OK",
    queue_status_failed: "Failed",

    tag_title: "Tag & Folder Sync Manager",
    tag_desc: "Inspect music folder ID3 metadata health, repair covers & lyrics, or compare with remote playlist.",
    tag_folder_label: "Local Music Folder Path",
    tag_folder_placeholder: "Choose local music folder...",
    tag_btn_browse: "Choose Folder",
    tag_btn_scan: "Scan Folder",
    tag_btn_open: "Open",
    tag_select_folder: "Select Local Playlist Folder",
    tag_btn_refresh: "Refresh Data",
    tag_btn_apply_tags: "Apply ID3 Tags",
    tag_btn_fetch_lyrics: "Download Lyrics (LRC)",
    tag_chip_cover_yes: "Cover: Yes",
    tag_chip_cover_no: "Cover: None",
    tag_chip_missing_lyrics: "Missing Lyrics",
    tag_tab_repair: "Repair Tags & Metadata",
    tag_tab_sync: "Playlist Diff & Sync",
    tag_album_name: "Album Name (TALB)",
    tag_album_placeholder: "Auto from folder name",
    tag_album_artist: "Album Artist (TPE2)",
    tag_chk_artist: "Fix artist/title from filename if Unknown",
    tag_chk_cover: "Embed folder cover.jpg to all MP3s",
    tag_chk_lyrics: "Auto-fetch lyrics (.lrc / USLT) for songs missing lyrics",
    tag_btn_repair_all: "Repair All Tags in This Folder",
    tag_status_repairing: "Repairing tags...",
    tag_status_repaired: "Success! {count} files updated.",
    tag_status_failed: "Failed: {error}",
    tag_sync_url_placeholder: "Enter Playlist Link (YouTube, Spotify, Deezer, etc)...",
    tag_btn_paste: "Paste",
    tag_btn_check_new: "Check New Songs",
    tag_diff_existing: "Already in Folder",
    tag_diff_new: "New on Remote",
    tag_diff_btn_download_pre: "Download",
    tag_diff_btn_download_post: "New Songs Only",
    tag_diff_local_ok: "Local OK",
    tag_diff_new_pill: "+ New",
    tag_cell_yes: "Yes",

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
    settings_discord_title: "Discord Rich Presence (Listening Status)",
    settings_discord_desc: "Display real-time 'Listening to MusicGit' activity status on your Discord profile when playing music.",
    settings_discord_enable: "Enable Discord Rich Presence",
    settings_btn_save: "Save Settings",
    settings_saved_alert: "MusicGit settings saved successfully.",
    settings_developed_by: "Developed by",
    about_tagline: "Multi-Platform Playlist Remote Sync & Music Player",

    lyrics_title: "Song Lyrics",
    lyrics_select_prompt: "Select a Song to Play",
    lyrics_empty_prompt: "Play a song to view real-time synchronized karaoke lyrics.",
    lyrics_btn_refetch: "Refetch Lyrics Online",
    lyrics_btn_back: "Back",
    lyrics_offset_title: "Lyrics Timing Calibration",
    lyrics_offset_hint: "Use buttons if song vocals and lyrics timing don't match.",
    lyrics_searching: "Searching for lyrics...",
    lyrics_not_available: "Lyrics not available yet for this song.",
    lyrics_not_found: "Lyrics not found for this song.",
    lyrics_source_none: "None",

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
    queue_close_title: "Close Queue",

    modal_link_title: "Link Remote Playlist",
    modal_link_desc: "Connect this local playlist folder to a remote playlist URL (YouTube, Spotify, Deezer, Apple Music, SoundCloud) to synchronize (Git Pull) new songs anytime.",
    modal_link_folder_label: "Local Folder",
    modal_link_url_label: "Remote Playlist URL",
    modal_link_custom_title: "Custom Playlist Title (Optional)",
    modal_link_title_placeholder: "Playlist name",
    modal_link_btn_save: "Save Remote",
    modal_sync_title: "Remote Playlist Sync",
    modal_sync_existing: "Already in Local",
    modal_sync_new: "New on Remote",
    modal_sync_comparing: "Connecting to platform and comparing playlist...",
    modal_sync_prep: "Preparing download...",
    modal_sync_prep_count: "Preparing download for {count} new songs...",
    modal_sync_downloading: "Downloading: ",
    modal_sync_completed: "Done! {completed} new songs successfully added.",
    modal_sync_failed: "Failed: {error}",
    modal_sync_btn_download_pre: "Download",
    modal_sync_btn_download_post: "New Songs Only",

    // Cloud & Auth
    account_topbar_title: "Manage Account & Cloud Sync",
    account_guest_mode: "Guest Mode",
    account_my_account: "My Account",
    lib_tab_local: "Local Playlists",
    lib_tab_cloud: "Cloud Backups",
    lib_cloud_backup_btn: "Backup Cloud",
    lib_cloud_synced: "Synced to Cloud",
    lib_cloud_backing_up: "Backing up to Cloud...",
    settings_cloud_title: "Cloud Account & Synchronization",
    settings_cloud_desc: "Sync playlist metadata for online multi-device backup",
    settings_cloud_status_label: "Account Status:",
    settings_cloud_status_guest: "Guest Mode (Local only)",
    settings_cloud_status_connected: "Connected:",
    settings_cloud_btn_open_auth: "Manage Account",
    auth_modal_title: "Account & Cloud Sync",
    auth_modal_subtitle: "Backup & sync playlists to cloud",
    auth_pill_connected: "Account Connected",
    auth_btn_sync_all: "Backup All Local Playlists to Cloud",
    auth_btn_logout: "Sign Out",
    auth_logout_confirm: "Are you sure you want to sign out?",
    auth_logout_success: "Signed out successfully.",
    auth_btn_google: "Continue with Google",
    auth_or_email: "or continue with email",
    auth_tab_signin: "Sign In",
    auth_tab_signup: "Create Account",
    auth_email_label: "Email Address",
    auth_email_placeholder: "name@email.com",
    auth_password_label: "Password",
    auth_password_placeholder: "At least 6 characters",
    auth_btn_submit_signin: "Sign In",
    auth_btn_submit_signup: "Create Account",
    auth_guest_note_title: "Guest Mode:",
    auth_guest_note_desc: "An account is optional. If not signed in, you can still download and play songs offline as usual.",
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
    document.documentElement.lang = lang;
    if (MusicGitState.config) {
      MusicGitState.config.language = lang;
    }

    const dict = I18N_DICTIONARY[lang];

    // 1. Translate all data-i18n elements
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      if (
        (el.id === "player-bar-title" || el.id === "player-bar-artist") &&
        window.MusicPlayer &&
        window.MusicPlayer.currentTrack
      ) {
        return;
      }
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

    // 6. Update theme toggle label & title if present
    const themeToggleBtn = document.getElementById("btn-toggle-theme");
    if (themeToggleBtn && dict.theme_toggle_title) {
      themeToggleBtn.title = dict.theme_toggle_title;
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

    // 9. Update Auth and Cloud Sync components
    if (window.AuthUIController) {
      window.AuthUIController.updateUI();
    }
    if (window.LibraryManagerEngine && typeof window.LibraryManagerEngine.renderCloudPlaylists === "function") {
      const tabCloud = document.getElementById("tab-lib-cloud");
      if (tabCloud && tabCloud.classList.contains("active")) {
        window.LibraryManagerEngine.renderCloudPlaylists();
      }
    }
  }
};


// =============================================================================
// 7. THEME MANAGER (PURE DARK MODE ONLY)
// =============================================================================
const ThemeManager = {
  currentTheme: "dark",

  getLogoUrl() {
    return "assets/logo-darkmode-v2.png";
  },

  init() {
    this.currentTheme = "dark";
    localStorage.setItem("musicgit_theme", "dark");
    this.applyTheme("dark");

    const themeSelect = document.getElementById("settings-theme-select");
    if (themeSelect) {
      themeSelect.value = "dark";
    }
  },

  applyTheme(theme = "dark") {
    this.currentTheme = "dark";
    document.body.classList.remove("theme-light");
    document.body.classList.add("theme-dark");
    document.documentElement.setAttribute("data-theme", "dark");
    document.body.setAttribute("data-theme", "dark");
    localStorage.setItem("musicgit_theme", "dark");

    // Browser / desktop titlebar theme-color dynamically
    let metaTheme = document.getElementById("meta-theme-color");
    if (!metaTheme) {
      metaTheme = document.createElement("meta");
      metaTheme.id = "meta-theme-color";
      metaTheme.name = "theme-color";
      document.head.appendChild(metaTheme);
    }
    metaTheme.setAttribute("content", "#181818");

    // Set in-app logos to logo-darkmode-v2.jpg
    const logoUrl = this.getLogoUrl();
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
        !window.MusicPlayer ||
        !window.MusicPlayer.currentTrack ||
        !window.MusicPlayer.currentTrack.cover_url
      ) {
        playerThumb.src = logoUrl;
      }
    }
  },
};

// =============================================================================
// 7.5 APP AUTO-UPDATE MANAGER (WINDOWS & ANDROID)
// =============================================================================
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const UpdateManager = {
  currentVersion: "2.3.1",
  pollInterval: null,
  latestRelease: null,

  init() {
    const btnCheck = document.getElementById("btn-check-update");
    if (btnCheck) {
      btnCheck.addEventListener("click", () => this.checkForUpdates(true));
    }
    // Fetch initial version from backend quietly on init
    fetch("/api/system/check-update")
      .then(res => res.json())
      .then(data => {
        if (data && data.current_version) {
          this.currentVersion = data.current_version;
          this.updateVersionChips(data.current_version);
        }
      })
      .catch(() => {});
  },

  updateVersionChips(version) {
    if (!version) return;
    const vStr = version.startsWith("v") || version.startsWith("V") ? version : `v${version}`;
    const chip = document.getElementById("update-current-ver-chip");
    if (chip) chip.textContent = vStr;
    document.querySelectorAll(".sidebar-footer-text").forEach(el => {
      el.textContent = `MusicGit ${vStr}`;
    });
  },

  async checkForUpdates(manual = false) {
    const btnCheck = document.getElementById("btn-check-update");
    const label = document.getElementById("btn-check-update-label");
    const iconSpin = document.getElementById("icon-check-update");
    const iconStatic = document.getElementById("icon-check-static");
    const panel = document.getElementById("update-panel-container");
    const statusDesc = document.getElementById("update-status-desc");

    if (btnCheck) btnCheck.disabled = true;
    if (label) label.textContent = I18nManager.t("update_btn_checking") || "Memeriksa...";
    if (iconSpin) iconSpin.classList.remove("hidden");
    if (iconStatic) iconStatic.classList.add("hidden");
    if (statusDesc) statusDesc.textContent = I18nManager.t("update_status_checking") || "Menghubungi server GitHub...";

    try {
      const res = await fetch(`/api/system/check-update?force=${manual ? "true" : "false"}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Gagal memeriksa update.");
      }
      const data = await res.json();
      this.latestRelease = data;
      if (data.current_version) {
        this.currentVersion = data.current_version;
        this.updateVersionChips(data.current_version);
      }

      if (panel) {
        panel.classList.remove("hidden");
        if (data.update_available) {
          this.renderUpdateAvailable(data);
          if (statusDesc) {
            statusDesc.textContent = (I18nManager.currentLang === "en")
              ? `New version ${data.latest_version} is available!`
              : `Versi baru ${data.latest_version} tersedia!`;
          }
        } else {
          this.renderUpToDate(data);
          if (statusDesc) {
            statusDesc.textContent = I18nManager.t("update_up_to_date") || "Aplikasi Anda sudah versi terbaru.";
          }
        }
      }
    } catch (err) {
      console.warn("Update check failed:", err);
      if (panel) {
        panel.classList.remove("hidden");
        panel.innerHTML = `
          <div class="update-status-box error">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>${escapeHtml(err.message || "Tidak dapat memeriksa pembaruan saat ini.")}</span>
          </div>
        `;
      }
      if (statusDesc) {
        statusDesc.textContent = (I18nManager.currentLang === "en")
          ? "Failed to check for updates."
          : "Gagal memeriksa pembaruan.";
      }
    } finally {
      if (btnCheck) btnCheck.disabled = false;
      if (label) label.textContent = I18nManager.t("update_btn_check") || "Periksa Pembaruan";
      if (iconSpin) iconSpin.classList.add("hidden");
      if (iconStatic) iconStatic.classList.remove("hidden");
    }
  },

  renderUpToDate(data) {
    const panel = document.getElementById("update-panel-container");
    if (!panel) return;
    const isEn = I18nManager.currentLang === "en";
    const installedVer = data.current_version || this.currentVersion || "2.3.1";
    panel.innerHTML = `
      <div class="update-status-box up-to-date">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <div>
          <strong style="display: block;">${I18nManager.t("update_up_to_date") || "Aplikasi Anda sudah versi terbaru."}</strong>
          <span style="font-size: 0.8rem; opacity: 0.85;">${isEn ? "Installed version" : "Versi terpasang"}: ${escapeHtml(installedVer)}</span>
        </div>
      </div>
    `;
  },

  renderUpdateAvailable(data) {
    const panel = document.getElementById("update-panel-container");
    if (!panel) return;
    const isAndroid = data.platform === "android" || /android/i.test(navigator.userAgent);
    const dateFormatted = data.published_at ? new Date(data.published_at).toLocaleDateString() : "";
    const assetSizeMb = data.asset_size ? (data.asset_size / (1024 * 1024)).toFixed(1) + " MB" : "";

    panel.innerHTML = `
      <div class="update-available-card">
        <div class="update-avail-header">
          <div class="update-avail-title-row">
            <h4 class="update-avail-title">${I18nManager.t("update_available_title") || "Pembaruan Baru Tersedia!"}</h4>
            <span class="update-new-badge">${escapeHtml(data.latest_version)}</span>
          </div>
          ${dateFormatted ? `<span class="update-avail-date">Dirilis: ${escapeHtml(dateFormatted)}</span>` : ""}
        </div>

        <div class="update-changelog-box">${escapeHtml(data.release_notes || "Peningkatan performa dan perbaikan bug.")}</div>

        <div id="update-download-section" class="update-progress-wrap hidden">
          <div class="update-progress-labels">
            <span id="update-prog-status-text">${I18nManager.t("update_downloading") || "Mengunduh pembaruan..."}</span>
            <span id="update-prog-percent">0%</span>
          </div>
          <div class="update-progress-track">
            <div id="update-prog-bar-fill" class="update-progress-fill" style="width: 0%;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.76rem; color: var(--text-subtle);">
            <span id="update-prog-speed">0 KB/s</span>
            <span id="update-prog-size">${assetSizeMb ? `Ukuran: ${assetSizeMb}` : ""}</span>
          </div>
        </div>

        <div class="update-action-row" id="update-actions-box">
          ${data.asset_url ? `
            <button type="button" id="btn-start-update-download" class="btn btn-primary btn-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>${I18nManager.t("update_btn_download") || "Unduh Pembaruan"} ${assetSizeMb ? `(${assetSizeMb})` : ""}</span>
            </button>
          ` : `
            <a href="${escapeHtml(data.html_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              <span>${I18nManager.t("update_view_release") || "Lihat di GitHub"}</span>
            </a>
          `}
          <a href="${escapeHtml(data.html_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="font-size: 0.8rem;">
            <span>GitHub Release</span>
          </a>
        </div>
      </div>
    `;

    const dlBtn = document.getElementById("btn-start-update-download");
    if (dlBtn) {
      dlBtn.addEventListener("click", () => this.startDownload(data));
    }
  },

  async startDownload(data) {
    const dlSection = document.getElementById("update-download-section");
    const actionsBox = document.getElementById("update-actions-box");
    if (dlSection) dlSection.classList.remove("hidden");
    if (actionsBox) actionsBox.classList.add("hidden");

    try {
      const res = await fetch("/api/system/download-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_url: data.asset_url,
          asset_name: data.asset_name,
          target_version: data.latest_version
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Gagal memulai unduhan update.");
      }

      this.startProgressPolling(data);
    } catch (err) {
      alert("Error unduh pembaruan: " + err.message);
      if (actionsBox) actionsBox.classList.remove("hidden");
    }
  },

  startProgressPolling(data) {
    if (this.pollInterval) clearInterval(this.pollInterval);

    const isAndroid = data.platform === "android" || /android/i.test(navigator.userAgent);
    const fill = document.getElementById("update-prog-bar-fill");
    const pct = document.getElementById("update-prog-percent");
    const speed = document.getElementById("update-prog-speed");
    const statusText = document.getElementById("update-prog-status-text");
    const actionsBox = document.getElementById("update-actions-box");

    this.pollInterval = setInterval(async () => {
      try {
        const res = await fetch("/api/system/update-progress");
        const prog = await res.json();

        if (fill) fill.style.width = `${prog.percentage}%`;
        if (pct) pct.textContent = `${prog.percentage}%`;
        if (speed) speed.textContent = prog.download_speed || "";

        if (prog.status === "ready") {
          clearInterval(this.pollInterval);
          this.pollInterval = null;

          if (statusText) {
            statusText.textContent = isAndroid
              ? (I18nManager.t("update_ready_android") || "Unduhan selesai. Siap dipasang di Android.")
              : (I18nManager.t("update_ready_windows") || "Unduhan selesai. Siap dipasang & restart.");
          }

          if (actionsBox) {
            actionsBox.classList.remove("hidden");
            actionsBox.innerHTML = `
              <button type="button" id="btn-apply-update-now" class="btn btn-primary btn-sm" style="background-color: #10b981;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>${isAndroid ? (I18nManager.t("update_btn_install_android") || "Pasang Pembaruan APK") : (I18nManager.t("update_btn_install") || "Pasang & Restart Sekarang")}</span>
              </button>
            `;

            const applyBtn = document.getElementById("btn-apply-update-now");
            if (applyBtn) {
              applyBtn.addEventListener("click", () => this.applyUpdate(prog.file_path, isAndroid));
            }
          }
        } else if (prog.status === "error") {
          clearInterval(this.pollInterval);
          this.pollInterval = null;
          if (statusText) statusText.textContent = `Error: ${prog.error_message || "Unduhan gagal."}`;
          if (actionsBox) actionsBox.classList.remove("hidden");
        }
      } catch (e) {
        console.warn("Polling update progress error:", e);
      }
    }, 500);
  },

  async applyUpdate(filePath, isAndroid) {
    try {
      if (!isAndroid) {
        const statusText = document.getElementById("update-prog-status-text");
        if (statusText) {
          statusText.textContent = I18nManager.currentLang === "en"
            ? "Preparing update... MusicGit will restart automatically."
            : "Menyiapkan pembaruan... MusicGit akan me-restart secara otomatis.";
        }
        const actionsBox = document.getElementById("update-actions-box");
        if (actionsBox) {
          actionsBox.innerHTML = `
            <div style="font-size: 0.85rem; color: #10b981; display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: rgba(16, 185, 129, 0.1); border-radius: 8px; border: 1px solid rgba(16, 185, 129, 0.25);">
              <svg class="spin-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
                <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
              </svg>
              <span>${I18nManager.currentLang === "en" ? "Installing update... please wait, restarting soon." : "Memasang pembaruan... mohon tunggu, segera restart."}</span>
            </div>
          `;
        }
      }

      const res = await fetch("/api/system/install-update", { method: "POST" });
      const result = await res.json();

      if (isAndroid || result.platform === "android") {
        const apkPath = result.apk_path || filePath;
        if (window.AndroidBridge && typeof window.AndroidBridge.installApk === "function") {
          window.AndroidBridge.installApk(apkPath);
        } else {
          alert(`File APK siap di: ${apkPath}. Silakan buka file ini untuk memperbarui.`);
        }
      }
    } catch (err) {
      alert("Gagal memasang pembaruan: " + err.message);
      const actionsBox = document.getElementById("update-actions-box");
      if (actionsBox) actionsBox.classList.remove("hidden");
    }
  }
};

// =============================================================================
// 8. VIEW CONTROLLER & APP INITIALIZATION
// =============================================================================
const ViewController = {
  previousView: "view-library",

  init() {
    I18nManager.init();
    ThemeManager.init();
    UpdateManager.init();

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
      const thm = "dark";
      const lang = document.getElementById("settings-lang-select").value;
      const discordEnabled = document.getElementById("settings-discord-enabled") ? document.getElementById("settings-discord-enabled").checked : true;
      const discordClientId = "1547603041497387099";

      MusicGitState.config.defaultMusicDir = dir;
      MusicGitState.config.defaultBitrate = br;
      MusicGitState.config.defaultTemplate = tpl;
      MusicGitState.config.theme = "dark";
      MusicGitState.config.language = lang;
      MusicGitState.config.discord_rpc_enabled = discordEnabled;
      MusicGitState.config.discord_client_id = discordClientId;

      ThemeManager.applyTheme("dark");
      I18nManager.applyLanguage(lang);

      // Sync settings immediately to Downloader view
      syncDownloaderSettingsFromConfig();

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
            discord_rpc_enabled: discordEnabled,
            discord_client_id: discordClientId,
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

    // Synchronize lyrics view whenever entering Lyrics view
    if (viewId === "view-lyrics") {
      const activeTrack = window.MusicPlayer && window.MusicPlayer.currentTrack ? window.MusicPlayer.currentTrack : null;
      if (activeTrack && window.LyricsEngine) {
        if (!window.LyricsEngine.currentTrack || window.LyricsEngine.currentTrack.file_path !== activeTrack.file_path) {
          window.LyricsEngine.loadLyrics(activeTrack);
        } else {
          window.LyricsEngine.scrollActiveLineIntoView();
        }
      }
    }

    // Synchronize downloader form options whenever entering Downloader view
    if (viewId === "view-downloader") {
      syncDownloaderSettingsFromConfig();
    }

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

function syncDownloaderSettingsFromConfig() {
  const cfg = MusicGitState.config || {};
  const bitrateSelect = document.getElementById("select-dl-bitrate");
  const bitrateBadge = document.getElementById("badge-selected-bitrate");
  const templateSelect = document.getElementById("select-dl-template");

  if (bitrateSelect && cfg.defaultBitrate) {
    bitrateSelect.value = cfg.defaultBitrate;
  }
  if (bitrateBadge) {
    const val = bitrateSelect ? bitrateSelect.value : (cfg.defaultBitrate || "192");
    bitrateBadge.textContent = `${val} kbps`;
  }
  if (templateSelect && cfg.defaultTemplate) {
    templateSelect.value = cfg.defaultTemplate;
  }

  // Also sync toggle options from localStorage if saved
  try {
    const savedOpts = localStorage.getItem("musicgit_dl_options");
    if (savedOpts) {
      const opts = JSON.parse(savedOpts);
      if (opts.embed_cover !== undefined && document.getElementById("toggle-dl-cover"))
        document.getElementById("toggle-dl-cover").checked = opts.embed_cover;
      if (opts.save_cover_file !== undefined && document.getElementById("toggle-dl-save-cover"))
        document.getElementById("toggle-dl-save-cover").checked = opts.save_cover_file;
      if (opts.fetch_lyrics !== undefined && document.getElementById("toggle-dl-lyrics"))
        document.getElementById("toggle-dl-lyrics").checked = opts.fetch_lyrics;
      if (opts.save_lrc_file !== undefined && document.getElementById("toggle-dl-lrc"))
        document.getElementById("toggle-dl-lrc").checked = opts.save_lrc_file;
    }
  } catch (e) {
    console.warn("Failed to load dl_options:", e);
  }
}

window.syncDownloaderSettingsFromConfig = syncDownloaderSettingsFromConfig;

// Global Handler for Android & Browser System Back Navigation
window.handleAppBack = function () {
  // 1. Close any visible modal dialogs
  const openModals = document.querySelectorAll(".modal:not(.hidden), .modal-overlay:not(.hidden)");
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
// =============================================================================
// 7. SUPABASE AUTH & CLOUD SYNC UI CONTROLLER
// =============================================================================
const AuthUIController = {
  activeTab: "signin",

  init() {
    this.modal = document.getElementById("modal-auth");
    this.loggedInView = document.getElementById("auth-logged-in-view");
    this.guestView = document.getElementById("auth-guest-view");
    this.emailInput = document.getElementById("auth-input-email");
    this.passwordInput = document.getElementById("auth-input-password");
    this.alertMsg = document.getElementById("auth-alert-msg");
    this.submitBtn = document.getElementById("btn-auth-submit");
    this.submitLabel = document.getElementById("btn-auth-submit-label");
    this.tabSignIn = document.getElementById("tab-btn-signin");
    this.tabSignUp = document.getElementById("tab-btn-signup");

    this._initListeners();
    this.updateUI();

    if (window.CloudSyncManager) {
      window.CloudSyncManager.onAuthStateChanged(() => {
        this.updateUI();
        if (window.LibraryManagerEngine) {
          window.LibraryManagerEngine.updateCloudBadges();
        }
      });
    }
  },

  _initListeners() {
    const openAuth = () => this.openModal();
    const btnTopbar = document.getElementById("btn-topbar-account");
    if (btnTopbar) btnTopbar.addEventListener("click", openAuth);

    const btnSettingsAuth = document.getElementById("btn-settings-open-auth");
    if (btnSettingsAuth) btnSettingsAuth.addEventListener("click", openAuth);

    const btnClose = document.getElementById("btn-close-modal-auth");
    if (btnClose) btnClose.addEventListener("click", () => this.closeModal());

    if (this.modal) {
      this.modal.addEventListener("click", (e) => {
        if (e.target === this.modal) this.closeModal();
      });
    }

    if (this.tabSignIn) {
      this.tabSignIn.addEventListener("click", () => this.switchTab("signin"));
    }
    if (this.tabSignUp) {
      this.tabSignUp.addEventListener("click", () => this.switchTab("signup"));
    }

    const btnGoogle = document.getElementById("btn-auth-google");
    if (btnGoogle) {
      btnGoogle.addEventListener("click", () => {
        try {
          if (!window.CloudSyncManager || !window.CloudSyncManager.isConfigured()) {
            this._showAlert("Supabase belum dikonfigurasi.", true);
            return;
          }
          window.CloudSyncManager.signInWithGoogle();
        } catch (err) {
          this._showAlert(err.message || "Gagal membuka login Google.", true);
        }
      });
    }

    const form = document.getElementById("form-supabase-auth");
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleSubmit();
      });
    }

    const btnLogout = document.getElementById("btn-auth-logout");
    if (btnLogout) {
      btnLogout.addEventListener("click", async () => {
        const isEn = (window.I18nManager && window.I18nManager.currentLang === "en");
        const confirmMsg = isEn ? "Are you sure you want to sign out?" : "Apakah Anda yakin ingin keluar dari akun?";
        if (confirm(confirmMsg)) {
          await window.CloudSyncManager.signOut();
          this.closeModal();
          alert(isEn ? "Signed out successfully." : "Berhasil keluar dari akun.");
        }
      });
    }

    const btnSyncAll = document.getElementById("btn-sync-all-to-cloud");
    if (btnSyncAll) {
      btnSyncAll.addEventListener("click", async () => {
        await this.syncAllLocalPlaylists();
      });
    }
  },

  switchTab(tab) {
    this.activeTab = tab;
    this._clearAlert();
    const isEn = (window.I18nManager && window.I18nManager.currentLang === "en");

    if (this.tabSignIn && this.tabSignUp) {
      if (tab === "signin") {
        this.tabSignIn.style.background = "var(--bg-card)";
        this.tabSignIn.style.color = "var(--text-main)";
        this.tabSignUp.style.background = "transparent";
        this.tabSignUp.style.color = "var(--text-subtle)";
        if (this.submitLabel) this.submitLabel.textContent = isEn ? "Sign In" : "Masuk";
      } else {
        this.tabSignUp.style.background = "var(--bg-card)";
        this.tabSignUp.style.color = "var(--text-main)";
        this.tabSignIn.style.background = "transparent";
        this.tabSignIn.style.color = "var(--text-subtle)";
        if (this.submitLabel) this.submitLabel.textContent = isEn ? "Create Account" : "Daftar Akun Baru";
      }
    }
  },

  openModal() {
    if (!this.modal) return;
    this._clearAlert();
    this.updateUI();
    this.modal.classList.remove("hidden");
  },

  closeModal() {
    if (!this.modal) return;
    this.modal.classList.add("hidden");
    this._clearAlert();
  },

  _showAlert(msg, isError = true) {
    if (!this.alertMsg) return;
    this.alertMsg.textContent = msg;
    this.alertMsg.style.background = isError ? "rgba(239, 68, 68, 0.15)" : "rgba(34, 197, 94, 0.15)";
    this.alertMsg.style.color = isError ? "#ef4444" : "#22c55e";
    this.alertMsg.style.border = `1px solid ${isError ? "rgba(239, 68, 68, 0.3)" : "rgba(34, 197, 94, 0.3)"}`;
    this.alertMsg.classList.remove("hidden");
  },

  _clearAlert() {
    if (!this.alertMsg) return;
    this.alertMsg.textContent = "";
    this.alertMsg.classList.add("hidden");
  },

  async handleSubmit() {
    if (!window.CloudSyncManager) return;

    if (!window.CloudSyncManager.isConfigured()) {
      this._showAlert("Supabase URL dan Anon Key belum diatur. Silakan masukkan di menu Pengaturan.", true);
      return;
    }

    const email = this.emailInput ? this.emailInput.value.trim() : "";
    const password = this.passwordInput ? this.passwordInput.value : "";

    if (!email || !password) {
      this._showAlert("Harap isi email dan password.", true);
      return;
    }

    if (password.length < 6) {
      this._showAlert("Password minimal 6 karakter.", true);
      return;
    }

    if (this.submitBtn) this.submitBtn.disabled = true;
    if (this.submitLabel) this.submitLabel.textContent = "Memproses...";

    try {
      if (this.activeTab === "signin") {
        await window.CloudSyncManager.signIn(email, password);
        this._showAlert("Berhasil masuk!", false);
        setTimeout(() => {
          this.closeModal();
          if (this.emailInput) this.emailInput.value = "";
          if (this.passwordInput) this.passwordInput.value = "";
        }, 800);
      } else {
        await window.CloudSyncManager.signUp(email, password);
        if (window.CloudSyncManager.isLoggedIn()) {
          this._showAlert("Pendaftaran berhasil!", false);
          setTimeout(() => this.closeModal(), 800);
        } else {
          this._showAlert("Pendaftaran berhasil! Silakan cek email Anda untuk konfirmasi (jika verifikasi email aktif di Supabase).", false);
        }
      }
    } catch (err) {
      this._showAlert(err.message || "Terjadi kesalahan autentikasi.", true);
    } finally {
      if (this.submitBtn) this.submitBtn.disabled = false;
      if (this.submitLabel) this.submitLabel.textContent = this.activeTab === "signin" ? "Masuk" : "Daftar Akun Baru";
    }
  },

  async syncAllLocalPlaylists() {
    if (!window.CloudSyncManager || !window.CloudSyncManager.isLoggedIn()) return;

    const isEn = (window.I18nManager && window.I18nManager.currentLang === "en");
    const playlists = MusicGitState.playlists || [];
    const withRemote = playlists.filter((p) => !!p.remote_url);

    if (withRemote.length === 0) {
      alert(isEn ? "No local playlists have a remote link to backup. Please link a remote URL to your playlist first." : "Tidak ada playlist lokal yang memiliki tautan remote untuk dicadangkan. Silakan tautkan remote pada playlist terlebih dahulu.");
      return;
    }

    const btn = document.getElementById("btn-sync-all-to-cloud");
    const label = document.getElementById("sync-all-label");
    const icon = document.getElementById("sync-all-icon");
    const progressBox = document.getElementById("sync-cloud-progress-box");
    const statusText = document.getElementById("sync-cloud-status-text");
    const percentText = document.getElementById("sync-cloud-percent-text");
    const progressBar = document.getElementById("sync-cloud-progress-bar");
    const subStatus = document.getElementById("sync-cloud-sub-status");

    // UI Loading state
    if (btn) btn.disabled = true;
    if (label) label.textContent = isEn ? "Backing up to Cloud..." : "Mencadangkan ke Cloud...";
    if (icon) {
      icon.innerHTML = `<path d="M21 12a9 9 0 1 1-6.219-8.56"></path>`;
      icon.classList.add("spin-icon-update");
    }
    if (progressBox) progressBox.classList.remove("hidden");
    if (progressBar) progressBar.style.width = "0%";
    if (percentText) percentText.textContent = "0%";
    if (statusText) statusText.textContent = isEn ? "Connecting to Supabase..." : "Menghubungkan ke Supabase...";

    let successCount = 0;
    const total = withRemote.length;

    for (let i = 0; i < total; i++) {
      const pl = withRemote[i];
      const percent = Math.round((i / total) * 100);

      if (statusText) statusText.textContent = `${isEn ? "Backing up: " : "Mencadangkan: "}${pl.name}`;
      if (percentText) percentText.textContent = `${percent}%`;
      if (progressBar) progressBar.style.width = `${percent}%`;
      if (subStatus) subStatus.textContent = isEn ? `${i} of ${total} playlists processed` : `${i} dari ${total} playlist diproses`;

      try {
        await window.CloudSyncManager.uploadPlaylist({
          title: pl.name,
          remote_url: pl.remote_url,
          provider: pl.provider || "youtube",
          cover_url: pl.cover_url || null,
          track_count: pl.track_count || 0,
          tracks: [],
        });
        successCount++;
      } catch (e) {
        console.warn("Sync failed for", pl.name, e);
      }

      // Smooth visual progression tick
      await new Promise((r) => setTimeout(r, 220));
    }

    // Complete state
    if (progressBar) progressBar.style.width = "100%";
    if (percentText) percentText.textContent = "100%";
    if (subStatus) subStatus.textContent = isEn ? `${successCount} of ${total} playlists backed up` : `${successCount} dari ${total} playlist berhasil dicadangkan`;
    if (statusText) {
      statusText.textContent = successCount === total
        ? (isEn ? `Done! All (${total}) playlists backed up.` : `Selesai! Semua (${total}) playlist berhasil dicadangkan.`)
        : (isEn ? `Done! ${successCount} of ${total} playlists backed up.` : `Selesai! ${successCount} dari ${total} playlist berhasil.`);
    }

    if (icon) {
      icon.classList.remove("spin-icon-update");
      icon.innerHTML = `<polyline points="20 6 9 17 4 12"></polyline>`;
    }
    if (label) label.textContent = isEn ? "Backup Completed!" : "Pencadangan Berhasil!";

    if (window.LibraryManagerEngine) {
      window.LibraryManagerEngine.updateCloudBadges();
      if (typeof window.LibraryManagerEngine.renderCloudPlaylists === "function") {
        window.LibraryManagerEngine.renderCloudPlaylists();
      }
    }

    setTimeout(() => {
      if (btn) btn.disabled = false;
      if (label) label.textContent = isEn ? "Backup All Local Playlists to Cloud" : "Cadangkan Semua Playlist Lokal ke Cloud";
      if (icon) {
        icon.innerHTML = `
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>
          <polyline points="12 13 12 7 9 10"></polyline>
          <polyline points="12 7 15 10"></polyline>
        `;
      }
      setTimeout(() => {
        if (progressBox) progressBox.classList.add("hidden");
      }, 4000);
    }, 2500);
  },

  updateUI() {
    const mgr = window.CloudSyncManager;
    const isLogged = mgr && mgr.isLoggedIn();
    const email = mgr ? mgr.getUserEmail() : null;
    const displayName = mgr ? mgr.getUserDisplayName() : null;
    const avatarUrl = mgr ? mgr.getUserAvatar() : null;
    const isEn = (window.I18nManager && window.I18nManager.currentLang === "en");

    const dot = document.getElementById("account-status-dot");
    const userLabel = document.getElementById("account-user-label");
    if (dot) dot.classList.toggle("logged-in", isLogged);
    if (userLabel) {
      if (isLogged) {
        userLabel.textContent = displayName || (email ? email.split("@")[0] : (isEn ? "My Account" : "Akun Saya"));
      } else {
        userLabel.textContent = isEn ? "Guest Mode" : "Mode Guest";
      }
    }

    if (this.loggedInView && this.guestView) {
      this.loggedInView.classList.toggle("hidden", !isLogged);
      this.guestView.classList.toggle("hidden", isLogged);
    }

    const profileName = document.getElementById("auth-profile-name");
    if (profileName) {
      profileName.textContent = displayName || (email ? email.split("@")[0] : (isEn ? "User" : "Pengguna"));
    }

    const profileEmail = document.getElementById("auth-profile-email");
    if (profileEmail) profileEmail.textContent = email || "";

    const avatarLetter = document.getElementById("auth-avatar-letter");
    if (avatarLetter) {
      if (avatarUrl) {
        avatarLetter.innerHTML = `<img src="${avatarUrl}" alt="Avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        avatarLetter.style.background = "transparent";
      } else if (displayName || email) {
        const letter = (displayName || email).charAt(0).toUpperCase();
        avatarLetter.textContent = letter;
        avatarLetter.style.background = "var(--accent-primary)";
      }
    }

    const statusText = document.getElementById("settings-auth-status-text");
    if (statusText) {
      if (isLogged) {
        statusText.textContent = `${isEn ? "Connected:" : "Terhubung:"} ${displayName || email} (${email || ""})`;
      } else {
        statusText.textContent = isEn ? "Guest Mode (Local only)" : "Mode Guest (Lokal saja)";
      }
    }
  },
};

window.AuthUIController = AuthUIController;

// BOOTSTRAP APPLICATION
// =============================================================================
let LyricsEngine, LibraryManagerEngine, DownloaderEngine, TagManager;

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Initialize Player & Engines
  LyricsEngine = new LyricsSyncEngine();
  window.LyricsEngine = LyricsEngine;
  window.MusicPlayer = new AudioPlayerEngine();
  LibraryManagerEngine = new LibraryEngine();
  DownloaderEngine = new DownloaderSyncEngine();
  TagManager = new TagManagerEngine();
  ViewController.init();
  AuthUIController.init();

  // 2. Load Config from Backend and LocalStorage (Dual Persistence)
  try {
    const res = await fetch("/api/config");
    const cfg = await res.json();
    MusicGitState.config.defaultMusicDir = cfg.default_music_dir || "";
    MusicGitState.config.defaultBitrate = cfg.default_bitrate || "192";
    MusicGitState.config.defaultTemplate = cfg.default_template || "{num}. {title}-{id}.mp3";
    MusicGitState.config.theme = "dark";
    const localLang = localStorage.getItem("musicgit_language");
    MusicGitState.config.language = localLang || cfg.language || "id";

    const saved = localStorage.getItem("musicgit_config");
    if (saved) {
      const parsed = JSON.parse(saved);
      MusicGitState.config = { ...MusicGitState.config, ...parsed, theme: "dark" };
      if (localLang) {
        MusicGitState.config.language = localLang;
      }
    }

    ThemeManager.applyTheme("dark");
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

    // Discord Rich Presence Settings
    const discordToggle = document.getElementById("settings-discord-enabled");
    if (discordToggle) {
      discordToggle.checked = MusicGitState.config.discord_rpc_enabled !== false;
    }
    const discordCard = document.getElementById("discord-rpc-settings-card");
    if (discordCard && isAndroid) {
      discordCard.style.display = "none";
    }

    // Synchronize settings into Downloader page form on start
    syncDownloaderSettingsFromConfig();
  } catch (err) {
    console.warn("Failed to load config:", err);
  }

  // 3. Load Library Playlists
  window.LibraryManagerEngine = LibraryManagerEngine;
  LibraryManagerEngine.loadPlaylists();

  if (window.MusicPlayer && window.MusicPlayer.currentTrack && LyricsEngine) {
    LyricsEngine.onTrackChanged(window.MusicPlayer.currentTrack);
  }

  // Auto-refresh when window regains focus (e.g. user returns from Explorer/Browser)
  window.addEventListener("focus", () => {
    if (window.LibraryManagerEngine) {
      window.LibraryManagerEngine.loadPlaylists();
    }
  });
});
