/**
 * Supabase Client & Cloud Sync Manager for MusicGit
 * Zero-dependency, lightweight REST implementation compatible with desktop & Android.
 */
class SupabaseSyncManager {
  constructor() {
    this.storagePrefix = "musicgit_supabase_";
    this.session = null;
    this.listeners = [];

    // Default project credentials for MusicGit Cloud
    this.defaultUrl = "https://ooxdadllrxnkltbphdav.supabase.co";
    this.defaultAnonKey = "sb_publishable_f0c3CMeqGBM4XuXPSfIA1Q_vvLF4yfK";

    // Load credentials & session from localStorage (or fallback to defaults)
    this.url = localStorage.getItem(this.storagePrefix + "url") || this.defaultUrl;
    this.anonKey = localStorage.getItem(this.storagePrefix + "anon_key") || this.defaultAnonKey;
    this._loadSession();
    this._checkAuthCallback();
  }

  // ==========================================
  // Configuration
  // ==========================================
  isConfigured() {
    return !!(this.url && this.anonKey);
  }

  getConfig() {
    return {
      url: this.url,
      anonKey: this.anonKey,
    };
  }

  setConfig(url, anonKey) {
    this.url = (url || "").trim().replace(/\/+$/, "");
    this.anonKey = (anonKey || "").trim();

    if (this.url) {
      localStorage.setItem(this.storagePrefix + "url", this.url);
    } else {
      localStorage.removeItem(this.storagePrefix + "url");
    }

    if (this.anonKey) {
      localStorage.setItem(this.storagePrefix + "anon_key", this.anonKey);
    } else {
      localStorage.removeItem(this.storagePrefix + "anon_key");
    }

    this._notifyListeners("config_changed", this.getConfig());
  }

  // ==========================================
  // Session & Auth
  // ==========================================
  _loadSession() {
    try {
      const raw = localStorage.getItem(this.storagePrefix + "session");
      if (raw) {
        this.session = JSON.parse(raw);
        const now = Math.floor(Date.now() / 1000);
        // Proactively refresh expired or near-expired token in background
        if (this.session && this.session.refresh_token && (this.session.expires_at || 0) <= now + 60) {
          this._getValidAccessToken().catch((e) => console.warn("Background token refresh failed:", e));
        } else if (this.session && this.session.access_token && !this.session.user) {
          this._fetchCurrentUser(this.session.access_token).then((user) => {
            if (user && this.session) {
              this.session.user = user;
              this._saveSession(this.session);
            }
          });
        }
      }
    } catch (e) {
      console.warn("Gagal memuat sesi Supabase dari localStorage:", e);
      this.session = null;
    }
  }

  _saveSession(sessionData) {
    this.session = sessionData;
    if (sessionData) {
      localStorage.setItem(this.storagePrefix + "session", JSON.stringify(sessionData));
    } else {
      localStorage.removeItem(this.storagePrefix + "session");
    }
    this._notifyListeners("auth_state_changed", this.session);
  }

  isLoggedIn() {
    return !!(this.session && (this.session.access_token || this.session.refresh_token));
  }

  getUser() {
    return this.session ? this.session.user : null;
  }

  getUserEmail() {
    const user = this.getUser();
    return user ? (user.email || "Pengguna") : null;
  }

  getUserDisplayName() {
    const user = this.getUser();
    if (!user) return null;
    if (user.user_metadata) {
      const name = user.user_metadata.full_name || user.user_metadata.name;
      if (name) return name;
    }
    return (user.email || "Pengguna").split("@")[0];
  }

  getUserAvatar() {
    const user = this.getUser();
    if (!user || !user.user_metadata) return null;
    return user.user_metadata.avatar_url || user.user_metadata.picture || null;
  }

