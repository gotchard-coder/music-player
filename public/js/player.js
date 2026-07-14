// =====================================================================
// 文件：player.js
// 职责：音乐播放器的核心逻辑（最复杂的文件）
// 这个文件控制所有的播放功能：播放/暂停、上下曲、进度条、音量、模式切换等
// =====================================================================

// 已实现的功能：
// 1. 播放控制：播放/暂停、上一曲、下一曲
// 2. 进度条：点击跳转、拖拽调节
// 3. 音量控制：滑块调节、静音/取消静音
// 4. 播放模式：列表循环、单曲循环、随机播放
// 5. 歌曲列表：渲染、搜索过滤、点击播放
// 6. 歌曲管理：删除、重命名
// 7. MediaSession：系统通知栏控制（手机锁屏控制）
// 8. 无限滚动：歌曲多时滚动加载
// 9. 跨歌单播放：顺序播放完一个歌单自动切换下一个
//
// 与其他文件的关系：
// - 被 app.js 创建和初始化
// - 被 upload.js 调用：上传完成后更新歌曲列表
// - 被 lyrics.js 调用：获取播放时间
// - 被 playlist.js 调用：加载歌单歌曲
// - 与 server.js 通信：获取歌曲数据、流式播放音乐
// =====================================================================

// 播放器核心类
class MusicPlayer {
  // 构造函数：初始化播放器
  constructor() {
    this.audio = new Audio();           // 音频播放对象（HTML5 Audio API）
    this.songs = [];                    // 当前显示的歌曲列表
    this.allSongs = [];                 // 所有歌曲（用于"全部歌曲"视图）
    this.currentIndex = -1;             // 当前播放的歌曲索引（-1表示没有播放）
    this.playMode = 'list';             // 播放模式：list(列表循环), single(单曲循环), random(随机)
    this.isPlaying = false;             // 是否正在播放
    this.currentPage = 1;               // 当前页码（分页用）
    this.pageSize = 100;                // 每页显示的歌曲数量
    this.totalCount = 0;                // 歌曲总数
    this.hasMore = false;               // 是否还有更多歌曲
    this.isLoadingMore = false;         // 是否正在加载更多

    this.initElements();                // 获取页面上的DOM元素
    this.initEvents();                  // 绑定事件监听器
    this.initMediaSession();            // 初始化MediaSession（通知栏控制）
    this.initInfiniteScroll();          // 初始化无限滚动
  }

  // 防止XSS攻击：将文本转为HTML安全格式
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 获取页面上的DOM元素
  initElements() {
    // 播放控制按钮
    this.playBtn = document.getElementById('playBtn');           // 播放/暂停按钮
    this.prevBtn = document.getElementById('prevBtn');           // 上一曲按钮
    this.nextBtn = document.getElementById('nextBtn');           // 下一曲按钮
    this.shuffleBtn = document.getElementById('shuffleBtn');     // 随机播放按钮
    this.repeatBtn = document.getElementById('repeatBtn');       // 循环模式按钮

    // 进度条
    this.progressBar = document.getElementById('progressBar');   // 进度条容器
    this.progress = document.getElementById('progress');         // 进度条填充部分

    // 时间显示
    this.currentTimeEl = document.getElementById('currentTime'); // 当前播放时间
    this.durationEl = document.getElementById('duration');       // 歌曲总时长

    // 音量控制
    this.volumeSlider = document.getElementById('volumeSlider'); // 音量滑块
    this.volumeBtn = document.getElementById('volumeBtn');       // 静音按钮

    // 歌曲信息
    this.songTitle = document.getElementById('songTitle');       // 歌曲标题
    this.songArtist = document.getElementById('songArtist');     // 歌手名称
    this.cover = document.getElementById('cover');               // 封面图片

    // 歌曲列表
    this.songList = document.getElementById('songList');         // 歌曲列表容器
  }

