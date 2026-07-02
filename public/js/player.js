// 播放器核心逻辑
class MusicPlayer {
  constructor() {
    this.audio = new Audio();
    this.songs = [];
    this.currentIndex = -1;
    this.playMode = 'list'; // list, single, random
    this.isPlaying = false;

    this.initElements();
    this.initEvents();
    this.initMediaSession();
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

    // 进度条
    this.progressBar.addEventListener('click', (e) => this.seek(e));

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

  setSongs(songs) {
    this.songs = songs;
    // 更新歌曲数量显示
    const countEl = document.getElementById('songCount');
    if (countEl) countEl.textContent = songs.length + ' 首';
    this.renderList();
  }

  renderList(filter = '') {
    const filtered = filter
      ? this.songs.filter(s => s.title.toLowerCase().includes(filter.toLowerCase()))
      : this.songs;

    if (filtered.length === 0) {
      this.songList.innerHTML = '<div class="empty-tip">暂无歌曲，点击上传</div>';
      return;
    }

    this.songList.innerHTML = filtered.map((song, i) => {
      const realIndex = this.songs.findIndex(s => s.id === song.id);
      const isActive = realIndex === this.currentIndex;
      return `
        <div class="song-item ${isActive ? 'active' : ''} ${isActive && this.isPlaying ? 'playing' : ''}"
             data-index="${realIndex}">
          <div class="song-item-index">${isActive && this.isPlaying ? '▶' : (i + 1)}</div>
          <div class="song-item-info">
            <div class="song-item-title">${song.title}</div>
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
    this.audio.play();
    this.songTitle.textContent = song.title;
    this.songArtist.textContent = song.original_name;
    this.renderList(document.getElementById('searchInput').value);
    this.updateMediaSession(song);
  }

  updateMediaSession(song) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: '我的音乐',
        artwork: []
      });
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
    this.audio.play();
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
  }

  onPause() {
    this.isPlaying = false;
    this.playBtn.textContent = '▶';
    this.cover.classList.remove('spinning');
    this.renderList(document.getElementById('searchInput').value);
  }

  onEnded() {
    if (this.playMode === 'single') {
      this.audio.currentTime = 0;
      this.audio.play();
    } else {
      this.next();
    }
  }

  onLoaded() {
    this.durationEl.textContent = this.formatTime(this.audio.duration);
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
    this.progress.style.width = percent + '%';
    this.currentTimeEl.textContent = this.formatTime(this.audio.currentTime);

    // 更新 Media Session position
    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
      navigator.mediaSession.setPositionState({
        duration: this.audio.duration || 0,
        playbackRate: this.audio.playbackRate,
        position: this.audio.currentTime || 0
      });
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
        if (this.songs.length === 0) {
          this.currentIndex = -1;
          this.audio.src = '';
          this.songTitle.textContent = '未选择歌曲';
          this.songArtist.textContent = '';
        }
        this.renderList(document.getElementById('searchInput').value);
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