  _checkAuthCallback() {
    try {
      const hash = window.location.hash;
      if (!hash) return;

      const hashContent = hash.startsWith("#") ? hash.substring(1) : hash;
      const params = new URLSearchParams(hashContent);

      const errorMsg = params.get("error_description") || params.get("error");
      if (errorMsg) {
        console.warn("Supabase OAuth callback error:", errorMsg);
        setTimeout(() => {
          alert("Login Google gagal: " + decodeURIComponent(errorMsg).replace(/\+/g, " "));
        }, 300);
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
        }
        return;
      }

      const accessToken = params.get("access_token");
      if (accessToken) {
        const refreshToken = params.get("refresh_token") || "";
        const expiresIn = parseInt(params.get("expires_in") || "3600", 10);
        const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

        // Clean URL hash immediately so tokens are not exposed
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
        }

        const sessionData = {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAt,
          user: null,
        };
        this._saveSession(sessionData);

        // Fetch complete profile from Supabase
        this._fetchCurrentUser(accessToken).then((user) => {
          if (user) {
            this._saveSession({
              access_token: accessToken,
              refresh_token: refreshToken,
              expires_at: expiresAt,
              user: user,
            });
          }
        });
      }
    } catch (e) {
      console.warn("Gagal membaca OAuth callback:", e);
    }
  }

  async _fetchCurrentUser(token) {
    if (!token || !this.isConfigured()) return null;
    try {
      const res = await fetch(`${this.url}/auth/v1/user`, {
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn("Gagal mengambil data user Supabase:", e);
    }
    return null;
  }

  onAuthStateChanged(callback) {
    if (typeof callback === "function") {
      this.listeners.push(callback);
    }
  }

  _notifyListeners(event, data) {
    this.listeners.forEach((cb) => {
      try {
        cb(event, data);
      } catch (err) {
        console.error("Auth listener error:", err);
      }
    });
  }

  // ==========================================
  // Token Auto-Refresh
  // ==========================================
  async _getValidAccessToken() {
    if (!this.session || !this.session.access_token) return null;

    // Check if token expires within 60 seconds
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = this.session.expires_at || 0;

    if (expiresAt > now + 60) {
      return this.session.access_token;
    }

    // Try refresh token if expired
    if (this.session.refresh_token && this.isConfigured()) {
      try {
        const res = await fetch(`${this.url}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: {
            apikey: this.anonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refresh_token: this.session.refresh_token }),
        });

        if (res.ok) {
          const refreshed = await res.json();
          this._saveSession({
            access_token: refreshed.access_token,
            refresh_token: refreshed.refresh_token,
            expires_at: Math.floor(Date.now() / 1000) + (refreshed.expires_in || 3600),
            user: refreshed.user || this.session.user,
          });
          return refreshed.access_token;
        }
      } catch (err) {
        console.warn("Gagal memperbarui token Supabase:", err);
      }
    }

    return this.session.access_token;
  }

  // ==========================================
  // Auth API Methods
  // ==========================================
  signInWithGoogle() {
    if (!this.isConfigured()) {
      throw new Error("Supabase URL dan Anon Key belum dikonfigurasi di Pengaturan.");
    }

    const redirectUrl = window.location.origin + window.location.pathname;
    const authUrl = `${this.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUrl)}`;
    window.location.href = authUrl;
  }

  async signUp(email, password) {
    if (!this.isConfigured()) {
      throw new Error("Supabase URL dan Anon Key belum dikonfigurasi di Pengaturan.");
    }

    const res = await fetch(`${this.url}/auth/v1/signup`, {
      method: "POST",
      headers: {
        apikey: this.anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: email.trim(), password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.msg || data.message || data.error_description || "Gagal mendaftar akun.");
    }

    if (data.access_token) {
      this._saveSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
        user: data.user,
      });
    }

    return data;
  }

  async signIn(email, password) {
    if (!this.isConfigured()) {
      throw new Error("Supabase URL dan Anon Key belum dikonfigurasi di Pengaturan.");
    }

    const res = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: this.anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: email.trim(), password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error_description || data.msg || data.message || "Email atau password salah.");
    }

    this._saveSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      user: data.user,
    });

    return data;
  }

  async signOut() {
    const token = this.session ? this.session.access_token : null;
    if (token && this.isConfigured()) {
      try {
        await fetch(`${this.url}/auth/v1/logout`, {
          method: "POST",
          headers: {
            apikey: this.anonKey,
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (e) {
        console.warn("Logout request failed:", e);
      }
    }
    this._saveSession(null);
  }

  // ==========================================
  // Database API Methods (Playlists Cloud Sync)
  // ==========================================

  /**
   * Fetch all cloud playlists belonging to the logged-in user.
   */
  async getCloudPlaylists() {
    if (!this.isLoggedIn()) {
      return [];
    }

    const token = await this._getValidAccessToken();
    if (!token) throw new Error("Sesi login telah kedaluwarsa. Silakan login kembali.");

    const res = await fetch(`${this.url}/rest/v1/user_playlists?select=*&order=updated_at.desc`, {
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Gagal mengambil daftar playlist dari cloud.");
    }

    return await res.json();
  }

  /**
   * Upload / sync a single playlist metadata to cloud.
   */
  async uploadPlaylist(playlistData) {
    if (!this.isLoggedIn()) {
      throw new Error("Silakan masuk dengan akun untuk mencadangkan ke cloud.");
    }

    const token = await this._getValidAccessToken();
    if (!token) throw new Error("Sesi login telah kedaluwarsa. Silakan login kembali.");

    const user = this.getUser();
    const payload = {
      user_id: user.id,
      title: playlistData.title || "Playlist",
      provider: playlistData.provider || "youtube",
      remote_url: playlistData.remote_url,
      cover_url: playlistData.cover_url || null,
      track_count: playlistData.track_count || 0,
      tracks_snapshot: playlistData.tracks || [],
      updated_at: new Date().toISOString(),
    };

    const res = await fetch(`${this.url}/rest/v1/user_playlists`, {
      method: "POST",
      headers: {
        apikey: this.anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Gagal mencadangkan playlist ke cloud.");
    }

    const data = await res.json();
    return Array.isArray(data) ? data[0] : data;
  }

  /**
   * Delete a cloud playlist backup by remote_url.
   */
  async deleteCloudPlaylist(remoteUrl) {
    if (!this.isLoggedIn()) return;

    const token = await this._getValidAccessToken();
    if (!token) throw new Error("Sesi login telah kedaluwarsa.");

    const res = await fetch(
      `${this.url}/rest/v1/user_playlists?remote_url=eq.${encodeURIComponent(remoteUrl)}`,
      {
        method: "DELETE",
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Gagal menghapus playlist dari cloud.");
    }

    return true;
  }
}

// Global instance
window.CloudSyncManager = new SupabaseSyncManager();
