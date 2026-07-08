// 歌单管理器
class PlaylistManager {
  constructor(player) {
    this.player = player;
    this.playlists = [];
    this.currentPlaylistId = null; // null = 全部歌曲

    this.playlistList = document.getElementById('playlistList');
    this.playlistCount = document.getElementById('playlistCount');
    this.playlistAddBtn = document.getElementById('playlistAddBtn');
    this.playlistNameInput = document.getElementById('playlistNameInput');

    this.initEvents();
  }

  initEvents() {
    // 新建歌单按钮
    this.playlistAddBtn.addEventListener('click', () => this.showNameInput());

    // 输入框回车/失焦
    this.playlistNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.createPlaylist(this.playlistNameInput.value);
      } else if (e.key === 'Escape') {
        this.hideNameInput();
      }
    });
    this.playlistNameInput.addEventListener('blur', () => {
      if (this.playlistNameInput.value.trim()) {
        this.createPlaylist(this.playlistNameInput.value);
      } else {
        this.hideNameInput();
      }
    });

    // 全部歌曲点击
    document.getElementById('playlistAll').addEventListener('click', () => {
      this.selectPlaylist(null);
    });
  }

  showNameInput() {
    this.playlistAddBtn.style.display = 'none';
    this.playlistNameInput.style.display = 'block';
    this.playlistNameInput.value = '';
    this.playlistNameInput.focus();
  }

  hideNameInput() {
    this.playlistAddBtn.style.display = '';
    this.playlistNameInput.style.display = 'none';
    this.playlistNameInput.value = '';
  }

  // 加载所有歌单
  async loadPlaylists() {
    try {
      const res = await fetch('/api/playlists');
      this.playlists = await res.json();
      this.renderPlaylistList();
    } catch (err) {
      console.error('加载歌单失败:', err);
    }
  }

  // 渲染歌单列表
  renderPlaylistList() {
    // 更新全部歌曲数量
    const allCountEl = document.getElementById('playlistAllCount');
    if (allCountEl) allCountEl.textContent = this.player.allSongs.length;

    // 渲染用户歌单
    const userPlaylists = this.playlists;

    // 保留全部歌曲的 HTML，只更新歌单项
    const container = this.playlistList;
    // 移除旧的歌单项（保留 playlistAll）
    container.querySelectorAll('.playlist-item:not(#playlistAll)').forEach(el => el.remove());

    // 如果没有歌单，显示提示
    if (userPlaylists.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'playlist-item';
      emptyItem.innerHTML = '<span class="playlist-item-name" style="color: var(--text-muted)">暂无歌单，点击 + 创建</span>';
      container.appendChild(emptyItem);
      if (this.playlistCount) {
        this.playlistCount.textContent = '0';
      }
      return;
    }

    userPlaylists.forEach(playlist => {
      const item = document.createElement('div');
      item.className = 'playlist-item' + (this.currentPlaylistId === playlist.id ? ' active' : '');
      item.dataset.id = playlist.id;
      item.innerHTML = `
        <span class="playlist-item-name">${this.escapeHtml(playlist.name)}</span>
        <span class="playlist-item-count">${playlist.song_count || 0}</span>
      `;
      item.addEventListener('click', () => this.selectPlaylist(playlist.id));

      // 右键菜单
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showPlaylistMenu(e, playlist);
      });

      container.appendChild(item);
    });

    // 更新总数
    if (this.playlistCount) {
      this.playlistCount.textContent = userPlaylists.length;
    }
  }

  // 创建歌单
  async createPlaylist(name) {
    this.hideNameInput();
    if (!name || !name.trim()) return;

    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() })
      });
      if (res.ok) {
        await this.loadPlaylists();
      }
    } catch (err) {
      console.error('创建歌单失败:', err);
    }
  }

  // 重命名歌单
  async renamePlaylist(id, name) {
    if (!name || !name.trim()) return;
    try {
      const res = await fetch(`/api/playlists/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() })
      });
      if (res.ok) {
        await this.loadPlaylists();
      }
    } catch (err) {
      console.error('重命名失败:', err);
    }
  }

  // 删除歌单
  async deletePlaylist(id) {
    try {
      const res = await fetch(`/api/playlists/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (this.currentPlaylistId === id) {
          this.currentPlaylistId = null;
          await this.player.loadAllSongs();
        }
        await this.loadPlaylists();
      }
    } catch (err) {
      console.error('删除歌单失败:', err);
    }
  }

  // 选择歌单
  async selectPlaylist(id) {
    this.currentPlaylistId = id;
    this.renderPlaylistList();

    // 更新标题
    const titleEl = document.getElementById('songListTitle');
    if (id === null) {
      titleEl.textContent = '全部歌曲';
    } else {
      const playlist = this.playlists.find(p => p.id === id);
      titleEl.textContent = playlist ? playlist.name : '全部歌曲';
    }

    // 加载歌曲
    if (id === null) {
      await this.player.loadAllSongs();
    } else {
      await this.player.loadPlaylistSongs(id);
    }
  }

  // 添加歌曲到歌单
  async addSongsToPlaylist(playlistId, songIds) {
    try {
      const res = await fetch(`/api/playlists/${playlistId}/songs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song_ids: songIds })
      });
      if (res.ok) {
        await this.loadPlaylists();
        return true;
      }
    } catch (err) {
      console.error('添加到歌单失败:', err);
    }
    return false;
  }

  // 从歌单移除歌曲
  async removeSongFromPlaylist(playlistId, songId) {
    try {
      const res = await fetch(`/api/playlists/${playlistId}/songs/${songId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        await this.loadPlaylists();
        // 如果当前正在查看该歌单，刷新列表
        if (this.currentPlaylistId === playlistId) {
          await this.player.loadPlaylistSongs(playlistId);
        }
        return true;
      }
    } catch (err) {
      console.error('从歌单移除失败:', err);
    }
    return false;
  }

  // 显示歌单右键菜单
  showPlaylistMenu(e, playlist) {
    const menu = document.getElementById('playlistContextMenu');
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.classList.add('visible');
    menu.dataset.playlistId = playlist.id;
    menu.dataset.playlistName = playlist.name;

    const close = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.classList.remove('visible');
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
