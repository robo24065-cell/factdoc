#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   참여(/pick) 카드 사진 파이프라인 — 위키미디어 공용 → 640px 파생본 + 저작자 데이터

   무엇을 하는가
     ① scripts/pick-photos.manifest.json(사람이 라이선스를 눈으로 확인한 목록)을 읽고
     ② Commons API(prop=imageinfo, iiprop=extmetadata|url|size, iiurlwidth=640)로
        각 파일의 라이선스·작가·원본 페이지를 **다시** 받아
        허용 화이트리스트(PD·CC0·CC-BY·CC-BY-SA — NC·ND·불명 금지)와 대조한다.
        불일치·불명이면 그 항목을 실패시키고 산출물에서 뺀다 — 자동 재검증이 정직성 장치다.
     ③ 640px 파생본(원본이 640px 이하면 원본 크기 그대로 — 업스케일 금지)을
        frontend/public/pick-img/{slug}.jpg 로 저장한다. 원본 핫링크 금지 충족.
        이미 있으면 내려받지 않는다(재실행 가능·캐시). --force 로 다시 받는다.
     ④ frontend/src/data/pick-photos.ts 를 생성한다 — ItemCard 가 itemKey 로 런타임 조인.
        pick-items.ts(다른 생성기 산출물)는 건드리지 않는다.

   CC BY-SA 파생본(축소본)은 동일 라이선스로 재배포한다 — 화면의 저작자 표시가 그 의무 이행이다.
   사용법: node scripts/nk-pick-images.mjs [--force]
   나가는 값: 전 항목 성공 0 · 하나라도 실패 1 (실패 항목은 산출물에서 빠진다 = 글자 카드)
   ────────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FORCE = process.argv.includes('--force')
const OUT_DIR = path.join(root, 'frontend/public/pick-img')
const OUT_TS = path.join(root, 'frontend/src/data/pick-photos.ts')
const MANIFEST = path.join(root, 'scripts/pick-photos.manifest.json')
const THUMB_W = 640
const UA = 'gohyang-on-pick-images/1.0 (2026 MOU public-data contest prototype; contact: data@unikorea.go.kr submission team)'

/* 허용 라이선스 — 파일 페이지의 LicenseShortName 기준. NC·ND 가 섞이면 즉시 탈락 */
function licenseAllowed(short) {
  const s = String(short ?? '').trim()
  if (!s) return false
  if (/\b(nc|nd)\b/i.test(s)) return false
  if (/^public domain/i.test(s) || /^pd\b/i.test(s)) return true
  if (/^cc0\b/i.test(s)) return true
  if (/^cc[ -]?by(-sa)?\b/i.test(s)) return true
  return false
}

const stripHtml = (s) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* 크기 조절은 이 기계에서 sharp 로 한다 — upload.wikimedia.org 가 2026 현재
   고정 크기 버킷만 서빙해서(임의 640px 요청은 HTTP 400 "Use thumbnail sizes listed…" 실측)
   API 가 준 유효 썸네일(960px 급)을 받아 긴 변 640px 로 줄인다. 업스케일 금지. */

async function api(titles) {
  const u = new URL('https://commons.wikimedia.org/w/api.php')
  u.searchParams.set('action', 'query')
  u.searchParams.set('format', 'json')
  u.searchParams.set('prop', 'imageinfo')
  u.searchParams.set('iiprop', 'extmetadata|url|size')
  u.searchParams.set('iiurlwidth', String(THUMB_W))
  u.searchParams.set('titles', titles.join('|'))
  const r = await fetch(u, { headers: { 'user-agent': UA } })
  if (!r.ok) throw new Error(`Commons API HTTP ${r.status}`)
  return r.json()
}

async function download(url) {
  /* upload.wikimedia.org 는 연속 요청을 429 로 막는다(실측) — 요청 간격 + 지수 대기 재시도 */
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { headers: { 'user-agent': UA } })
    if (r.status === 429 && attempt < 3) {
      await sleep(15000 * (attempt + 1))
      continue
    }
    if (!r.ok) throw new Error(`download HTTP ${r.status} — ${url}`)
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length < 1000) throw new Error(`download too small (${buf.length}B) — ${url}`)
    return buf
  }
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
fs.mkdirSync(OUT_DIR, { recursive: true })

/* Commons API 는 한 요청에 50 타이틀까지 — 27개라 한 번이면 되지만 안전하게 쪼갠다 */
const infoByTitle = new Map()
for (let i = 0; i < manifest.items.length; i += 40) {
  const batch = manifest.items.slice(i, i + 40).map((m) => m.commonsFile)
  const j = await api(batch)
  const norm = new Map((j.query?.normalized ?? []).map((n) => [n.to, n.from]))
  for (const p of Object.values(j.query?.pages ?? {})) {
    const orig = norm.get(p.title) ?? p.title
    infoByTitle.set(orig, p)
    if (orig !== p.title) infoByTitle.set(p.title, p)
  }
}

