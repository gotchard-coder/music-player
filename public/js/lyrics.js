// 歌词管理器
class LyricsManager {
  constructor(player) {
    this.player = player;
    this.parsedLyrics = [];
    this.currentLineIndex = -1;
    this.currentSongId = null;

    this.panel = document.getElementById('lyricsPanel');
    this.content = document.getElementById('lyricsContent');
    this.uploadBtn = document.getElementById('lyricsUploadBtn');
    this.input = document.getElementById('lyricsInput');

    this.initEvents();
  }

  initEvents() {
    // 上传歌词
    this.input.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.uploadLyrics(e.target.files[0]);
      }
    });

    // 点击歌词行跳转
    this.content.addEventListener('click', (e) => {
      const line = e.target.closest('.lyrics-line');
      if (line && line.dataset.time) {
        this.player.audio.currentTime = parseFloat(line.dataset.time);
        if (!this.player.isPlaying) {
          this.player.togglePlay();
        }
      }
    });
  }

  // 解析 LRC 格式歌词
  parseLRC(text) {
    const lines = text.split('\n');
    const result = [];

    for (const line of lines) {
      const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
      if (match) {
        const min = parseInt(match[1]);
        const sec = parseInt(match[2]);
        const ms = parseInt(match[3].padEnd(3, '0'));
        const time = min * 60 + sec + ms / 1000;
        const text = match[4].trim();
        if (text) {
          result.push({ time, text });
        }
      }
    }

    result.sort((a, b) => a.time - b.time);
    return result;
  }

  // 渲染歌词到面板
  renderLyrics() {
    if (this.parsedLyrics.length === 0) {
      this.content.innerHTML = '<div class="lyrics-empty">暂无歌词</div>';
      return;
    }

    this.content.innerHTML = this.parsedLyrics.map((line, i) => {
      return `<div class="lyrics-line" data-index="${i}" data-time="${line.time}">${line.text}</div>`;
    }).join('');
  }

  // 根据当前播放时间高亮对应歌词行
  updateHighlight(currentTime) {
    if (this.parsedLyrics.length === 0) return;

    let activeIndex = -1;
    for (let i = this.parsedLyrics.length - 1; i >= 0; i--) {
      if (currentTime >= this.parsedLyrics[i].time - 0.1) {
        activeIndex = i;
        break;
      }
    }

    if (activeIndex !== this.currentLineIndex) {
      this.currentLineIndex = activeIndex;
      const lines = this.content.querySelectorAll('.lyrics-line');
      lines.forEach((line, i) => {
        line.classList.remove('active', 'past');
        if (i === activeIndex) {
          line.classList.add('active');
        } else if (i < activeIndex) {
          line.classList.add('past');
        }
      });

      // 自动滚动到当前行
      if (activeIndex >= 0 && lines[activeIndex]) {
        const container = this.content;
        const line = lines[activeIndex];
        const containerHeight = container.clientHeight;
        const lineTop = line.offsetTop;
        const lineHeight = line.offsetHeight;
        const scrollTo = lineTop - containerHeight / 2 + lineHeight / 2;
        container.scrollTo({ top: scrollTo, behavior: 'smooth' });
      }
    }
  }

  // 加载歌曲歌词
  async loadLyrics(songId) {
    this.currentSongId = songId;
    this.currentLineIndex = -1;
    this.parsedLyrics = [];

    if (!songId) {
      this.renderLyrics();
      return;
    }

    try {
      const res = await fetch(`/api/songs/${songId}/lyrics`);
      const data = await res.json();
      if (data.lyrics) {
        this.parsedLyrics = this.parseLRC(data.lyrics);
      }
    } catch (err) {
      console.error('加载歌词失败:', err);
    }

    this.renderLyrics();
  }

  // 上传歌词文件
  async uploadLyrics(file) {
    if (!this.currentSongId) return;

    const formData = new FormData();
    formData.append('lyrics', file);

    try {
      const res = await fetch(`/api/songs/${this.currentSongId}/lyrics`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        // 从服务器重新加载（服务器已转成 UTF-8）
        const lyricsRes = await fetch(`/api/songs/${this.currentSongId}/lyrics`);
        const lyricsData = await lyricsRes.json();
        if (lyricsData.lyrics) {
          this.parsedLyrics = this.parseLRC(lyricsData.lyrics);
        }
        this.renderLyrics();

        // 更新歌曲数据
        const song = this.player.songs.find(s => s.id === this.currentSongId);
        if (song) {
          song.has_lyrics = true;
          this.player.renderList(document.getElementById('searchInput').value);
        }
      }
    } catch (err) {
      console.error('上传歌词失败:', err);
    }

    this.input.value = '';
  }

  // 显示/隐藏歌词面板
  toggle() {
    this.panel.classList.toggle('visible');
    if (this.panel.classList.contains('visible') && this.player.currentIndex >= 0) {
      const song = this.player.songs[this.player.currentIndex];
      if (song && (!this.parsedLyrics.length || this.currentSongId !== song.id)) {
        this.loadLyrics(song.id);
      }
    }
  }

  show() {
    this.panel.classList.add('visible');
  }

  hide() {
    this.panel.classList.remove('visible');
  }
}
