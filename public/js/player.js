// 播放器核心逻辑
class MusicPlayer {
  constructor() {
    this.audio = new Audio();
    this.songs = [];
    this.allSongs = []; // 所有歌曲（用于"全部歌曲"视图）
    this.currentIndex = -1;
    this.playMode = 'list'; // list, single, random
    this.isPlaying = false;
    this.currentPage = 1;
    this.pageSize = 20;

    this.initElements();
    this.initEvents();
    this.initMediaSession();
    this.initPagination();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  initElements() {
    this.playBtn = document.getElementById('playBtn');
    this.prevBtn = document.getElementById('prevBtn');
    this.nextBtn = document.getElementById('nextBtn');
    this.shuffleBtn = document.getElementById('shuffleBtn');
    this.repeatBtn = document.getElementById('repeatBtn');
    this.progressBar = document.getElementById('progressBar');
    this.progress = document.getElementById('progress');
    this.currentTimeEl = document.getElementById('currentTime');
    this.durationEl = document.getElementById('duration');
    this.volumeSlider = document.getElementById('volumeSlider');
    this.volumeBtn = document.getElementById('volumeBtn');
    this.songTitle = document.getElementById('songTitle');
    this.songArtist = document.getElementById('songArtist');
    this.cover = document.getElementById('cover');
    this.songList = document.getElementById('songList');
  }

  initEvents() {
    // 播放控制
    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.prevBtn.addEventListener('click', () => this.prev());
    this.nextBtn.addEventListener('click', () => this.next());
    this.shuffleBtn.addEventListener('click', () => this.toggleShuffle());
    this.repeatBtn.addEventListener('click', () => this.toggleRepeat());

    // 进度条点击和拖拽
    this.progressBar.addEventListener('click', (e) => this.seek(e));

    let isDragging = false;
    const onDragMove = (e) => {
      if (!isDragging) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const rect = this.progressBar.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      this.progress.style.width = (percent * 100) + '%';
      this.currentTimeEl.textContent = this.formatTime(percent * this.audio.duration);
    };
    const onDragEnd = (e) => {
      if (!isDragging) return;
      isDragging = false;
      this._isDraggingProgress = false;
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragEnd);
      document.removeEventListener('touchmove', onDragMove);
      document.removeEventListener('touchend', onDragEnd);
      const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
      const rect = this.progressBar.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      this.audio.currentTime = percent * this.audio.duration;
    };
    this.progressBar.addEventListener('mousedown', (e) => {
      isDragging = true;
      this._isDraggingProgress = true;
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragEnd);
    });
    this.progressBar.addEventListener('touchstart', (e) => {
      isDragging = true;
      this._isDraggingProgress = true;
      onDragMove(e);
      document.addEventListener('touchmove', onDragMove, { passive: true });
      document.addEventListener('touchend', onDragEnd);
    }, { passive: true });

    // 音量
    this.volumeSlider.addEventListener('input', (e) => {
      this.audio.volume = e.target.value / 100;
      this.updateVolumeIcon();
      const volVal = document.getElementById('volumeValue');
      if (volVal) volVal.textContent = e.target.value;
    });
    this.volumeBtn.addEventListener('click', () => this.toggleMute());

