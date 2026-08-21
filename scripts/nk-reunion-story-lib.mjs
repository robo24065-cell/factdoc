// nk-reunion-story-lib.mjs — 이산가족정보통합시스템 「스토리」 구획 수집기 공통 계층
//   (디지털박물관 구획 수집기는 nk-reunion-lib.mjs 를 쓴다 — 별개 모듈이다. 이름을 섞지 말 것.)
//
// 왜 별도 계층인가:
//   · 코너 3종(htgallery / vletter / photo)이 같은 호스트를 친다. 예의 규칙(동시 ≤2, 요청 간격, 캐시)을
//     코너마다 따로 구현하면 반드시 어긋난다 — 게이트를 한 군데로 모은다.
//   · 재실행 가능·증분이 필수라서 "받은 HTML 원문을 디스크에 캐시" 하는 계층이 있어야 한다.
//     2회차 실행은 네트워크를 0회 치고 파싱만 다시 한다.
//
// 규약
//   · reunion.unikorea.go.kr 은 TLS 체인 문제가 있어 curl -k 가 필수(nk-museum-harvest.mjs 와 동일).
//   · 세션 쿠키는 이 세 코너에 불필요하다(탐사 실측). 그래도 쿠키 항아리는 유지한다.
//   · 응답은 UTF-8. (Content-Type: text/html;charset=UTF-8 실측)
//   · 미디어(jpg/mp4)는 절대 내려받지 않는다 — URL 만 기록. 이 계층에 다운로드 함수 자체를 두지 않는다.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '..')
export const OUT_DIR = path.join(ROOT, '북한자료-api')
export const CACHE_ROOT = path.join(OUT_DIR, '_cache', 'reunion-story')
export const BASE = 'https://reunion.unikorea.go.kr'

export const args = process.argv.slice(2)
export const FORCE = args.includes('--force')
export const argOf = (k, d) => {
  const a = args.find(x => x.startsWith(`--${k}=`))
  return a ? a.split('=').slice(1).join('=') : d
}
// as-of 규약: 수집일은 KST 달력 날짜로 못박는다(UTC 로 밀려 하루 어긋나는 것을 막는다).
export function todayKST() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}
/* ★ as-of 규약 — 수집일은 「실행한 날」이 아니라 「자료를 실제로 받아 온 날」이다.
     COLLECTED_AT 은 **사람이 --collected-at 로 못박은 값**일 때만 쓴다. 그 값이 없으면
     collectedAt() 이 캐시 파일의 mtime(캐시 적중)과 지금 시각(새 요청)의 최댓값으로 정한다.
     실행 시각을 그냥 찍으면 네트워크를 0회 치고도 수집일이 내일로 밀린다(실측 결함). */
export const COLLECTED_AT_FORCED = argOf('collected-at', process.env.BUILD_DATE || null)
export const COLLECTED_AT = COLLECTED_AT_FORCED || todayKST()
/** 실제로 받아 온 시각(ms)들 — 캐시 적중은 그 파일의 mtime, 새 요청은 그때의 Date.now(). */
export const OBSERVED = []
export const observe = (ms) => { if (Number.isFinite(ms)) OBSERVED.push(ms) }
/** 산출물에 적을 수집일(KST 달력 날짜). --collected-at 이 있으면 그것이 우선한다. */
export function collectedAt() {
  if (COLLECTED_AT_FORCED) return String(COLLECTED_AT_FORCED).slice(0, 10)
  if (!OBSERVED.length) return todayKST()
  return new Date(Math.max(...OBSERVED) + 9 * 3600 * 1000).toISOString().slice(0, 10)
}
// 정부 서버 배려 — 요청 시작 간 최소 간격(ms). 하한 350 강제. 동시 요청은 CONC(기본 2, 상한 2).
export const DELAY_MS = Math.max(350, +argOf('delay', 400))
export const CONC = Math.min(2, Math.max(1, +argOf('conc', 2)))

export const sleep = (ms) => new Promise(r => setTimeout(r, ms))
export const die = (m) => { console.error('X ' + m); process.exit(1) }

// ── 네트워크 게이트 ────────────────────────────────────────────────────────────
export const NET = { calls: 0, fromCache: 0, fail: 0, consecFail: 0, bytes: 0, lastAt: 0 }
const MAX_CONSEC_FAIL = 25
let gateChain = Promise.resolve()
function gate() {
  // 직렬 체인으로 "요청 시작 시각" 사이 간격을 보장한다. 동시성 2 여도 시작은 DELAY_MS 씩 벌어진다.
  const p = gateChain.then(async () => {
    const wait = DELAY_MS - (Date.now() - NET.lastAt)
    if (wait > 0) await sleep(wait)
    NET.lastAt = Date.now()
  })
  gateChain = p.catch(() => {})
  return p
}

