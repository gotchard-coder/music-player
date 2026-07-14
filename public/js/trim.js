// 文件：trim.js
// 职责：音频剪辑功能 — 让用户裁剪歌曲的任意片段

class AudioTrimmer {
  constructor() {
    this.modal = document.getElementById('trimModal');
    this.canvas = document.getElementById('trimCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.selection = document.getElementById('trimSelection');
    this.handleLeft = document.getElementById('trimHandleLeft');
    this.handleRight = document.getElementById('trimHandleRight');
    this.startInput = document.getElementById('trimStart');
    this.endInput = document.getElementById('trimEnd');
    this.durationInput = document.getElementById('trimDuration');
    this.playPauseBtn = document.getElementById('trimPlayPause');
    this.saveBtn = document.getElementById('trimSave');
    this.statusEl = document.getElementById('trimStatus');
    this.songNameEl = document.getElementById('trimSongName');

    this.audioContext = null;
    this.audioBuffer = null;
    this.sourceNode = null;
    this.currentSong = null;
    this.isPlaying = false;

    // 选区状态（百分比 0-1）
    this.selectStart = 0;
    this.selectEnd = 1;
    this.isDragging = false;
    this.dragTarget = null;

    this.init();
  }

  init() {
    // 关闭按钮
    document.getElementById('trimClose').addEventListener('click', () => this.close());

    // 点击遮罩关闭
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    // 拖动选区
    this.handleLeft.addEventListener('mousedown', (e) => this.startDrag(e, 'left'));
    this.handleRight.addEventListener('mousedown', (e) => this.startDrag(e, 'right'));
    this.selection.addEventListener('mousedown', (e) => {
      if (e.target === this.selection) this.startDrag(e, 'body');
    });
    document.addEventListener('mousemove', (e) => this.onDrag(e));
    document.addEventListener('mouseup', () => this.stopDrag());

    // 触摸支持
    this.handleLeft.addEventListener('touchstart', (e) => this.startDrag(e, 'left'));
    this.handleRight.addEventListener('touchstart', (e) => this.startDrag(e, 'right'));
    this.selection.addEventListener('touchstart', (e) => {
      if (e.target === this.selection) this.startDrag(e, 'body');
    });
    document.addEventListener('touchmove', (e) => this.onDrag(e));
    document.addEventListener('touchend', () => this.stopDrag());

    // 播放/暂停按钮
    this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
    // 保存按钮
    this.saveBtn.addEventListener('click', () => this.save());
  }

  // 打开剪辑面板
  async open(song) {
    this.currentSong = song;
    this.songNameEl.textContent = '剪辑：' + song.title;
    this.modal.classList.add('visible');
    this.statusEl.textContent = '加载音频中...';
    this.stopPlayback();

    try {
      // 初始化 AudioContext
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      // 获取音频数据
      const res = await fetch(`/api/stream/${song.id}`);
      const arrayBuffer = await res.arrayBuffer();
      this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      // 绘制波形
      this.drawWaveform();

      // 重置选区为全部
      this.selectStart = 0;
      this.selectEnd = 1;
      this.updateSelection();
      this.updatePlayPauseBtn();
      this.statusEl.textContent = '拖动白色区域选择保留的片段';
    } catch (err) {
      this.statusEl.textContent = '加载失败：' + err.message;
    }
  }

  // 关闭剪辑面板
  close() {
    this.stopPlayback();
    this.modal.classList.remove('visible');
    this.audioBuffer = null;
    this.currentSong = null;
    this.isPlaying = false;
    this.updatePlayPauseBtn();
  }

  // 绘制波形
  drawWaveform() {
    const buffer = this.audioBuffer;
    if (!buffer) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / width);

    this.ctx.clearRect(0, 0, width, height);
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(0, 0, width, height);

    this.ctx.beginPath();
    this.ctx.strokeStyle = '#4ecdc4';
    this.ctx.lineWidth = 1;

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[(i * step) + j] || 0;
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      const yMin = (1 + min) * height / 2;
      const yMax = (1 + max) * height / 2;
      this.ctx.moveTo(i, yMin);
      this.ctx.lineTo(i, yMax);
    }
    this.ctx.stroke();
  }

  // 更新选区显示
  updateSelection() {
    const left = this.selectStart * 100;
    const width = (this.selectEnd - this.selectStart) * 100;
    this.selection.style.left = left + '%';
    this.selection.style.width = width + '%';

    const duration = this.audioBuffer.duration;
    const startTime = this.selectStart * duration;
    const endTime = this.selectEnd * duration;
    this.startInput.value = this.formatTime(startTime);
    this.endInput.value = this.formatTime(endTime);
    this.durationInput.value = this.formatTime(endTime - startTime);
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}.${secs.toFixed(1).padStart(4, '0')}`;
  }

  // 拖动处理
  startDrag(e, target) {
    e.preventDefault();
    this.isDragging = true;
    this.dragTarget = target;
    this.dragStartX = e.clientX || e.touches[0].clientX;
    this.dragStartSelectStart = this.selectStart;
    this.dragStartSelectEnd = this.selectEnd;
  }

  onDrag(e) {
    if (!this.isDragging) return;
    e.preventDefault();

    const clientX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX);
    if (clientX === undefined) return;

    const rect = this.canvas.getBoundingClientRect();
    const delta = (clientX - this.dragStartX) / rect.width;

    if (this.dragTarget === 'left') {
      this.selectStart = Math.max(0, Math.min(this.selectEnd - 0.01, this.dragStartSelectStart + delta));
    } else if (this.dragTarget === 'right') {
      this.selectEnd = Math.min(1, Math.max(this.selectStart + 0.01, this.dragStartSelectEnd + delta));
    } else if (this.dragTarget === 'body') {
      const range = this.dragStartSelectEnd - this.dragStartSelectStart;
      let newStart = this.dragStartSelectStart + delta;
      if (newStart < 0) newStart = 0;
      if (newStart + range > 1) newStart = 1 - range;
      this.selectStart = newStart;
      this.selectEnd = newStart + range;
    }

    this.updateSelection();
  }

  stopDrag() {
    this.isDragging = false;
    this.dragTarget = null;
  }

  // 切换播放/暂停
  togglePlayPause() {
    if (this.isPlaying) {
      this.stopPlayback();
    } else {
      this.preview();
    }
  }

  // 更新播放/暂停按钮图标
  updatePlayPauseBtn() {
    this.playPauseBtn.textContent = this.isPlaying ? '⏸' : '▶';
  }

  // 预览选区
  preview() {
    this.stopPlayback();
    if (!this.audioBuffer || !this.audioContext) return;

    const startTime = this.selectStart * this.audioBuffer.duration;
    const endTime = this.selectEnd * this.audioBuffer.duration;
    const duration = endTime - startTime;

    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.start(0, startTime, duration);
    this.sourceNode.connect(this.audioContext.destination);

    this.isPlaying = true;
    this.updatePlayPauseBtn();

    this.sourceNode.onended = () => {
      this.sourceNode = null;
      this.isPlaying = false;
      this.updatePlayPauseBtn();
    };
  }

  // 停止播放
  stopPlayback() {
    if (this.sourceNode) {
      try { this.sourceNode.stop(); } catch (e) {}
      this.sourceNode = null;
    }
    this.isPlaying = false;
    this.updatePlayPauseBtn();
  }

  // 保存剪辑结果
  async save() {
    if (!this.audioBuffer || !this.currentSong) return;
    this.stopPlayback();
    this.statusEl.textContent = '处理中...';
    this.saveBtn.disabled = true;

    try {
      const startTime = Math.floor(this.selectStart * this.audioBuffer.duration * this.audioBuffer.sampleRate);
      const endTime = Math.floor(this.selectEnd * this.audioBuffer.duration * this.audioBuffer.sampleRate);
      const length = endTime - startTime;

      const newBuffer = this.audioContext.createBuffer(
        this.audioBuffer.numberOfChannels,
        length,
        this.audioBuffer.sampleRate
      );

      for (let ch = 0; ch < this.audioBuffer.numberOfChannels; ch++) {
        const oldData = this.audioBuffer.getChannelData(ch);
        const newData = newBuffer.getChannelData(ch);
        for (let i = 0; i < length; i++) {
          newData[i] = oldData[startTime + i];
        }
      }

      this.statusEl.textContent = '编码为 WAV...';
      const wavBlob = this.audioBufferToWav(newBuffer);

      this.statusEl.textContent = '上传到服务器...';
      const formData = new FormData();
      formData.append('file', wavBlob, this.currentSong.filename);

      const uploadRes = await fetch(`/api/songs/${this.currentSong.id}/replace`, {
        method: 'POST',
        body: formData
      });

      if (uploadRes.ok) {
        this.statusEl.textContent = '保存成功！';
        setTimeout(() => this.close(), 1000);
        if (window.player) {
          await window.player.loadAllSongs();
        }
      } else {
        const err = await uploadRes.json();
        this.statusEl.textContent = '保存失败：' + (err.error || '未知错误');
      }
    } catch (err) {
      this.statusEl.textContent = '处理失败：' + err.message;
    }

    this.saveBtn.disabled = false;
  }

  // AudioBuffer 转 WAV Blob
  audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1;
    const bitDepth = 16;

    let length = buffer.length * numChannels * 2 + 44;
    const output = new ArrayBuffer(length);
    const view = new DataView(output);

    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, length - 8, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, bitDepth, true);
    this.writeString(view, 36, 'data');
    view.setUint32(40, length - 44, true);

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return new Blob([output], { type: 'audio/wav' });
  }

  writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
}

// 全局实例
window.audioTrimmer = null;
document.addEventListener('DOMContentLoaded', () => {
  window.audioTrimmer = new AudioTrimmer();
});
