// ID3 歌词提取器
class LyricsExtractor {
  // 从 ArrayBuffer 中提取 ID3v2 嵌入歌词
  static extractFromBuffer(buffer) {
    const view = new Uint8Array(buffer);

    // 检查 ID3v2 头
    if (view[0] !== 0x49 || view[1] !== 0x44 || view[2] !== 0x53) {
      return null; // 不是 ID3v2
    }

    const version = view[3]; // 3 = ID3v2.3, 4 = ID3v2.4
    const size = (view[6] << 21) | (view[7] << 14) | (view[8] << 7) | view[9];
    let offset = 10;

    // 跳过扩展头
    if (view[10] & 0x40) {
      const extSize = (view[14] << 24) | (view[15] << 16) | (view[16] << 8) | view[17];
      offset += extSize;
    }

    while (offset < size + 10) {
      if (view[offset] === 0) break;

      const frameId = String.fromCharCode(view[offset], view[offset+1], view[offset+2], view[offset+3]);
      let frameSize;
      if (version === 4) {
        frameSize = (view[offset+4] << 21) | (view[offset+5] << 14) | (view[offset+6] << 7) | view[offset+7];
      } else {
        frameSize = (view[offset+4] << 24) | (view[offset+5] << 16) | (view[offset+6] << 8) | view[offset+7];
      }

      if (frameSize <= 0 || frameSize > 1024 * 100) break;

      // USLT = 歌词帧
      if (frameId === 'USLT') {
        const dataStart = offset + 10;
        // 跳过语言(3字节) + 描述(以00结尾) + 编码
        let pos = dataStart + 3;
        while (pos < dataStart + frameSize && view[pos] !== 0) pos++;
        pos++; // 跳过 null
        pos++; // 跳过 content descriptor null

        const lyricsBytes = view.slice(pos, offset + 10 + frameSize);
        const decoder = new TextDecoder('utf-8');
        const lyrics = decoder.decode(lyricsBytes).trim();
        if (lyrics) return lyrics;
      }

      // SYLT = 同步歌词帧
      if (frameId === 'SYLT') {
        const dataStart = offset + 10;
        let pos = dataStart + 3; // 跳过语言
        pos++; // content descriptor type
        while (pos < dataStart + frameSize && view[pos] !== 0) pos++;
        pos++; // 跳过 null

        // 检查时间戳格式
        const timestampFormat = view[pos];
        pos++;

        // 解析同步歌词
        const result = [];
        while (pos < offset + 10 + frameSize - 4) {
          let text = '';
          while (pos < offset + 10 + frameSize && view[pos] !== 0) {
            text += String.fromCharCode(view[pos]);
            pos++;
          }
          pos++; // null

          if (pos + 4 > offset + 10 + frameSize) break;
          const timeMs = (view[pos] << 24) | (view[pos+1] << 16) | (view[pos+2] << 8) | view[pos+3];
          pos += 4;

          if (text.trim()) {
            const sec = timeMs / 1000;
            const min = Math.floor(sec / 60);
            const s = Math.floor(sec % 60);
            const ms = Math.floor((sec % 1) * 100);
            const mm = String(min).padStart(2, '0');
            const ss = String(s).padStart(2, '0');
            const mmm = String(ms).padStart(2, '0');
            result.push(`[${mm}:${ss}.${mmm}]${text}`);
          }
        }

        if (result.length > 0) return result.join('\n');
      }

      offset += 10 + frameSize;
    }

    return null;
  }

  // 从文件读取
  static async extractFromFile(file) {
    // 只处理常见音频格式
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['mp3', 'flac', 'ogg', 'm4a', 'aac', 'wav'].includes(ext)) {
      return null;
    }

    // MP3 用 ID3 解析
    if (ext === 'mp3') {
      // 读取前 512KB 足够覆盖 ID3 标签
      const slice = file.slice(0, 512 * 1024);
      const buffer = await slice.arrayBuffer();
      return this.extractFromBuffer(buffer);
    }

    return null;
  }
}
