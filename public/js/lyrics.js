// =====================================================================
// 文件：lyrics.js
// 职责：管理歌词的显示、同步、上传
// 这个文件负责解析LRC/SRT格式歌词，根据播放进度高亮当前行，支持点击跳转
// =====================================================================

// 已实现的功能：
// 1. 解析LRC格式歌词（带时间戳的歌词格式）
// 2. 解析SRT格式歌词（字幕文件格式）
// 3. 渲染歌词到页面
// 4. 根据播放时间高亮当前歌词行
// 5. 自动滚动到当前歌词行
// 6. 点击歌词行跳转到对应时间
// 7. 上传LRC/SRT歌词文件
// 8. 从服务器加载歌词
// 9. 显示/隐藏歌词面板
//
// 与其他文件的关系：
// - 依赖 player.js：获取播放时间，控制播放进度
// - 被 app.js 创建和初始化
// - 与 lyrics-extract.js 配合：提取的歌词会保存到服务器
//
// LRC格式说明：
// [mm:ss.xx]歌词内容
// 例如：[01:23.45]这是第一句歌词
// =====================================================================

// 歌词管理器类
class LyricsManager {
  // 构造函数：初始化歌词管理器
  constructor(player) {
    this.player = player;           // 保存播放器实例的引用
    this.parsedLyrics = [];         // 解析后的歌词数组，每项包含 {time, text}
    this.currentLineIndex = -1;     // 当前高亮的歌词行索引（-1表示没有高亮）
    this.currentSongId = null;      // 当前加载歌词的歌曲ID

    // 获取页面上的DOM元素
    this.panel = document.getElementById('lyricsPanel');       // 歌词面板容器
    this.content = document.getElementById('lyricsContent');   // 歌词内容区域
    this.uploadBtn = document.getElementById('lyricsUploadBtn'); // 上传歌词按钮
    this.input = document.getElementById('lyricsInput');       // 隐藏的文件选择框

    this.initEvents(); // 绑定事件监听器
  }