export function ensureDir(d) { fs.mkdirSync(d, { recursive: true }) }

// 캐시는 gzip 으로 저장한다 — 이 사이트의 HTML 은 한 쪽당 250KB 가까이 되는데 대부분이 공통 껍데기라
// 압축하면 1/10 로 줄어든다. 옛 .html 평문 캐시도 계속 읽는다(있으면 그대로 쓰고 다시 받지 않는다).
function cacheFile(cacheDir, key) {
  const safe = String(key).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 150)
  return path.join(cacheDir, safe + '.html.gz')
}
function cacheFilePlain(cacheDir, key) {
  const safe = String(key).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 150)
  return path.join(cacheDir, safe + '.html')
}
function cacheReadSync(cacheDir, key) {
  const gz = cacheFile(cacheDir, key)
  /* 캐시 적중이면 그 파일이 쓰인 때가 이 자료를 실제로 받아 온 시각이다 — 수집일의 근거. */
  if (fs.existsSync(gz)) {
    try { observe(fs.statSync(gz).mtimeMs) } catch { /* mtime 을 못 읽어도 본문은 유효하다 */ }
    return zlib.gunzipSync(fs.readFileSync(gz)).toString('utf8')
  }
  const plain = cacheFilePlain(cacheDir, key)
  if (fs.existsSync(plain)) {
    try { observe(fs.statSync(plain).mtimeMs) } catch { /* 위와 같다 */ }
    return fs.readFileSync(plain, 'utf8')
  }
  return null
}
function cacheWriteSync(cacheDir, key, body) {
  fs.writeFileSync(cacheFile(cacheDir, key), zlib.gzipSync(Buffer.from(body, 'utf8'), { level: 6 }))
  const plain = cacheFilePlain(cacheDir, key)
  if (fs.existsSync(plain)) { try { fs.unlinkSync(plain) } catch { /* 지우지 못해도 치명적이지 않다 */ } }
}

function curlOnce(url, cookieJar) {
  const buf = execFileSync('curl', [
    '-sk', '--max-time', '90',
    '-A', 'Mozilla/5.0 (compatible; nk-reunion-story-harvest/1.0; 2026 통일부 공공데이터 활용 공모전)',
    '-b', cookieJar, '-c', cookieJar,
    '-w', '\n__HTTP__%{http_code}', url,
  ], { maxBuffer: 1 << 28 })
  const s = buf.toString('utf8')
  const cut = s.lastIndexOf('\n__HTTP__')
  const code = +s.slice(cut + 9).trim()
  return { code, body: s.slice(0, cut) }
}

/**
 * GET + 디스크 캐시. 성공한 HTML 만 캐시한다(실패를 캐시하면 증분 재실행이 영원히 실패한다).
 * 반환: { ok, body, code, cached }
 */
export async function fetchCached(url, { cacheDir, key, label, retries = 2 }) {
  ensureDir(cacheDir)
  ensureDir(CACHE_ROOT)
  const cookieJar = path.join(CACHE_ROOT, 'cookies.txt')
  if (!FORCE) {
    const hit = cacheReadSync(cacheDir, key)
    if (hit != null) { NET.fromCache++; return { ok: true, body: hit, code: 200, cached: true } }
  }
  let lastErr = null, lastCode = 0
  for (let a = 0; a <= retries; a++) {
    await gate()
    try {
      const { code, body } = curlOnce(url, cookieJar)
      lastCode = code
      if (code === 200 && body.length > 0) {
        cacheWriteSync(cacheDir, key, body)
        NET.calls++; NET.bytes += body.length; NET.consecFail = 0
        observe(Date.now())
        return { ok: true, body, code, cached: false }
      }
      lastErr = `HTTP ${code}`
    } catch (e) { lastErr = String(e?.message || e) }
    if (a < retries) await sleep(800 * (a + 1))
  }
  NET.calls++; NET.fail++; NET.consecFail++
  console.warn(`  ! 실패(${NET.consecFail}연속) ${label || url}: ${lastErr}`)
  if (NET.consecFail >= MAX_CONSEC_FAIL) die(`연속 실패 ${MAX_CONSEC_FAIL}회 — 중단(서버 이상 또는 차단 의심). 캐시는 남아 있으니 다시 실행하면 이어받는다.`)
  return { ok: false, body: '', code: lastCode, cached: false, error: lastErr }
}

