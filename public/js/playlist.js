// =====================================================================
// 文件：playlist.js
// 职责：管理歌单的创建、删除、重命名、添加歌曲
// 这个文件负责歌单的全部操作，让用户可以把歌曲分组管理
// =====================================================================

// 已实现的功能：
// 1. 加载所有歌单
// 2. 渲染歌单列表
// 3. 创建新歌单
// 4. 重命名歌单
// 5. 删除歌单
// 6. 选择歌单（显示歌单内的歌曲）
// 7. 添加歌曲到歌单
// 8. 从歌单移除歌曲
// 9. 歌单右键菜单
//
// 与其他文件的关系：
// - 依赖 player.js：调用 player.loadPlaylistSongs() 加载歌单内的歌曲
// - 被 app.js 创建和初始化
// - 与 server.js 通信：通过API操作歌单数据
//
// 歌单说明：
// - 没有默认歌单，所有歌单都由用户创建
// - 一首歌可以属于多个歌单（像B站收藏夹）
// - "全部歌曲"是特殊视图，不属于任何歌单
// =====================================================================

// 歌单管理器类
class PlaylistManager {
  // 构造函数：初始化歌单管理器
  constructor(player) {
    this.player = player;           // 保存播放器实例的引用
    this.playlists = [];            // 所有歌单数组
    this.currentPlaylistId = null;  // 当前选中的歌单ID（null表示"全部歌曲"视图）

    // 获取页面上的DOM元素
    this.playlistList = document.getElementById('playlistList');     // 歌单列表容器
    this.playlistCount = document.getElementById('playlistCount');   // 歌单数量显示
    this.playlistAddBtn = document.getElementById('playlistAddBtn'); // 新建歌单按钮
    this.playlistNameInput = document.getElementById('playlistNameInput'); // 歌单名称输入框

    this.initEvents(); // 绑定事件监听器
  }

