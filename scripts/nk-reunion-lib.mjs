#!/usr/bin/env node
// nk-reunion-lib.mjs — 이산가족정보통합시스템(reunion.unikorea.go.kr) 「디지털박물관」 코너 수집기 공용 계층
//
// 이 모듈은 데이터를 만들지 않는다. 네트워크 예의·캐시·재실행 가능성만 책임진다.
//   · 요청 게이트: 동시 1(≤2 규칙 충족) + 요청 간 최소 간격(기본 500ms, 하한 400ms)
//   · 캐시: 북한자료-api/_cache/reunion-museum/<corner>/  — 재실행 시 네트워크를 다시 때리지 않는다
//   · 세션: mid 없이 부르면 302 → museum/view.do 로 JSESSIONID 를 먼저 받아 물고 다닌다
//   · TLS: reunion.unikorea.go.kr 은 체인 문제가 있어 curl -k 필수(기존 nk-museum-harvest.mjs 와 동일)
//   · 실패는 삼키지 않는다. ctx.failed[] 에 사유와 함께 쌓여 산출물 meta.failed 로 나간다.
//
// 공통 봉투(모든 코너 산출물이 이 모양이다):
//   { source, corner, url, collectedAt, total, items[], meta:{ failed[], note, ... } }
//
// 사용:
//   import { createCtx, writeEnvelope, ... } from './nk-reunion-lib.mjs'

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '..')
export const OUT_DIR = path.join(ROOT, '북한자료-api')
export const CACHE_ROOT = path.join(OUT_DIR, '_cache', 'reunion-museum')

export const BASE = 'https://reunion.unikorea.go.kr'
export const MID = {
  museum: 'SM00000261',      // 박물관 진입 = 세션 발급
  letter: 'SM00000262',      // 손편지 · 이미지 뷰어
  collection: 'SM00000263',
  archive: 'SM00000264',
  donation: 'SM00000265',
  search: 'SM00000268',
  yearbook: 'SM00000276',
}
export const SESSION_URL = `${BASE}/reuni/home/museum/view.do?gubn=A&mid=${MID.museum}`

// ── 인자 ─────────────────────────────────────────────────────────────────────
export function parseArgs(argv = process.argv.slice(2)) {
  const flag = (k) => argv.includes(`--${k}`)
  const val = (k, d) => {
    const a = argv.find(x => x.startsWith(`--${k}=`))
    return a ? a.split('=').slice(1).join('=') : d
  }
  return {
    force: flag('force'),
    dryRun: flag('dry-run'),
    delay: Math.max(400, +val('delay', 500)),
    /* ★ 수집일은 **실행한 날이 아니라 자료를 실제로 받아 온 날**이다.
         collectedAtForced 가 있으면 그 값이 우선하고, 없으면 산출물을 쓰기 직전에
         stampCollected(ctx, args) 가 캐시 색인의 fetch 시각으로 다시 정한다.
         기본값은 그 계산이 아무것도 못 찾았을 때의 폴백일 뿐이다. */
    collectedAtForced: val('collected-at', process.env.COLLECT_DATE || null),
    collectedAt: val('collected-at', process.env.COLLECT_DATE || todayKST()),
    collectedAtStamp: nowKSTStamp(),
    limit: val('limit', null) == null ? null : +val('limit', null),
    raw: argv,
    val, flag,
  }
}

