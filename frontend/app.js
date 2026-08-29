/**
 * Frontend Application Logic for YouTube Playlist Downloader
 * Clean & Professional Edition
 */

// Application State
const state = {
  playlistData: null,
  activeJobId: null,
  eventSource: null,
  targetDirectory: '',
  selectedBitrate: '192',
};

// DOM Elements
const elements = {
  analyzeForm: document.getElementById('analyze-form'),
  playlistUrl: document.getElementById('playlist-url'),
  btnPaste: document.getElementById('btn-paste'),
  btnAnalyze: document.getElementById('btn-analyze'),
  analyzeSpinner: document.getElementById('analyze-spinner'),

  // Settings
  outputDir: document.getElementById('output-dir'),
  btnOpenBaseFolder: document.getElementById('btn-open-base-folder'),
  selectBitrate: document.getElementById('select-bitrate'),
  chipBitrate: document.getElementById('chip-bitrate'),
  selectTemplate: document.getElementById('select-template'),
  inputAlbum: document.getElementById('input-album'),
  inputAlbumArtist: document.getElementById('input-album-artist'),
  inputFolderName: document.getElementById('input-folder-name'),
  toggleCover: document.getElementById('toggle-cover'),
  toggleSaveCover: document.getElementById('toggle-save-cover'),
  toggleLyrics: document.getElementById('toggle-lyrics'),
  toggleLrc: document.getElementById('toggle-lrc'),

  // Fix Local Tags Tool
  btnToggleFixPanel: document.getElementById('btn-toggle-fix-panel'),
  fixPanelBody: document.getElementById('fix-panel-body'),
  fixTagsForm: document.getElementById('fix-tags-form'),
  fixFolderPath: document.getElementById('fix-folder-path'),
  fixAlbumName: document.getElementById('fix-album-name'),
  fixAlbumArtist: document.getElementById('fix-album-artist'),
  fixTagsStatus: document.getElementById('fix-tags-status'),
  btnRunFix: document.getElementById('btn-run-fix'),

  // Playlist Banner & Tracklist
  playlistSection: document.getElementById('playlist-section'),
  bannerThumb: document.getElementById('banner-thumb'),
  bannerType: document.getElementById('banner-type'),
  bannerTitle: document.getElementById('banner-title'),
  bannerAuthor: document.getElementById('banner-author'),
  bannerCount: document.getElementById('banner-count'),
  bannerDuration: document.getElementById('banner-duration'),
  btnStartDownload: document.getElementById('btn-start-download'),
  selectedCountBadge: document.getElementById('selected-count-badge'),
  checkAll: document.getElementById('check-all'),
  trackStatsText: document.getElementById('track-stats-text'),
  trackSearch: document.getElementById('track-search'),
  tracksTbody: document.getElementById('tracks-tbody'),

  // Progress Section
  progressSection: document.getElementById('download-progress-section'),
  currentTrackLabel: document.getElementById('current-track-label'),
  btnOpenDestFolder: document.getElementById('btn-open-dest-folder'),
  overallPercentText: document.getElementById('overall-percent-text'),
  overallProgressFill: document.getElementById('overall-progress-fill'),
  progressSpeed: document.getElementById('progress-speed'),
  progressEta: document.getElementById('progress-eta'),
  progressCounts: document.getElementById('progress-counts'),
  queueStatusList: document.getElementById('queue-status-list'),
  terminalLogs: document.getElementById('terminal-logs'),
  btnClearLogs: document.getElementById('btn-clear-logs'),

  // Audio Player
  audioPreviewSection: document.getElementById('audio-preview-section'),
  playerThumb: document.getElementById('player-thumb'),
  playerTitle: document.getElementById('player-title'),
  playerArtist: document.getElementById('player-artist'),
  nativeAudio: document.getElementById('native-audio'),
  btnViewFolderPlayer: document.getElementById('btn-view-folder-player'),
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  setupEventListeners();
});

