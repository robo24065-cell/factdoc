#!/usr/bin/env node
// nk-reunion-photo.mjs — 이산가족정보통합시스템 스토리 「이산가족상봉 이모저모」 전량 수집
//   → 북한자료-api/reunion-photo.json
//
// 대상(탭 3개 — 브리핑의 t1 하나가 아니다. 실측으로 t2·t3 를 추가했다):
//   t1 상봉행사 : new_list_t1.do?mid=SM00000134  (eqEventCd=ICD-03) — 앨범 21개
//   t2 초청행사 : new_list_t2.do?mid=SM00000134  (eqEventCd=ICD-01) — 앨범 24개
//   t3 동영상   : new_list_t3.do?mid=SM00000134                     — 영상 18건
//
// 실측 근거(2026-08-21 탐사):
//   · 정적 서버렌더 HTML. 내부 API 없음(CDP 렌더 시 XHR/Fetch 0건).
//   · ★ 배지 「총 N 건」은 t1/t2 에서 '앨범(행사) 수' 다. '사진 수' 가 아니다.
//     사진 수는 각 앨범 헤더의 별도 배지에 있다 — 그것을 합산해야 사진 총계가 나온다.
//   · ★ 앨범 자체에 페이징이 있고 10장/쪽 고정이다(페이저 UI 가 화면에 없다). limit 은 무시된다.
//   · ★★ 목록 페이지가 자기 page 값을 앨범 링크에 그대로 끌고 간다 → 앨범을 열 때 page=1 로 반드시 리셋.
//        리셋하지 않으면 앨범 앞 10장을 조용히 빠뜨린다.
//   · ★ 파일ID 접두가 두 종류다: F 계열(대부분) + P 계열(2018년 21차 3개 앨범). 정규식은 [A-Z]+\d+.
//   · 영상은 받지 않는다 — mp4 URL 과 메타데이터만.
//
// 지역: ★ 없다. 어떤 필드에도 이산가족의 고향 정보가 없다.
//   초청행사 제목의 지명(여수·속초 등)은 '남측 개최지' 이지 고향이 아니다 — 고향축에 붙이면 오류다.
//   그래서 이 파일은 지역 필드를 만들지 않는다. 이 코너는 시간축(행사기간)에 붙인다.
//
// 실행: node scripts/nk-reunion-photo.mjs [--force] [--delay=400] [--collected-at=YYYY-MM-DD]
// 재실행 가능·증분(HTML 디스크 캐시). 키 불필요.

import path from 'node:path'
import {
  BASE, OUT_DIR, CACHE_ROOT, collectedAt, DELAY_MS, CONC, FORCE,
  fetchCached, pool, siteBadgeTotal, sliceDivById, imgTags, abs, atchFileId,
  decodeEntities, squish, stripTags, writeJson, netSummary,
} from './nk-reunion-story-lib.mjs'

const MID = 'SM00000134'
const G = `${BASE}/reuni/home/pds/photo/gallery`
const listUrl = (t, page) => `${G}/new_list_t${t}.do?mid=${MID}&limit=9&page=${page}`
const albumUrl = (t, eqEvent, cd, page) => `${G}/new_list_sub_t${t}.do?eqEvent=${eqEvent}&mid=${MID}&eqEventCd=${cd}&page=${page}`
const CACHE = path.join(CACHE_ROOT, 'photo')
const OUT = path.join(OUT_DIR, 'reunion-photo.json')
const PER_LIST_PAGE = 9
const PER_ALBUM_PAGE = 10

const failed = []

