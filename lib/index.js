/**
 * dsh-podcast-panel — host half.
 *
 * 订阅播客 RSS / 小宇宙等音频源，在 DSH 侧栏播放：
 * 倍速、记住进度、三行摘要、音频代理（支持 Range 拖动）。
 *
 * 零运行时依赖，数据只落本机 ~/.dsh/podcast-panel/state.json。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import crypto from 'node:crypto'
import { Readable } from 'node:stream'

export const name = 'podcast-panel'
export const inject = ['webServer', 'commands']

const ROUTE = '/podcast-panel'
const MAX_FEEDS = 50
const MAX_EPISODES = 200
const MAX_BODY = 1024 * 1024

// ---------- storage ----------

function hasHome() {
  return typeof os.homedir === 'function' && os.homedir()
}

export function resolveDataDir(config = {}) {
  if (config.dataDir) return path.resolve(String(config.dataDir))
  if (process.env.DSH_PODCAST_HOME) return path.resolve(process.env.DSH_PODCAST_HOME)
  return path.join(hasHome() ? os.homedir() : process.cwd(), '.dsh', 'podcast-panel')
}

function stateFile(config) {
  return path.join(resolveDataDir(config), 'state.json')
}

function emptyState() {
  return { feeds: [], progress: {}, settings: { speed: 1, skip: 15 } }
}

export function readState(config) {
  try {
    const raw = fs.readFileSync(stateFile(config), 'utf8')
    const parsed = JSON.parse(raw)
    return {
      feeds: Array.isArray(parsed.feeds) ? parsed.feeds : [],
      progress: parsed.progress && typeof parsed.progress === 'object' ? parsed.progress : {},
      settings: { speed: 1, skip: 15, ...(parsed.settings || {}) },
    }
  } catch {
    return emptyState()
  }
}

function writeState(config, state) {
  const dir = resolveDataDir(config)
  fs.mkdirSync(dir, { recursive: true })
  const file = stateFile(config)
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2))
  fs.renameSync(tmp, file)
}

export function hashId(input) {
  return crypto.createHash('sha1').update(String(input)).digest('hex').slice(0, 12)
}

// ---------- parsing ----------

const ENTITIES = { apos: "'", quot: '"', amp: '&', lt: '<', gt: '>', nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', middot: '·' }

function decodeEntities(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(Number(num)))
    .replace(/&([a-z]+);/gi, (all, name) => ENTITIES[name.toLowerCase()] ?? all)
}

export function stripHtml(input) {
  const decoded = decodeEntities(String(input || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'))
  return decoded
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseDuration(value) {
  if (value == null) return 0
  const text = String(value).trim()
  if (!text) return 0
  if (/^\d+$/.test(text)) return Number(text)
  const parts = text.split(':').map((p) => Number(p))
  if (parts.some((n) => !Number.isFinite(n))) return 0
  let seconds = 0
  for (const part of parts) seconds = seconds * 60 + part
  return Math.round(seconds)
}

function firstTag(xml, names) {
  for (const tag of names) {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i')
    const match = xml.match(re)
    if (match && match[1]) return match[1]
  }
  return ''
}

function attr(openTag, key) {
  const re = new RegExp(`${key}\\s*=\\s*["']([^"']*)["']`, 'i')
  const match = String(openTag || '').match(re)
  return match ? match[1] : ''
}

function absoluteUrl(url, base) {
  if (!url) return ''
  try {
    return new URL(url, base || undefined).toString()
  } catch {
    return ''
  }
}

export function summarize(description) {
  const text = stripHtml(description)
  if (!text) return { summary: [], quote: '' }
  const sentences = text
    .split(/(?<=[。！？!?；;])\s*|(?<=\.)\s+/)
    .map((s) => s.trim().replace(/^(?:\d+[.、)]|[-•·])\s*/, ''))
    .filter((s) => s.length >= 8 && s.length <= 160)
  const picked = []
  for (const sentence of sentences) {
    if (picked.length >= 3) break
    if (!picked.includes(sentence)) picked.push(sentence)
  }
  if (!picked.length && text) picked.push(text.slice(0, 120))
  const quote = sentences
    .filter((s) => s.length <= 80)
    .sort((a, b) => b.length - a.length)[0] || ''
  return { summary: picked, quote }
}