  // 绑定事件监听器
  initEvents() {
    // 上传歌词：选择文件后自动上传
    this.input.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.uploadLyrics(e.target.files[0]); // 上传选中的歌词文件
      }
    });

    // 点击歌词行跳转到对应时间
    this.content.addEventListener('click', (e) => {
      const line = e.target.closest('.lyrics-line'); // 找到被点击的歌词行
      if (line && line.dataset.time) { // 如果有时间属性
        this.player.audio.currentTime = parseFloat(line.dataset.time); // 跳转到对应时间
        if (!this.player.isPlaying) {
          this.player.togglePlay(); // 如果没在播放，开始播放
        }
      }
    });
  }

  // 解析LRC格式歌词
  // LRC格式：[mm:ss.xx]歌词内容
  // 例如：
  // [00:12.00]这是第一句歌词
  // [00:18.50]这是第二句歌词
  parseLRC(text) {
    const lines = text.split('\n'); // 按行分割
    const result = []; // 存储解析结果

    for (const line of lines) {
      // 用正则表达式匹配LRC格式：[mm:ss.xx]文本
      const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
      if (match) {
        const min = parseInt(match[1]); // 分钟
        const sec = parseInt(match[2]); // 秒
        const ms = parseInt(match[3].padEnd(3, '0')); // 毫秒（补零到3位）
        const time = min * 60 + sec + ms / 1000; // 转换为总秒数
        const text = match[4].trim(); // 歌词文本

        if (text) { // 只添加有内容的歌词行
          result.push({ time, text }); // 添加到结果数组
        }
      }
    }

    result.sort((a, b) => a.time - b.time); // 按时间排序
    return result; // 返回解析后的歌词数组
  }

  // 解析SRT格式歌词
  // SRT格式：
  // 1
  // 00:00:01,000 --> 00:00:04,000
  // 这是第一句歌词
  //
  // 2
  // 00:00:05,000 --> 00:00:08,000
  // 这是第二句歌词
  parseSRT(text) {
    const result = []; // 存储解析结果

    // 去掉BOM（字节顺序标记）
    const cleanText = text.replace(/^\uFEFF/, '');
    // 统一换行符为\n
    const normalized = cleanText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // 按双换行分割成多个字幕块
    const blocks = normalized.split(/\n\n+/);

    for (const block of blocks) {
      const lines = block.trim().split('\n'); // 按行分割
      if (lines.length < 2) continue;

      // 逐行查找时间格式 HH:MM:SS,mmm 或 HH:MM:SS.mmm
      for (let i = 0; i < Math.min(lines.length, 3); i++) {
        const line = lines[i].trim();
        // 匹配：00:00:00,066 或 00:00:00.066
        const timeMatch = line.match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/);
        if (!timeMatch) continue;

        const hour = parseInt(timeMatch[1]);
        const min = parseInt(timeMatch[2]);
        const sec = parseInt(timeMatch[3]);
        const ms = parseInt(timeMatch[4]);
        const time = hour * 3600 + min * 60 + sec + ms / 1000;

        // 时间行之后的都是歌词文本
        const text = lines.slice(i + 1).join('\n').trim();
        if (text) {
          result.push({ time, text });
        }
        break; // 找到时间行就跳出内层循环
      }
    }

    result.sort((a, b) => a.time - b.time);
    return result;
  }

  // 根据文件扩展名选择解析方法
  parseLyrics(text, filename) {
    const ext = filename.split('.').pop().toLowerCase(); // 获取文件扩展名
    if (ext === 'srt') {
      return this.parseSRT(text); // SRT格式
    }
    return this.parseLRC(text); // 默认LRC格式
  }

  // 渲染歌词到页面
  renderLyrics() {
    if (this.parsedLyrics.length === 0) {
      // 没有歌词时显示提示
      this.content.innerHTML = '<div class="lyrics-empty">暂无歌词</div>';
      return;
    }

    // 将每行歌词转换为HTML元素
    this.content.innerHTML = this.parsedLyrics.map((line, i) => {
      return `<div class="lyrics-line" data-index="${i}" data-time="${line.time}">${line.text}</div>`;
    }).join('');
  }

  // 根据当前播放时间高亮对应的歌词行
  updateHighlight(currentTime) {
    if (this.parsedLyrics.length === 0) return; // 没有歌词就不处理

    // 找到当前时间对应的歌词行（从后往前找，找到第一个时间<=当前时间的行）
    let activeIndex = -1;
    for (let i = this.parsedLyrics.length - 1; i >= 0; i--) {
      if (currentTime >= this.parsedLyrics[i].time - 0.1) { // 减0.1秒的容差
        activeIndex = i; // 找到了，记录索引
        break;
      }
    }

    // 如果高亮行发生变化，更新样式
    if (activeIndex !== this.currentLineIndex) {
      this.currentLineIndex = activeIndex; // 更新当前高亮索引
      const lines = this.content.querySelectorAll('.lyrics-line'); // 获取所有歌词行

      lines.forEach((line, i) => {
        line.classList.remove('active', 'past'); // 先清除所有样式
        if (i === activeIndex) {
          line.classList.add('active'); // 当前行加active样式（高亮）
        } else if (i < activeIndex) {
          line.classList.add('past'); // 之前的行加past样式（变暗）
        }
      });

      // 自动滚动到当前歌词行（让它居中显示）
      if (activeIndex >= 0 && lines[activeIndex]) {
        const container = this.content; // 歌词容器
        const line = lines[activeIndex]; // 当前歌词行
        const containerHeight = container.clientHeight; // 容器高度
        const lineTop = line.offsetTop; // 歌词行距离容器顶部的距离
        const lineHeight = line.offsetHeight; // 歌词行高度
        // 计算滚动位置：让当前行居中
        const scrollTo = lineTop - containerHeight / 2 + lineHeight / 2;
        container.scrollTo({ top: scrollTo, behavior: 'smooth' }); // 平滑滚动
      }
    }
  }

  // 加载歌曲的歌词
  async loadLyrics(songId) {
    this.currentSongId = songId; // 记录当前歌曲ID
    this.currentLineIndex = -1; // 重置高亮索引
    this.parsedLyrics = []; // 清空歌词

    if (!songId) {
      this.renderLyrics(); // 没有歌曲ID就显示空歌词
      return;
    }

    try {
      // 从服务器获取歌词
      const res = await fetch(`/api/songs/${songId}/lyrics`);
      const data = await res.json();
      if (data.lyrics) {
        this.parsedLyrics = this.parseLRC(data.lyrics); // 解析LRC格式
      }
    } catch (err) {
      console.error('加载歌词失败:', err);
    }

    this.renderLyrics(); // 渲染歌词到页面
  }

  // 上传歌词文件
  async uploadLyrics(file) {
    if (!this.currentSongId) return; // 没有选中歌曲就不处理

    try {
      // 读取文件内容
      const text = await file.text();
      // 根据文件扩展名解析歌词（LRC或SRT）
      this.parsedLyrics = this.parseLyrics(text, file.name);
      this.renderLyrics(); // 渲染歌词到页面

      // 上传到服务器保存（转为LRC格式保存）
      const lrcText = this.parsedLyrics.map(line => {
        const min = Math.floor(line.time / 60);
        const sec = Math.floor(line.time % 60);
        const ms = Math.floor((line.time % 1) * 1000);
        return `[${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}]${line.text}`;
      }).join('\n');

      await fetch(`/api/songs/${this.currentSongId}/lyrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lyrics: lrcText })
      });

      // 更新歌曲数据（标记这首歌有歌词了）
      const song = this.player.songs.find(s => s.id === this.currentSongId);
      if (song) {
        song.has_lyrics = true; // 标记有歌词
        this.player.renderList(document.getElementById('searchInput').value); // 刷新歌曲列表
      }
    } catch (err) {
      console.error('上传歌词失败:', err);
    }

    this.input.value = ''; // 清空文件选择框
  }

  // 显示/隐藏歌词面板（切换）
  toggle() {
    this.panel.classList.toggle('visible'); // 切换显示/隐藏
    // 如果面板显示了，且正在播放歌曲，加载歌词
    if (this.panel.classList.contains('visible') && this.player.currentIndex >= 0) {
      const song = this.player.songs[this.player.currentIndex]; // 获取当前歌曲
      if (song && (!this.parsedLyrics.length || this.currentSongId !== song.id)) {
        this.loadLyrics(song.id); // 加载歌词
      }
    }
  }

  // 显示歌词面板
  show() {
    this.panel.classList.add('visible');
  }

  // 隐藏歌词面板
  hide() {
    this.panel.classList.remove('visible');
  }
}