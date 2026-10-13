import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import multer from 'multer'
import sharp from 'sharp'

const execFileAsync = promisify(execFile)
const currentDir = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(currentDir, '..')
const workspaceDir = path.resolve(appDir, '..')
const dataDir = path.resolve(appDir, '.clipper-data')
const uploadDir = path.join(dataDir, 'uploads')
const renderDir = path.join(dataDir, 'renders')
const queueFile = path.join(dataDir, 'share-drafts.json')
const demoFile = path.join(workspaceDir, 'index.mp4')
const port = Number(process.env.PORT || 8787)

await Promise.all([fs.mkdir(uploadDir, { recursive: true }), fs.mkdir(renderDir, { recursive: true })])

const app = express()
app.use(express.json({ limit: '1mb' }))
app.use('/renders', express.static(renderDir))

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, uploadDir),
  filename: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase() || '.mp4'
    callback(null, `${crypto.randomUUID()}${extension}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    const validType = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'].includes(file.mimetype)
    callback(validType ? null : new Error('Use an MP4, MOV, WebM, or MKV video.'), validType)
  },
})

async function getMediaInfo(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_type,width,height',
    '-of', 'json',
    filePath,
  ])
  const info = JSON.parse(stdout)
  const videoStream = info.streams?.find((stream) => stream.codec_type === 'video')
  if (!videoStream) throw new Error('No video stream was found in this file.')
  return {
    duration: Number(info.format?.duration || 0),
    width: Number(videoStream.width || 0),
    height: Number(videoStream.height || 0),
  }
}

async function readQueue() {
  try {
    return JSON.parse(await fs.readFile(queueFile, 'utf8'))
  } catch {
    return []
  }
}

async function writeQueue(items) {
  await fs.writeFile(queueFile, `${JSON.stringify(items, null, 2)}\n`)
}

function wrapOverlay(text, maxCharacters = 30) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > maxCharacters && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines.slice(0, 3).join('\n')
}

function escapeXml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

function buildOverlaySvg(text, isHook) {
  const lines = wrapOverlay(text, isHook ? 24 : 31).split('\n')
  const lineHeight = isHook ? 64 : 53
  const fontSize = isHook ? 54 : 44
  const panelY = isHook ? 100 : 1490
  const panelHeight = lines.length * lineHeight + 46
  const firstLineY = panelY + (panelHeight - (lines.length - 1) * lineHeight) / 2 + fontSize * 0.34
  const rows = lines.map((line, index) => `<tspan x="540" y="${firstLineY + index * lineHeight}">${escapeXml(line)}</tspan>`).join('')
  const panelColor = isHook ? '#1b2820' : '#17211b'
  const accent = isHook ? '#d7f356' : '#ffffff'
  return `<svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg"><rect x="68" y="${panelY}" width="944" height="${panelHeight}" rx="24" fill="${panelColor}" fill-opacity="0.84" stroke="${accent}" stroke-opacity="0.7" stroke-width="2"/><text text-anchor="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#fff" stroke="#111" stroke-width="2" paint-order="stroke">${rows}</text></svg>`
}

async function writeTextOverlay(filePath, text, isHook) {
  await sharp(Buffer.from(buildOverlaySvg(text, isHook))).png().toFile(filePath)
}

function buildFilter(style, hookIndex, captionIndex) {
  const grade = style === 'chaos'
    ? 'eq=contrast=1.18:saturation=1.38:brightness=-0.06'
    : style === 'story'
      ? 'eq=contrast=1.08:saturation=1.12:brightness=-0.04'
      : 'eq=contrast=1.14:saturation=1.24:brightness=-0.06'
  const composite = [
    '[0:v]split=2[background][foreground]',
    `[background]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:12,${grade}[back]`,
    '[foreground]scale=1010:-2:force_original_aspect_ratio=decrease[front]',
    '[back][front]overlay=(W-w)/2:(H-h)/2,setsar=1[base]',
  ]
  let currentLabel = 'base'
  if (hookIndex !== null) {
    composite.push(`[${hookIndex}:v]format=rgba[hook]`)
    composite.push(`[${currentLabel}][hook]overlay=shortest=1[withhook]`)
    currentLabel = 'withhook'
  }
  if (captionIndex !== null) {
    composite.push(`[${captionIndex}:v]format=rgba[caption]`)
    composite.push(`[${currentLabel}][caption]overlay=shortest=1[withcaption]`)
    currentLabel = 'withcaption'
  }
  composite.push(`[${currentLabel}]format=yuv420p[outv]`)
  return composite.join(';')
}

