// =====================================================================
// 文件：upload.js
// 职责：处理音乐文件的上传功能
// 这个文件负责让用户选择音频文件，上传到服务器，并显示上传进度
// =====================================================================

// 已实现的功能：
// 1. 点击"上传"按钮选择文件
// 2. 支持同时上传多个文件
// 3. 显示上传进度条和状态
// 4. 自动提取音频文件内嵌的歌词
// 5. 上传完成后刷新歌曲列表
//
// 与其他文件的关系：
// - 依赖 player.js：上传完成后调用 player.setSongs() 更新歌曲列表
// - 依赖 lyrics-extract.js：调用 LyricsExtractor.extractFromFile() 提取歌词
// - 被 app.js 创建和初始化
// =====================================================================

// 上传管理器类
class UploadManager {
  // 构造函数：初始化上传管理器
  constructor(player) {
    this.player = player;           // 保存播放器实例的引用，上传完成后需要更新歌曲列表
    this.onUploadComplete = null;   // 上传完成后的回调函数（由app.js设置）
    this.initElements();            // 获取页面上的DOM元素
    this.initEvents();              // 绑定事件监听器
  }

  // 获取页面上的DOM元素
  initElements() {
    this.uploadBtn = document.getElementById('uploadBtn');         // 上传按钮（侧边栏的"+ 上传"）
    this.fileInput = document.getElementById('fileInput');         // 隐藏的文件选择框（点击上传按钮时触发）
    this.uploadModal = document.getElementById('uploadModal');     // 上传进度弹窗（显示进度条）
    this.uploadProgress = document.getElementById('uploadProgress'); // 进度条填充部分
    this.uploadStatus = document.getElementById('uploadStatus');   // 上传状态文字（如"正在上传 3/5"）
  }

  // 绑定事件监听器
  initEvents() {
    // 点击上传按钮 → 触发隐藏的文件选择框
    this.uploadBtn.addEventListener('click', () => this.fileInput.click());

    // 用户选择文件后 → 开始上传
    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) { // 如果选择了文件
        this.uploadFiles(e.target.files); // 调用上传方法
      }
    });
  }

  // 获取音频文件的时长
  // 原理：创建一个临时的Audio对象，加载文件，读取duration属性
  getAudioDuration(file) {
    return new Promise((resolve) => { // 返回一个Promise，异步获取时长
      const audio = new Audio(); // 创建临时音频对象
      const url = URL.createObjectURL(file); // 创建文件的临时URL
      audio.src = url; // 设置音频源

      // 加载完成后获取时长
      audio.addEventListener('loadedmetadata', () => {
        const dur = audio.duration; // 获取时长（秒）
        URL.revokeObjectURL(url); // 释放临时URL，节省内存
        resolve(isFinite(dur) ? dur : 0); // 如果时长有效就返回，否则返回0
      });

      // 加载出错时返回0
      audio.addEventListener('error', () => {
        URL.revokeObjectURL(url); // 释放临时URL
        resolve(0); // 返回0表示获取失败
      });
    });
  }

  // 上传文件到服务器
  async uploadFiles(files) {
    const formData = new FormData(); // 创建表单数据对象，用于上传文件
    const fileMap = []; // 记录文件顺序，用于后续提取歌词

    // 遍历所有文件，获取时长并添加到formData
    for (let i = 0; i < files.length; i++) {
      const duration = await this.getAudioDuration(files[i]); // 获取文件时长
      formData.append('music', files[i]); // 添加文件到formData（字段名'music'）
      formData.append('duration_' + i, duration); // 添加时长（字段名'duration_0', 'duration_1'等）
      fileMap.push(files[i]); // 记录文件顺序
    }

    // 显示上传弹窗和进度条
    this.uploadModal.classList.add('active'); // 显示弹窗
    this.uploadProgress.style.width = '0%'; // 进度条从0%开始
    this.uploadStatus.textContent = `正在上传 ${files.length} 个文件...`; // 显示上传状态

    try {
      const xhr = new XMLHttpRequest(); // 创建AJAX请求对象

      // 监听上传进度
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) { // 如果可以计算进度
          // 更新进度条宽度（loaded/total * 100%）
          this.uploadProgress.style.width = (e.loaded / e.total) * 100 + '%';
        }
      });

      // 上传完成后的处理
      xhr.addEventListener('load', async () => {
        if (xhr.status === 200) { // 服务器返回200表示成功
          const result = JSON.parse(xhr.responseText); // 解析服务器返回的JSON
          this.uploadStatus.textContent = `上传成功！共 ${result.songs.length} 首`; // 显示成功状态
          this.uploadProgress.style.width = '100%'; // 进度条显示100%

          // 自动提取音频文件内嵌的歌词
          let lyricsCount = 0; // 记录成功提取歌词的数量
          for (let i = 0; i < result.songs.length && i < fileMap.length; i++) {
            try {
              // 调用lyrics-extract.js的extractFromFile方法提取歌词
              const lrc = await LyricsExtractor.extractFromFile(fileMap[i]);
              if (lrc) { // 如果提取到了歌词
                // 把歌词发送到服务器保存
                await fetch(`/api/songs/${result.songs[i].id}/lyrics`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ lyrics: lrc })
                });
                result.songs[i].has_lyrics = true; // 标记这首歌有歌词
                lyricsCount++; // 歌词数量+1
              }
            } catch (e) {} // 提取失败就跳过，不影响上传
          }

          // 延迟500ms后关闭弹窗，让用户看到"上传成功"的提示
          setTimeout(() => {
            this.uploadModal.classList.remove('active'); // 隐藏弹窗
            // 把新上传的歌曲添加到播放器的歌曲列表
            this.player.setSongs([...this.player.songs, ...result.songs]);
            // 如果有歌词被提取，更新状态文字
            if (lyricsCount > 0) {
              this.uploadStatus.textContent = `上传成功！${result.songs.length} 首，自动识别 ${lyricsCount} 首歌词`;
            }
            // 触发上传完成回调（让app.js刷新歌单）
            if (this.onUploadComplete) {
              this.onUploadComplete();
            }
          }, 500); // 延迟500ms
        } else {
          throw new Error('上传失败'); // 服务器返回错误
        }
      });

      // 上传出错（网络错误等）
      xhr.addEventListener('error', () => {
        this.uploadStatus.textContent = '上传出错，请重试';
        setTimeout(() => this.uploadModal.classList.remove('active'), 2000); // 2秒后关闭弹窗
      });

      // 发送上传请求
      xhr.open('POST', '/api/upload'); // POST请求到 /api/upload
      xhr.send(formData); // 发送表单数据

    } catch (err) {
      console.error('上传失败:', err); // 在控制台打印错误
      this.uploadStatus.textContent = '上传失败';
      setTimeout(() => this.uploadModal.classList.remove('active'), 2000); // 2秒后关闭弹窗
    }

    this.fileInput.value = ''; // 清空文件选择框，允许重复选择同一文件
  }
}