    // 音频事件
    this.audio.addEventListener('timeupdate', () => this.updateProgress());
    this.audio.addEventListener('ended', () => this.onEnded());
    this.audio.addEventListener('loadedmetadata', () => this.onLoaded());
    this.audio.addEventListener('play', () => this.onPlay());
    this.audio.addEventListener('pause', () => this.onPause());

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      switch(e.code) {
        case 'Space':
          e.preventDefault();
          this.togglePlay();
          break;
        case 'ArrowLeft':
          this.audio.currentTime -= 5;
          break;
        case 'ArrowRight':
          this.audio.currentTime += 5;
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.volumeSlider.value = Math.min(100, parseInt(this.volumeSlider.value) + 10);
          this.audio.volume = this.volumeSlider.value / 100;
          this.updateVolumeIcon();
          const volValUp = document.getElementById('volumeValue');
          if (volValUp) volValUp.textContent = this.volumeSlider.value;
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.volumeSlider.value = Math.max(0, parseInt(this.volumeSlider.value) - 10);
          this.audio.volume = this.volumeSlider.value / 100;
          this.updateVolumeIcon();
          const volValDown = document.getElementById('volumeValue');
          if (volValDown) volValDown.textContent = this.volumeSlider.value;
          break;
      }
    });
  }

  initMediaSession() {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => this.play());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        this.audio.currentTime = Math.max(0, this.audio.currentTime - 10);
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        this.audio.currentTime = Math.min(this.audio.duration, this.audio.currentTime + 10);
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null) {
          this.audio.currentTime = details.seekTime;
        }
      });
    }
  }

  initPagination() {
    this.paginationEl = document.getElementById('pagination');
    this.pagePrevBtn = document.getElementById('pagePrev');
    this.pageNextBtn = document.getElementById('pageNext');
    this.pageInfoEl = document.getElementById('pageInfo');

    this.pagePrevBtn.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.renderList(document.getElementById('searchInput').value);
      }
    });

    this.pageNextBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(this.songs.length / this.pageSize);
      if (this.currentPage < totalPages) {
        this.currentPage++;
        this.renderList(document.getElementById('searchInput').value);
      }
    });
  }

  setSongs(songs) {
    this.songs = songs;
    this.allSongs = songs;
    // 更新歌曲数量显示
    const countEl = document.getElementById('songCount');
    if (countEl) countEl.textContent = songs.length + ' 首';
    // 更新歌单的全部歌曲数量
    const allCountEl = document.getElementById('playlistAllCount');
    if (allCountEl) allCountEl.textContent = songs.length;
    this.currentPage = 1;
    this.renderList();
  }

  // 加载所有歌曲
  async loadAllSongs() {
    try {
      const res = await fetch('/api/songs');
      const songs = await res.json();
      this.allSongs = songs;
      this.songs = songs;
      this.currentIndex = -1;
      const countEl = document.getElementById('songCount');
      if (countEl) countEl.textContent = songs.length + ' 首';
      const allCountEl = document.getElementById('playlistAllCount');
      if (allCountEl) allCountEl.textContent = songs.length;
      this.currentPage = 1;
      this.renderList();
    } catch (err) {
      console.error('加载歌曲失败:', err);
    }
  }

  // 加载歌单歌曲
  async loadPlaylistSongs(playlistId) {
    try {
      const res = await fetch(`/api/songs?playlist_id=${playlistId}`);
      const songs = await res.json();
      this.songs = songs;
      this.currentIndex = -1;
      const countEl = document.getElementById('songCount');
      if (countEl) countEl.textContent = songs.length + ' 首';
      this.currentPage = 1;
      this.renderList();
    } catch (err) {
      console.error('加载歌单歌曲失败:', err);
    }
  }

  // 从 allSongs 渲染（全部歌曲视图）
  renderFromAllSongs() {
    this.songs = this.allSongs;
    this.currentIndex = -1;
    const countEl = document.getElementById('songCount');
    if (countEl) countEl.textContent = this.songs.length + ' 首';
    this.currentPage = 1;
    this.renderList();
  }

  renderList(filter = '') {
    const filtered = filter
      ? this.songs.filter(s => s.title.toLowerCase().includes(filter.toLowerCase()))
      : this.songs;

    if (filtered.length === 0) {
      this.songList.innerHTML = '<div class="empty-tip">暂无歌曲，点击上传</div>';
      this.paginationEl.style.display = 'none';
      return;
    }

    // 移动端不分页，直接显示所有歌曲
    const isMobile = window.innerWidth <= 768;
    let pageItems, start;

    if (isMobile) {
      pageItems = filtered;
      start = 0;
      this.paginationEl.style.display = 'none';
    } else {
      // 分页
      const totalPages = Math.ceil(filtered.length / this.pageSize);
      if (this.currentPage > totalPages) this.currentPage = totalPages;
      if (this.currentPage < 1) this.currentPage = 1;

      start = (this.currentPage - 1) * this.pageSize;
      pageItems = filtered.slice(start, start + this.pageSize);

      // 更新分页控件
      if (totalPages > 1) {
        this.paginationEl.style.display = 'flex';
        this.pageInfoEl.textContent = `${this.currentPage} / ${totalPages}`;
        this.pagePrevBtn.disabled = this.currentPage <= 1;
        this.pageNextBtn.disabled = this.currentPage >= totalPages;
      } else {
        this.paginationEl.style.display = 'none';
      }
    }

    this.songList.innerHTML = pageItems.map((song, i) => {
      const realIndex = this.songs.findIndex(s => s.id === song.id);
      const isActive = realIndex === this.currentIndex;
      return `
        <div class="song-item ${isActive ? 'active' : ''} ${isActive && this.isPlaying ? 'playing' : ''}"
             data-index="${realIndex}">
          <div class="song-item-index">${isActive && this.isPlaying ? '▶' : (start + i + 1)}</div>
          <div class="song-item-info">
            <div class="song-item-title">${this.escapeHtml(song.title)}</div>
          </div>
          <div class="song-item-duration">${this.formatTime(song.duration || 0)}</div>
          <button class="song-item-menu" data-id="${song.id}" title="更多">⋯</button>
        </div>
      `;
    }).join('');

    // 绑定点击事件
    this.songList.querySelectorAll('.song-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.song-item-menu')) return;
        const index = parseInt(item.dataset.index);
        this.playIndex(index);
      });
    });

    // 菜单按钮
    this.songList.querySelectorAll('.song-item-menu').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        this.showSongMenu(e, id);
      });
    });
  }

  showSongMenu(e, songId) {
    const menu = document.getElementById('contextMenu');
    const song = this.songs.find(s => s.id === songId);
    if (!song) return;

    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.classList.add('visible');
    menu.dataset.songId = songId;

    // 点击其他地方关闭菜单
    const close = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.classList.remove('visible');
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  playIndex(index) {
    if (index < 0 || index >= this.songs.length) return;
    // 点击当前正在播放的歌曲，切换播放/暂停
    if (index === this.currentIndex && this.audio.src) {
      this.togglePlay();
      return;
    }
    this.currentIndex = index;
    const song = this.songs[index];
    this.audio.src = `/api/stream/${song.id}`;
    this.songTitle.textContent = song.title;
    this.songArtist.textContent = song.original_name;
    this.renderList(document.getElementById('searchInput').value);
    this.updateMediaSession(song);
    this.audio.play().catch(() => this.scheduleResume());
  }

  updateMediaSession(song) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: '我的音乐',
        album: '本地音乐',
        artwork: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      });
      navigator.mediaSession.playbackState = 'playing';
    }
  }

  togglePlay() {
    if (this.currentIndex === -1 && this.songs.length > 0) {
      this.playIndex(0);
      return;
    }
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    this.audio.play().catch(() => this.scheduleResume());
  }

  pause() {
    this.audio.pause();
  }

  prev() {
    if (this.songs.length === 0) return;
    let index = this.currentIndex - 1;
    if (index < 0) index = this.songs.length - 1;
    this.playIndex(index);
  }

  next() {
    if (this.songs.length === 0) return;
    let index;
    if (this.playMode === 'random') {
      index = Math.floor(Math.random() * this.songs.length);
    } else {
      index = (this.currentIndex + 1) % this.songs.length;
    }
    this.playIndex(index);
  }

  onPlay() {
    this.isPlaying = true;
    this.playBtn.textContent = '⏸';
    this.cover.classList.add('spinning');
    this.renderList(document.getElementById('searchInput').value);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
  }

  onPause() {
    this.isPlaying = false;
    this.playBtn.textContent = '▶';
    this.cover.classList.remove('spinning');
    this.renderList(document.getElementById('searchInput').value);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  }

  onEnded() {
    if (this.playMode === 'single') {
      this.audio.currentTime = 0;
      this.audio.play().catch(() => this.scheduleResume());
    } else {
      this.next();
    }
  }

  scheduleResume() {
    if (this._resumeListener) return;
    this._resumeListener = () => {
      if (document.visibilityState === 'visible' && !this.isPlaying) {
        document.removeEventListener('visibilitychange', this._resumeListener);
        this._resumeListener = null;
        this.audio.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', this._resumeListener);
  }

  onLoaded() {
    this.durationEl.textContent = this.formatTime(this.audio.duration);
    // 更新 Media Session duration
    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && this.audio.duration && isFinite(this.audio.duration)) {
      navigator.mediaSession.setPositionState({
        duration: this.audio.duration,
        playbackRate: this.audio.playbackRate,
        position: this.audio.currentTime || 0
      });
    }
    // 如果当前歌曲时长为0，回写到数据库
    if (this.currentIndex >= 0) {
      const song = this.songs[this.currentIndex];
      if (!song.duration || song.duration === 0) {
        song.duration = Math.round(this.audio.duration);
        fetch(`/api/songs/${song.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ duration: song.duration })
        }).catch(() => {});
        this.renderList(document.getElementById('searchInput').value);
      }
    }
  }

  updateProgress() {
    const percent = (this.audio.currentTime / this.audio.duration) * 100 || 0;
    if (!this._isDraggingProgress) {
      this.progress.style.width = percent + '%';
    }
    this.currentTimeEl.textContent = this.formatTime(this.audio.currentTime);

    // 节流：每秒只更新一次 Media Session position
    const now = Date.now();
    if (this._lastPosUpdate && now - this._lastPosUpdate < 1000) return;
    this._lastPosUpdate = now;

    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
      if (this.audio.duration && isFinite(this.audio.duration)) {
        navigator.mediaSession.setPositionState({
          duration: this.audio.duration,
          playbackRate: this.audio.playbackRate,
          position: Math.min(this.audio.currentTime || 0, this.audio.duration)
        });
      }
    }
  }

  seek(e) {
    const rect = this.progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    this.audio.currentTime = percent * this.audio.duration;
  }

  toggleShuffle() {
    if (this.playMode === 'random') {
      this.playMode = 'list';
      this.shuffleBtn.classList.remove('active');
    } else {
      this.playMode = 'random';
      this.shuffleBtn.classList.add('active');
    }
  }

  toggleRepeat() {
    if (this.playMode === 'single') {
      this.playMode = 'list';
      this.repeatBtn.classList.remove('active');
      this.repeatBtn.textContent = '↻';
    } else {
      this.playMode = 'single';
      this.repeatBtn.classList.add('active');
      this.repeatBtn.textContent = '↻₁';
    }
  }

  toggleMute() {
    const volVal = document.getElementById('volumeValue');
    if (this.audio.volume > 0) {
      this.audio._prevVolume = this.audio.volume;
      this.audio.volume = 0;
      this.volumeSlider.value = 0;
      if (volVal) volVal.textContent = '0';
    } else {
      this.audio.volume = this.audio._prevVolume || 0.8;
      this.volumeSlider.value = this.audio.volume * 100;
      if (volVal) volVal.textContent = this.volumeSlider.value;
    }
    this.updateVolumeIcon();
  }

  updateVolumeIcon() {
    const vol = this.audio.volume;
    if (vol === 0) this.volumeBtn.textContent = '🔇';
    else if (vol < 0.5) this.volumeBtn.textContent = '🔉';
    else this.volumeBtn.textContent = '🔊';
  }

  async deleteSong(id) {
    if (!confirm('确定删除这首歌曲？')) return;
    try {
      const res = await fetch(`/api/songs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        this.songs = this.songs.filter(s => s.id !== id);
        this.allSongs = this.allSongs.filter(s => s.id !== id);
        // 更新歌曲数量显示
        const countEl = document.getElementById('songCount');
        if (countEl) countEl.textContent = this.songs.length + ' 首';
        const allCountEl = document.getElementById('playlistAllCount');
        if (allCountEl) allCountEl.textContent = this.allSongs.length;
        if (this.songs.length === 0) {
          this.currentIndex = -1;
          this.audio.src = '';
          this.songTitle.textContent = '未选择歌曲';
          this.songArtist.textContent = '';
        }
        this.renderList(document.getElementById('searchInput').value);
        // 刷新歌单列表
        if (window.playlistManager) {
          window.playlistManager.loadPlaylists();
        }
      }
    } catch (err) {
      console.error('删除失败:', err);
    }
  }

  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  async startRename(titleEl, song) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = song.title;
    input.className = 'rename-input';
    titleEl.textContent = '';
    titleEl.appendChild(input);
    input.focus();
    input.select();

    // 阻止输入框的点击冒泡到歌曲项
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('dblclick', (e) => e.stopPropagation());

    const finish = async (save) => {
      const newTitle = input.value.trim();
      if (save && newTitle && newTitle !== song.title) {
        try {
          const res = await fetch(`/api/songs/${song.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle })
          });
          if (res.ok) {
            song.title = newTitle;
            if (this.songTitle.textContent === song.title || this.currentIndex >= 0) {
              this.songTitle.textContent = newTitle;
            }
          }
        } catch (err) {
          console.error('改名失败:', err);
        }
      }
      titleEl.textContent = song.title;
      this.renderList(document.getElementById('searchInput').value);
    };

    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') {
        input.value = song.title;
        input.blur();
      }
    });
  }
}
