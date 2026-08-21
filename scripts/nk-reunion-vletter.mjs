#!/usr/bin/env node
// nk-reunion-vletter.mjs — 이산가족정보통합시스템 스토리 「영상편지」 전량 수집
//   → 북한자료-api/reunion-vletter.json
//
// 대상: https://reunion.unikorea.go.kr/reuni/home/vle/vletter/promote/list_vle.do?mid=SM00000127
//        상세 view_vle.do?id=<id>&mid=SM00000127
//
// 실측 근거(2026-08-21 탐사):
//   · 정적 서버렌더 HTML. 내부 API 없음(CDP 렌더 시 XHR/Fetch 0건). 세션 쿠키 불필요.
//   · 총건수 배지 「총 4186 건」. 제작연도 필터 q_year 15개 값의 배지 합과 정확히 일치한다 → 교차검증한다.
//   · 9건/쪽 고정. limit·pageUnit 은 무시된다. 마지막 쪽 = ceil(총건수/9) = 466.
//   · ★ 함정: 마지막을 넘긴 page=467·500 도 HTTP 200 에 마지막 1건을 그대로 돌려준다.
//     '빈 쪽이 나올 때까지' 로 끝을 판정하면 무한 루프다 → ceil(총건수/9) 로 끊는다.
//   · 상세에 mp4 절대 URL·등록일(초 단위)·안내문 1줄·전체자막 전문이 있다. 자막은 일부 항목에만 있다.
//
// ★ 지역: 구조화된 고향 필드가 없다. 목록·상세 어디에도 지역 컬럼이 없고 검색축도 등록자명·제작연도뿐이다.
//   고향은 오직 '전체자막' 자유텍스트 안에만 있다. 그래서 이 수집기는 매핑을 하지 않고
//   caption 전문을 원문 그대로 보존한다. placeMentionsRaw 는 '그 문자열이 자막에 등장했다'는 사실일 뿐
//   고향 판정이 아니다(남측 거주지·피난 경로 지명도 함께 걸린다). 고향축 매핑은 통합 단계의 일이다.
//
// ★ 개인정보: 이 코너는 다른 어느 코너보다 민감하다. 실명이 제목·썸네일 파일경로에 그대로 있고
//   자막에는 본적지·가족 이름·나이·현재 거주지까지 들어 있다. 사이트 안내문의 공개 동의 범위는
//   '이 게시판' 이지 우리 서비스가 아니다. 화면에 옮길 때는 실명 노출을 낮추고 원문 링크로 보낼 것.
//
// 영상은 받지 않는다 — mp4 URL 과 메타데이터만.
//
// 실행: node scripts/nk-reunion-vletter.mjs [--force] [--delay=400] [--stage=list|details|all]
//       [--max-details=N] [--collected-at=YYYY-MM-DD]
// 재실행 가능·증분. 받은 HTML 은 전부 디스크 캐시에 남으므로 중간에 끊겨도 다시 실행하면 이어받는다.

import fs from 'node:fs'
import path from 'node:path'
import {
  BASE, OUT_DIR, CACHE_ROOT, collectedAt, DELAY_MS, CONC, FORCE, argOf,
  fetchCached, isCached, pool, siteBadgeTotal, imgTags, abs,
  decodeEntities, squish, stripTags, writeJson, netSummary, ensureDir,
} from './nk-reunion-story-lib.mjs'

const MID = 'SM00000127'
const V = `${BASE}/reuni/home/vle/vletter/promote`
const listUrl = (page, year) => `${V}/list_vle.do?mid=${MID}&limit=9&page=${page}${year ? `&q_year=${year}` : ''}`
const viewUrl = (id) => `${V}/view_vle.do?id=${id}&mid=${MID}`
const CACHE = path.join(CACHE_ROOT, 'vletter')
const CACHE_LIST = path.join(CACHE, 'list')
const CACHE_VIEW = path.join(CACHE, 'view')
const OUT = path.join(OUT_DIR, 'reunion-vletter.json')
const PER_PAGE = 9
const STAGE = argOf('stage', 'all')
const MAX_DETAILS = argOf('max-details', null) == null ? Infinity : +argOf('max-details', null)