  // 绑定事件监听器
  initEvents() {
    // ========== 播放控制按钮 ==========
    this.playBtn.addEventListener('click', () => this.togglePlay());   // 点击播放/暂停
    this.prevBtn.addEventListener('click', () => this.prev());         // 点击上一曲
    this.nextBtn.addEventListener('click', () => this.next());         // 点击下一曲
    this.shuffleBtn.addEventListener('click', () => this.toggleShuffle()); // 点击随机播放
    this.repeatBtn.addEventListener('click', () => this.toggleRepeat());   // 点击循环模式

    // ========== 进度条：点击跳转 ==========
    this.progressBar.addEventListener('click', (e) => this.seek(e));

    // ========== 进度条：拖拽调节 ==========
    let isDragging = false; // 是否正在拖拽

    // 拖拽过程中：实时更新进度条显示
    const onDragMove = (e) => {
      if (!isDragging) return;
      // 获取鼠标/触摸位置（支持手机触摸）
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const rect = this.progressBar.getBoundingClientRect(); // 获取进度条位置
      // 计算拖拽位置对应的百分比（0-1之间）
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      this.progress.style.width = (percent * 100) + '%'; // 更新进度条显示
      // 更新时间显示
      this.currentTimeEl.textContent = this.formatTime(percent * this.audio.duration);
    };

    // 拖拽结束：跳转到拖拽位置
    const onDragEnd = (e) => {
      if (!isDragging) return;
      isDragging = false;
      this._isDraggingProgress = false; // 标记拖拽结束
      // 移除事件监听
      document.removeEventListener('mousemove', onDragMove);
      document.removeEventListener('mouseup', onDragEnd);
      document.removeEventListener('touchmove', onDragMove);
      document.removeEventListener('touchend', onDragEnd);
      // 获取松手时的位置
      const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
      const rect = this.progressBar.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      this.audio.currentTime = percent * this.audio.duration; // 跳转到对应时间
    };

    // 鼠标按下开始拖拽（电脑端）
    this.progressBar.addEventListener('mousedown', (e) => {
      isDragging = true;
      this._isDraggingProgress = true;
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragEnd);
    });

    // 触摸开始拖拽（手机端）
    this.progressBar.addEventListener('touchstart', (e) => {
      isDragging = true;
      this._isDraggingProgress = true;
      onDragMove(e); // 立即更新一次位置
      document.addEventListener('touchmove', onDragMove, { passive: true });
      document.addEventListener('touchend', onDragEnd);
    }, { passive: true });

    // ========== 音量控制 ==========
    this.volumeSlider.addEventListener('input', (e) => {
      this.audio.volume = e.target.value / 100; // 设置音量（0-100转为0-1）
      this.updateVolumeIcon(); // 更新音量图标
      const volVal = document.getElementById('volumeValue');
      if (volVal) volVal.textContent = e.target.value; // 更新音量数值显示
    });
    this.volumeBtn.addEventListener('click', () => this.toggleMute()); // 点击静音/取消静音

    // ========== 音频事件 ==========
    this.audio.addEventListener('timeupdate', () => this.updateProgress());   // 播放进度更新
    this.audio.addEventListener('ended', () => this.onEnded());               // 播放结束
    this.audio.addEventListener('loadedmetadata', () => this.onLoaded());     // 元数据加载完成
    this.audio.addEventListener('play', () => this.onPlay());                 // 开始播放
    this.audio.addEventListener('pause', () => this.onPause());               // 暂停播放