export function parseFeed(xml, feedUrl) {
  const text = String(xml || '')
  const channel = firstTag(text, ['channel']) || text
  const feedTitle = stripHtml(firstTag(channel, ['title'])) || feedUrl
  const feedLink = absoluteUrl(stripHtml(firstTag(channel, ['link'])), feedUrl)
  const imageTag = channel.match(/<itunes:image[^>]*>/i)
  const feedImage = absoluteUrl(
    (imageTag && attr(imageTag[0], 'href')) || (channel.match(/<url>([^<]+)<\/url>/i) || [])[1],
    feedUrl,
  )
  const feedDesc = stripHtml(firstTag(channel, ['description', 'subtitle', 'summary']))

  const itemRe = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi
  const episodes = []
  let match
  while ((match = itemRe.exec(text))) {
    const item = match[2]
    const enclosure = item.match(/<enclosure[^>]*>/i)
    const media = item.match(/<media:content[^>]*>/i)
    const audio = absoluteUrl(
      (enclosure && attr(enclosure[0], 'url')) || (media && attr(media[0], 'url')),
      feedUrl,
    )
    if (!audio) continue
    const title = stripHtml(firstTag(item, ['title'])) || '未命名单集'
    const link = absoluteUrl(stripHtml(firstTag(item, ['link'])), feedUrl)
    const guid = stripHtml(firstTag(item, ['guid', 'id']))
    const pub = stripHtml(firstTag(item, ['pubDate', 'published', 'updated', 'dc:date']))
    const duration = parseDuration(stripHtml(firstTag(item, ['itunes:duration', 'duration'])))
    const descRaw = firstTag(item, ['itunes:summary', 'description', 'summary', 'content:encoded'])
    const desc = stripHtml(descRaw).slice(0, 4000)
    const itemImageTag = item.match(/<itunes:image[^>]*>/i)
    const itemImage = absoluteUrl(itemImageTag && attr(itemImageTag[0], 'href'), feedUrl)
    episodes.push({
      id: hashId(audio || guid || `${title}|${pub}`),
      title,
      pub: pub ? new Date(pub).toISOString() : '',
      duration,
      audio,
      link,
      desc,
      image: itemImage || feedImage || '',
    })
  }
  // 新到旧
  episodes.sort((a, b) => String(b.pub).localeCompare(String(a.pub)))
  return {
    id: hashId(feedUrl),
    title: feedTitle,
    url: feedUrl,
    link: feedLink,
    image: feedImage,
    desc: feedDesc.slice(0, 600),
    episodes: episodes.slice(0, MAX_EPISODES),
  }
}

export async function fetchFeed(feedUrl, timeoutMs = 60000) {
  const url = new URL(feedUrl)
  if (!/^https?:$/.test(url.protocol)) throw new Error('只支持 http/https 订阅地址')
  assertPublicHost(url.hostname)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) DSH-Podcast/0.1', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
    })
    if (!response.ok) throw new Error(`订阅源返回 HTTP ${response.status}`)
    const declared = Number(response.headers.get('content-length') || 0)
    if (declared > 24 * 1024 * 1024) throw new Error('订阅源太大（>24MB）')
    const text = await response.text()
    if (text.length > 24 * 1024 * 1024) throw new Error('订阅源太大（>24MB）')
    return parseFeed(text, url.toString())
  } finally {
    clearTimeout(timer)
  }
}

// ---------- SSRF guard ----------

function assertPublicHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) throw new Error('地址为空')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('不允许访问本机/内网地址')
  }
  if (net.isIP(host)) {
    const v4 = host.split('.').map(Number)
    const blocked =
      v4[0] === 10 ||
      v4[0] === 127 ||
      (v4[0] === 169 && v4[1] === 254) ||
      (v4[0] === 192 && v4[1] === 168) ||
      (v4[0] === 172 && v4[1] >= 16 && v4[1] <= 31) ||
      host === '0.0.0.0'
    if (blocked) throw new Error('不允许访问本机/内网地址')
    if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) {
      throw new Error('不允许访问本机/内网地址')
    }
  }
}

// ---------- audio proxy ----------

function encodeUrl(url) {
  return Buffer.from(url, 'utf8').toString('base64url')
}

function decodeUrl(token) {
  return Buffer.from(String(token || ''), 'base64url').toString('utf8')
}

