// =====================================================================
// 文件：server.js
// 职责：后端服务器，处理所有数据请求（Node.js + Express）
// 这个文件是整个应用的"大脑"，负责接收前端请求、读写数据、返回结果
// =====================================================================

// 已实现的功能：
// 1. 歌曲管理：获取、上传、改名、删除
// 2. 歌单管理：获取、创建、重命名、删除、添加/移除歌曲
// 3. 歌词管理：上传、获取、删除
// 4. 音乐播放：流式返回音频文件（支持断点续传）
// 5. 文件上传：使用multer处理音频文件上传
//
// 与其他文件的关系：
// - 被所有前端JS文件调用（通过HTTP请求）
// - 读写 data/ 目录下的JSON文件和音频文件
// =====================================================================

// ==================== 引入依赖 ====================
const express = require('express');   // Web框架，用于创建服务器和处理请求
const multer = require('multer');     // 文件上传中间件，处理音频文件上传
const path = require('path');         // 路径工具，处理文件路径
const fs = require('fs');             // 文件系统，读写文件

// ==================== 工具函数 ====================

// 解码Buffer为UTF-8字符串
// 中文文件名在传输时可能被编码成latin1，需要转回UTF-8
function decodeBuffer(str) {
  if (!str) return str;
  try {
    return Buffer.from(str, 'latin1').toString('utf8');
  } catch (e) {
    return str;
  }
}

// ==================== 创建服务器 ====================
const app = express(); // 创建Express应用
const PORT = 3000;     // 服务器端口号

// ==================== 数据目录配置 ====================
// 定义数据存储的目录路径
const dataDir = path.join(__dirname, 'data');           // 数据根目录
const dbPath = path.join(dataDir, 'songs.json');        // 歌曲数据文件
const playlistsPath = path.join(dataDir, 'playlists.json'); // 歌单数据文件
const uploadDir = path.join(dataDir, 'uploads');        // 上传的音乐文件目录
const lyricsDir = path.join(dataDir, 'lyrics');         // 歌词文件目录

// 如果目录不存在就创建（recursive: true表示自动创建父目录）
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(lyricsDir)) fs.mkdirSync(lyricsDir, { recursive: true });

// ==================== 歌曲数据库操作 ====================

// 读取歌曲数据（从JSON文件）
function loadDB() {
  if (!fs.existsSync(dbPath)) {
    // 文件不存在就创建空数组
    fs.writeFileSync(dbPath, '[]', 'utf8');
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(dbPath, 'utf8')); // 读取并解析JSON
  } catch (e) {
    // JSON解析失败就重置为空数组
    fs.writeFileSync(dbPath, '[]', 'utf8');
    return [];
  }
}

// 保存歌曲数据（写入JSON文件）
function saveDB(data) {
  // JSON.stringify的第三个参数2表示缩进2个空格，方便阅读
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

// 获取下一个歌曲ID（当前最大ID + 1）
function getNextId(songs) {
  return songs.length > 0 ? Math.max(...songs.map(s => s.id)) + 1 : 1;
}

// ==================== 歌单数据库操作 ====================

// 读取歌单数据
function loadPlaylists() {
  if (!fs.existsSync(playlistsPath)) {
    fs.writeFileSync(playlistsPath, '[]', 'utf8');
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(playlistsPath, 'utf8'));
  } catch (e) {
    fs.writeFileSync(playlistsPath, '[]', 'utf8');
    return [];
  }
}

// 保存歌单数据
function savePlaylists(data) {
  fs.writeFileSync(playlistsPath, JSON.stringify(data, null, 2), 'utf8');
}

// 获取下一个歌单ID
function getNextPlaylistId(playlists) {
  return playlists.length > 0 ? Math.max(...playlists.map(p => p.id)) + 1 : 1;
}

// 初始化歌单（程序启动时调用）
// 不再创建默认歌单，让用户自己创建

// ==================== 中间件配置 ====================

