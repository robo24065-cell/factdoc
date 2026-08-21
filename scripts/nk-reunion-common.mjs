// nk-reunion-common.mjs — 이산가족정보통합시스템(reunion.unikorea.go.kr) 스토리 구획 수집 공용 유틸
//
// 기존 관례를 그대로 따른다(scripts/nk-museum-harvest.mjs):
//   · curl -k 필수 (이 사이트는 TLS 체인 문제가 있다)
//   · 세션: museum 계열은 mid 없이 부르면 302 → museum/view.do?gubn=A 로 JSESSIONID 를 먼저 받는다
//   · 요청 게이트: 최소 간격 강제(기본 700ms, 하한 500ms) · 동시 요청 1(직렬) — 브리핑의 "동시 ≤2" 를 만족
//   · 캐시: 북한자료-api/_cache/reunion/<코너>/ 에 원문 응답을 URL 해시로 저장. 재실행 시 다시 긁지 않는다
//   · --force 로 캐시 무시, --refetch-list 로 목록만 새로 받기
//
// ★ 미디어는 절대 내려받지 않는다. URL 과 메타데이터만 기록한다.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '..')
export const OUT_DIR = path.join(ROOT, '북한자료-api')
export const CACHE_ROOT = path.join(OUT_DIR, '_cache', 'reunion')
export const BASE = 'https://reunion.unikorea.go.kr'

export const args = process.argv.slice(2)
export const argOf = (k, d) => {
  const a = args.find(x => x.startsWith(`--${k}=`))
  return a ? a.split('=').slice(1).join('=') : d
}
export const FORCE = args.includes('--force')
export const DELAY_MS = Math.max(500, +argOf('delay', 700))   // 공공 서버 배려 — 하한 500ms
export const MAX_CONSEC_FAIL = 20

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
export const nowIso = () => new Date().toISOString()
export const kstDate = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)

// ── 요청 게이트 ───────────────────────────────────────────────────────────────
export const NET = { calls: 0, fromCache: 0, fail: 0, consecFail: 0, bytes: 0, lastAt: 0 }

/* ★ as-of 규약 — 수집일은 「실행한 날」이 아니라 「자료를 실제로 받아 온 날」이다.
     캐시에서만 읽고도 nowIso() 를 찍으면, 8-20 에 받은 자료가 8-25 실행에서 8-25 수집으로
     둔갑한다(실측 결함). 그래서 캐시 적중은 그 캐시 파일의 mtime 을, 새 요청은 지금 시각을
     여기에 쌓아 두고, 산출물은 그 최댓값을 수집 시각으로 쓴다. */
export const OBSERVED = []
export const observe = (ms) => { if (Number.isFinite(ms)) OBSERVED.push(ms) }
/** 실제로 받아 온 시각의 최댓값(ms). 아무것도 못 읽었으면 null — 지어내지 않는다. */
export const observedMs = () => (OBSERVED.length ? Math.max(...OBSERVED) : null)
/** 산출물에 적을 수집 시각(ISO). --collected-at 이 주어지면 그것이 우선한다. */
export function collectedIso() {
  const forced = argOf('collected-at', process.env.COLLECT_DATE || null)
  if (forced) return forced
  const ms = observedMs()
  return ms == null ? nowIso() : new Date(ms).toISOString()
}
/** 산출물에 적을 수집일(KST 달력 날짜). */
export function collectedKst() {
  const forced = argOf('collected-at', process.env.COLLECT_DATE || null)
  if (forced) return String(forced).slice(0, 10)
  const ms = observedMs()
  return new Date((ms == null ? Date.now() : ms) + 9 * 3600e3).toISOString().slice(0, 10)
}