app.get('/api/health', async (_request, response) => {
  let ffmpegReady = false
  try {
    await execFileAsync('ffmpeg', ['-version'])
    ffmpegReady = true
  } catch {
    ffmpegReady = false
  }
  response.json({ ffmpegReady })
})

app.get('/api/demo', async (_request, response, next) => {
  try {
    const metadata = await getMediaInfo(demoFile)
    response.json({ name: 'index.mp4', url: '/api/demo/video', ...metadata })
  } catch (error) {
    next(error)
  }
})

app.get('/api/demo/video', (_request, response) => {
  response.sendFile(demoFile, (error) => {
    if (error && !response.headersSent) response.status(404).json({ error: 'The workspace sample video was not found.' })
  })
})

app.get('/api/share-drafts', async (_request, response) => {
  response.json(await readQueue())
})

app.post('/api/render', upload.single('video'), async (request, response, next) => {
  try {
    const sourcePath = request.body.useDemo === 'true' ? demoFile : request.file?.path
    if (!sourcePath) return response.status(400).json({ error: 'Choose a source video first.' })

    const metadata = await getMediaInfo(sourcePath)
    const start = Number(request.body.start)
    const end = Number(request.body.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > metadata.duration + 0.1) {
      return response.status(400).json({ error: 'The selected in and out points are outside the source video.' })
    }
    if (end - start > 90) return response.status(400).json({ error: 'Keep the first edit under 90 seconds.' })

    const id = crypto.randomUUID()
    const outputName = `${id}.mp4`
    const outputPath = path.join(renderDir, outputName)
    const hookText = wrapOverlay(request.body.hook, 25)
    const captionText = wrapOverlay(request.body.caption, 32)
    const hookFile = hookText ? path.join(dataDir, `${id}-hook.png`) : null
    const captionFile = captionText ? path.join(dataDir, `${id}-caption.png`) : null
    if (hookFile) await writeTextOverlay(hookFile, hookText, true)
    if (captionFile) await writeTextOverlay(captionFile, captionText, false)

    const style = ['reaction', 'story', 'chaos'].includes(request.body.style) ? request.body.style : 'reaction'
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-ss', start.toFixed(2), '-i', sourcePath,
    ]
    let nextInput = 1
    const hookIndex = hookFile ? nextInput++ : null
    const captionIndex = captionFile ? nextInput++ : null
    for (const overlayPath of [hookFile, captionFile].filter(Boolean)) {
      args.push('-loop', '1', '-framerate', '60', '-i', overlayPath)
    }
    args.push(
      '-t', (end - start).toFixed(2),
      '-filter_complex', buildFilter(style, hookIndex, captionIndex),
      '-map', '[outv]', '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
      '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart',
      outputPath,
    )

    try {
      await execFileAsync('ffmpeg', args, { maxBuffer: 12 * 1024 * 1024 })
    } finally {
      await Promise.all([hookFile, captionFile].filter(Boolean).map((file) => fs.rm(file, { force: true })))
    }

    const outputStats = await fs.stat(outputPath)
    response.json({
      id,
      name: `cutline-${id.slice(0, 8)}.mp4`,
      url: `/renders/${outputName}`,
      duration: end - start,
      size: outputStats.size,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/share-drafts', async (request, response) => {
  const { clipId, title, rightsConfirmed } = request.body || {}
  if (!rightsConfirmed) return response.status(400).json({ error: 'Confirm that you have permission to edit and post this footage.' })
  if (typeof clipId !== 'string' || !/^[a-f0-9-]+$/.test(clipId)) {
    return response.status(400).json({ error: 'Render a clip before saving a publish draft.' })
  }
  try {
    await fs.access(path.join(renderDir, `${clipId}.mp4`))
  } catch {
    return response.status(404).json({ error: 'That rendered clip is no longer available.' })
  }

  const items = await readQueue()
  const item = {
    id: crypto.randomUUID(),
    clipId,
    title: String(title || '').slice(0, 150),
    status: 'ready_for_manual_post',
    createdAt: new Date().toISOString(),
  }
  items.unshift(item)
  await writeQueue(items)
  response.status(201).json(item)
})

app.use((error, _request, response, _next) => {
  console.error(error)
  const status = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 500
  response.status(status).json({ error: status === 500 ? error.message || 'The local video service failed.' : 'Video exceeds the 1 GB upload limit.' })
})

app.listen(port, () => {
  console.log(`Cutline video service listening on http://localhost:${port}`)
})