// 解析JSON请求体（前端发送JSON时需要）
app.use(express.json());

// 提供静态文件服务（public目录下的HTML/CSS/JS文件）
app.use(express.static(path.join(__dirname, 'public')));

// 提供上传文件的访问（浏览器可以通过 /uploads/文件名 访问音乐文件）
app.use('/uploads', express.static(uploadDir));

// ==================== Multer文件上传配置 ====================

// 配置文件存储位置和文件名
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir), // 存储到uploads目录
  filename: (req, file, cb) => {
    // 文件名：时间戳 + 随机数 + 原始扩展名（避免重名）
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// 配置上传限制
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 最大100MB
  fileFilter: (req, file, cb) => {
    // 只允许音频文件
    const allowedTypes = /mp3|wav|ogg|aac|flac|m4a/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = /audio/.test(file.mimetype);
    if (extname || mimetype) {
      cb(null, true); // 允许上传
    } else {
      cb(new Error('只支持音频文件')); // 拒绝上传
    }
  }
});

// ==================== 歌曲 API ====================

// API: 获取歌曲列表
// GET /api/songs
// 可选参数：playlist_id（歌单ID）、page（页码）、limit（每页数量）
app.get('/api/songs', (req, res) => {
  const songs = loadDB();
  const { playlist_id, page, limit } = req.query;

  // 如果指定了歌单ID，返回该歌单的歌曲
  if (playlist_id) {
    const playlists = loadPlaylists();
    const playlist = playlists.find(p => p.id === parseInt(playlist_id));
    if (!playlist) {
      return res.status(404).json({ error: '歌单不存在' });
    }
    // 根据歌单的song_ids数组，找到对应的歌曲
    const playlistSongs = playlist.song_ids
      .map(id => songs.find(s => s.id === id))
      .filter(Boolean); // 过滤掉undefined（歌曲可能已被删除）

    // 支持分页
    if (page && limit) {
      const p = parseInt(page) || 1;
      const l = parseInt(limit) || 20;
      const start = (p - 1) * l;
      const paged = playlistSongs.slice(start, start + l);
      return res.json({
        songs: paged,
        total: playlistSongs.length,
        page: p,
        limit: l,
        hasMore: start + l < playlistSongs.length
      });
    }
    return res.json(playlistSongs);
  }

  // 按创建时间倒序排列（最新的在前面）
  const sorted = songs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // 支持分页
  if (page && limit) {
    const p = parseInt(page) || 1;
    const l = parseInt(limit) || 20;
    const start = (p - 1) * l;
    const paged = sorted.slice(start, start + l);
    return res.json({
      songs: paged,
      total: sorted.length,
      page: p,
      limit: l,
      hasMore: start + l < sorted.length
    });
  }

  res.json(sorted);
});

// API: 上传音乐文件
// POST /api/upload
// 使用multer处理多个文件上传（最多50个）
app.post('/api/upload', upload.array('music', 50), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: '没有选择文件' });
  }

  const songs = loadDB();
  const results = []; // 保存新上传的歌曲信息

  // 处理每个上传的文件
  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const originalName = decodeBuffer(file.originalname); // 解码文件名
    const title = path.basename(originalName, path.extname(originalName)); // 去掉扩展名作为标题
    const duration = parseFloat(req.body['duration_' + i]) || 0; // 获取时长

    // 创建歌曲对象
    const song = {
      id: getNextId(songs),        // 分配ID
      title,                        // 歌曲标题
      filename: file.filename,      // 存储的文件名
      original_name: originalName,  // 原始文件名
      duration: Math.round(duration), // 时长（秒）
      file_size: file.size,        // 文件大小
      created_at: new Date().toISOString() // 创建时间
    };
    songs.push(song);    // 添加到歌曲列表
    results.push(song);  // 记录到结果
  }

  saveDB(songs); // 保存到JSON文件

  // 自动分配歌曲到歌单（平衡分配：每次添加到歌曲最少的歌单）
  if (results.length > 0) {
    const playlists = loadPlaylists();

    if (playlists.length > 0) {
      // 统计每个歌单的歌曲数量
      const playlistSongCounts = playlists.map(p => ({
        id: p.id,
        count: p.song_ids.length
      }));

      // 按歌曲数量排序（少的在前面）
      playlistSongCounts.sort((a, b) => a.count - b.count);

      // 将新歌曲分配到歌单
      for (const song of results) {
        const targetPlaylist = playlistSongCounts[0]; // 选歌曲最少的歌单
        const playlist = playlists.find(p => p.id === targetPlaylist.id);
        if (playlist) {
          playlist.song_ids.push(song.id); // 添加歌曲ID到歌单
          targetPlaylist.count++; // 更新计数
          playlistSongCounts.sort((a, b) => a.count - b.count); // 重新排序
        }
      }

      savePlaylists(playlists); // 保存歌单
    }
  }

  res.json({ success: true, songs: results });
});

