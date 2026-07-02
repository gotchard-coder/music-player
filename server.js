const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 读取buffer转utf8的辅助函数
function decodeBuffer(str) {
  if (!str) return str;
  try {
    return Buffer.from(str, 'latin1').toString('utf8');
  } catch (e) {
    return str;
  }
}

const app = express();
const PORT = 3000;

// 数据目录
const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'songs.json');
const uploadDir = path.join(dataDir, 'uploads');
const lyricsDir = path.join(dataDir, 'lyrics');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(lyricsDir)) fs.mkdirSync(lyricsDir, { recursive: true });

// JSON 数据库
function loadDB() {
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, '[]', 'utf8');
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch (e) {
    fs.writeFileSync(dbPath, '[]', 'utf8');
    return [];
  }
}

function saveDB(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

function getNextId(songs) {
  return songs.length > 0 ? Math.max(...songs.map(s => s.id)) + 1 : 1;
}

// 中间件
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

// Multer 配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp3|wav|ogg|aac|flac|m4a/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = /audio/.test(file.mimetype);
    if (extname || mimetype) {
      cb(null, true);
    } else {
      cb(new Error('只支持音频文件'));
    }
  }
});

// API: 获取所有歌曲
app.get('/api/songs', (req, res) => {
  const songs = loadDB();
  res.json(songs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

// API: 上传音乐
app.post('/api/upload', upload.array('music', 50), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: '没有选择文件' });
  }

  const songs = loadDB();
  const results = [];

  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const originalName = decodeBuffer(file.originalname);
    const title = path.basename(originalName, path.extname(originalName));
    const duration = parseFloat(req.body['duration_' + i]) || 0;
    const song = {
      id: getNextId(songs),
      title,
      filename: file.filename,
      original_name: originalName,
      duration: Math.round(duration),
      file_size: file.size,
      created_at: new Date().toISOString()
    };
    songs.push(song);
    results.push(song);
  }

  saveDB(songs);
  res.json({ success: true, songs: results });
});

// API: 改名/更新
app.put('/api/songs/:id', (req, res) => {
  const songs = loadDB();
  const id = parseInt(req.params.id);
  const song = songs.find(s => s.id === id);

  if (!song) {
    return res.status(404).json({ error: '歌曲不存在' });
  }

  if (req.body.title !== undefined) song.title = req.body.title || song.title;
  if (req.body.duration !== undefined) song.duration = req.body.duration;
  saveDB(songs);
  res.json({ success: true, song });
});

// API: 上传歌词
const lyricsUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 } });

// 检测并转换编码为 UTF-8
function toUTF8(buffer) {
  // 先尝试 UTF-8
  const utf8 = buffer.toString('utf8');
  // 如果包含大量替换字符，可能是 GBK
  if ((utf8.match(/\uFFFD/g) || []).length > 5) {
    try {
      const iconv = require('iconv-lite');
      return iconv.decode(buffer, 'gbk');
    } catch (e) {
      // iconv-lite 没装，尝试 latin1 透传
      return buffer.toString('latin1');
    }
  }
  return utf8;
}

app.post('/api/songs/:id/lyrics', (req, res, next) => {
  // 先尝试 JSON body
  if (req.body && req.body.lyrics) {
    const songs = loadDB();
    const id = parseInt(req.params.id);
    const song = songs.find(s => s.id === id);
    if (!song) return res.status(404).json({ error: '歌曲不存在' });

    const lrcPath = path.join(lyricsDir, `${id}.lrc`);
    fs.writeFileSync(lrcPath, req.body.lyrics, 'utf8');
    song.has_lyrics = true;
    saveDB(songs);
    return res.json({ success: true });
  }
  // 否则走 multer（文件上传）
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

  const lrcContent = toUTF8(req.file.buffer);
  const lrcPath = path.join(lyricsDir, `${id}.lrc`);
  fs.writeFileSync(lrcPath, lrcContent, 'utf8');

  song.has_lyrics = true;
  saveDB(songs);
  res.json({ success: true });
});

// API: 获取歌词
app.get('/api/songs/:id/lyrics', (req, res) => {
  const id = parseInt(req.params.id);
  const lrcPath = path.join(lyricsDir, `${id}.lrc`);

  if (fs.existsSync(lrcPath)) {
    const lyrics = fs.readFileSync(lrcPath, 'utf8');
    return res.json({ lyrics, source: 'local' });
  }

  res.json({ lyrics: '' });
});

// API: 删除歌词
app.delete('/api/songs/:id/lyrics', (req, res) => {
  const id = parseInt(req.params.id);
  const lrcPath = path.join(lyricsDir, `${id}.lrc`);

  if (fs.existsSync(lrcPath)) {
    fs.unlinkSync(lrcPath);
  }

  const songs = loadDB();
  const song = songs.find(s => s.id === id);
  if (song) {
    song.has_lyrics = false;
    saveDB(songs);
  }

  res.json({ success: true });
});

// API: 删除歌曲
app.delete('/api/songs/:id', (req, res) => {
  const songs = loadDB();
  const id = parseInt(req.params.id);
  const index = songs.findIndex(s => s.id === id);

  if (index === -1) {
    return res.status(404).json({ error: '歌曲不存在' });
  }

  const song = songs[index];
  const filePath = path.join(uploadDir, song.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // 同时删除歌词文件
  const lrcPath = path.join(lyricsDir, `${id}.lrc`);
  if (fs.existsSync(lrcPath)) {
    fs.unlinkSync(lrcPath);
  }

  songs.splice(index, 1);
  saveDB(songs);
  res.json({ success: true });
});

// API: 流式播放
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
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    const file = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'audio/mpeg'
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'audio/mpeg'
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// 全局错误处理 — 防止未捕获异常导致终端刷屏
process.on('uncaughtException', (err) => {
  // 静默处理，不输出到终端
});

process.on('unhandledRejection', (reason) => {
  // 静默处理，不输出到终端
});

// Multer 错误处理
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: '上传出错: ' + err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`音乐播放器已启动: http://localhost:${PORT}`);
});
