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
    this.cursor = document.getElementById('trimCursor');
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
    this.cursorPos = 0; // 光标位置 0-1
    this.animFrame = null;

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
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    // ===== 鼠标事件 =====
    this.handleLeft.addEventListener('mousedown', (e) => { e.stopPropagation(); this.startDrag(e, 'left'); });
    this.handleRight.addEventListener('mousedown', (e) => { e.stopPropagation(); this.startDrag(e, 'right'); });
    this.selection.addEventListener('mousedown', (e) => {
      if (e.target === this.selection) { e.stopPropagation(); this.startDrag(e, 'body'); }
    });

    // 光标拖动
    this.cursor.addEventListener('mousedown', (e) => { e.stopPropagation(); this.startDrag(e, 'cursor'); });

    // 点击波形移动光标
    this.canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.setCursorFromMouse(e);
      this.startDrag(e, 'cursor');
    });

    document.addEventListener('mousemove', (e) => this.onDrag(e));
    document.addEventListener('mouseup', () => this.stopDrag());

    // ===== 触摸事件 =====
    this.handleLeft.addEventListener('touchstart', (e) => { e.stopPropagation(); this.startDrag(e, 'left'); }, { passive: false });
    this.handleRight.addEventListener('touchstart', (e) => { e.stopPropagation(); this.startDrag(e, 'right'); }, { passive: false });
    this.selection.addEventListener('touchstart', (e) => {
      if (e.target === this.selection) { e.stopPropagation(); this.startDrag(e, 'body'); }
    }, { passive: false });
    this.cursor.addEventListener('touchstart', (e) => { e.stopPropagation(); this.startDrag(e, 'cursor'); }, { passive: false });
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.setCursorFromTouch(e);
      this.startDrag(e, 'cursor');
    }, { passive: false });

    document.addEventListener('touchmove', (e) => this.onDrag(e), { passive: false });
    document.addEventListener('touchend', () => this.stopDrag());

    // 按钮
    this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
    this.saveBtn.addEventListener('click', () => this.save());
  }

  // 把光标限制在选区内
  clampCursor(pos) {
    return Math.max(this.selectStart, Math.min(this.selectEnd, pos));
  }

  // 打开剪辑面板
  async open(song) {
    this.currentSong = song;
    this.songNameEl.textContent = '剪辑：' + song.title;
    this.modal.classList.add('visible');
    this.statusEl.textContent = '加载音频中...';
    this.stopPlayback();

    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      const res = await fetch(`/api/stream/${song.id}`);
      const arrayBuffer = await res.arrayBuffer();
      this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      this.drawWaveform();
      this.selectStart = 0;
      this.selectEnd = 1;
      this.cursorPos = 0;
      this.updateSelection();
      this.updateCursor();
      this.updatePlayPauseBtn();
      this.statusEl.textContent = '点击波形设置光标位置，点播放从光标处开始';
    } catch (err) {
      this.statusEl.textContent = '加载失败：' + err.message;
    }
  }

  close() {
    this.stopPlayback();
    this.modal.classList.remove('visible');
    this.audioBuffer = null;
    this.currentSong = null;
    this.isPlaying = false;
    this.updatePlayPauseBtn();
  }

  // ===== 波形绘制 =====
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
      let min = 1.0, max = -1.0;
      for (let j = 0; j < step; j++) {
        const d = data[(i * step) + j] || 0;
        if (d < min) min = d;
        if (d > max) max = d;
      }
      this.ctx.moveTo(i, (1 + min) * height / 2);
      this.ctx.lineTo(i, (1 + max) * height / 2);
    }
    this.ctx.stroke();
  }

  // ===== 选区 =====
  updateSelection() {
    this.selection.style.left = (this.selectStart * 100) + '%';
    this.selection.style.width = ((this.selectEnd - this.selectStart) * 100) + '%';
    const dur = this.audioBuffer.duration;
    this.startInput.value = this.formatTime(this.selectStart * dur);
    this.endInput.value = this.formatTime(this.selectEnd * dur);
    this.durationInput.value = this.formatTime((this.selectEnd - this.selectStart) * dur);
  }

  // ===== 光标 =====
  updateCursor() {
    this.cursor.style.left = (this.cursorPos * 100) + '%';
  }

  setCursorFromMouse(e) {
    const rect = this.canvas.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    this.cursorPos = this.clampCursor(pos);
    this.updateCursor();
  }

  setCursorFromTouch(e) {
    const rect = this.canvas.getBoundingClientRect();
    const pos = (e.touches[0].clientX - rect.left) / rect.width;
    this.cursorPos = this.clampCursor(pos);
    this.updateCursor();
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}.${secs.toFixed(1).padStart(4, '0')}`;
  }

  // ===== 拖动 =====
  startDrag(e, target) {
    e.preventDefault();
    // 拖动光标时，如果正在播放就暂停
    if (target === 'cursor' && this.isPlaying) {
      this.pause();
    }
    this.isDragging = true;
    this.dragTarget = target;
    this.dragStartX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX);
    this.dragStartSelectStart = this.selectStart;
    this.dragStartSelectEnd = this.selectEnd;
    this.dragStartCursorPos = this.cursorPos;
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
      // 光标不能超出新选区
      this.cursorPos = this.clampCursor(this.cursorPos);
      this.updateCursor();
    } else if (this.dragTarget === 'right') {
      this.selectEnd = Math.min(1, Math.max(this.selectStart + 0.01, this.dragStartSelectEnd + delta));
      this.cursorPos = this.clampCursor(this.cursorPos);
      this.updateCursor();
    } else if (this.dragTarget === 'body') {
      const range = this.dragStartSelectEnd - this.dragStartSelectStart;
      let s = this.dragStartSelectStart + delta;
      if (s < 0) s = 0;
      if (s + range > 1) s = 1 - range;
      this.selectStart = s;
      this.selectEnd = s + range;
      this.cursorPos = this.clampCursor(this.cursorPos);
      this.updateCursor();
    } else if (this.dragTarget === 'cursor') {
      const newPos = this.dragStartCursorPos + delta;
      this.cursorPos = this.clampCursor(newPos);
      this.updateCursor();
      this.pauseTime = this.cursorPos * this.audioBuffer.duration;
      return;
    }
    this.updateSelection();
  }

  stopDrag() {
    this.isDragging = false;
    this.dragTarget = null;
  }

  // ===== 播放控制 =====
  togglePlayPause() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  updatePlayPauseBtn() {
    this.playPauseBtn.textContent = this.isPlaying ? '⏸' : '▶';
  }

  // 从光标位置开始播放
  play() {
    if (!this.audioBuffer || !this.audioContext) return;

    // 恢复暂停状态
    if (this.pauseTime !== undefined) {
      const dur = this.audioBuffer.duration;
      const startPos = this.clampCursor(this.pauseTime / dur) * dur;
      const endPos = this.selectEnd * dur;
      if (startPos >= endPos) {
        // 光标在选区末尾，从头开始
        return this.playFrom(this.selectStart * dur);
      }
      return this.playFrom(startPos);
    }

    // 从光标位置开始
    this.playFrom(this.cursorPos * this.audioBuffer.duration);
  }

  playFrom(startPos) {
    const dur = this.audioBuffer.duration;
    const endPos = this.selectEnd * dur;
    const playDuration = endPos - startPos;

    if (playDuration <= 0) return;

    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.start(0, startPos, playDuration);
    this.sourceNode.connect(this.audioContext.destination);

    this.playStartTime = this.audioContext.currentTime;
    this.playStartPos = startPos;
    this.playDuration = playDuration;
    this.isPlaying = true;
    this.updatePlayPauseBtn();
    this.animateCursor();

    this.sourceNode.onended = () => this.onPlayEnd();
    delete this.pauseTime;
  }

  // 暂停
  pause() {
    if (this.sourceNode) {
      try { this.sourceNode.stop(); } catch (e) {}
      this.sourceNode = null;
    }
    const elapsed = this.audioContext.currentTime - this.playStartTime;
    this.pauseTime = this.playStartPos + elapsed;
    this.cursorPos = this.clampCursor(this.pauseTime / this.audioBuffer.duration);
    this.updateCursor();

    this.isPlaying = false;
    cancelAnimationFrame(this.animFrame);
    this.updatePlayPauseBtn();
  }

  onPlayEnd() {
    this.sourceNode = null;
    this.isPlaying = false;
    // 光标停在选区末尾
    this.cursorPos = this.selectEnd;
    this.updateCursor();
    delete this.pauseTime;
    cancelAnimationFrame(this.animFrame);
    this.updatePlayPauseBtn();
  }

  stopPlayback() {
    if (this.sourceNode) {
      try { this.sourceNode.stop(); } catch (e) {}
      this.sourceNode = null;
    }
    this.isPlaying = false;
    delete this.pauseTime;
    cancelAnimationFrame(this.animFrame);
    this.updatePlayPauseBtn();
  }

  // 光标跟随播放（限制在选区内）
  animateCursor() {
    if (!this.isPlaying) return;
    const elapsed = this.audioContext.currentTime - this.playStartTime;
    const progress = elapsed / this.playDuration;
    if (progress >= 1) return;
    const rawPos = this.playStartPos / this.audioBuffer.duration + progress * (this.playDuration / this.audioBuffer.duration);
    this.cursorPos = this.clampCursor(rawPos);
    this.updateCursor();
    this.animFrame = requestAnimationFrame(() => this.animateCursor());
  }

  // ===== 保存 =====
  async save() {
    if (!this.audioBuffer || !this.currentSong) return;
    this.stopPlayback();
    this.statusEl.textContent = '处理中...';
    this.saveBtn.disabled = true;

    try {
      const sr = this.audioBuffer.sampleRate;
      const startSample = Math.floor(this.selectStart * this.audioBuffer.duration * sr);
      const endSample = Math.floor(this.selectEnd * this.audioBuffer.duration * sr);
      const length = endSample - startSample;

      const newBuffer = this.audioContext.createBuffer(this.audioBuffer.numberOfChannels, length, sr);
      for (let ch = 0; ch < this.audioBuffer.numberOfChannels; ch++) {
        const old = this.audioBuffer.getChannelData(ch);
        const nw = newBuffer.getChannelData(ch);
        for (let i = 0; i < length; i++) nw[i] = old[startSample + i];
      }

      this.statusEl.textContent = '编码中...';
      const wavBlob = this.audioBufferToWav(newBuffer);

      this.statusEl.textContent = '上传中...';
      const formData = new FormData();
      formData.append('file', wavBlob, this.currentSong.filename);

      const res = await fetch(`/api/songs/${this.currentSong.id}/replace`, { method: 'POST', body: formData });

      if (res.ok) {
        this.statusEl.textContent = '保存成功！';
        setTimeout(() => this.close(), 1000);
        if (window.player) await window.player.loadAllSongs();
      } else {
        const err = await res.json();
        this.statusEl.textContent = '保存失败：' + (err.error || '未知错误');
      }
    } catch (err) {
      this.statusEl.textContent = '处理失败：' + err.message;
    }
    this.saveBtn.disabled = false;
  }

  // AudioBuffer 转 WAV
  audioBufferToWav(buffer) {
    const numCh = buffer.numberOfChannels;
    const sr = buffer.sampleRate;
    const len = buffer.length * numCh * 2 + 44;
    const out = new ArrayBuffer(len);
    const v = new DataView(out);

    const w = (p, s) => { for (let i = 0; i < s.length; i++) v.setUint8(p + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, len - 8, true); w(8, 'WAVE');
    w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, numCh, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * numCh * 2, true); v.setUint16(32, numCh * 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, len - 44, true);

    let off = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numCh; ch++) {
        const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
        v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        off += 2;
      }
    }
    return new Blob([out], { type: 'audio/wav' });
  }
}

window.audioTrimmer = null;
document.addEventListener('DOMContentLoaded', () => {
  window.audioTrimmer = new AudioTrimmer();
});