// API: 更新歌曲（改名/修改时长）
// PUT /api/songs/:id
app.put('/api/songs/:id', (req, res) => {
  const songs = loadDB();
  const id = parseInt(req.params.id);
  const song = songs.find(s => s.id === id);

  if (!song) {
    return res.status(404).json({ error: '歌曲不存在' });
  }

  // 更新标题（如果提供了）
  if (req.body.title !== undefined) song.title = req.body.title || song.title;
  // 更新时长（如果提供了）
  if (req.body.duration !== undefined) song.duration = req.body.duration;
  saveDB(songs); // 保存
  res.json({ success: true, song });
});

// ==================== 歌词 API ====================

// 配置歌词上传（存储到内存，不是文件）
const lyricsUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 } });

// 检测并转换编码为UTF-8（处理GBK编码的歌词文件）
function toUTF8(buffer) {
  const utf8 = buffer.toString('utf8');
  // 如果包含大量替换字符，可能是GBK编码
  if ((utf8.match(/\uFFFD/g) || []).length > 5) {
    try {
      const iconv = require('iconv-lite');
      return iconv.decode(buffer, 'gbk'); // 转换GBK为UTF-8
    } catch (e) {
      return buffer.toString('latin1');
    }
  }
  return utf8;
}

// API: 上传歌词
// POST /api/songs/:id/lyrics
// 支持两种方式：JSON body 或 文件上传
app.post('/api/songs/:id/lyrics', (req, res, next) => {
  // 方式1：JSON body（前端提取的歌词通过JSON发送）
  if (req.body && req.body.lyrics) {
    const songs = loadDB();
    const id = parseInt(req.params.id);
    const song = songs.find(s => s.id === id);
    if (!song) return res.status(404).json({ error: '歌曲不存在' });

    // 保存歌词到文件
    const lrcPath = path.join(lyricsDir, `${id}.lrc`);
    fs.writeFileSync(lrcPath, req.body.lyrics, 'utf8');
    song.has_lyrics = true; // 标记这首歌有歌词
    saveDB(songs);
    return res.json({ success: true });
  }
  // 方式2：文件上传（用户手动选择LRC文件）
  lyricsUpload.single('lyrics')(req, res, next);
}, (req, res) => {
  const songs = loadDB();
  const id = parseInt(req.params.id);
  const song = songs.find(s => s.id === id);

  if (!song) {
    return res.status(404).json({ error: '歌曲不存在' });
  }

  if (!req.file) {
    return res.status(400).json({ error: '没有选择文件' });
  }

  // 转换编码并保存
  const lrcContent = toUTF8(req.file.buffer);
  const lrcPath = path.join(lyricsDir, `${id}.lrc`);
  fs.writeFileSync(lrcPath, lrcContent, 'utf8');

  song.has_lyrics = true;
  saveDB(songs);
  res.json({ success: true });
});