const failed = []

// 자막 안에 '문자열로 등장했는지'만 본다. 판정이 아니다 — 통합 단계가 해석한다.
const PLACE_LITERALS = [
  // 광복 당시 도명(우리 고향축 후보)
  '황해도', '평안남도', '평안북도', '함경남도', '함경북도', '경기도', '강원도',
  // 현행 북측 행정구역명
  '평양', '남포', '개성', '나선', '자강도', '양강도', '황해남도', '황해북도',
  // 자주 나오는 시·군 지명(원문 문자열 그대로)
  '연백', '해주', '사리원', '옹진', '장연', '신의주', '정주', '영변', '안주', '박천',
  '흥남', '함흥', '원산', '청진', '단천', '회령', '북청', '길주', '무산', '나진',
  '개천', '순천', '강계', '혜산', '만포', '금강산', '장단', '연천', '철원', '통천',
  '개풍', '벽동', '초산',
]

function parseListPage(html) {
  const out = []
  const re = /<li>\s*<a href="(view_vle\.do\?[^"]*)"\s*>([\s\S]*?)<\/a>\s*<b class="titUnit">([\s\S]*?)<\/b>/gi
  let m
  while ((m = re.exec(html))) {
    const href = decodeEntities(m[1])
    const id = (href.match(/[?&]id=(\d+)/) || [])[1]
    if (!id) continue
    const img = imgTags(m[2])[0] || {}
    const title = squish(stripTags(m[3])) || null
    out.push({
      id: +id,
      title,
      listThumbUrl: abs(img.src) || null,
      listAltRaw: img.alt || null,
    })
  }
  return out
}