export function makeSession(corner) {
  const dir = path.join(CACHE_ROOT, corner)
  fs.mkdirSync(dir, { recursive: true })
  const cookie = path.join(dir, 'cookies.txt')
  let sessionReady = false

  const cachePath = (url) =>
    path.join(dir, crypto.createHash('sha1').update(url).digest('hex').slice(0, 16) + '.bin')

  function curlRaw(url, { retries = 2 } = {}) {
    let last
    for (let a = 0; a <= retries; a++) {
      try {
        return execFileSync('curl', [
          '-sk', '--max-time', '120',
          '-A', 'Mozilla/5.0 (compatible; nk-reunion-harvest/1.0; 2026 통일부 공공데이터 공모전)',
          '-b', cookie, '-c', cookie,
          '-w', '\n__HTTP__%{http_code}', url,
        ], { maxBuffer: 1 << 28 })
      } catch (e) { last = e }
    }
    throw new Error(`curl 실패 — ${last?.message}`)
  }

  async function ensureSession() {
    if (sessionReady) return
    sessionReady = true
    // 세션 발급용. 실패해도 치명적이지 않다(일부 경로는 쿠키 없이도 200).
    try { await fetchText(`${BASE}/reuni/home/museum/view.do?gubn=A&mid=SM00000261`, '세션 발급', { noSession: true }) }
    catch { /* 무시 — 개별 요청에서 다시 판정한다 */ }
  }

  /**
   * 캐시 우선 GET. 반환 { text, cached }.  실패 시 null 반환(호출측이 failed 에 기록).
   */
  async function fetchText(url, label, { noSession = false, useCache = true } = {}) {
    const cp = cachePath(url)
    if (useCache && !FORCE && fs.existsSync(cp)) {
      NET.fromCache++
      /* 이 자료를 실제로 받아 온 시각 = 캐시 파일이 쓰인 때. 실행 시각이 아니다. */
      try { observe(fs.statSync(cp).mtimeMs) } catch { /* mtime 을 못 읽어도 본문은 유효하다 */ }
      return { text: fs.readFileSync(cp, 'utf8'), cached: true }
    }
    if (!noSession) await ensureSession()
    const wait = DELAY_MS - (Date.now() - NET.lastAt)
    if (wait > 0) await sleep(wait)
    NET.lastAt = Date.now()
    try {
      const buf = curlRaw(url)
      const s = buf.toString('utf8')
      const cut = s.lastIndexOf('\n__HTTP__')
      const code = +s.slice(cut + 9).trim()
      const body = s.slice(0, cut).replace(/^﻿+/, '')
      if (code !== 200) throw new Error(`HTTP ${code}`)
      NET.calls++; NET.bytes += body.length; NET.consecFail = 0
      if (useCache) fs.writeFileSync(cp, body, 'utf8')
      observe(Date.now())
      return { text: body, cached: false }
    } catch (e) {
      NET.calls++; NET.fail++; NET.consecFail++
      console.warn(`  ! 실패(${NET.consecFail}연속) ${label}: ${e.message || e}`)
      if (NET.consecFail >= MAX_CONSEC_FAIL) {
        throw new Error(`연속 실패 ${MAX_CONSEC_FAIL}회 — 중단(서버 이상 또는 차단 의심). 지금까지 받은 캐시는 남아 있으므로 재실행하면 이어서 받는다.`)
      }
      return null
    }
  }

  return { fetchText, cachePath, dir }
}

// ── HTML 유틸 (nk-museum-harvest.mjs 와 동일 규칙) ────────────────────────────
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
export function decodeEntities(s) {
  return String(s).replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, k) => ENT[k])
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, d) => String.fromCharCode(parseInt(d, 16)))
}
export function htmlToText(s) {
  return decodeEntities(
    String(s).replace(/<\s*br\s*\/?\s*>[ \t\r\n ]*/gi, '\n').replace(/<[^>]*>/g, '')
  ).split('\n').map(l => l.replace(/[ \t ]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim()
}
export const oneLine = (s) => htmlToText(s).replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim()
export const abs = (u) => !u ? null : (u.startsWith('http') ? u : BASE + (u.startsWith('/') ? u : '/' + u))

/** 사이트가 표시한 「총 N 건」 배지. 없으면 null — 지어내지 않는다. */
export function readTotalBadge(html) {
  const m = html.match(/<div class="totalNum">\s*총\s*<span>\s*([\d,]+)\s*<\/span>\s*건/)
  return m ? +m[1].replace(/,/g, '') : null
}

export function writeEnvelope(file, envelope) {
  const p = path.join(OUT_DIR, file)
  fs.writeFileSync(p, JSON.stringify(envelope, null, 2) + '\n', 'utf8')
  return p
}