  // 绑定事件监听器
  initEvents() {
    // 点击新建歌单按钮 → 显示输入框
    this.playlistAddBtn.addEventListener('click', () => this.showNameInput());

    // 输入框键盘事件
    this.playlistNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault(); // 防止表单提交
        this.createPlaylist(this.playlistNameInput.value); // 回车创建歌单
      } else if (e.key === 'Escape') {
        this.hideNameInput(); // ESC取消创建
      }
    });

    // 输入框失去焦点时 → 创建歌单或取消
    this.playlistNameInput.addEventListener('blur', () => {
      if (this.playlistNameInput.value.trim()) {
        this.createPlaylist(this.playlistNameInput.value); // 有内容就创建
      } else {
        this.hideNameInput(); // 没内容就取消
      }
    });
  }

  // 显示歌单名称输入框
  showNameInput() {
    this.playlistAddBtn.style.display = 'none'; // 隐藏新建按钮
    this.playlistNameInput.style.display = 'block'; // 显示输入框
    this.playlistNameInput.value = ''; // 清空输入框
    this.playlistNameInput.focus(); // 聚焦输入框
  }

  // 隐藏歌单名称输入框
  hideNameInput() {
    this.playlistAddBtn.style.display = ''; // 显示新建按钮
    this.playlistNameInput.style.display = 'none'; // 隐藏输入框
    this.playlistNameInput.value = ''; // 清空输入框
  }

  // 加载所有歌单
  async loadPlaylists() {
    try {
      const res = await fetch('/api/playlists'); // 从服务器获取歌单
      this.playlists = await res.json(); // 解析JSON
      this.renderPlaylistList(); // 渲染歌单列表
    } catch (err) {
      console.error('加载歌单失败:', err);
    }
  }

  // 渲染歌单列表到页面
  renderPlaylistList() {
    // 过滤掉null
    const userPlaylists = this.playlists.filter(p => p.id !== null);

    const container = this.playlistList; // 获取容器
    container.innerHTML = ''; // 清空容器

    // ========== 添加"全部歌曲"固定选项 ==========
    const allSongsItem = document.createElement('div');
    // 如果当前没有选中任何歌单（currentPlaylistId === null），显示active样式
    allSongsItem.className = 'playlist-item' + (this.currentPlaylistId === null ? ' active' : '');
    allSongsItem.dataset.id = 'all'; // 特殊标记：全部歌曲
    // 显示歌曲总数
    const totalCount = this.player.allSongs ? this.player.allSongs.length : 0;
    allSongsItem.innerHTML = `
      <span class="playlist-item-name">🎵 全部歌曲</span>
      <span class="playlist-item-count">${totalCount}</span>
    `;
    // 点击"全部歌曲" → 显示所有歌曲
    allSongsItem.addEventListener('click', () => this.selectAllSongs());
    container.appendChild(allSongsItem);

    // 遍历每个用户歌单，创建DOM元素
    userPlaylists.forEach(playlist => {
      const item = document.createElement('div');
      // 如果是当前选中的歌单，加上active样式
      item.className = 'playlist-item' + (this.currentPlaylistId === playlist.id ? ' active' : '');
      item.dataset.id = playlist.id; // 存储歌单ID
      // 内部HTML：歌单名称 + 歌曲数量
      item.innerHTML = `
        <span class="playlist-item-name">${this.escapeHtml(playlist.name)}</span>
        <span class="playlist-item-count">${playlist.song_count || 0}</span>
      `;
      // 点击歌单 → 选中这个歌单
      item.addEventListener('click', () => this.selectPlaylist(playlist.id));

      // 右键菜单
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault(); // 阻止浏览器默认右键菜单
        this.showPlaylistMenu(e, playlist); // 显示自定义右键菜单
      });

      container.appendChild(item); // 添加到容器
    });

    // 更新歌单数量显示
    if (this.playlistCount) {
      this.playlistCount.textContent = userPlaylists.length;
    }
  }

  // 创建新歌单
  async createPlaylist(name) {
    this.hideNameInput(); // 隐藏输入框
    if (!name || !name.trim()) return; // 名称为空就不创建

    try {
      // 发送POST请求到服务器创建歌单
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }) // 发送歌单名称
      });
      if (res.ok) {
        await this.loadPlaylists(); // 重新加载歌单列表
      }
    } catch (err) {
      console.error('创建歌单失败:', err);
    }
  }

  // 重命名歌单
  async renamePlaylist(id, name) {
    if (!name || !name.trim()) return; // 名称为空就不重命名
    try {
      // 发送PUT请求到服务器重命名
      const res = await fetch(`/api/playlists/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }) // 发送新名称
      });
      if (res.ok) {
        await this.loadPlaylists(); // 重新加载歌单列表
      }
    } catch (err) {
      console.error('重命名失败:', err);
    }
  }

  // 删除歌单
  async deletePlaylist(id) {
    try {
      // 发送DELETE请求到服务器删除
      const res = await fetch(`/api/playlists/${id}`, { method: 'DELETE' });
      if (res.ok) {
        // 如果删除的是当前正在查看的歌单，切换到"全部歌曲"视图
        if (this.currentPlaylistId === id) {
          this.currentPlaylistId = null; // 清空当前歌单
          await this.player.loadAllSongs(); // 加载所有歌曲
        }
        await this.loadPlaylists(); // 重新加载歌单列表
      }
    } catch (err) {
      console.error('删除歌单失败:', err);
    }
  }

  // 选择歌单（显示这个歌单内的歌曲）
  async selectPlaylist(id) {
    this.currentPlaylistId = id; // 记录当前选中的歌单
    this.renderPlaylistList(); // 重新渲染歌单列表（更新active样式）

    // 更新歌曲列表标题
    const titleEl = document.getElementById('songListTitle');
    const playlist = this.playlists.find(p => p.id === id); // 找到这个歌单
    titleEl.textContent = playlist ? playlist.name : '全部歌曲'; // 显示歌单名称

    // 加载这个歌单内的歌曲
    await this.player.loadPlaylistSongs(id);
  }

  // 选择"全部歌曲"视图
  async selectAllSongs() {
    this.currentPlaylistId = null; // 清空当前歌单（null表示"全部歌曲"）
    this.renderPlaylistList(); // 重新渲染歌单列表（更新active样式）

    // 更新歌曲列表标题
    const titleEl = document.getElementById('songListTitle');
    titleEl.textContent = '全部歌曲';

    // 加载所有歌曲
    await this.player.loadAllSongs();
  }

  // 添加歌曲到歌单
  async addSongsToPlaylist(playlistId, songIds) {
    try {
      // 发送POST请求添加歌曲
      const res = await fetch(`/api/playlists/${playlistId}/songs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song_ids: songIds }) // 发送歌曲ID数组
      });
      if (res.ok) {
        await this.loadPlaylists(); // 重新加载歌单列表（更新歌曲数量）
        return true; // 返回成功
      }
    } catch (err) {
      console.error('添加到歌单失败:', err);
    }
    return false; // 返回失败
  }

  // 从歌单移除歌曲
  async removeSongFromPlaylist(playlistId, songId) {
    try {
      // 发送DELETE请求移除歌曲
      const res = await fetch(`/api/playlists/${playlistId}/songs/${songId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await this.loadPlaylists(); // 重新加载歌单列表
        // 如果当前正在查看这个歌单，刷新歌曲列表
        if (this.currentPlaylistId === playlistId) {
          await this.player.loadPlaylistSongs(playlistId);
        }
        return true; // 返回成功
      }
    } catch (err) {
      console.error('从歌单移除失败:', err);
    }
    return false; // 返回失败
  }

  // 显示歌单右键菜单
  showPlaylistMenu(e, playlist) {
    const menu = document.getElementById('playlistContextMenu'); // 获取右键菜单元素
    menu.style.left = e.clientX + 'px'; // 定位到鼠标位置
    menu.style.top = e.clientY + 'px';
    menu.classList.add('visible'); // 显示菜单
    menu.dataset.playlistId = playlist.id; // 存储歌单ID
    menu.dataset.playlistName = playlist.name; // 存储歌单名称

    // 点击其他地方关闭菜单
    const close = (ev) => {
      if (!menu.contains(ev.target)) { // 如果点击的不是菜单内部
        menu.classList.remove('visible'); // 关闭菜单
        document.removeEventListener('click', close); // 移除事件监听
      }
    };
    setTimeout(() => document.addEventListener('click', close), 0); // 延迟添加，避免立即触发
  }

  // 防止XSS攻击：将文本转为HTML安全格式
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text; // 设置文本内容
    return div.innerHTML; // 返回HTML编码后的文本
  }
}