async function proxyAudio(request, response, targetUrl) {
  const url = new URL(targetUrl)
  if (!/^https?:$/.test(url.protocol)) throw new Error('只支持 http/https 音频地址')
  assertPublicHost(url.hostname)
  const headers = { 'user-agent': 'DSH-Podcast/0.1' }
  if (request.headers.range) headers.range = request.headers.range
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const upstream = await fetch(url, { headers, redirect: 'follow', signal: controller.signal })
    const out = {
      'content-type': upstream.headers.get('content-type') || 'audio/mpeg',
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
    }
    for (const key of ['content-length', 'content-range']) {
      const value = upstream.headers.get(key)
      if (value) out[key] = value
    }
    response.writeHead(upstream.status, out)
    if (!upstream.body) return response.end()
    Readable.fromWeb(upstream.body).pipe(response)
  } finally {
    clearTimeout(timer)
  }
}

// ---------- helpers ----------

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('请求体太大'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    request.on('error', reject)
  })
}

function publicState(state) {
  return {
    feeds: state.feeds.map((feed) => ({
      id: feed.id,
      title: feed.title,
      url: feed.url,
      link: feed.link,
      image: feed.image,
      desc: feed.desc,
      fetchedAt: feed.fetchedAt,
      episodes: feed.episodes.map((ep) => ({
        ...ep,
        audioProxy: `${ROUTE}/audio?u=${encodeUrl(ep.audio)}`,
        progress: state.progress[ep.id] || null,
      })),
    })),
    settings: state.settings,
    qqGroup: {
      name: 'AI 学习群',
      number: '1132348296',
    },
  }
}

function upsertFeed(state, feed) {
  const existing = state.feeds.findIndex((item) => item.id === feed.id)
  const next = { ...feed, fetchedAt: new Date().toISOString() }
  if (existing >= 0) state.feeds[existing] = next
  else state.feeds.unshift(next)
  state.feeds = state.feeds.slice(0, MAX_FEEDS)
  return state
}

function pruneProgress(state) {
  const entries = Object.entries(state.progress)
  if (entries.length <= 5000) return
  entries.sort((a, b) => String(b[1].updatedAt).localeCompare(String(a[1].updatedAt)))
  state.progress = Object.fromEntries(entries.slice(0, 5000))
}

// ---------- plugin ----------