// Load Config from Backend
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const config = await res.json();
      elements.outputDir.value = config.default_music_dir;
      state.targetDirectory = config.default_music_dir;
    }
  } catch (err) {
    console.error('Failed to load system config:', err);
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Paste button
  elements.btnPaste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        elements.playlistUrl.value = text;
      }
    } catch (err) {
      alert('Tidak dapat mengakses clipboard. Silakan paste manual (Ctrl+V).');
    }
  });

  // Analyze form submit
  elements.analyzeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = elements.playlistUrl.value.trim();
    if (!url) return;
    await analyzePlaylist(url);
  });

  // Bitrate change
  elements.selectBitrate.addEventListener('change', (e) => {
    state.selectedBitrate = e.target.value;
    elements.chipBitrate.textContent = `${e.target.value} kbps`;
  });

  // Check all tracks checkbox
  elements.checkAll.addEventListener('change', (e) => {
    const checked = e.target.checked;
    if (state.playlistData && state.playlistData.tracks) {
      state.playlistData.tracks.forEach((track) => {
        track.selected = checked;
      });
      renderTracksTable();
      updateSelectedCount();
    }
  });

  // Track search filter
  elements.trackSearch.addEventListener('input', () => {
    renderTracksTable();
  });

  // Start Download
  elements.btnStartDownload.addEventListener('click', () => {
    startDownload();
  });

  // Open Base Folder
  elements.btnOpenBaseFolder.addEventListener('click', async () => {
    const path = elements.outputDir.value.trim();
    if (path) {
      await fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
    }
  });

  // Open Destination Folder in Progress Card
  elements.btnOpenDestFolder.addEventListener('click', async () => {
    if (state.targetDirectory) {
      await fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: state.targetDirectory }),
      });
    }
  });

  // Player Open Folder
  elements.btnViewFolderPlayer.addEventListener('click', async () => {
    if (state.targetDirectory) {
      await fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: state.targetDirectory }),
      });
    }
  });

  // Clear Logs
  elements.btnClearLogs.addEventListener('click', () => {
    elements.terminalLogs.innerHTML = '';
  });

  // Toggle Fix Tags Panel
  elements.btnToggleFixPanel.addEventListener('click', () => {
    const isHidden = elements.fixPanelBody.classList.toggle('hidden');
    elements.btnToggleFixPanel.textContent = isHidden ? 'Tampilkan Alat' : 'Sembunyikan Alat';
  });

  // Fix Tags Form Submit
  elements.fixTagsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const folderPath = elements.fixFolderPath.value.trim();
    if (!folderPath) return;

    elements.btnRunFix.disabled = true;
    elements.fixTagsStatus.classList.remove('hidden', 'success', 'error');
    elements.fixTagsStatus.textContent = 'Memproses perbaikan tag ID3...';

    try {
      const res = await fetch('/api/fix-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder_path: folderPath,
          album_name: elements.fixAlbumName.value.trim() || null,
          album_artist: elements.fixAlbumArtist.value.trim() || 'Various Artists',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Gagal memperbaiki tag');
      }

      elements.fixTagsStatus.className = 'status-msg success';
      elements.fixTagsStatus.textContent = `Berhasil! ${data.updated_files} lagu diperbarui menjadi 1 album "${data.album}" (${data.album_artist}).`;
    } catch (err) {
      elements.fixTagsStatus.className = 'status-msg error';
      elements.fixTagsStatus.textContent = `Gagal: ${err.message}`;
    } finally {
      elements.btnRunFix.disabled = false;
    }
  });
}

// Analyze Playlist via Backend API
async function analyzePlaylist(url) {
  setAnalyzing(true);
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Gagal menganalisis URL');
    }

    const data = await res.json();
    state.playlistData = data;

    // Autofill settings
    elements.inputAlbum.value = data.title;
    elements.inputAlbumArtist.value = data.album_artist || 'Various Artists';
    elements.inputFolderName.value = data.title;

    // Render Banner
    elements.bannerTitle.textContent = data.title;
    elements.bannerAuthor.textContent = `Diupload oleh: ${data.uploader}`;
    elements.bannerType.textContent = data.is_playlist ? 'Playlist' : 'Single Video';
    elements.bannerThumb.src = data.thumbnail || 'https://via.placeholder.com/300?text=Cover';
    elements.bannerCount.textContent = `${data.track_count} Lagu`;

    // Calculate total duration
    const totalSecs = data.tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    elements.bannerDuration.textContent = hours > 0 ? `${hours} jam ${mins} mnt` : `${mins} menit`;

    // Render Tracks
    renderTracksTable();
    updateSelectedCount();

    // Show section
    elements.playlistSection.classList.remove('hidden');
    elements.playlistSection.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    setAnalyzing(false);
  }
}

