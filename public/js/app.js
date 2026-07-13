// =====================================================================
// 文件：app.js
// 职责：音乐播放器的主入口文件，负责初始化整个应用
// 这个文件是JavaScript的起点，所有其他模块都在这里被创建和连接
// =====================================================================

// 已实现的功能：
// 1. 初始化各个管理器
//    - 创建MusicPlayer实例（播放器核心）
//    - 创建UploadManager实例（上传功能）
//    - 创建LyricsManager实例（歌词功能）
//    - 创建PlaylistManager实例（歌单管理）
//
// 2. 音量控制
//    - 初始化音量显示（默认80）
//
// 3. 歌词功能
//    - 歌词按钮点击事件（显示/隐藏歌词面板）
//    - L键快捷键切换歌词
//    - 歌词同步（监听播放进度，自动高亮当前歌词行）
//
// 4. 侧边栏控制
//    - 手机端菜单按钮点击打开侧边栏
//    - 关闭按钮点击关闭侧边栏
//    - 遮罩层点击关闭侧边栏
//    - 切换歌曲时自动关闭侧边栏
//
// 5. 歌曲加载
//    - 加载歌单数据
//    - 切换歌曲时自动加载对应歌词
//
// 6. 搜索功能
//    - 搜索框输入实时过滤歌曲列表
//    - 搜索时重置分页到第一页
//
// 7. 歌曲右键菜单
//    - 重命名歌曲
//    - 添加到歌单（显示歌单列表子菜单）
//    - 删除歌曲
//
// 8. 歌单右键菜单
//    - 重命名歌单
//    - 删除歌单
//
// 9. 上传功能
//    - 上传完成后刷新歌曲列表和歌单
//    - 自动选择第一个歌单
//
// 10. 应用初始化
//     - 加载所有歌曲
//     - 自动选择第一个歌单显示
// =====================================================================