// as-of 규약: 수집일은 KST 기준 달력 날짜로 못박는다(UTC 로 밀려 하루 어긋나는 것을 막는다).
export function todayKST() {
  const d = new Date(Date.now() + 9 * 3600 * 1000)
  return d.toISOString().slice(0, 10)
}
export function nowKSTStamp() {
  const d = new Date(Date.now() + 9 * 3600 * 1000)
  return d.toISOString().slice(0, 19).replace('T', ' ') + ' KST'
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex')

// ── 컨텍스트 ─────────────────────────────────────────────────────────────────
export function createCtx({ corner, delay = 500, force = false, maxConsecFail = 20 }) {
  const cacheDir = path.join(CACHE_ROOT, corner)
  fs.mkdirSync(cacheDir, { recursive: true })
  const cookieFile = path.join(cacheDir, 'cookies.txt')
  const indexFile = path.join(cacheDir, '_index.json')
  let index = {}
  try { index = JSON.parse(fs.readFileSync(indexFile, 'utf8')) } catch { index = {} }

  const ctx = {
    corner,
    delay: Math.max(400, delay),
    force,
    cacheDir,
    cookieFile,
    failed: [],
    /** 이번 실행에서 **실제로 받아 온 시각**들("YYYY-MM-DD HH:MM:SS KST"). 캐시 적중은 캐시에 적힌 값. */
    observedStamps: [],
    net: { calls: 0, cacheHits: 0, failures: 0, bytes: 0, lastAt: 0, consecFail: 0 },
    sessionReady: false,
    log(...a) { console.log(`[${corner}]`, ...a) },
    warn(...a) { console.warn(`[${corner}] ⚠`, ...a) },
    note(label, reason, extra) {
      ctx.failed.push({ label, reason: String(reason), ...(extra || {}) })
    },
    saveIndex() { fs.writeFileSync(indexFile, JSON.stringify(index, null, 1)) },
  }

  async function gate() {
    const wait = ctx.delay - (Date.now() - ctx.net.lastAt)
    if (wait > 0) await sleep(wait)
    ctx.net.lastAt = Date.now()
  }

  function curlRaw(extra, { retries = 2 } = {}) {
    let last
    for (let a = 0; a <= retries; a++) {
      try {
        return execFileSync('curl', [
          '-sk', '--max-time', '120',
          '-A', 'Mozilla/5.0 (compatible; nk-reunion-harvest/1.0; +goyang-itgi)',
          '-b', cookieFile, '-c', cookieFile,
          ...extra,
        ], { maxBuffer: 1 << 28 })
      } catch (e) { last = e }
    }
    throw new Error(String(last?.message || last))
  }

  async function ensureSession() {
    if (ctx.sessionReady) return
    await gate()
    try {
      curlRaw(['-o', path.join(cacheDir, '.session.html'), SESSION_URL])
      ctx.sessionReady = true
      ctx.net.calls++
    } catch (e) {
      ctx.note('session', `세션 발급 실패: ${e.message}`)
      throw new Error(`세션 발급 실패 — ${e.message}`)
    }
  }

  // key 는 캐시 식별자이자 사람이 읽는 라벨이다.
  function cacheRead(key) {
    if (ctx.force) return null
    const h = sha1(key)
    const f = path.join(cacheDir, h + '.txt')
    if (!index[h] || !fs.existsSync(f)) return null
    ctx.net.cacheHits++
    /* 이 자료를 실제로 받아 온 시각 = 캐시에 적힌 at. 산출물의 수집일은 이 값들의 최댓값이다. */
    if (index[h].at) ctx.observedStamps.push(index[h].at)
    return fs.readFileSync(f, 'utf8')
  }
  function cacheWrite(key, body) {
    const h = sha1(key)
    fs.writeFileSync(path.join(cacheDir, h + '.txt'), body, 'utf8')
    const at = nowKSTStamp()
    index[h] = { key, at, bytes: Buffer.byteLength(body) }
    ctx.observedStamps.push(at)
  }

  function noteOk(bytes) { ctx.net.calls++; ctx.net.bytes += bytes; ctx.net.consecFail = 0 }
  function noteFail(label, err) {
    ctx.net.calls++; ctx.net.failures++; ctx.net.consecFail++
    ctx.warn(`실패(${ctx.net.consecFail}연속) ${label}: ${err}`)
    if (ctx.net.consecFail >= maxConsecFail) {
      throw new Error(`연속 실패 ${maxConsecFail}회 — 중단(서버 이상 또는 차단 의심). 지금까지 받은 것은 캐시에 남아 있으므로 재실행하면 이어서 받는다.`)
    }
  }

  // GET — 캐시 우선
  ctx.get = async function get(url, label, { session = true, noCache = false } = {}) {
    const key = `GET ${url}`
    if (!noCache) { const c = cacheRead(key); if (c != null) return c }
    if (session) await ensureSession()
    await gate()
    try {
      const buf = curlRaw(['-w', '\n__HTTP__%{http_code}', url])
      const s = buf.toString('utf8')
      const cut = s.lastIndexOf('\n__HTTP__')
      const code = +s.slice(cut + 9).trim()
      const body = s.slice(0, cut).replace(/^﻿+/, '')
      if (code !== 200) throw new Error(`HTTP ${code}`)
      noteOk(body.length)
      if (!noCache) { cacheWrite(key, body); ctx.saveIndex() }
      return body
    } catch (e) { noteFail(label, e.message || e); ctx.note(label, e.message || e, { url }); return null }
  }

  // POST(form) — 캐시 우선. body 는 이미 인코딩된 문자열.
  ctx.post = async function post(url, body, label, { session = true, noCache = false, referer = null } = {}) {
    const key = `POST ${url}\n${body}`
    if (!noCache) { const c = cacheRead(key); if (c != null) return c }
    if (session) await ensureSession()
    await gate()
    try {
      const extra = ['-X', 'POST', '-H', 'Content-Type: application/x-www-form-urlencoded',
        '--data-binary', body, '-w', '\n__HTTP__%{http_code}', url]
      if (referer) extra.unshift('-H', `Referer: ${referer}`)
      const buf = curlRaw(extra)
      const s = buf.toString('utf8')
      const cut = s.lastIndexOf('\n__HTTP__')
      const code = +s.slice(cut + 9).trim()
      const out = s.slice(0, cut).replace(/^﻿+/, '')
      if (code !== 200) throw new Error(`HTTP ${code}`)
      noteOk(out.length)
      if (!noCache) { cacheWrite(key, out); ctx.saveIndex() }
      return out
    } catch (e) { noteFail(label, e.message || e); ctx.note(label, e.message || e, { url, body }); return null }
  }

  ctx.finish = () => { ctx.saveIndex() }
  return ctx
}

// ── HTML 유틸 ────────────────────────────────────────────────────────────────
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
export function decodeEntities(s) {
  return String(s).replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, k) => ENT[k])
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, d) => String.fromCharCode(parseInt(d, 16)))
}
// <br> 은 줄바꿈으로 살린다(사료 '내용'이 줄 단위 서술이라 의미가 실린다).
export function htmlToText(s) {
  if (s == null) return null
  return decodeEntities(
    String(s)
      .replace(/<\s*br\s*\/?>\s*/gi, '\n')
      .replace(/<[^>]*>/g, '')
  ).replace(/\r/g, '').split('\n').map(l => l.replace(/[ \t ]+/g, ' ').trim()).join('\n').trim()
}
export function stripTags(s) {
  if (s == null) return null
  return decodeEntities(String(s).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
}
export function totCntOf(html) {
  const m = html && html.match(/id="totCnt"\s+value="(\d+)"/)
  return m ? +m[1] : null
}

// 손편지(HandLttrList.do)와 기록관(ArchivesList.do)은 **같은 카드 마크업**을 쓴다 — 파서를 공유한다.
//   <li><a onClick="jsRecordView('11892')" class="list-item">
//     <div class="img-wrap" style="background-image:url(...HandLttrImageView.do?file_id=26498)">
//       <span class="a11y">제목</span></div>
//     <strong class="tit ellip">제목</strong>
//     <span class="data">2018.06.15</span> <span class="name">기증자</span>
//     <p class="dec">내용 전문</p>
// ★ 이미지가 없는 사료가 실제로 있다(museum.json 실측 3건) — img-wrap 없음을 정상으로 취급한다.
export function parseListCards(html) {
  if (!html) return []
  const out = []
  const re = /onClick="jsRecordView\('(\d+)'\)"/g
  const marks = []
  let m
  while ((m = re.exec(html))) marks.push({ iId: +m[1], at: m.index })
  for (let k = 0; k < marks.length; k++) {
    const seg = html.slice(marks[k].at, k + 1 < marks.length ? marks[k + 1].at : html.length)
    const fid = seg.match(/HandLttrImageView\.do\?file_id=(\d+)/)
    const tit = seg.match(/<strong class="tit[^"]*">([\s\S]*?)<\/strong>/)
    const a11y = seg.match(/<span class="a11y">([\s\S]*?)<\/span>/)
    const data = seg.match(/<span class="data">([\s\S]*?)<\/span>/)
    const name = seg.match(/<span class="name">([\s\S]*?)<\/span>/)
    const dec = seg.match(/<p class="dec">([\s\S]*?)<\/p>/)
    const produced = data ? stripTags(data[1]) : null
    out.push({
      iId: marks[k].iId,
      title: tit ? stripTags(tit[1]) : (a11y ? stripTags(a11y[1]) : null),
      producedOn: produced && produced.length ? produced : null,
      name: name ? stripTags(name[1]) : null,      // 카드의 이름칸 = 기증자(museum.json 실측 215/215 일치)
      content: dec ? htmlToText(dec[1]) : null,
      thumbFileId: fid ? +fid[1] : null,
      thumbUrl: fid ? `${BASE}/reuni/home/museum/archive/letter/HandLttrImageView.do?mid=${MID.letter}&file_id=${fid[1]}` : null,
    })
  }
  return out
}

// ── 산출물 ───────────────────────────────────────────────────────────────────
/* ★ 수집일 확정 — 산출물을 쓰기 **직전에** 부른다.
     args.collectedAt / args.collectedAtStamp 를 「실제로 받아 온 시각」의 최댓값으로 덮어쓴다.
     --collected-at 로 못박았으면 그대로 둔다. 캐시에서 아무것도 못 읽었으면(전부 새 요청 실패 등)
     기존 폴백값을 그대로 둔다 — 지어내지 않는다.
     반환: { date, stamp, observed } — 호출부가 로그로 찍을 수 있게. */
export function stampCollected(ctx, args) {
  if (args.collectedAtForced) {
    args.collectedAt = String(args.collectedAtForced).slice(0, 10)
    return { date: args.collectedAt, stamp: args.collectedAtStamp, observed: false, forced: true }
  }
  const st = (ctx?.observedStamps ?? []).filter(Boolean).sort()
  if (!st.length) return { date: args.collectedAt, stamp: args.collectedAtStamp, observed: false, forced: false }
  const max = st[st.length - 1]
  args.collectedAt = max.slice(0, 10)
  args.collectedAtStamp = max
  return { date: args.collectedAt, stamp: max, observed: true, forced: false }
}

export function writeEnvelope(fileName, envelope) {
  const out = path.join(OUT_DIR, fileName)
  fs.writeFileSync(out, JSON.stringify(envelope, null, 1) + '\n', 'utf8')
  return out
}

// museum.json 과의 겹침 판정 — 이번 수집이 '새 사료'인지 '이미 가진 것'인지 정직하게 적기 위한 것.
// 새 건수를 만들어 내는 수집인지 아닌지가 기록 밀도 분자에 직결되므로 반드시 확인한다.
export function loadMuseumIds() {
  const f = path.join(OUT_DIR, 'museum.json')
  if (!fs.existsSync(f)) return null
  const j = JSON.parse(fs.readFileSync(f, 'utf8'))
  const recs = j.records || j.items || []
  return {
    total: recs.length,
    ids: new Set(recs.map(r => +r.iId)),
    byId: new Map(recs.map(r => [+r.iId, r])),
    builtAt: j.builtAt || null,
  }
}
export function overlapReport(ids, museum) {
  if (!museum) return { checked: false, note: 'museum.json 없음 — 겹침 판정 불가' }
  const uniq = [...new Set(ids.map(Number))]
  const inMuseum = uniq.filter(i => museum.ids.has(i))
  const notIn = uniq.filter(i => !museum.ids.has(i))
  return {
    checked: true,
    museumTotal: museum.total,
    museumBuiltAt: museum.builtAt,
    uniqueIds: uniq.length,
    alreadyInMuseumJson: inMuseum.length,
    newToMuseumJson: notIn.length,
    newIdsSample: notIn.slice(0, 50),
    note: notIn.length === 0
      ? '전량이 museum.json 4,342건 안에 있다 — 새 사료 0건. 기록 밀도 분자에 더하면 이중계상이다.'
      : `museum.json 에 없는 iId 가 ${notIn.length}건 있다 — 통합 단계에서 원인을 확인할 것.`,
  }
}

export const LICENSE_NOTE =
  '공공누리(KOGL) 등 개방형 라이선스 표기를 사이트에서 찾지 못했다. 푸터 표기는 ' +
  '"COPYRIGHT 2020 (C) Integrated information system for separated families. ALL RIGHTS RESERVED." 뿐이다. ' +
  '사료 원본은 기증자 저작물이므로 이 산출물은 메타데이터와 URL 만 담고 미디어 바이너리는 저장하지 않는다. ' +
  '화면에서는 원문 페이지로 링크하고 제공처를 함께 표기할 것.'