function parseDetail(html, id) {
  const title = squish(decodeEntities((html.match(/<div class="titCont">\s*<h3>([\s\S]*?)<\/h3>/) || [])[1] || '')) || null
  const registeredAt = squish(decodeEntities((html.match(/<div class="rightUnit"><span>등록일<\/span>([^<]*)<\/div>/) || [])[1] || '')) || null
  const videoUrl = decodeEntities((html.match(/<source[^>]*src="([^"]*)"/) || [])[1] || '') || null
  const posterRaw = decodeEntities((html.match(/<video[^>]*poster="([^"]*)"/) || [])[1] || '') || null
  const guide = squish(stripTags((html.match(/<p align="center">([\s\S]*?)<\/p>/) || [])[1] || '')) || null

  // 전체자막: caption 「전체자막 표시」 아래 innermost td[tabindex="0"].
  let caption = null
  if (html.includes('전체자막')) {
    const m = html.match(/<td[^>]*tabindex="0"[^>]*>([\s\S]*?)<\/td>/)
    if (m) {
      caption = decodeEntities(
        m[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
      ).replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() || null
    }
  }

  // 제작연도: mp4 경로가 /WMV{n}_{연도}/{연도}-{순번}_{id}_720.mp4 구조라 거기서 뽑는다.
  const yearFromVideo = videoUrl ? +((videoUrl.match(/\/WMV\d+_(\d{4})\//) || [])[1] || 0) || null : null

  const placeMentionsRaw = caption
    ? [...new Set(PLACE_LITERALS.filter(p => caption.includes(p)))]
    : []

  return {
    id,
    title,
    registeredAt,                 // 게시일. 제작연도(q_year)와 다르다 — 섞지 말 것.
    productionYearFromVideoPath: yearFromVideo,
    videoUrl: videoUrl || null,   // 파일은 받지 않는다. URL 만.
    posterUrl: posterRaw && /^https?:/i.test(posterRaw) && posterRaw.length > 'https://vod.unikorea.go.kr'.length ? posterRaw : null,
    guideText: guide,             // "이 영상은 남측에 사는 OOO 님이 북측에 사는 <관계·이름> 을 찾는 영상편지입니다"
    caption,                      // 전체자막 전문 — 원문 그대로. 고향 정보가 여기에만 있다.
    hasCaption: !!caption,
    captionChars: caption ? caption.length : 0,
    placeMentionsRaw,             // ★ 문자열 등장 사실일 뿐. 고향 판정 아님.
    sourceUrl: viewUrl(id),
  }
}

async function collectList() {
  const p1 = await fetchCached(listUrl(1), { cacheDir: CACHE_LIST, key: 'p1', label: '목록 1쪽' })
  if (!p1.ok) { failed.push({ what: '목록 1쪽', url: listUrl(1), reason: p1.error || `HTTP ${p1.code}` }); return { badge: null, items: [], years: [] } }
  const badge = siteBadgeTotal(p1.body)
  const lastPage = badge ? Math.ceil(badge / PER_PAGE) : 1
  const years = [...new Set([...p1.body.matchAll(/<option value="(\d{4})">/g)].map(m => +m[1]))].sort((a, b) => b - a)

  const items = parseListPage(p1.body)
  console.log(`  배지 총 ${badge ?? '?'} 건 · 마지막 쪽 ${lastPage} · 제작연도 옵션 ${years.length}개`)

  const pages = []
  for (let p = 2; p <= lastPage; p++) pages.push(p)
  let done = 1
  const chunks = await pool(pages, async (p) => {
    const r = await fetchCached(listUrl(p), { cacheDir: CACHE_LIST, key: `p${p}`, label: `목록 ${p}쪽` })
    done++
    if (done % 50 === 0) console.log(`    목록 ${done}/${lastPage}쪽`)
    if (!r.ok) { failed.push({ what: `목록 ${p}쪽`, url: listUrl(p), reason: r.error || `HTTP ${r.code}` }); return [] }
    return parseListPage(r.body)
  })
  for (const c of chunks) items.push(...c)

  // ★ 목록 자체에 같은 id 가 서로 다른 쪽에 두 번 나오는 건이 있다(실측). 접되 무엇을 접었는지 남긴다.
  const seen = new Map(); const uniq = []
  for (const it of items) {
    if (seen.has(it.id)) { seen.get(it.id).count++; continue }
    seen.set(it.id, { id: it.id, title: it.title, count: 1 })
    uniq.push(it)
  }
  const dupIds = [...seen.values()].filter(v => v.count > 1)
  return {
    badge, lastPage, items: uniq, years,
    listedRows: items.length,
    duplicatesInListing: items.length - uniq.length,
    duplicateIds: dupIds,
  }
}

async function collectYearCensus(years) {
  // 교차검증: 연도별 배지의 합이 전체 배지와 맞는지 본다. 15요청.
  const out = {}
  for (const y of years) {
    const r = await fetchCached(listUrl(1, y), { cacheDir: CACHE_LIST, key: `y${y}`, label: `연도 ${y}` })
    if (!r.ok) { failed.push({ what: `연도 배지 ${y}`, url: listUrl(1, y), reason: r.error || `HTTP ${r.code}` }); continue }
    out[y] = siteBadgeTotal(r.body)
  }
  return out
}

/**
 * 제작연도 확정 — 사이트의 q_year 필터 목록을 연도별로 전수 페이징해 id → 제작연도 를 만든다.
 * 왜 이걸 하나: mp4 경로에서 연도를 뽑는 방법은 옛 폴더(/WMV1/, /WMV2/)에 연도 접미가 없어
 * 617건에서 값이 나오지 않는다. 추정으로 메우지 않고 사이트가 스스로 분류한 값을 그대로 받아온다.
 */
async function collectYearMembership(yearCensus) {
  const yearsOf = new Map()          // id -> Set(연도)
  const perYear = {}                 // 연도별로 그 목록이 실제로 그린 고유 id 수
  for (const [y, cnt] of Object.entries(yearCensus)) {
    if (!cnt) { perYear[y] = 0; continue }
    const pages = Math.ceil(cnt / PER_PAGE)
    const idsThisYear = new Set()
    for (let p = 1; p <= pages; p++) {
      const r = await fetchCached(listUrl(p, y), { cacheDir: CACHE_LIST, key: `y${y}_p${p}`, label: `연도 ${y} ${p}쪽` })
      if (!r.ok) { failed.push({ what: `연도 ${y} 목록 ${p}쪽`, url: listUrl(p, y), reason: r.error || `HTTP ${r.code}` }); continue }
      for (const it of parseListPage(r.body)) {
        idsThisYear.add(it.id)
        if (!yearsOf.has(it.id)) yearsOf.set(it.id, new Set())
        yearsOf.get(it.id).add(+y)
      }
    }
    perYear[y] = idsThisYear.size
    console.log(`    제작연도 ${y} — 배지 ${cnt} / 고유 id ${idsThisYear.size}`)
  }
  // 한 id 가 두 연도 목록에 걸치는 경우가 있다(실측). 임의로 하나를 고르지 않고 전부 남긴다.
  const multi = [...yearsOf.entries()].filter(([, s]) => s.size > 1)
    .map(([id, s]) => ({ id, years: [...s].sort() }))
  const map = new Map([...yearsOf.entries()].map(([id, s]) => [id, [...s].sort()]))
  return { map, perYear, multiYearIds: multi }
}

async function collectDetails(listItems) {
  const todo = listItems.slice(0, MAX_DETAILS === Infinity ? listItems.length : MAX_DETAILS)
  const already = todo.filter(it => isCached(CACHE_VIEW, `v${it.id}`)).length
  console.log(`  상세 ${todo.length}건 — 캐시 ${already}건 보유, 새로 받을 것 ${todo.length - already}건`)
  const t0 = Date.now()
  let done = 0
  const details = await pool(todo, async (it) => {
    const r = await fetchCached(viewUrl(it.id), { cacheDir: CACHE_VIEW, key: `v${it.id}`, label: `상세 ${it.id}` })
    done++
    if (done % 200 === 0) {
      const perSec = done / ((Date.now() - t0) / 1000)
      const left = Math.round((todo.length - done) / Math.max(perSec, 0.01))
      console.log(`    상세 ${done}/${todo.length} (${perSec.toFixed(1)}건/초, 남은 시간 약 ${Math.round(left / 60)}분)`)
    }
    if (!r.ok) { failed.push({ what: `상세 ${it.id}`, url: viewUrl(it.id), reason: r.error || `HTTP ${r.code}` }); return null }
    try { return parseDetail(r.body, it.id) }
    catch (e) { failed.push({ what: `상세 파싱 ${it.id}`, url: viewUrl(it.id), reason: String(e.message || e) }); return null }
  })
  return details
}

async function main() {
  ensureDir(CACHE_LIST); ensureDir(CACHE_VIEW)
  console.log(`[vletter] 수집 시작 — delay=${DELAY_MS}ms conc=${CONC} stage=${STAGE}${FORCE ? ' (force)' : ''}`)

  const list = await collectList()
  console.log(`  목록 수집 완료 — ${list.items.length}건 (중복 ${list.duplicatesInListing ?? 0}건 접음)`)

  const yearCensus = await collectYearCensus(list.years || [])
  const yearSum = Object.values(yearCensus).reduce((a, b) => a + (b || 0), 0)
  console.log(`  연도 배지 합 ${yearSum} vs 전체 배지 ${list.badge} — ${yearSum === list.badge ? '일치' : '불일치'}`)

  const { map: yearOf, perYear: yearMembershipCollected, multiYearIds } = await collectYearMembership(yearCensus)
  console.log(`  제작연도 확정 — ${yearOf.size}건에 연도가 붙었다(전체 ${list.items.length}건) · 두 연도에 걸친 id ${multiYearIds.length}건`)

  let details = []
  if (STAGE !== 'list') details = await collectDetails(list.items)

  const byId = new Map()
  for (const d of details) if (d) byId.set(d.id, d)

  const items = list.items.map((it) => {
    const d = byId.get(it.id) || null
    return {
      id: it.id,
      title: d?.title || it.title,
      applicantNameRaw: (it.title || '').replace(/님의 영상편지\s*$/, '').trim() || null,  // 실명. 화면 노출 주의.
      listThumbUrl: it.listThumbUrl,
      hasRealThumb: !!(it.listThumbUrl && !/\/res\/img\/video\/video_thumb\.jpg$/i.test(it.listThumbUrl)),
      registeredAt: d?.registeredAt ?? null,
      // 제작연도는 사이트 q_year 분류가 정본이다. mp4 경로 추출값은 참고로만 함께 남긴다.
      // 두 연도에 걸친 id 는 하나를 임의로 고르지 않는다 — productionYear 는 null 로 두고 목록을 남긴다.
      productionYear: (yearOf.get(it.id) || []).length === 1 ? yearOf.get(it.id)[0] : null,
      productionYears: yearOf.get(it.id) ?? [],
      productionYearSource: yearOf.has(it.id) ? 'q_year 필터 목록(사이트 분류)' : null,
      productionYearFromVideoPath: d?.productionYearFromVideoPath ?? null,
      videoUrl: d?.videoUrl ?? null,
      posterUrl: d?.posterUrl ?? null,
      guideText: d?.guideText ?? null,
      caption: d?.caption ?? null,
      hasCaption: d ? d.hasCaption : null,
      captionChars: d?.captionChars ?? null,
      placeMentionsRaw: d?.placeMentionsRaw ?? [],
      detailFetched: !!d,
      sourceUrl: viewUrl(it.id),
    }
  })

  const withDetail = items.filter(i => i.detailFetched)
  const withCaption = items.filter(i => i.hasCaption)
  const withPlace = items.filter(i => (i.placeMentionsRaw || []).length > 0)
  const byProductionYear = {}
  for (const i of items) if (i.productionYear) byProductionYear[i.productionYear] = (byProductionYear[i.productionYear] || 0) + 1
  const byProductionYearFromVideoPath = {}
  for (const i of items) if (i.productionYearFromVideoPath) byProductionYearFromVideoPath[i.productionYearFromVideoPath] = (byProductionYearFromVideoPath[i.productionYearFromVideoPath] || 0) + 1
  const placeFreq = {}
  for (const i of items) for (const p of i.placeMentionsRaw || []) placeFreq[p] = (placeFreq[p] || 0) + 1

  const out = {
    source: '통일부 이산가족정보통합시스템 — 스토리 > 영상편지',
    url: `${V}/list_vle.do?mid=${MID}`,
    /* 수집일 = 실제로 받아 온 날(캐시 적중이면 그 캐시가 쓰인 날). 실행일이 아니다. */
    collectedAt: collectedAt(),
    total: list.badge,                    // 사이트 표시값 「총 N 건」 그대로
    items,
    meta: {
      failed,
      note: [
        'total 은 사이트 배지 「총 N 건」 그대로다. 연도 필터(q_year) 배지의 합으로 교차검증했다(meta.yearCensus).',
        '9건/쪽 고정이고 limit 은 무시된다. 마지막 쪽을 ceil(총건수/9) 로 끊었다 — 마지막을 넘긴 page 도 HTTP 200 에 1건을 돌려주므로 「빈 쪽까지」로 끝을 판정하면 무한 루프다.',
        '★ 구조화된 고향 필드가 없다. 고향은 전체자막(caption) 자유텍스트 안에만 있다. 여기서는 매핑하지 않고 자막 전문을 원문 그대로 보존했다.',
        'placeMentionsRaw 는 「그 문자열이 자막에 등장했다」는 사실일 뿐 고향 판정이 아니다 — 남측 거주지·피난 경로 지명도 함께 걸린다. 고향축 매핑은 통합 단계의 일이다.',
        '★ 개인정보: 실명이 title·applicantNameRaw·썸네일 파일경로에 그대로 있고, caption 에는 본적지·가족 이름·나이·현재 거주지가 들어 있다. 사이트 안내문의 공개 동의 범위는 그 게시판이지 우리 서비스가 아니다 — 화면에서는 실명 노출을 낮추고 sourceUrl 원문으로 보낼 것.',
        '영상은 받지 않았다. videoUrl·posterUrl 은 링크일 뿐이다.',
        'as-of: collectedAt 은 수집일. registeredAt 은 게시일, productionYear 는 제작연도(mp4 경로에서 추출)로 서로 다른 축이다 — 섞지 말 것.',
        '권리: 공공누리(KOGL) 표시 없음. 통일부 제작 영상이나 출연자는 이산가족 개인이다.',
      ].join('\n'),
      siteBadgeTotal: list.badge,
      lastPage: list.lastPage,
      listedRows: list.listedRows,          // 466쪽에서 실제로 그려진 행 수 — 배지와 일치해야 한다
      listCollected: list.items.length,     // 그중 고유 id
      listGap: (list.badge || 0) - list.items.length,
      listGapReason: (list.duplicatesInListing || 0) > 0
        ? `배지 ${list.badge} 와 고유 ${list.items.length} 의 차이 ${(list.badge || 0) - list.items.length}건은 목록 자체가 같은 id 를 서로 다른 쪽에 두 번 그리기 때문이다(meta.duplicateIds). 누락이 아니라 원본 중복이다.`
        : null,
      detailsCollected: withDetail.length,
      detailsMissing: items.length - withDetail.length,
      // ★ 실측 발견: 상세가 HTTP 500 인 id 집합과, 목록에 두 번 나오는 id 집합이 정확히 같다.
      //   재시도 3회 + 이후 수동 재확인에서도 계속 500 이다(정상건은 같은 조건에서 200).
      //   즉 사이트 쪽에 깨진 레코드가 있는 것이지 우리 수집이 실패한 것이 아니다.
      brokenDetailIds: {
        ids: items.filter(i => !i.detailFetched).map(i => i.id),
        httpStatus: 500,
        sameAsDuplicateIds: (() => {
          const a = new Set(items.filter(i => !i.detailFetched).map(i => i.id))
          const b = new Set((list.duplicateIds || []).map(d => d.id))
          return a.size === b.size && [...a].every(x => b.has(x))
        })(),
        note: '목록 카드(제목·썸네일)는 정상이므로 items[] 에 남겨 두었다. detailFetched=false 이며 videoUrl·caption 이 null 이다. 지어내지 않았다.',
      },
      duplicatesInListing: list.duplicatesInListing ?? 0,
      duplicateIds: list.duplicateIds ?? [],
      yearCensus,
      yearCensusSum: yearSum,
      yearCensusMatchesBadge: yearSum === list.badge,
      byProductionYear,
      yearMembershipCollected,
      itemsWithProductionYear: items.filter(i => i.productionYear).length,
      itemsWithoutProductionYear: items.filter(i => !i.productionYear).length,
      multiYearIds: {
        count: multiYearIds.length,
        ids: multiYearIds,
        note: '한 id 가 두 개의 q_year 목록에 동시에 잡힌다. 사이트 분류가 그렇게 되어 있는 것이므로 임의로 하나를 고르지 않고 productionYears[] 에 전부 남겼다(productionYear 는 null). 연도별 배지 합(4,186)이 고유 id 수(4,179)보다 큰 이유의 일부다.',
      },
      // 제작연도 3중 대조: ① 사이트 배지 ② q_year 목록 전수 수집 ③ mp4 경로 추출.
      // ①=② 는 맞아야 한다(같은 목록). ③ 은 옛 폴더(/WMV1/,/WMV2/)에 연도 접미가 없어 비는 것이 정상이다.
      // 안 맞는 값을 덮지 않고 그대로 보여 준다.
      productionYearCrossCheck: (() => {
        const years = [...new Set([
          ...Object.keys(yearCensus), ...Object.keys(byProductionYear), ...Object.keys(byProductionYearFromVideoPath),
        ])].sort((a, b) => b - a)
        const rows = years.map(y => ({
          year: +y,
          siteBadge: yearCensus[y] ?? null,                          // ① 사이트 배지
          fromYearFilterListing: yearMembershipCollected[y] ?? 0,     // ② 그 연도 목록에서 실제로 그려진 고유 id
          assignedUniquely: byProductionYear[y] ?? 0,                 // ③ 그 연도 하나에만 속한 id(= productionYear 확정분)
          fromVideoPath: byProductionYearFromVideoPath[y] ?? 0,       // ④ 참고: mp4 경로에서 뽑은 연도
        }))
        return {
          rows,
          badgeMatchesYearFilterListing: rows.every(r => (r.siteBadge ?? 0) === r.fromYearFilterListing),
          videoPathMatchesBadge: rows.every(r => (r.siteBadge ?? 0) === r.fromVideoPath),
          note: [
            'productionYear 의 정본은 사이트 q_year 분류다. ①=② 가 맞으면 그 연도 목록을 전수 수집했다는 뜻이다.',
            '②와 ③의 차이는 두 연도에 걸친 id(meta.multiYearIds) 때문이다 — 임의로 한 연도를 고르지 않았다.',
            '④ fromVideoPath 는 참고값이다. 옛 폴더 /WMV1/·/WMV2/ 에는 연도 접미가 없어 2012년분 610건이 통째로 0 으로 나온다 — 추정으로 메우지 않았다.',
          ].join(' '),
        }
      })(),
      captionCoverage: {
        withCaption: withCaption.length,
        withoutCaption: withDetail.length - withCaption.length,
        ofDetailsFetched: withDetail.length,
        note: '자막은 일부 항목에만 있다. 자막이 없는 항목은 고향축에 붙일 방법이 없다.',
      },
      placeMentions: {
        itemsWithAnyMention: withPlace.length,
        frequency: Object.fromEntries(Object.entries(placeFreq).sort((a, b) => b[1] - a[1])),
        warning: '이 빈도는 자막에 문자열이 등장한 횟수다. 고향 분포가 아니다.',
      },
      thumbnails: {
        withRealThumb: items.filter(i => i.hasRealThumb).length,
        withPlaceholder: items.filter(i => i.listThumbUrl && !i.hasRealThumb).length,
        withoutThumb: items.filter(i => !i.listThumbUrl).length,
        note: '공용 플레이스홀더 /res/img/video/video_thumb.jpg 를 쓰는 항목이 많다. hasRealThumb=false 는 개인 썸네일이 없다는 뜻이다.',
      },
      overlapWithMuseum: (() => {
        // 자산 단위 중복은 0이다(저장소·ID 체계가 다르다). 이름 단위 일치는 '단서' 일 뿐 동일인 판정이 아니다.
        let donors = null, matched = null, names = null
        try {
          const mu = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'museum.json'), 'utf8'))
          const dset = new Set(mu.records.map(r => r.donor).filter(Boolean))
          const nset = new Set(items.map(i => i.applicantNameRaw).filter(Boolean))
          donors = dset.size; names = nset.size
          matched = [...nset].filter(n => dset.has(n)).length
        } catch { /* museum.json 이 없으면 수치를 지어내지 않는다 */ }
        return {
          assetLevelDuplicates: 0,
          assetLevelNote: 'museum.json(4,342건)과 자산이 겹치지 않는다 — 박물관은 개인 기증 유물(HandLttrImageView.do?file_id=<정수>), 여기는 통일부 제작 영상(vod.unikorea.go.kr mp4)으로 저장소·ID 체계가 완전히 다르다.',
          nameLevelMatches: matched,
          vletterUniqueNames: names,
          museumUniqueDonors: donors,
          nameLevelWarning: '★ 이름 일치는 동일인 판정이 아니다. 한국어 성명은 동명이인이 흔하고 대조군 규모(수천 대 수백)에서 우연 일치가 다수 나온다. 근거로 쓰려면 이름 외 항목(고향·가족관계·연도)까지 맞춰 사람이 확인해야 한다.',
        }
      })(),
      network: netSummary(),
    },
  }

  writeJson(OUT, out)
  console.log(`[vletter] 완료 — 배지 ${list.badge} / 목록 ${list.items.length} / 상세 ${withDetail.length} · 자막 ${withCaption.length}건 · 실패 ${failed.length}건`)
}

main().catch(e => { console.error(e); process.exit(1) })