/** 이미 캐시에 있는지만 본다(네트워크 호출 없음). */
export function isCached(cacheDir, key) {
  return !FORCE && (fs.existsSync(cacheFile(cacheDir, key)) || fs.existsSync(cacheFilePlain(cacheDir, key)))
}

/** 기존 평문 .html 캐시를 .html.gz 로 접는다. 내용은 그대로 — 재수집이 아니다. */
export function compactCache(dir = CACHE_ROOT) {
  let n = 0, before = 0, after = 0
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (!e.name.endsWith('.html')) continue
      const buf = fs.readFileSync(p)
      const gz = zlib.gzipSync(buf, { level: 6 })
      fs.writeFileSync(p + '.gz', gz)
      fs.unlinkSync(p)
      n++; before += buf.length; after += gz.length
    }
  }
  if (fs.existsSync(dir)) walk(dir)
  return { files: n, beforeBytes: before, afterBytes: after }
}

/** 동시 실행 풀. limit 은 CONC 로 상한이 걸린다. */
export async function pool(items, worker, limit = CONC) {
  const n = Math.min(limit, CONC)
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (true) {
      const k = i++
      if (k >= items.length) return
      out[k] = await worker(items[k], k)
    }
  }))
  return out
}

// ── HTML 유틸 ────────────────────────────────────────────────────────────────
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
export function decodeEntities(s) {
  if (s == null) return s
  return String(s)
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, k) => (k in ENT ? ENT[k] : m))
}
export const stripTags = (s) => decodeEntities(String(s).replace(/<[^>]*>/g, ' ')).replace(/[ \t ]+/g, ' ').trim()
export const squish = (s) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim())

/** 사이트가 표시한 총건수 배지. 없으면 null — 지어내지 않는다. */
export function siteBadgeTotal(html) {
  const m = html.match(/총\s*<span>\s*(\d+)\s*<\/span>\s*건/)
  return m ? +m[1] : null
}

/** id 로 감싸인 div 블록을 잘라낸다(중첩 div 깊이 추적). */
export function sliceDivById(html, id) {
  const start = html.indexOf(`<div id="${id}"`)
  if (start < 0) return ''
  let i = html.indexOf('>', start)
  if (i < 0) return ''
  let depth = 1
  const re = /<\/?div\b[^>]*>/gi
  re.lastIndex = i + 1
  let m
  while ((m = re.exec(html))) {
    if (m[0].startsWith('</')) { depth--; if (depth === 0) return html.slice(i + 1, m.index) }
    else if (!/\/>$/.test(m[0])) depth++
  }
  return html.slice(i + 1)
}

/** <img ...> 태그를 속성 객체 배열로. */
export function imgTags(html) {
  const out = []
  const re = /<img\b([^>]*)>/gi
  let m
  while ((m = re.exec(html))) {
    const attrs = {}
    const ar = /([a-zA-Z_:][-\w:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s">]+))/g
    let a
    while ((a = ar.exec(m[1]))) attrs[a[1].toLowerCase()] = decodeEntities(a[3] ?? a[4] ?? a[5] ?? '')
    out.push(attrs)
  }
  return out
}

export const abs = (u) => (!u ? null : /^https?:/i.test(u) ? u : BASE + (u.startsWith('/') ? '' : '/') + u)

/** /reuni/atchfile/(thumb|view)/<ID>.<ext> 에서 파일ID. 접두는 F 뿐이 아니다(P 계열 존재) → [A-Z]+\d+. */
export function atchFileId(u) {
  const m = String(u || '').match(/\/reuni\/atchfile\/(?:thumb|view)\/([A-Z]+\d+)\.(?:jpe?g|png|gif)/i)
  return m ? m[1] : null
}

export function writeJson(file, obj) {
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, JSON.stringify(obj, null, 1), 'utf8')
  const kb = (fs.statSync(file).size / 1024).toFixed(0)
  console.log(`-> ${path.relative(ROOT, file)} (${kb} KB)`)
}

export function netSummary() {
  return {
    requests: NET.calls, fromCache: NET.fromCache, failures: NET.fail,
    bytes: NET.bytes, delayMs: DELAY_MS, concurrency: CONC,
  }
}