// API: 获取歌词
// GET /api/songs/:id/lyrics
app.get('/api/songs/:id/lyrics', (req, res) => {
  const id = parseInt(req.params.id);
  const lrcPath = path.join(lyricsDir, `${id}.lrc`);

  // 如果歌词文件存在就读取并返回
  if (fs.existsSync(lrcPath)) {
    const lyrics = fs.readFileSync(lrcPath, 'utf8');
    return res.json({ lyrics, source: 'local' });
  }

  res.json({ lyrics: '' }); // 没有歌词就返回空
});

// API: 删除歌词
// DELETE /api/songs/:id/lyrics
app.delete('/api/songs/:id/lyrics', (req, res) => {
  const id = parseInt(req.params.id);
  const lrcPath = path.join(lyricsDir, `${id}.lrc`);

  // 删除歌词文件
  if (fs.existsSync(lrcPath)) {
    fs.unlinkSync(lrcPath);
  }

  // 更新歌曲数据
  const songs = loadDB();
  const song = songs.find(s => s.id === id);
  if (song) {
    song.has_lyrics = false;
    saveDB(songs);
  }

  res.json({ success: true });
});

// ==================== 歌曲删除 API ====================

// API: 删除歌曲
// DELETE /api/songs/:id
// 同时删除：歌曲文件、歌词文件、从歌单中移除
app.delete('/api/songs/:id', (req, res) => {
  const songs = loadDB();
  const id = parseInt(req.params.id);
  const index = songs.findIndex(s => s.id === id);

  if (index === -1) {
    return res.status(404).json({ error: '歌曲不存在' });
  }

  const song = songs[index];

  // 删除音乐文件
  const filePath = path.join(uploadDir, song.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // 删除歌词文件
  const lrcPath = path.join(lyricsDir, `${id}.lrc`);
  if (fs.existsSync(lrcPath)) {
    fs.unlinkSync(lrcPath);
  }

  // 从歌曲列表中移除
  songs.splice(index, 1);
  saveDB(songs);

  // 从所有歌单中移除该歌曲
  const playlists = loadPlaylists();
  let playlistChanged = false;
  playlists.forEach(p => {
    const idx = p.song_ids.indexOf(id);
    if (idx !== -1) {
      p.song_ids.splice(idx, 1); // 移除歌曲ID
      playlistChanged = true;
    }
  });
  if (playlistChanged) {
    savePlaylists(playlists); // 保存歌单
  }

  res.json({ success: true });
});

// ==================== 歌单 API ====================

// API: 获取所有歌单
// GET /api/playlists
app.get('/api/playlists', (req, res) => {
  const playlists = loadPlaylists();
  // 附加每首歌单的歌曲数量
  const result = playlists.map(p => ({
    ...p,
    song_count: p.song_ids.length
  }));
  res.json(result);
});

// API: 创建歌单
// POST /api/playlists
app.post('/api/playlists', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: '歌单名称不能为空' });
  }

  const playlists = loadPlaylists();
  const newPlaylist = {
    id: getNextPlaylistId(playlists),
    name: name.trim(),
    created_at: new Date().toISOString(),
    song_ids: [] // 新歌单是空的
  };
  playlists.push(newPlaylist);
  savePlaylists(playlists);
  res.json({ success: true, playlist: { ...newPlaylist, song_count: 0 } });
});

// API: 重命名歌单
// PUT /api/playlists/:id
app.put('/api/playlists/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: '歌单名称不能为空' });
  }

  const playlists = loadPlaylists();
  const playlist = playlists.find(p => p.id === id);
  if (!playlist) {
    return res.status(404).json({ error: '歌单不存在' });
  }

  playlist.name = name.trim();
  savePlaylists(playlists);
  res.json({ success: true, playlist });
});