// 主应用：等待页面加载完成后执行
document.addEventListener('DOMContentLoaded', async () => {
  // ========== 第1步：创建各个管理器实例 ==========
  const player = new MusicPlayer();           // 播放器核心：控制播放、暂停、上下曲等
  const uploader = new UploadManager(player); // 上传管理：处理文件上传功能
  const lyrics = new LyricsManager(player);   // 歌词管理：显示和同步歌词
  const playlistManager = new PlaylistManager(player); // 歌单管理：创建、删除、添加歌曲
  window.playlistManager = playlistManager;   // 挂载到window上，方便其他模块访问

  // ========== 第2步：初始化音量显示 ==========
  const volVal = document.getElementById('volumeValue');   // 获取音量数值显示元素
  const volSlider = document.getElementById('volumeSlider'); // 获取音量滑块元素
  // 如果两个元素都存在，就把滑块的值显示出来
  if (volVal && volSlider) volVal.textContent = volSlider.value;

  // ========== 第3步：歌词功能 ==========
  const lyricsBtn = document.getElementById('lyricsBtn'); // 获取歌词按钮
  // 点击歌词按钮，切换歌词面板显示/隐藏
  lyricsBtn.addEventListener('click', () => {
    lyrics.toggle(); // 调用歌词管理器的toggle方法
    // 同时更新按钮的样式（如果歌词面板可见就加active样式）
    lyricsBtn.classList.toggle('lyrics-active', lyrics.panel.classList.contains('visible'));
  });

  // L键快捷键：按下L键也能切换歌词面板
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return; // 如果正在输入框里打字，就不响应
    if (e.code === 'KeyL') { // 按下L键
      lyrics.toggle(); // 切换歌词面板
      lyricsBtn.classList.toggle('lyrics-active', lyrics.panel.classList.contains('visible'));
    }
  });

  // 歌词同步：每次播放进度更新时，高亮当前时间对应的歌词行
  player.audio.addEventListener('timeupdate', () => {
    lyrics.updateHighlight(player.audio.currentTime); // 把当前时间传给歌词管理器
  });

  // ========== 第4步：侧边栏控制（手机端用） ==========
  const sidebar = document.getElementById('sidebar');         // 获取侧边栏元素
  const menuBtn = document.getElementById('menuBtn');         // 获取手机端菜单按钮
  const closeSidebarBtn = document.getElementById('closeSidebar'); // 获取关闭侧边栏按钮
  const overlay = document.getElementById('mobileOverlay');   // 获取遮罩层元素

  // 打开侧边栏：给侧边栏和遮罩层加上open/visible样式
  function openSidebar() {
    sidebar.classList.add('open');      // 侧边栏滑入
    overlay.classList.add('visible');   // 遮罩层显示（半透明黑色背景）
  }

  // 关闭侧边栏：移除open/visible样式
  function closeSidebar() {
    sidebar.classList.remove('open');      // 侧边栏滑出
    overlay.classList.remove('visible');   // 遮罩层隐藏
  }

  // 绑定事件：菜单按钮打开、关闭按钮关闭、遮罩层点击关闭
  menuBtn.addEventListener('click', openSidebar);
  closeSidebarBtn.addEventListener('click', closeSidebar);
  overlay.addEventListener('click', closeSidebar);

  // ========== 第5步：切换歌曲时的附加操作 ==========
  // 保存原来的playIndex方法
  const originalPlayIndex = player.playIndex.bind(player);
  // 重写playIndex方法，添加额外操作
  player.playIndex = function(index) {
    originalPlayIndex(index); // 先执行原来的播放逻辑
    closeSidebar();           // 播放歌曲后自动关闭侧边栏（手机端体验更好）
    const song = this.songs[index]; // 获取当前播放的歌曲
    if (song) {
      lyrics.loadLyrics(song.id); // 加载这首歌的歌词
    }
  };

  // ========== 第6步：加载歌曲列表 ==========
  async function loadSongs() {
    try {
      await playlistManager.loadPlaylists(); // 从服务器加载所有歌单
    } catch (err) {
      console.error('加载歌曲失败:', err); // 加载失败时在控制台打印错误
    }
  }

  // ========== 第7步：搜索功能 ==========
  const searchInput = document.getElementById('searchInput'); // 获取搜索输入框
  // 每次输入内容变化时，重新渲染歌曲列表（只显示匹配的歌曲）
  searchInput.addEventListener('input', (e) => {
    player.currentPage = 1; // 搜索时重置到第一页
    player.renderList(e.target.value); // 把搜索关键词传给播放器，过滤歌曲
  });

  // ========== 第8步：歌曲右键菜单 ==========
  const contextMenu = document.getElementById('contextMenu');           // 获取歌曲右键菜单
  const addToPlaylistMenu = document.getElementById('addToPlaylistMenu'); // 获取"添加到歌单"子菜单
  let currentMenuSongId = null; // 记录当前右键点击的是哪首歌

  // 给右键菜单的每个选项绑定点击事件
  contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.dataset.action; // 获取操作类型（rename/add-to-playlist/delete）
      const songId = parseInt(contextMenu.dataset.songId); // 获取歌曲ID
      const song = player.songs.find(s => s.id === songId); // 找到这首歌
      contextMenu.classList.remove('visible'); // 关闭菜单

      if (action === 'rename' && song) {
        // 重命名：找到歌曲标题元素，进入编辑模式
        const allTitles = document.querySelectorAll('.song-item-title');
        for (const el of allTitles) {
          const parent = el.closest('.song-item');
          if (parent && parseInt(parent.dataset.index) === player.songs.indexOf(song)) {
            player.startRename(el, song); // 调用播放器的重命名方法
            break;
          }
        }
      } else if (action === 'add-to-playlist') {
        // 添加到歌单：显示歌单列表子菜单
        showAddToPlaylistMenu(songId, contextMenu);
      } else if (action === 'delete') {
        // 删除歌曲
        player.deleteSong(songId);
      }
    });
  });

  // 显示"添加到歌单"子菜单
  function showAddToPlaylistMenu(songId, parentMenu) {
    currentMenuSongId = songId; // 记录当前操作的歌曲ID
    const playlists = playlistManager.playlists; // 获取所有歌单

    // 清空子菜单，重新创建歌单项
    addToPlaylistMenu.innerHTML = '<div class="context-menu-subtitle">选择歌单</div>';

    // 为每个歌单创建一个菜单项
    playlists.forEach(playlist => {
      const item = document.createElement('div');
      item.className = 'context-menu-item';
      item.textContent = playlist.name; // 显示歌单名称
      item.dataset.playlistId = playlist.id; // 存储歌单ID
      // 点击后把歌曲添加到这个歌单
      item.addEventListener('click', async () => {
        await playlistManager.addSongsToPlaylist(playlist.id, [songId]);
        addToPlaylistMenu.classList.remove('visible'); // 关闭子菜单
      });
      addToPlaylistMenu.appendChild(item); // 添加到子菜单
    });

    // 定位子菜单：显示在父菜单的右边
    const parentRect = parentMenu.getBoundingClientRect();
    addToPlaylistMenu.style.left = (parentRect.right + 4) + 'px';
    addToPlaylistMenu.style.top = parentRect.top + 'px';
    addToPlaylistMenu.classList.add('visible'); // 显示子菜单

    // 点击其他地方关闭子菜单
    const close = (ev) => {
      if (!addToPlaylistMenu.contains(ev.target) && !parentMenu.contains(ev.target)) {
        addToPlaylistMenu.classList.remove('visible');
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  // ========== 第9步：歌单右键菜单 ==========
  const playlistContextMenu = document.getElementById('playlistContextMenu'); // 获取歌单右键菜单
  // 给歌单右键菜单的每个选项绑定点击事件
  playlistContextMenu.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.dataset.action; // 获取操作类型（rename-playlist/delete-playlist）
      const playlistId = parseInt(playlistContextMenu.dataset.playlistId); // 获取歌单ID
      const playlistName = playlistContextMenu.dataset.playlistName; // 获取歌单名称
      playlistContextMenu.classList.remove('visible'); // 关闭菜单

      if (action === 'rename-playlist') {
        // 重命名歌单：弹出输入框让用户输入新名称
        const newName = prompt('重命名歌单', playlistName);
        if (newName && newName.trim()) { // 如果输入了新名称
          playlistManager.renamePlaylist(playlistId, newName); // 调用重命名方法
        }
      } else if (action === 'delete-playlist') {
        // 删除歌单：弹出确认框
        if (confirm(`确定删除歌单"${playlistName}"？`)) {
          playlistManager.deletePlaylist(playlistId); // 调用删除方法
        }
      }
    });
  });

  // ========== 第10步：上传完成后的处理 ==========
  uploader.onUploadComplete = async () => {
    await player.loadAllSongs();        // 重新加载所有歌曲
    await playlistManager.loadPlaylists(); // 重新加载所有歌单
    // 上传完成后保持在当前视图（如果是"全部歌曲"就刷新）
    if (playlistManager.currentPlaylistId === null) {
      await playlistManager.selectAllSongs(); // 刷新"全部歌曲"视图
    } else {
      await playlistManager.selectPlaylist(playlistManager.currentPlaylistId); // 刷新当前歌单
    }
  };

  // ========== 第11步：应用初始化 ==========
  await loadSongs(); // 加载所有歌曲和歌单
  // 初始化完成后，默认选中"全部歌曲"视图
  await playlistManager.selectAllSongs();
});