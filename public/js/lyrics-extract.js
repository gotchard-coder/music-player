// =====================================================================
// 文件：lyrics-extract.js
// 职责：从音频文件中提取内嵌的歌词（ID3标签）
// 这个文件负责解析MP3等音频文件的元数据，提取其中嵌入的歌词
// =====================================================================

// 已实现的功能：
// 1. 解析ID3v2标签（MP3文件的元数据格式）
// 2. 提取USLT帧（非同步歌词）
// 3. 提取SYLT帧（同步歌词，带时间戳）
// 4. 支持MP3格式的歌词提取
//
// 与其他文件的关系：
// - 被 upload.js 调用：上传歌曲时自动提取歌词
// - 被 lyrics.js 使用：解析提取到的歌词
//
// 技术说明：
// - ID3v2是MP3文件存储元数据的标准格式
// - 文件开头的标签包含歌曲名、歌手、专辑、歌词等信息
// - USLT = Unsynchronized Lyrics（非同步歌词）
// - SYLT = Synchronized Lyrics（同步歌词，每行有时间戳）
// =====================================================================

// 歌词提取器类
class LyricsExtractor {

  // 从ArrayBuffer（二进制数据）中提取ID3v2嵌入的歌词
  static extractFromBuffer(buffer) {
    const view = new Uint8Array(buffer); // 将buffer转为字节数组，方便逐字节读取

    // ========== 第1步：检查是否是ID3v2格式 ==========
    // ID3v2标签以 "ID3" 三个字符开头（十六进制：0x49 0x44 0x53）
    if (view[0] !== 0x49 || view[1] !== 0x44 || view[2] !== 0x53) {
      return null; // 不是ID3v2格式，返回null
    }

    // ========== 第2步：读取ID3v2头部信息 ==========
    const version = view[3]; // 版本号：3=ID3v2.3，4=ID3v2.4
    // 计算标签总大小（4字节，使用特殊的同步整数编码）
    // 每个字节只用7位，需要移位组合
    const size = (view[6] << 21) | (view[7] << 14) | (view[8] << 7) | view[9];
    let offset = 10; // 从第10字节开始（跳过10字节的头部）

    // ========== 第3步：跳过扩展头（如果有的话） ==========
    // 第10字节的第6位表示是否有扩展头
    if (view[10] & 0x40) {
      // 扩展头大小在第14-17字节
      const extSize = (view[14] << 24) | (view[15] << 16) | (view[16] << 8) | view[17];
      offset += extSize; // 跳过扩展头
    }

    // ========== 第4步：遍历所有帧，寻找歌词帧 ==========
    while (offset < size + 10) {
      if (view[offset] === 0) break; // 遇到空字节，说明没有更多帧了

      // 读取帧ID（4个字符，如"USLT"、"SYLT"、"TIT2"等）
      const frameId = String.fromCharCode(view[offset], view[offset+1], view[offset+2], view[offset+3]);

      // 读取帧大小（4字节）
      let frameSize;
      if (version === 4) {
        // ID3v2.4使用同步整数编码
        frameSize = (view[offset+4] << 21) | (view[offset+5] << 14) | (view[offset+6] << 7) | view[offset+7];
      } else {
        // ID3v2.3使用普通大端整数
        frameSize = (view[offset+4] << 24) | (view[offset+5] << 16) | (view[offset+6] << 8) | view[offset+7];
      }

      // 安全检查：帧大小不能为负数或过大（超过100KB）
      if (frameSize <= 0 || frameSize > 1024 * 100) break;

      // ========== 第5步：处理USLT帧（非同步歌词） ==========
      if (frameId === 'USLT') {
        const dataStart = offset + 10; // 帧数据从offset+10开始（跳过10字节的帧头）
        // 跳过：语言代码(3字节) + 描述(以00结尾) + 编码标志(1字节)
        let pos = dataStart + 3; // 跳过3字节语言代码
        while (pos < dataStart + frameSize && view[pos] !== 0) pos++; // 跳过描述字符串
        pos++; // 跳过null终止符
        pos++; // 跳过内容描述的null终止符

        // 提取歌词文本
        const lyricsBytes = view.slice(pos, offset + 10 + frameSize); // 切片出歌词部分
        const decoder = new TextDecoder('utf-8'); // 用UTF-8解码
        const lyrics = decoder.decode(lyricsBytes).trim(); // 解码并去除首尾空格
        if (lyrics) return lyrics; // 找到歌词就返回
      }

      // ========== 第6步：处理SYLT帧（同步歌词，带时间戳） ==========
      if (frameId === 'SYLT') {
        const dataStart = offset + 10;
        let pos = dataStart + 3; // 跳过3字节语言代码
        pos++; // 跳过内容描述类型
        while (pos < dataStart + frameSize && view[pos] !== 0) pos++; // 跳过描述
        pos++; // 跳过null终止符

        // 读取时间戳格式（1字节）
        const timestampFormat = view[pos];
        pos++;

        // 解析同步歌词：每行格式为 [文本\0 时间戳(4字节)]
        const result = [];
        while (pos < offset + 10 + frameSize - 4) {
          // 读取文本（以null结尾）
          let text = '';
          while (pos < offset + 10 + frameSize && view[pos] !== 0) {
            text += String.fromCharCode(view[pos]);
            pos++;
          }
          pos++; // 跳过null终止符

          // 读取时间戳（4字节，毫秒）
          if (pos + 4 > offset + 10 + frameSize) break;
          const timeMs = (view[pos] << 24) | (view[pos+1] << 16) | (view[pos+2] << 8) | view[pos+3];
          pos += 4;

          // 将毫秒转换为LRC格式的时间戳 [mm:ss.ms]
          if (text.trim()) {
            const sec = timeMs / 1000; // 总秒数
            const min = Math.floor(sec / 60); // 分钟
            const s = Math.floor(sec % 60); // 秒
            const ms = Math.floor((sec % 1) * 100); // 毫秒（取前两位）
            const mm = String(min).padStart(2, '0'); // 补零到2位
            const ss = String(s).padStart(2, '0');
            const mmm = String(ms).padStart(2, '0');
            result.push(`[${mm}:${ss}.${mmm}]${text}`); // 格式化为LRC格式
          }
        }

        if (result.length > 0) return result.join('\n'); // 返回LRC格式的歌词
      }

      // 移动到下一个帧
      offset += 10 + frameSize;
    }

    return null; // 没有找到歌词
  }

  // 从文件读取并提取歌词
  static async extractFromFile(file) {
    // 只处理常见音频格式
    const ext = file.name.split('.').pop().toLowerCase(); // 获取文件扩展名
    if (!['mp3', 'flac', 'ogg', 'm4a', 'aac', 'wav'].includes(ext)) {
      return null; // 不支持的格式，返回null
    }

    // MP3文件用ID3解析
    if (ext === 'mp3') {
      // 只读取前512KB，足够覆盖ID3标签（标签通常在文件开头）
      const slice = file.slice(0, 512 * 1024); // 切片出前512KB
      const buffer = await slice.arrayBuffer(); // 转为ArrayBuffer
      return this.extractFromBuffer(buffer); // 调用上面的方法提取歌词
    }

    return null; // 其他格式暂不支持
  }
}