// 上传逻辑
class UploadManager {
  constructor(player) {
    this.player = player;
    this.initElements();
    this.initEvents();
  }

  initElements() {
    this.uploadBtn = document.getElementById('uploadBtn');
    this.fileInput = document.getElementById('fileInput');
    this.uploadModal = document.getElementById('uploadModal');
    this.uploadProgress = document.getElementById('uploadProgress');
    this.uploadStatus = document.getElementById('uploadStatus');
  }

  initEvents() {
    this.uploadBtn.addEventListener('click', () => this.fileInput.click());

    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.uploadFiles(e.target.files);
      }
    });
  }

  getAudioDuration(file) {
    return new Promise((resolve) => {
      const audio = new Audio();
      const url = URL.createObjectURL(file);
      audio.src = url;
      audio.addEventListener('loadedmetadata', () => {
        const dur = audio.duration;
        URL.revokeObjectURL(url);
        resolve(isFinite(dur) ? dur : 0);
      });
      audio.addEventListener('error', () => {
        URL.revokeObjectURL(url);
        resolve(0);
      });
    });
  }

  async uploadFiles(files) {
    const formData = new FormData();
    const fileMap = []; // 记录文件顺序

    for (let i = 0; i < files.length; i++) {
      const duration = await this.getAudioDuration(files[i]);
      formData.append('music', files[i]);
      formData.append('duration_' + i, duration);
    }

    this.uploadModal.classList.add('active');
    this.uploadProgress.style.width = '0%';
    this.uploadStatus.textContent = `正在上传 ${files.length} 个文件...`;

    try {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          this.uploadProgress.style.width = (e.loaded / e.total) * 100 + '%';
        }
      });

      xhr.addEventListener('load', async () => {
        if (xhr.status === 200) {
          const result = JSON.parse(xhr.responseText);
          this.uploadStatus.textContent = `上传成功！共 ${result.songs.length} 首`;
          this.uploadProgress.style.width = '100%';

          // 自动提取内嵌歌词
          let lyricsCount = 0;
          for (let i = 0; i < result.songs.length && i < fileMap.length; i++) {
            try {
              const lrc = await LyricsExtractor.extractFromFile(fileMap[i]);
              if (lrc) {
                await fetch(`/api/songs/${result.songs[i].id}/lyrics`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ lyrics: lrc })
                });
                result.songs[i].has_lyrics = true;
                lyricsCount++;
              }
            } catch (e) {}
          }

          setTimeout(() => {
            this.uploadModal.classList.remove('active');
            this.player.setSongs([...this.player.songs, ...result.songs]);
            if (lyricsCount > 0) {
              this.uploadStatus.textContent = `上传成功！${result.songs.length} 首，自动识别 ${lyricsCount} 首歌词`;
            }
          }, 500);
        } else {
          throw new Error('上传失败');
        }
      });

      xhr.addEventListener('error', () => {
        this.uploadStatus.textContent = '上传出错，请重试';
        setTimeout(() => this.uploadModal.classList.remove('active'), 2000);
      });

      xhr.open('POST', '/api/upload');
      xhr.send(formData);

    } catch (err) {
      console.error('上传失败:', err);
      this.uploadStatus.textContent = '上传失败';
      setTimeout(() => this.uploadModal.classList.remove('active'), 2000);
    }

    this.fileInput.value = '';
  }
}