// ── 앨범 목록 카드 파싱 ───────────────────────────────────────────────────────
function parseAlbumCards(html, tabNo) {
  const out = []
  const re = new RegExp(
    `<a\\s+href="new_list_sub_t${tabNo}\\.do\\?([^"]*)"\\s*>([\\s\\S]*?)<\\/a>`, 'gi')
  let m
  while ((m = re.exec(html))) {
    const qs = decodeEntities(m[1])
    const inner = m[2]
    const eqEvent = (qs.match(/eqEvent=(\d+)/) || [])[1]
    const eqEventCd = (qs.match(/eqEventCd=([A-Z0-9-]+)/) || [])[1] || null
    if (!eqEvent) continue
    const img = imgTags(inner)[0] || {}
    const title = squish(decodeEntities((inner.match(/<b class="titUnit">([\s\S]*?)<\/b>/) || [])[1] || '')) || null
    const spans = [...inner.matchAll(/<span(?![^>]*class="imgUnit")[^>]*>([\s\S]*?)<\/span>/g)].map(x => squish(stripTags(x[1]))).filter(Boolean)
    const period = spans.find(s => /^\d{4}-\d{2}-\d{2}~\d{4}-\d{2}-\d{2}$/.test(s)) || spans[spans.length - 1] || null
    out.push({
      tab: `t${tabNo}`, eqEvent: +eqEvent, eqEventCd,
      title, period,
      coverThumbUrl: abs(img.src) || null,
      coverAltRaw: img.alt || null,        // 원본 파일명이 그대로 들어 있다(예 "3-RIM_1630.jpg")
      albumUrl: albumUrl(tabNo, eqEvent, eqEventCd, 1),   // ★ page=1 리셋
    })
  }
  return out
}

// ── 앨범 안 사진 파싱 ────────────────────────────────────────────────────────
function parseAlbumPage(html) {
  const header = {
    title: squish(decodeEntities((html.match(/<div class="titCont">\s*<h3>([\s\S]*?)<\/h3>/) || [])[1] || '')) || null,
    photoBadge: siteBadgeTotal(html),
    period: squish(decodeEntities((html.match(/<span>행사기간<\/span>([\s\S]*?)<\/div>/) || [])[1] || '')) || null,
  }
  const nav = sliceDivById(html, 'slick_galleryView_nav')
  const photos = imgTags(nav)
    .filter(a => atchFileId(a.src))
    .map(a => ({
      fileId: atchFileId(a.src),
      thumbUrl: abs(a.src),
      viewUrl: abs(a['data-img'] || a.src.replace('/thumb/', '/view/')),
      altRaw: a.alt || null,      // "<앨범제목> N번째 사진" — N 이 전부 1 이라 순번으로 못 쓴다
    }))
  return { header, photos }
}

// ── t3 동영상 파싱 ───────────────────────────────────────────────────────────
function parseVideoList(html) {
  const out = []
  const re = /<li>\s*<a href="([^"]*new_view\.do\?[^"]*)"\s*>([\s\S]*?)<\/a>\s*<\/li>/gi
  let m
  while ((m = re.exec(html))) {
    const href = decodeEntities(m[1]); const inner = m[2]
    const id = (href.match(/[?&]id=(\d+)/) || [])[1]
    if (!id) continue
    const poster = (inner.match(/poster="([^"]*)"/) || [])[1] || null
    const mp4 = (inner.match(/<source[^>]*src="([^"]*)"/) || [])[1] || null
    const title = squish(decodeEntities((inner.match(/<b class="titUnit">([\s\S]*?)<\/b>/) || [])[1] || '')) || null
    const spans = [...inner.matchAll(/<span>([\s\S]*?)<\/span>/g)].map(x => squish(stripTags(x[1])))
    const reg = spans.find(s => s.startsWith('등록자')) || null
    const day = spans.find(s => s.startsWith('등록일자')) || null
    out.push({
      id: +id, title,
      registeredOn: day ? squish(day.replace(/^등록일자\s*[:：]\s*/, '')) : null,
      // 등록자 필드는 운영 계정명이다. 수집은 하되 화면 노출 금지(meta.note 참조).
      registrantAccountRaw: reg ? squish(reg.replace(/^등록자\s*[:：]\s*/, '')) : null,
      posterUrl: decodeEntities(poster),
      videoUrl: decodeEntities(mp4),
      sourceUrl: abs(href.replace(/&amp;/g, '&')),
    })
  }
  return out
}