    // ========== 键盘快捷键 ==========
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return; // 如果正在输入框里打字，就不响应
      switch(e.code) {
        case 'Space':        // 空格键：播放/暂停
          e.preventDefault();
          this.togglePlay();
          break;
        case 'ArrowLeft':    // 左箭头：后退5秒
          this.audio.currentTime -= 5;
          break;
        case 'ArrowRight':   // 右箭头：前进5秒
          this.audio.currentTime += 5;
          break;
        case 'ArrowUp':      // 上箭头：音量增加10%
          e.preventDefault();
          this.volumeSlider.value = Math.min(100, parseInt(this.volumeSlider.value) + 10);
          this.audio.volume = this.volumeSlider.value / 100;
          this.updateVolumeIcon();
          const volValUp = document.getElementById('volumeValue');
          if (volValUp) volValUp.textContent = this.volumeSlider.value;
          break;
        case 'ArrowDown':    // 下箭头：音量减少10%
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

  // 初始化MediaSession（系统通知栏控制）
  // 手机锁屏时可以显示歌曲信息和控制按钮
  initMediaSession() {
    if ('mediaSession' in navigator) {
      // 设置通知栏的控制按钮对应的 action
      navigator.mediaSession.setActionHandler('play', () => this.play());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        this.audio.currentTime = Math.max(0, this.audio.currentTime - 10); // 后退10秒
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        this.audio.currentTime = Math.min(this.audio.duration, this.audio.currentTime + 10); // 前进10秒
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null) {
          this.audio.currentTime = details.seekTime; // 跳转到指定时间
        }
      });
    }
  }

  // 初始化无限滚动（歌曲多时滚动加载更多）
  initInfiniteScroll() {
    this.paginationEl = document.getElementById('pagination');
    this.paginationEl.style.display = 'none'; // 隐藏分页控件（改用无限滚动）

    // 监听歌曲列表的滚动事件
    this.songList.addEventListener('scroll', () => {
      if (this.isLoadingMore || !this.hasMore) return; // 正在加载或没有更多就不处理
      // 检查是否滚动到底部（距离底部50px以内）
      const { scrollTop, scrollHeight, clientHeight } = this.songList;
      if (scrollTop + clientHeight >= scrollHeight - 50) {
        this.loadMoreSongs(); // 加载更多歌曲
      }
    });
  }

  // 设置歌曲列表
  setSongs(songs, total, hasMore) {
    this.songs = songs;             // 设置歌曲列表
    this.allSongs = songs;          // 同时设置所有歌曲
    this.totalCount = total || songs.length; // 设置总数
    this.hasMore = hasMore || false; // 是否还有更多
    this.currentPage = 1;           // 重置页码
    // 更新歌曲数量显示
    const countEl = document.getElementById('songCount');
    if (countEl) countEl.textContent = this.totalCount + ' 首';
    this.renderList(); // 重新渲染列表
  }

  // 加载所有歌曲（分页加载全部）
  async loadAllSongs() {
    try {
      this.allSongs = []; // 清空
      let page = 1;
      let hasMore = true;

      // 循环加载直到没有更多
      while (hasMore) {
        const res = await fetch(`/api/songs?page=${page}&limit=50`); // 每次请求50首
        const data = await res.json();
        if (data.songs && data.songs.length > 0) {
          this.allSongs = [...this.allSongs, ...data.songs]; // 追加到列表
          hasMore = data.hasMore; // 检查是否还有更多
          page++;
        } else {
          hasMore = false;
        }
      }

      this.songs = this.allSongs; // 设置歌曲列表
      this.currentIndex = -1;     // 重置播放索引
      this.totalCount = this.allSongs.length;
      const countEl = document.getElementById('songCount');
      if (countEl) countEl.textContent = this.totalCount + ' 首';
      this.currentPage = 1;
      this.hasMore = false;
      this.renderList();
    } catch (err) {
      console.error('加载歌曲失败:', err);
    }
  }

  // 加载更多歌曲（无限滚动）
  async loadMoreSongs() {
    if (this.isLoadingMore || !this.hasMore) return; // 防止重复加载
    this.isLoadingMore = true;
    try {
      this.currentPage++; // 页码+1
      const res = await fetch(`/api/songs?page=${this.currentPage}&limit=20`);
      const data = await res.json();
      if (data.songs && data.songs.length > 0) {
        this.allSongs = [...this.allSongs, ...data.songs]; // 追加到列表
        this.songs = this.allSongs;
        this.hasMore = data.hasMore;
        this.renderList();
      } else {
        this.hasMore = false;
      }
    } catch (err) {
      console.error('加载更多歌曲失败:', err);
    } finally {
      this.isLoadingMore = false;
    }
  }

  // 加载歌单内的歌曲
  async loadPlaylistSongs(playlistId) {
    try {
      const res = await fetch(`/api/songs?playlist_id=${playlistId}`);
      const data = await res.json();
      if (data.songs) {
        this.songs = data.songs;
        this.totalCount = data.total || data.songs.length;
      } else {
        this.songs = data;
        this.totalCount = data.length;
      }
      this.currentIndex = -1;
      const countEl = document.getElementById('songCount');
      if (countEl) countEl.textContent = this.totalCount + ' 首';
      this.currentPage = 1;
      this.hasMore = false;
      this.renderList();
    } catch (err) {
      console.error('加载歌单歌曲失败:', err);
    }
  }

  // 从allSongs渲染（全部歌曲视图）
  renderFromAllSongs() {
    this.songs = this.allSongs;
    this.currentIndex = -1;
    const countEl = document.getElementById('songCount');
    if (countEl) countEl.textContent = this.allSongs.length + ' 首';
    this.currentPage = 1;
    this.hasMore = false;
    this.renderList();
  }

  // 渲染歌曲列表到页面
  renderList(filter = '') {
    // 如果有搜索关键词，过滤歌曲
    const filtered = filter
      ? this.songs.filter(s => s.title.toLowerCase().includes(filter.toLowerCase()))
      : this.songs;

    if (filtered.length === 0) {
      this.songList.innerHTML = '<div class="empty-tip">暂无歌曲，点击上传</div>';
      this.paginationEl.style.display = 'none';
      return;
    }

    this.paginationEl.style.display = 'none'; // 隐藏分页控件

    // 生成歌曲列表HTML
    let html = filtered.map((song, i) => {
      const realIndex = this.songs.findIndex(s => s.id === song.id); // 在原始列表中的索引
      const isActive = realIndex === this.currentIndex; // 是否是当前播放的歌曲
      return `
        <div class="song-item ${isActive ? 'active' : ''} ${isActive && this.isPlaying ? 'playing' : ''}"
             data-index="${realIndex}">
          <div class="song-item-index">${isActive && this.isPlaying ? '▶' : (i + 1)}</div>
          <div class="song-item-info">
            <div class="song-item-title">${this.escapeHtml(song.title)}</div>
          </div>
          <div class="song-item-duration">${this.formatTime(song.duration || 0)}</div>
          <button class="song-item-menu" data-id="${song.id}" title="更多">⋯</button>
        </div>
      `;
    }).join('');

    // 如果还有更多歌曲，显示加载提示
    if (this.hasMore) {
      html += '<div class="loading-more">滚动加载更多...</div>';
    }

    this.songList.innerHTML = html;

    // 绑定歌曲点击事件
    this.songList.querySelectorAll('.song-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.song-item-menu')) return; // 如果点击的是菜单按钮，不处理
        const index = parseInt(item.dataset.index);
        this.playIndex(index); // 播放点击的歌曲
      });
    });

    // 绑定菜单按钮点击事件
    this.songList.querySelectorAll('.song-item-menu').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // 阻止冒泡到歌曲项
        const id = parseInt(btn.dataset.id);
        this.showSongMenu(e, id); // 显示右键菜单
      });
    });
  }

  // 显示歌曲右键菜单
  showSongMenu(e, songId) {
    const menu = document.getElementById('contextMenu');
    const song = this.songs.find(s => s.id === songId);
    if (!song) return;

    menu.style.left = e.clientX + 'px'; // 定位到鼠标位置
    menu.style.top = e.clientY + 'px';
    menu.classList.add('visible'); // 显示菜单
    menu.dataset.songId = songId; // 存储歌曲ID

    // 点击其他地方关闭菜单
    const close = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.classList.remove('visible');
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  // 播放指定索引的歌曲
  playIndex(index) {
    if (index < 0 || index >= this.songs.length) return; // 索引无效就不处理
    // 点击当前正在播放的歌曲，切换播放/暂停
    if (index === this.currentIndex && this.audio.src) {
      this.togglePlay();
      return;
    }
    this.currentIndex = index; // 记录当前播放索引
    const song = this.songs[index]; // 获取歌曲
    this.audio.src = `/api/stream/${song.id}`; // 设置音频源（从服务器流式播放）
    this.songTitle.textContent = song.title; // 显示歌曲标题
    this.songArtist.textContent = song.original_name; // 显示歌手名称
    this.renderList(document.getElementById('searchInput').value); // 重新渲染列表（更新高亮）
    this.updateMediaSession(song); // 更新通知栏信息
    this.audio.play().catch(() => this.scheduleResume()); // 开始播放
  }

  // 更新MediaSession（通知栏信息）
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

  // 切换播放/暂停
  togglePlay() {
    if (this.currentIndex === -1 && this.songs.length > 0) {
      this.playIndex(0); // 如果没有播放，播放第一首
      return;
    }
    if (this.isPlaying) {
      this.pause(); // 正在播放就暂停
    } else {
      this.play(); // 暂停状态就播放
    }
  }

  // 播放
  play() {
    this.audio.play().catch(() => this.scheduleResume());
  }

  // 暂停
  pause() {
    this.audio.pause();
  }

  // 上一曲
  prev() {
    if (this.songs.length === 0) return;
    let index = this.currentIndex - 1;
    if (index < 0) index = this.songs.length - 1; // 到第一首就跳到最后一首
    this.playIndex(index);
  }

  // 下一曲
  async next() {
    if (this.songs.length === 0) return;

    // 随机模式：跨歌单随机播放
    if (this.playMode === 'random') {
      const result = await this.getRandomSongFromAllPlaylists();
      if (result) {
        // 如果当前不在目标歌单，先切换
        if (window.playlistManager.currentPlaylistId !== result.playlistId) {
          await window.playlistManager.selectPlaylist(result.playlistId);
        }
        // 找到歌曲在当前列表中的索引
        const index = this.songs.findIndex(s => s.id === result.song.id);
        if (index >= 0) {
          this.playIndex(index);
        }
        return;
      }
    }

    // 顺序播放：检查是否是当前歌单的最后一首
    if (this.currentIndex >= this.songs.length - 1) {
      // 当前歌单播放完，切换到下一个歌单
      const switched = await this.switchToNextPlaylist();
      if (!switched) {
        // 如果无法切换，循环播放当前歌单
        this.playIndex(0);
      }
    } else {
      // 还有下一首，继续播放
      this.playIndex(this.currentIndex + 1);
    }
  }

  // 开始播放时的处理
  onPlay() {
    this.isPlaying = true;
    this.playBtn.textContent = '⏸'; // 按钮变为暂停图标
    this.cover.classList.add('spinning'); // 封面开始旋转
    this.cover.style.animationPlayState = 'running'; // 恢复旋转动画
    this.renderList(document.getElementById('searchInput').value); // 更新列表（显示播放动画）
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
  }

  // 暂停时的处理
  onPause() {
    this.isPlaying = false;
    this.playBtn.textContent = '▶'; // 按钮变为播放图标
    this.cover.style.animationPlayState = 'paused'; // 暂停旋转（停在当前角度）
    this.renderList(document.getElementById('searchInput').value);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  }

  // 播放结束时的处理
  onEnded() {
    if (this.playMode === 'single') {
      // 单曲循环：重新播放当前歌曲
      this.audio.currentTime = 0;
      this.audio.play().catch(() => this.scheduleResume());
    } else {
      // 其他模式：播放下一曲
      this.next();
    }
  }

  // 获取下一个歌单
  async getNextPlaylist() {
    if (!window.playlistManager) return null;
    const playlists = window.playlistManager.playlists;
    if (playlists.length === 0) return null;

    const currentPlaylistId = window.playlistManager.currentPlaylistId;
    if (!currentPlaylistId) return null;

    const currentIndex = playlists.findIndex(p => p.id === currentPlaylistId);
    const nextIndex = (currentIndex + 1) % playlists.length; // 循环到下一个
    return playlists[nextIndex];
  }

  // 切换到下一个歌单并播放第一首
  async switchToNextPlaylist() {
    const nextPlaylist = await this.getNextPlaylist();
    if (nextPlaylist && window.playlistManager) {
      await window.playlistManager.selectPlaylist(nextPlaylist.id);
      // 播放第一首歌
      if (this.songs.length > 0) {
        this.playIndex(0);
      }
      return true;
    }
    return false;
  }

  // 随机播放时跨歌单选择歌曲
  async getRandomSongFromAllPlaylists() {
    if (!window.playlistManager) return null;
    const playlists = window.playlistManager.playlists;
    if (playlists.length === 0) return null;

    // 随机选择一个歌单
    const randomPlaylist = playlists[Math.floor(Math.random() * playlists.length)];

    // 加载该歌单的歌曲
    try {
      const res = await fetch(`/api/songs?playlist_id=${randomPlaylist.id}`);
      const data = await res.json();
      const songs = data.songs || data;
      if (songs.length > 0) {
        // 随机选择一首歌
        const randomSong = songs[Math.floor(Math.random() * songs.length)];
        return { song: randomSong, playlistId: randomPlaylist.id };
      }
    } catch (err) {
      console.error('获取随机歌曲失败:', err);
    }
    return null;
  }

  // 后台自动恢复播放（手机切后台后回来自动继续）
  scheduleResume() {
    if (this._resumeListener) return; // 已经注册过就不重复注册
    this._resumeListener = () => {
      if (document.visibilityState === 'visible' && !this.isPlaying) {
        // 页面重新可见且没有在播放，自动恢复播放
        document.removeEventListener('visibilitychange', this._resumeListener);
        this._resumeListener = null;
        this.audio.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', this._resumeListener);
  }

  // 音频元数据加载完成（获取到时长等信息）
  onLoaded() {
    this.durationEl.textContent = this.formatTime(this.audio.duration); // 显示时长
    // 更新MediaSession的时长信息
    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession && this.audio.duration && isFinite(this.audio.duration)) {
      navigator.mediaSession.setPositionState({
        duration: this.audio.duration,
        playbackRate: this.audio.playbackRate,
        position: this.audio.currentTime || 0
      });
    }
    // 如果当前歌曲时长为0，回写到数据库（修正数据）
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

  // 更新播放进度显示
  updateProgress() {
    const percent = (this.audio.currentTime / this.audio.duration) * 100 || 0;
    if (!this._isDraggingProgress) { // 如果没有在拖拽，才更新进度条
      this.progress.style.width = percent + '%';
    }
    this.currentTimeEl.textContent = this.formatTime(this.audio.currentTime);

    // 节流：每秒只更新一次MediaSession的position（避免频繁更新）
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

  // 点击进度条跳转
  seek(e) {
    const rect = this.progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    this.audio.currentTime = percent * this.audio.duration;
  }

  // 切换随机播放模式
  toggleShuffle() {
    if (this.playMode === 'random') {
      this.playMode = 'list'; // 取消随机
      this.shuffleBtn.classList.remove('active');
    } else {
      this.playMode = 'random'; // 开启随机
      this.shuffleBtn.classList.add('active');
    }
  }

  // 切换循环模式（列表循环 ↔ 单曲循环）
  toggleRepeat() {
    if (this.playMode === 'single') {
      this.playMode = 'list'; // 切换到列表循环
      this.repeatBtn.classList.remove('active');
      this.repeatBtn.textContent = '↻';
    } else {
      this.playMode = 'single'; // 切换到单曲循环
      this.repeatBtn.classList.add('active');
      this.repeatBtn.textContent = '↻₁';
    }
  }

  // 静音/取消静音
  toggleMute() {
    const volVal = document.getElementById('volumeValue');
    if (this.audio.volume > 0) {
      // 当前有音量，静音
      this.audio._prevVolume = this.audio.volume; // 保存之前的音量
      this.audio.volume = 0;
      this.volumeSlider.value = 0;
      if (volVal) volVal.textContent = '0';
    } else {
      // 当前静音，恢复之前的音量
      this.audio.volume = this.audio._prevVolume || 0.8; // 没有记录就恢复到80%
      this.volumeSlider.value = this.audio.volume * 100;
      if (volVal) volVal.textContent = this.volumeSlider.value;
    }
    this.updateVolumeIcon();
  }

  // 更新音量图标
  updateVolumeIcon() {
    const vol = this.audio.volume;
    if (vol === 0) this.volumeBtn.textContent = '🔇';       // 静音
    else if (vol < 0.5) this.volumeBtn.textContent = '🔉';  // 低音量
    else this.volumeBtn.textContent = '🔊';                  // 正常音量
  }

  // 删除歌曲
  async deleteSong(id) {
    try {
      const res = await fetch(`/api/songs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        // 检查是否正在播放这首歌曲
        const isPlaying = this.currentIndex >= 0 && this.songs[this.currentIndex] && this.songs[this.currentIndex].id === id;

        // 从列表中移除
        this.songs = this.songs.filter(s => s.id !== id);
        this.allSongs = this.allSongs.filter(s => s.id !== id);

        // 立即更新列表显示（歌曲消失）
        const countEl = document.getElementById('songCount');
        if (countEl) countEl.textContent = this.songs.length + ' 首';
        this.renderList(document.getElementById('searchInput').value);

        // 如果删除的是正在播放的歌曲，无缝切换到下一首
        if (isPlaying) {
          if (this.songs.length > 0) {
            if (this.currentIndex >= this.songs.length) {
              this.currentIndex = 0;
            }
            const nextSong = this.songs[this.currentIndex];
            this.audio.src = `/api/stream/${nextSong.id}`;
            this.songTitle.textContent = nextSong.title;
            this.songArtist.textContent = nextSong.original_name;
            this.updateMediaSession(nextSong);
            this.audio.play().catch(() => this.scheduleResume());
          } else {
            this.currentIndex = -1;
            this.audio.pause();
            this.audio.src = '';
            this.songTitle.textContent = '未选择歌曲';
            this.songArtist.textContent = '';
            this.songCover.src = '';
            this.durationEl.textContent = '00:00';
            this.currentTimeEl.textContent = '00:00';
          }
        } else if (this.currentIndex >= 0) {
          const currentId = this.songs[this.currentIndex] ? this.songs[this.currentIndex].id : null;
          if (currentId) {
            const newIndex = this.songs.findIndex(s => s.id === currentId);
            if (newIndex !== -1) this.currentIndex = newIndex;
          }
        }

        // 刷新歌单列表
        if (window.playlistManager) {
          window.playlistManager.loadPlaylists();
        }
      }
    } catch (err) {
      console.error('删除失败:', err);
    }
  }

  // 格式化时间：秒数 → "mm:ss"格式
  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // 开始重命名歌曲
  async startRename(titleEl, song) {
    const input = document.createElement('input'); // 创建输入框
    input.type = 'text';
    input.value = song.title; // 显示当前歌曲名
    input.className = 'rename-input';
    titleEl.textContent = ''; // 清空标题
    titleEl.appendChild(input); // 添加输入框
    input.focus(); // 聚焦
    input.select(); // 全选文本

    // 阻止输入框的点击冒泡到歌曲项（避免触发播放）
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('dblclick', (e) => e.stopPropagation());

    // 完成重命名
    const finish = async (save) => {
      const newTitle = input.value.trim();
      if (save && newTitle && newTitle !== song.title) {
        // 保存新名称
        try {
          const res = await fetch(`/api/songs/${song.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle })
          });
          if (res.ok) {
            song.title = newTitle; // 更新本地数据
            if (this.songTitle.textContent === song.title || this.currentIndex >= 0) {
              this.songTitle.textContent = newTitle; // 更新显示
            }
          }
        } catch (err) {
          console.error('改名失败:', err);
        }
      }
      titleEl.textContent = song.title; // 恢复显示
      this.renderList(document.getElementById('searchInput').value);
    };

    input.addEventListener('blur', () => finish(true)); // 失去焦点时保存
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur(); // 回车保存
      if (e.key === 'Escape') {
        input.value = song.title; // ESC取消，恢复原名
        input.blur();
      }
    });
  }
}