export function apply(ctx, config = {}) {
  const log = (...args) => ctx.logger?.info?.(`[dsh-podcast-panel]`, ...args)

  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: 'prefix',
      path: ROUTE,
      handler: async (request, response) => {
        const url = new URL(request.url || '/', 'http://local')
        const send = (status, body, type = 'application/json; charset=utf-8') => {
          response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
          response.end(body)
        }
        try {
          if (url.pathname === `${ROUTE}/audio` && request.method === 'GET') {
            const target = decodeUrl(url.searchParams.get('u'))
            if (!target) return send(400, JSON.stringify({ error: 'missing-u' }))
            return await proxyAudio(request, response, target)
          }

          if (url.pathname === `${ROUTE}/api/state` && request.method === 'GET') {
            return send(200, JSON.stringify(publicState(readState(config))))
          }

          if (url.pathname === `${ROUTE}/api/summary` && request.method === 'GET') {
            const state = readState(config)
            const episodeId = url.searchParams.get('id') || ''
            for (const feed of state.feeds) {
              const ep = feed.episodes.find((item) => item.id === episodeId)
              if (ep) {
                const { summary, quote } = summarize(ep.desc)
                return send(200, JSON.stringify({ summary, quote, title: ep.title }))
              }
            }
            return send(404, JSON.stringify({ error: 'episode-not-found' }))
          }

          if (url.pathname === `${ROUTE}/api/settings` && request.method === 'POST') {
            const body = await readBody(request)
            const state = readState(config)
            const speed = Number(body.speed)
            if (Number.isFinite(speed) && speed >= 0.5 && speed <= 2) state.settings.speed = speed
            const skip = Number(body.skip)
            if (Number.isInteger(skip) && skip >= 5 && skip <= 120) state.settings.skip = skip
            writeState(config, state)
            return send(200, JSON.stringify({ ok: true, settings: state.settings }))
          }

          if (url.pathname === `${ROUTE}/api/feeds` && request.method === 'POST') {
            const body = await readBody(request)
            const feedUrl = String(body.url || '').trim()
            if (!/^https?:\/\//i.test(feedUrl)) return send(400, JSON.stringify({ error: '需要 http/https 订阅地址' }))
            const feed = await fetchFeed(feedUrl)
            const state = readState(config)
            upsertFeed(state, feed)
            writeState(config, state)
            log('feed added', feed.title, feed.episodes.length)
            return send(200, JSON.stringify(publicState(state)))
          }

          if (url.pathname === `${ROUTE}/api/feeds/remove` && request.method === 'POST') {
            const body = await readBody(request)
            const state = readState(config)
            state.feeds = state.feeds.filter((feed) => feed.id !== body.id)
            writeState(config, state)
            return send(200, JSON.stringify(publicState(state)))
          }

          if (url.pathname === `${ROUTE}/api/feeds/refresh` && request.method === 'POST') {
            const body = await readBody(request)
            const state = readState(config)
            const targets = body.id ? state.feeds.filter((feed) => feed.id === body.id) : state.feeds.slice()
            const errors = []
            for (const feed of targets) {
              try {
                const next = await fetchFeed(feed.url)
                upsertFeed(state, next)
              } catch (err) {
                errors.push({ id: feed.id, title: feed.title, error: String(err?.message || err) })
              }
            }
            writeState(config, state)
            return send(200, JSON.stringify({ ...publicState(state), errors }))
          }

          if (url.pathname === `${ROUTE}/api/progress` && request.method === 'POST') {
            const body = await readBody(request)
            const id = String(body.id || '')
            if (!id) return send(400, JSON.stringify({ error: 'missing-id' }))
            const state = readState(config)
            const pos = Math.max(0, Number(body.pos) || 0)
            const done = Boolean(body.done)
            state.progress[id] = { pos: Math.round(pos), done, updatedAt: new Date().toISOString() }
            pruneProgress(state)
            writeState(config, state)
            return send(200, JSON.stringify({ ok: true }))
          }

          if (url.pathname === ROUTE || url.pathname === `${ROUTE}/`) {
            return send(200, '<meta charset="utf-8"><p>dsh-podcast-panel</p>', 'text/html; charset=utf-8')
          }
          return send(404, JSON.stringify({ error: 'not-found' }))
        } catch (err) {
          log('route failed', err?.message || err)
          if (!response.headersSent) send(500, JSON.stringify({ error: String(err?.message || err) }))
          else response.end()
        }
      },
    })
    return () => {
      if (typeof dispose === 'function') dispose()
    }
  })

  ctx.effect(() => {
    const dispose = ctx.commands.register({
      name: 'podcast',
      description: '订阅并查看播客：/podcast add <RSS地址>、/podcast list、/podcast refresh',
      input: { hint: 'add <RSS 地址> | list | refresh' },
      handler: async (input) => {
        const raw = typeof input === 'string' ? input : input?.rawInput || input?.input || ''
        const text = String(raw).trim()
        const [verb = 'list', ...rest] = text.split(/\s+/)
        const state = readState(config)
        try {
          if (verb === 'add' && rest[0]) {
            const feed = await fetchFeed(rest[0])
            upsertFeed(state, feed)
            writeState(config, state)
            return {
              kind: 'success',
              text: `已订阅「${feed.title}」，共 ${feed.episodes.length} 集。打开左侧「播客」面板开始听。`,
            }
          }
          if (verb === 'refresh') {
            const errors = []
            for (const feed of state.feeds) {
              try {
                upsertFeed(state, await fetchFeed(feed.url))
              } catch (err) {
                errors.push(`${feed.title}: ${err?.message || err}`)
              }
            }
            writeState(config, state)
            return {
              kind: 'success',
              text: `已刷新 ${state.feeds.length} 个订阅${errors.length ? `，${errors.length} 个失败：${errors.join('；')}` : ''}。`,
            }
          }
          if (!state.feeds.length) {
            return { kind: 'success', text: '还没有订阅。发我一个小宇宙/RSS 链接：/podcast add <地址>' }
          }
          const lines = [`播客（${state.feeds.length} 个订阅）`]
          for (const feed of state.feeds) {
            lines.push(`- ${feed.title}（${feed.episodes.length} 集）`)
            for (const ep of feed.episodes.slice(0, 5)) {
              const p = state.progress[ep.id]
              const mark = p?.done ? '✓' : p?.pos ? '·' : ' '
              const minutes = ep.duration ? `${Math.round(ep.duration / 60)} 分钟` : ''
              lines.push(`  ${mark} ${ep.title}${minutes ? `（${minutes}）` : ''}`)
            }
          }
          lines.push('', '群里一起听：AI 学习群 1132348296')
          return { kind: 'success', text: lines.join('\n') }
        } catch (err) {
          return { kind: 'error', text: `播客操作失败：${err?.message || err}` }
        }
      },
    })
    return () => {
      if (typeof dispose === 'function') dispose()
    }
  })
}