const ok = []
const failed = []
for (const m of manifest.items) {
  const page = infoByTitle.get(m.commonsFile)
  const ii = page?.imageinfo?.[0]
  const meta = ii?.extmetadata ?? {}
  const license = stripHtml(meta.LicenseShortName?.value)
  const licenseUrl = stripHtml(meta.LicenseUrl?.value) || null
  let artist = stripHtml(meta.Artist?.value) || '작자 미상'
  if (/unknown author/i.test(artist)) artist = '작자 미상'
  try {
    if (!ii) throw new Error('Commons 에 파일이 없다(삭제됐을 수 있음)')
    if (!licenseAllowed(license)) throw new Error(`라이선스 불허·불명: 「${license || '(없음)'}」`)
    const small = Math.max(ii.width ?? 0, ii.height ?? 0) <= THUMB_W   // 소형 원본 — 업스케일 금지
    const srcUrl = small ? ii.url : (ii.thumburl ?? ii.url)            // thumburl = 유효 버킷 크기(960px 급)
    const dest = path.join(OUT_DIR, `${m.slug}.jpg`)
    let size = fs.existsSync(dest) && !FORCE ? fs.statSync(dest).size : 0
    if (!size) {
      const buf = await download(srcUrl)
      /* 긴 변 640px 파생본 — 소형 원본은 fit:inside + withoutEnlargement 로 그대로 남는다 */
      await sharp(buf).rotate().resize({ width: THUMB_W, height: THUMB_W, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 }).toFile(dest)
      size = fs.statSync(dest).size
      await sleep(1200)
    }
    ok.push({
      key: m.key,
      slug: m.slug,
      caption: m.caption,
      author: artist,
      license,
      licenseUrl,
      sourcePage: ii.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(m.commonsFile.replace(/ /g, '_'))}`,
      width: Math.min(ii.width ?? THUMB_W, THUMB_W),
    })
    console.log(`✓ ${m.key} — ${license} · ${artist} · ${Math.round(size / 1024)}KB${small ? ' (소형 원본 그대로)' : ''}`)
  } catch (e) {
    failed.push({ key: m.key, reason: String(e?.message ?? e) })
    console.error(`✗ ${m.key} — ${e?.message ?? e}`)
  }
}

/* 산출물 — 검증을 통과한 항목만 적는다. 실패 항목은 글자 카드로 남는 것이 설계다 */
const record = Object.fromEntries(ok.map((p) => [p.key, {
  src: `/pick-img/${p.slug}.jpg`,
  caption: p.caption,
  author: p.author,
  license: p.license,
  licenseUrl: p.licenseUrl,
  sourcePage: p.sourcePage,
}]))

const ts = `/* 자동 생성 파일 — 손으로 고치지 마라. scripts/nk-pick-images.mjs 가 재생성한다.
   위키미디어 공용에서 라이선스를 재검증(PD·CC0·CC-BY·CC-BY-SA 만)하고 640px 파생본을
   frontend/public/pick-img/ 에 저장한 항목만 들어 있다. 없는 항목은 글자 카드가 설계다.
   CC 라이선스 표시 의무: 화면에서 author·license 를 반드시 함께 보여 줄 것.
   생성 ${new Date().toISOString().slice(0, 10)} · 항목 ${ok.length}/${manifest.items.length} (음식 ${ok.filter(p => p.key.startsWith('food-')).length}/16 · 말 ${ok.filter(p => p.key.startsWith('word-')).length}/16) */

export type PickPhoto = {
  /** frontend/public 기준 경로 — 640px 이하 파생본(소형 원본은 그대로) */
  src: string
  /** 캡션 — 「참고 사진」 여부와 실물과의 차이를 정직하게 적은 줄 */
  caption: string
  author: string
  license: string
  licenseUrl: string | null
  /** 위키미디어 공용 파일 페이지 — 저작자 표시 링크는 결과 화면에서만 건다 */
  sourcePage: string
}

const PICK_PHOTOS: Record<string, PickPhoto> = ${JSON.stringify(record, null, 2)}

export default PICK_PHOTOS
`
fs.writeFileSync(OUT_TS, ts)
console.log(`\n${failed.length ? '✗' : '✓'} ${ok.length}/${manifest.items.length} 확보 → ${path.relative(root, OUT_TS)}`)
if (failed.length) {
  console.error('실패 항목(글자 카드로 남음):')
  for (const f of failed) console.error(`  - ${f.key}: ${f.reason}`)
}
process.exit(failed.length ? 1 : 0)