async function collectListPages(tabNo) {
  const p1 = await fetchCached(listUrl(tabNo, 1), { cacheDir: CACHE, key: `list_t${tabNo}_p1`, label: `t${tabNo} 목록 1쪽` })
  if (!p1.ok) { failed.push({ what: `t${tabNo} 목록 1쪽`, url: listUrl(tabNo, 1), reason: p1.error || `HTTP ${p1.code}` }); return { badge: null, cards: [] } }
  const badge = siteBadgeTotal(p1.body)
  const pages = badge ? Math.ceil(badge / PER_LIST_PAGE) : 1
  const cards = parseAlbumCards(p1.body, tabNo)
  for (let p = 2; p <= pages; p++) {
    const r = await fetchCached(listUrl(tabNo, p), { cacheDir: CACHE, key: `list_t${tabNo}_p${p}`, label: `t${tabNo} 목록 ${p}쪽` })
    if (!r.ok) { failed.push({ what: `t${tabNo} 목록 ${p}쪽`, url: listUrl(tabNo, p), reason: r.error || `HTTP ${r.code}` }); continue }
    cards.push(...parseAlbumCards(r.body, tabNo))
  }
  // 같은 eqEvent 가 두 번 나오면 접는다(페이지 경계 중복 방어)
  const seen = new Set(); const uniq = []
  for (const c of cards) { const k = `${c.tab}:${c.eqEvent}`; if (seen.has(k)) continue; seen.add(k); uniq.push(c) }
  return { badge, cards: uniq }
}

async function collectAlbum(card) {
  const tabNo = +card.tab.slice(1)
  const first = await fetchCached(albumUrl(tabNo, card.eqEvent, card.eqEventCd, 1),
    { cacheDir: CACHE, key: `alb_t${tabNo}_${card.eqEvent}_p1`, label: `${card.title} 1쪽` })
  if (!first.ok) {
    failed.push({ what: `앨범 ${card.tab}#${card.eqEvent} ${card.title} 1쪽`, url: card.albumUrl, reason: first.error || `HTTP ${first.code}` })
    return { ...card, photoBadge: null, photos: [], pages: 0 }
  }
  const { header, photos } = parseAlbumPage(first.body)
  const badge = header.photoBadge
  const pages = badge ? Math.ceil(badge / PER_ALBUM_PAGE) : 1
  const all = [...photos]
  const rest = []
  for (let p = 2; p <= pages; p++) rest.push(p)
  const results = await pool(rest, async (p) => {
    const u = albumUrl(tabNo, card.eqEvent, card.eqEventCd, p)
    const r = await fetchCached(u, { cacheDir: CACHE, key: `alb_t${tabNo}_${card.eqEvent}_p${p}`, label: `${card.title} ${p}쪽` })
    if (!r.ok) { failed.push({ what: `앨범 ${card.tab}#${card.eqEvent} ${card.title} ${p}쪽`, url: u, reason: r.error || `HTTP ${r.code}` }); return [] }
    return parseAlbumPage(r.body).photos
  })
  for (const arr of results) all.push(...arr)
  const seen = new Set(); const uniq = []
  for (const ph of all) { if (seen.has(ph.fileId)) continue; seen.add(ph.fileId); uniq.push(ph) }
  return {
    ...card,
    titleFromAlbum: header.title,
    periodFromAlbum: header.period,
    photoBadge: badge,
    pages,
    photos: uniq,
    duplicateFileIdsWithinAlbum: all.length - uniq.length,
  }
}

