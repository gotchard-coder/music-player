// 主应用
document.addEventListener('DOMContentLoaded', async () => {
  const player = new MusicPlayer();
  const uploader = new UploadManager(player);
  const lyrics = new LyricsManager(player);

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
      const songs = await res.json();
      player.setSongs(songs);
    } catch (err) {
      console.error('加载歌曲失败:', err);
    }
  }

  // 搜索功能
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', (e) => {
    player.renderList(e.target.value);
  });

  // 菜单项点击
  const contextMenu = document.getElementById('contextMenu');
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
      } else if (action === 'delete') {
        player.deleteSong(songId);
      }
    });
  });

  // 初始化
  await loadSongs();
});
