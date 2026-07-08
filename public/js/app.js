// 主应用
document.addEventListener('DOMContentLoaded', async () => {
  const player = new MusicPlayer();
  const uploader = new UploadManager(player);
  const lyrics = new LyricsManager(player);
  const playlistManager = new PlaylistManager(player);
  window.playlistManager = playlistManager;

  // 初始化音量显示
  const volVal = document.getElementById('volumeValue');
  const volSlider = document.getElementById('volumeSlider');
  if (volVal && volSlider) volVal.textContent = volSlider.value;

  // 歌词按钮
  const lyricsBtn = document.getElementById('lyricsBtn');
  lyricsBtn.addEventListener('click', () => {
    lyrics.toggle();
    lyricsBtn.classList.toggle('lyrics-active', lyrics.panel.classList.contains('visible'));
  });

  // L 键切换歌词
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'KeyL') {
      lyrics.toggle();
      lyricsBtn.classList.toggle('lyrics-active', lyrics.panel.classList.contains('visible'));
    }
  });

  // 歌词同步：监听播放进度
  player.audio.addEventListener('timeupdate', () => {
    lyrics.updateHighlight(player.audio.currentTime);
  });

  // 侧边栏和遮罩
  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.getElementById('menuBtn');
  const closeSidebarBtn = document.getElementById('closeSidebar');
  const overlay = document.getElementById('mobileOverlay');

  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('visible');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
  }

  menuBtn.addEventListener('click', openSidebar);
  closeSidebarBtn.addEventListener('click', closeSidebar);
  overlay.addEventListener('click', closeSidebar);

  // 切换歌曲时加载歌词，关闭侧边栏
  const originalPlayIndex = player.playIndex.bind(player);
  player.playIndex = function(index) {
    originalPlayIndex(index);
    closeSidebar();
    const song = this.songs[index];
    if (song) {
      lyrics.loadLyrics(song.id);
    }
  };

  // 加载歌曲列表
  async function loadSongs() {
    try {
      const res = await fetch('/api/songs');
      const data = await res.json();
      // 兼容新旧API格式
      if (data.songs) {
        player.setSongs(data.songs, data.total, data.hasMore);
      } else {
        player.setSongs(data);
      }
      // 加载歌单
      await playlistManager.loadPlaylists();
    } catch (err) {
      console.error('加载歌曲失败:', err);
    }
  }

  // 搜索功能
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', (e) => {
    player.currentPage = 1;
    player.renderList(e.target.value);
  });

  // 歌曲右键菜单
  const contextMenu = document.getElementById('contextMenu');
  const addToPlaylistMenu = document.getElementById('addToPlaylistMenu');
  let currentMenuSongId = null;

  contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      const songId = parseInt(contextMenu.dataset.songId);
      const song = player.songs.find(s => s.id === songId);
      contextMenu.classList.remove('visible');

      if (action === 'rename' && song) {
        const allTitles = document.querySelectorAll('.song-item-title');
        for (const el of allTitles) {
          const parent = el.closest('.song-item');
          if (parent && parseInt(parent.dataset.index) === player.songs.indexOf(song)) {
            player.startRename(el, song);
            break;
          }
        }
      } else if (action === 'add-to-playlist') {
        showAddToPlaylistMenu(songId, contextMenu);
      } else if (action === 'delete') {
        player.deleteSong(songId);
      }
    });
  });

  // 显示"添加到歌单"子菜单
  function showAddToPlaylistMenu(songId, parentMenu) {
    currentMenuSongId = songId;
    const playlists = playlistManager.playlists;

    // 清空并重建菜单项
    addToPlaylistMenu.innerHTML = '<div class="context-menu-subtitle">选择歌单</div>';

    playlists.forEach(playlist => {
      const item = document.createElement('div');
      item.className = 'context-menu-item';
      item.textContent = playlist.name;
      item.dataset.playlistId = playlist.id;
      item.addEventListener('click', async () => {
        await playlistManager.addSongsToPlaylist(playlist.id, [songId]);
        addToPlaylistMenu.classList.remove('visible');
      });
      addToPlaylistMenu.appendChild(item);
    });

    // 定位子菜单
    const parentRect = parentMenu.getBoundingClientRect();
    addToPlaylistMenu.style.left = (parentRect.right + 4) + 'px';
    addToPlaylistMenu.style.top = parentRect.top + 'px';
    addToPlaylistMenu.classList.add('visible');

    // 点击其他地方关闭
    const close = (ev) => {
      if (!addToPlaylistMenu.contains(ev.target) && !parentMenu.contains(ev.target)) {
        addToPlaylistMenu.classList.remove('visible');
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  // 歌单右键菜单
  const playlistContextMenu = document.getElementById('playlistContextMenu');
  playlistContextMenu.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      const playlistId = parseInt(playlistContextMenu.dataset.playlistId);
      const playlistName = playlistContextMenu.dataset.playlistName;
      playlistContextMenu.classList.remove('visible');

      if (action === 'rename-playlist') {
        const newName = prompt('重命名歌单', playlistName);
        if (newName && newName.trim()) {
          playlistManager.renamePlaylist(playlistId, newName);
        }
      } else if (action === 'delete-playlist') {
        if (confirm(`确定删除歌单"${playlistName}"？`)) {
          playlistManager.deletePlaylist(playlistId);
        }
      }
    });
  });

  // 上传后刷新歌单
  uploader.onUploadComplete = async () => {
    await player.loadAllSongs();
    await playlistManager.loadPlaylists();
  };

  // 初始化
  await loadSongs();
});