// Render Tracklist Table
function renderTracksTable() {
  if (!state.playlistData || !state.playlistData.tracks) return;

  const filterText = elements.trackSearch.value.toLowerCase().trim();
  const tracks = state.playlistData.tracks;
  elements.tracksTbody.innerHTML = '';

  let visibleCount = 0;

  tracks.forEach((track, i) => {
    const matchSearch =
      !filterText ||
      track.title.toLowerCase().includes(filterText) ||
      track.artist.toLowerCase().includes(filterText) ||
      track.raw_title.toLowerCase().includes(filterText);

    if (!matchSearch) return;

    visibleCount++;
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td style="text-align: center;">
        <input type="checkbox" class="track-checkbox" data-index="${i}" ${track.selected ? 'checked' : ''}>
      </td>
      <td class="index-cell">${track.index}</td>
      <td>
        <img src="${track.thumbnail || 'https://via.placeholder.com/60'}" class="table-thumb" alt="Thumb">
      </td>
      <td>
        <input type="text" class="inline-edit track-title-input" data-index="${i}" value="${escapeHtml(track.title)}">
      </td>
      <td>
        <input type="text" class="inline-edit track-artist-input" data-index="${i}" value="${escapeHtml(track.artist)}">
      </td>
      <td class="duration-cell">${track.duration_formatted}</td>
      <td style="text-align: center;">
        <button type="button" class="btn-icon" onclick="previewTrackWeb('${track.id}')" title="Lihat di YouTube">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </button>
      </td>
    `;

    elements.tracksTbody.appendChild(tr);
  });

  elements.trackStatsText.textContent = `Menampilkan ${visibleCount} dari ${tracks.length} lagu`;

  // Attach dynamic event listeners for inputs
  document.querySelectorAll('.track-checkbox').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index);
      state.playlistData.tracks[idx].selected = e.target.checked;
      updateSelectedCount();
    });
  });

  document.querySelectorAll('.track-title-input').forEach((input) => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index);
      state.playlistData.tracks[idx].title = e.target.value.trim();
    });
  });

  document.querySelectorAll('.track-artist-input').forEach((input) => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.index);
      state.playlistData.tracks[idx].artist = e.target.value.trim();
    });
  });
}

function updateSelectedCount() {
  if (!state.playlistData || !state.playlistData.tracks) return;
  const count = state.playlistData.tracks.filter((t) => t.selected).length;
  elements.selectedCountBadge.textContent = count;
  elements.btnStartDownload.disabled = count === 0;
  elements.checkAll.checked = count === state.playlistData.tracks.length;
}

// Start Download
async function startDownload() {
  if (!state.playlistData || !state.playlistData.tracks) return;

  const selectedTracks = state.playlistData.tracks.filter((t) => t.selected);
  if (selectedTracks.length === 0) {
    alert('Pilih minimal satu lagu untuk didownload.');
    return;
  }

  const payload = {
    tracks: selectedTracks,
    playlist_title: state.playlistData.title,
    output_base_dir: elements.outputDir.value.trim(),
    options: {
      folder_name: elements.inputFolderName.value.trim() || state.playlistData.title,
      bitrate: elements.selectBitrate.value,
      filename_template: elements.selectTemplate.value,
      embed_cover: elements.toggleCover.checked,
      save_cover_file: elements.toggleSaveCover.checked,
      fetch_lyrics: elements.toggleLyrics.checked,
      save_lrc_file: elements.toggleLrc.checked,
      album_name: elements.inputAlbum.value.trim() || state.playlistData.title,
      album_artist: elements.inputAlbumArtist.value.trim() || 'Various Artists',
    },
  };

  try {
    elements.btnStartDownload.disabled = true;
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Gagal memulai download.');
    }

    const data = await res.json();
    state.activeJobId = data.job_id;

    // Show Progress Section
    elements.progressSection.classList.remove('hidden');
    elements.progressSection.scrollIntoView({ behavior: 'smooth' });

    // Initialize Queue UI
    renderInitialQueue(selectedTracks);

    // Start SSE Stream
    listenToJobProgress(data.job_id);
  } catch (err) {
    alert(`Error: ${err.message}`);
    elements.btnStartDownload.disabled = false;
  }
}

function renderInitialQueue(tracks) {
  elements.queueStatusList.innerHTML = '';
  tracks.forEach((t) => {
    const item = document.createElement('div');
    item.className = 'queue-row';
    item.id = `queue-item-${t.id}`;
    item.innerHTML = `
      <div class="queue-row-meta">
        <span class="queue-row-title">${t.index}. ${escapeHtml(t.title)}</span>
        <span class="queue-row-artist">${escapeHtml(t.artist)}</span>
      </div>
      <div class="queue-row-actions" id="queue-badge-${t.id}">
        <span class="tag-badge queued">Antrian</span>
      </div>
    `;
    elements.queueStatusList.appendChild(item);
  });
}

// SSE Listener for Real-Time Progress
function listenToJobProgress(jobId) {
  if (state.eventSource) {
    state.eventSource.close();
  }

  state.eventSource = new EventSource(`/api/job/${jobId}/stream`);

  state.eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);

    // Update overall progress
    elements.overallPercentText.textContent = `${data.overall_percent}%`;
    elements.overallProgressFill.style.width = `${data.overall_percent}%`;
    elements.progressSpeed.textContent = `Kecepatan: ${data.speed || '--'}`;
    elements.progressEta.textContent = `Sisa: ${data.eta || '--'}`;
    elements.progressCounts.textContent = `${data.completed_tracks} / ${data.total_tracks} Selesai`;

    if (data.target_dir) {
      state.targetDirectory = data.target_dir;
    }

    if (data.current_track_title) {
      elements.currentTrackLabel.textContent = `Memproses [${data.current_track_index}/${data.total_tracks}]: ${data.current_track_title}`;
    }

    // Update per-track badges
    if (data.tracks_status) {
      Object.entries(data.tracks_status).forEach(([trackId, statusObj]) => {
        const badgeContainer = document.getElementById(`queue-badge-${trackId}`);
        if (badgeContainer) {
          const badgeClass = statusObj.status;
          let labelText = statusObj.status;
          if (statusObj.status === 'downloading') labelText = `Download ${Math.round(statusObj.progress || 0)}%`;
          else if (statusObj.status === 'converting') labelText = 'Konversi MP3';
          else if (statusObj.status === 'tagging') labelText = 'Metadata & Cover';
          else if (statusObj.status === 'lyrics') labelText = 'Ambil Lirik';
          else if (statusObj.status === 'completed') labelText = 'Selesai';
          else if (statusObj.status === 'failed') labelText = 'Gagal';

          badgeContainer.innerHTML = `
            <span class="tag-badge ${badgeClass}">${labelText}</span>
            ${statusObj.status === 'completed' && statusObj.file_path ? `
              <button type="button" class="btn-icon" style="width: 24px; height: 24px; margin-left: 6px;" onclick="playAudioFile('${encodeURIComponent(statusObj.file_path)}', '${escapeHtml(statusObj.title)}', '${escapeHtml(statusObj.artist)}')" title="Putar Lagu">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              </button>
            ` : ''}
          `;
        }
      });
    }

    // Append logs (strip emoji characters if any)
    if (data.new_logs && data.new_logs.length > 0) {
      data.new_logs.forEach((log) => {
        const cleanLog = stripEmojis(log);
        const div = document.createElement('div');
        div.className = 'log-row';
        div.textContent = cleanLog;
        elements.terminalLogs.appendChild(div);
      });
      elements.terminalLogs.scrollTop = elements.terminalLogs.scrollHeight;
    }

    // Completion
    if (data.status === 'completed' || data.status === 'failed') {
      state.eventSource.close();
      elements.btnStartDownload.disabled = false;
      elements.currentTrackLabel.textContent = data.status === 'completed'
        ? 'Semua proses download selesai.'
        : 'Proses download selesai dengan beberapa catatan.';
    }
  };

  state.eventSource.onerror = () => {
    state.eventSource.close();
    elements.btnStartDownload.disabled = false;
  };
}

function stripEmojis(text) {
  if (!text) return '';
  return text.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '').trim();
}

// Audio Player
function playAudioFile(encodedPath, title, artist) {
  const filePath = decodeURIComponent(encodedPath);
  elements.playerTitle.textContent = title;
  elements.playerArtist.textContent = artist;
  elements.playerThumb.src = state.playlistData?.thumbnail || '';
  elements.nativeAudio.src = `/api/audio-stream?file_path=${encodeURIComponent(filePath)}`;
  elements.audioPreviewSection.classList.remove('hidden');
  elements.nativeAudio.play();
}

function previewTrackWeb(videoId) {
  window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
}

function setAnalyzing(isAnalyzing) {
  elements.btnAnalyze.disabled = isAnalyzing;
  if (isAnalyzing) {
    elements.analyzeSpinner.classList.remove('hidden');
    elements.btnAnalyze.querySelector('.btn-text').textContent = 'Menganalisis...';
  } else {
    elements.analyzeSpinner.classList.add('hidden');
    elements.btnAnalyze.querySelector('.btn-text').textContent = 'Analisis URL';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