async function main() {
  console.log(`[photo] 수집 시작 — delay=${DELAY_MS}ms conc=${CONC}${FORCE ? ' (force)' : ''}`)

  const t1 = await collectListPages(1)
  const t2 = await collectListPages(2)
  console.log(`  앨범 목록 — t1 배지 ${t1.badge ?? '?'} / 카드 ${t1.cards.length} · t2 배지 ${t2.badge ?? '?'} / 카드 ${t2.cards.length}`)

  const cards = [...t1.cards, ...t2.cards]
  const albums = []
  let done = 0
  for (const c of cards) {
    const a = await collectAlbum(c)
    albums.push(a)
    done++
    console.log(`  [${done}/${cards.length}] ${a.tab}#${a.eqEvent} ${a.title} — 배지 ${a.photoBadge ?? '?'} / 수집 ${a.photos.length}장`)
  }

  // t3 동영상
  const v1 = await fetchCached(listUrl(3, 1), { cacheDir: CACHE, key: 'list_t3_p1', label: 't3 1쪽' })
  let videos = [], t3Badge = null
  if (v1.ok) {
    t3Badge = siteBadgeTotal(v1.body)
    videos = parseVideoList(v1.body)
    const vpages = t3Badge ? Math.ceil(t3Badge / PER_LIST_PAGE) : 1
    for (let p = 2; p <= vpages; p++) {
      const r = await fetchCached(listUrl(3, p), { cacheDir: CACHE, key: `list_t3_p${p}`, label: `t3 ${p}쪽` })
      if (!r.ok) { failed.push({ what: `t3 ${p}쪽`, url: listUrl(3, p), reason: r.error || `HTTP ${r.code}` }); continue }
      videos.push(...parseVideoList(r.body))
    }
    const vs = new Set(); videos = videos.filter(v => (vs.has(v.id) ? false : (vs.add(v.id), true)))
  } else {
    failed.push({ what: 't3 목록 1쪽', url: listUrl(3, 1), reason: v1.error || `HTTP ${v1.code}` })
  }
  console.log(`  t3 동영상 — 배지 ${t3Badge ?? '?'} / 수집 ${videos.length}건`)

  // 사진 평탄화
  const items = []
  for (const a of albums) {
    for (const ph of a.photos) {
      items.push({
        fileId: ph.fileId,
        albumTab: a.tab,
        albumEventCd: a.eqEventCd,
        eqEvent: a.eqEvent,
        albumTitle: a.titleFromAlbum || a.title,
        eventPeriod: a.periodFromAlbum || a.period,   // 자료의 기준일 = 행사기간(수집일과 다르다)
        thumbUrl: ph.thumbUrl,
        viewUrl: ph.viewUrl,
        altRaw: ph.altRaw,
        sourceUrl: a.albumUrl,
      })
    }
  }

  const photoBadgeSum = albums.reduce((s, a) => s + (a.photoBadge || 0), 0)
  const uniqAll = new Set(items.map(i => i.fileId))
  const crossAlbumDup = items.length - uniqAll.size

  const out = {
    source: '통일부 이산가족정보통합시스템 — 스토리 > 이산가족상봉 이모저모 (상봉행사·초청행사 사진 + 동영상)',
    url: `${G}/new_list_t1.do?mid=${MID}`,
    /* 수집일 = 실제로 받아 온 날(캐시 적중이면 그 캐시가 쓰인 날). 실행일이 아니다. */
    collectedAt: collectedAt(),
    total: photoBadgeSum,     // 사진 총건수 = 앨범별 사이트 배지의 합. 지어낸 값 아님.
    totalBreakdown: {
      albumsT1SiteBadge: t1.badge, albumsT1Collected: t1.cards.length,
      albumsT2SiteBadge: t2.badge, albumsT2Collected: t2.cards.length,
      videosT3SiteBadge: t3Badge, videosT3Collected: videos.length,
      photosFromAlbumBadges: photoBadgeSum, photosCollected: items.length,
      note: 't1/t2 의 「총 N 건」은 앨범(행사) 수다. 사진 수는 각 앨범 헤더 배지의 합이다.',
    },
    items,
    albums: albums.map(({ photos, ...a }) => ({ ...a, photoCount: photos.length })),
    videos,
    meta: {
      failed,
      note: [
        '탭 3개를 모두 수집했다 — t1 상봉행사(ICD-03) · t2 초청행사(ICD-01) · t3 동영상.',
        'items[] 는 사진 낱장이다. albums[] 는 앨범 메타(제목·행사기간·배지·수집장수), videos[] 는 t3 영상 메타.',
        '앨범 링크는 목록쪽 page 값을 끌고 가는 함정이 있어 반드시 page=1 로 리셋해 열었다.',
        '파일ID 접두가 F 계열과 P 계열(2018년 21차 3개 앨범) 두 가지다 — [A-Z]+\\d+ 로 잡았다.',
        '★ 지역 필드를 만들지 않았다. 이 코너에는 이산가족의 고향 정보가 어떤 필드에도 없다. 초청행사 제목의 지명은 남측 개최지이지 고향이 아니다 — 고향축에 붙이면 오류다. 시간축(eventPeriod)에 붙일 것.',
        '영상은 URL 과 메타데이터만 기록했다. 파일은 내려받지 않았다.',
        'videos[].registrantAccountRaw 는 운영 계정명이다(fnsvalue1 등). 원문 보존을 위해 담았을 뿐 화면에 노출하지 말 것.',
        '제목에 인코딩 깨짐이 있다(예: 쉼표가 ¸ 로 저장). 원문 그대로 두었다 — 교정은 표시 단계의 판단이다.',
        '권리: 제공처 표기가 없고 공공누리(KOGL) 표시도 없다. 사진 안에 이산가족 얼굴이 그대로 나온다 — 표시 시 주의.',
        'as-of: collectedAt 은 수집일. 자료의 기준일은 각 앨범의 eventPeriod 다. 2018년 21차 이후 신규 앨범이 없는 것은 「자료 미갱신」이 아니라 「상봉행사 자체가 2018년에 멈췄다」는 뜻이다(frozen 성격).',
      ].join('\n'),
      uniqueFileIds: uniqAll.size,
      crossAlbumDuplicateFileIds: crossAlbumDup,
      duplicateCheck: crossAlbumDup === 0
        ? '앨범 전량을 fileId 로 대조한 결과 앨범 간 중복 0건 — 제목이 비슷한 앨범(19차 3개, 15차 2개)도 서로 다른 사진이다.'
        : `앨범 간 중복 fileId ${crossAlbumDup}건 — 통합 단계에서 접어야 한다.`,
      badgeVsCollected: {
        photos: {
          siteBadgeSum: photoBadgeSum, collected: items.length, gap: photoBadgeSum - items.length,
          gapReason: photoBadgeSum === items.length ? null
            : '앨범 배지(등록 건수) 중 일부가 <img> 없이 빈 슬롯으로 렌더된다. 실측: 앨범 t1#37 1쪽은 10건을 페이징하면서 <img> 는 8개만 그린다(빈 반복 블록이 마크업에 남아 있다). 이미지가 없으므로 URL 자체를 만들 수 없어 수집 불가 — 누락이 아니라 원본에 이미지가 없는 것이다.',
          gapByAlbum: albums.filter(a => (a.photoBadge || 0) !== a.photos.length)
            .map(a => ({ tab: a.tab, eqEvent: a.eqEvent, title: a.titleFromAlbum || a.title, siteBadge: a.photoBadge, collected: a.photos.length, gap: (a.photoBadge || 0) - a.photos.length })),
        },
        albumsT1: { siteBadge: t1.badge, collected: t1.cards.length, gap: (t1.badge || 0) - t1.cards.length },
        albumsT2: { siteBadge: t2.badge, collected: t2.cards.length, gap: (t2.badge || 0) - t2.cards.length },
        videosT3: { siteBadge: t3Badge, collected: videos.length, gap: (t3Badge || 0) - videos.length },
      },
      overlapWithMuseum: 'museum.json(4,342건)과 겹치지 않는다. 박물관에 「상봉행사」 제목 레코드가 있으나 전부 개인 기증 유물이고 저장소·ID 체계가 다르다(HandLttrImageView.do?file_id=<정수> vs /reuni/atchfile/<F|P 접두>).',
      network: netSummary(),
    },
  }

  writeJson(OUT, out)
  console.log(`[photo] 완료 — 앨범 ${albums.length}개 · 사진 배지합 ${photoBadgeSum} / 수집 ${items.length}장 · 영상 ${videos.length}건 · 실패 ${failed.length}건`)
}

main().catch(e => { console.error(e); process.exit(1) })