// API: 删除歌单
// DELETE /api/playlists/:id
app.delete('/api/playlists/:id', (req, res) => {
  const id = parseInt(req.params.id);

  const playlists = loadPlaylists();
  const index = playlists.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ error: '歌单不存在' });
  }

  playlists.splice(index, 1); // 从列表中移除
  savePlaylists(playlists);
  res.json({ success: true });
});

// API: 添加歌曲到歌单
// POST /api/playlists/:id/songs
app.post('/api/playlists/:id/songs', (req, res) => {
  const id = parseInt(req.params.id);
  const { song_ids } = req.body;

  if (!song_ids || !Array.isArray(song_ids)) {
    return res.status(400).json({ error: '请提供歌曲ID列表' });
  }

  const playlists = loadPlaylists();
  const playlist = playlists.find(p => p.id === id);
  if (!playlist) {
    return res.status(404).json({ error: '歌单不存在' });
  }

  // 添加不重复的歌曲
  song_ids.forEach(songId => {
    if (!playlist.song_ids.includes(songId)) { // 避免重复添加
      playlist.song_ids.push(songId);
    }
  });

  savePlaylists(playlists);
  res.json({ success: true, song_count: playlist.song_ids.length });
});

// API: 从歌单移除歌曲
// DELETE /api/playlists/:id/songs/:songId
app.delete('/api/playlists/:id/songs/:songId', (req, res) => {
  const playlistId = parseInt(req.params.id);
  const songId = parseInt(req.params.songId);

  const playlists = loadPlaylists();
  const playlist = playlists.find(p => p.id === playlistId);
  if (!playlist) {
    return res.status(404).json({ error: '歌单不存在' });
  }

  const index = playlist.song_ids.indexOf(songId);
  if (index !== -1) {
    playlist.song_ids.splice(index, 1); // 移除歌曲
    savePlaylists(playlists);
  }

  res.json({ success: true, song_count: playlist.song_ids.length });
});

// ==================== 音乐播放 API ====================

// API: 流式播放音乐（支持断点续传）
// GET /api/stream/:id
// 浏览器可以通过Range请求部分数据，实现拖动进度条
app.get('/api/stream/:id', (req, res) => {
  const songs = loadDB();
  const id = parseInt(req.params.id);
  const song = songs.find(s => s.id === id);

  if (!song) {
    return res.status(404).json({ error: '歌曲不存在' });
  }

  const filePath = path.join(uploadDir, song.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '文件不存在' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size; // 文件总大小
  const range = req.headers.range; // 浏览器发送的Range头（请求部分数据）

  if (range) {
    // ========== 断点续传：只发送请求的部分数据 ==========
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);        // 起始位置
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1; // 结束位置
    const chunkSize = end - start + 1;           // 这次发送的数据大小

    // 创建读取流，只读取指定范围
    const file = fs.createReadStream(filePath, { start, end });
    // 返回206 Partial Content状态码
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`, // 内容范围
      'Accept-Ranges': 'bytes',    // 支持Range请求
      'Content-Length': chunkSize,  // 本次发送的大小
      'Content-Type': 'audio/mpeg' // 音频类型
    });
    file.pipe(res); // 把数据流发送给浏览器
  } else {
    // ========== 完整请求：发送整个文件 ==========
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'audio/mpeg'
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// ==================== 错误处理 ====================

// 全局错误处理：记录日志但不崩溃
process.on('uncaughtException', (err) => {
  fs.appendFileSync(
    path.join(dataDir, 'error.log'),
    `[${new Date().toISOString()}] uncaughtException: ${err.stack || err.message || err}\n`
  );
});

process.on('unhandledRejection', (reason) => {
  fs.appendFileSync(
    path.join(dataDir, 'error.log'),
    `[${new Date().toISOString()}] unhandledRejection: ${reason instanceof Error ? (reason.stack || reason.message) : reason}\n`
  );
});

// Multer错误处理
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: '上传出错: ' + err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

// ==================== 启动服务器 ====================
app.listen(PORT, () => {
  console.log(`音乐播放器已启动: http://localhost:${PORT}`);
});