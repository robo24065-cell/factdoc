#!/usr/bin/env node
// nk-reunion-htgallery.mjs — 이산가족정보통합시스템 스토리 「나의 살던 고향은」 전량 수집
//   → 북한자료-api/reunion-htgallery.json
//
// 대상: https://reunion.unikorea.go.kr/reuni/home/pds/htgallery/list_sub_0{1..5}.do?mid=SM00000283
//
// 실측 근거(2026-08-21 탐사):
//   · 정적 서버렌더 HTML. 내부 API 없음(CDP 렌더 시 XHR/Fetch 0건). 페이징 없음 — 탭 1쪽에 전량.
//   · 한 사진이 두 블록에 각각 1번씩 나온다:
//        #slick_galleryView_nav  → 썸네일 /reuni/atchfile/thumb/<ID>.jpg
//        #slick_galleryView      → 원본   /reuni/atchfile/view/<ID>.jpg + 캡션(span[data-title])
//     ★ 두 블록을 합쳐 세면 정확히 2배가 된다. 고유 사진은 fileId 로 접는다.
//   · 사이트 배지 「총 N 건」은 '등록 건수' 이고, 실제로 <img> 가 그려지는 사진은 그보다 적다.
//     차이는 meta.badgeVsRendered 에 사유와 함께 남긴다 — 조용히 덮지 않는다.
//   · 사진별 상세 페이지가 없다. 원문 링크는 '탭 URL' 까지만 걸 수 있다.
//   · 미디어는 URL 만 기록한다. 내려받지 않는다(제공처 저작권 — 공공누리 표시 없음).
//
// 지역: 원문 그대로만 보존한다. 우리 고향 축(광복 당시 7종) 매핑은 여기서 하지 않는다.
//   tab      = 탭 구도명(함경도/평안도/황해도/경기도/강원도)
//   areaRaw  = data-title 의 " - " 뒤 접미(현행 북한 행정구역명. 없을 수 있다)
//
// 실행: node scripts/nk-reunion-htgallery.mjs [--force] [--delay=400] [--collected-at=YYYY-MM-DD]
// 재실행 가능·증분(HTML 디스크 캐시). 키 불필요.

import path from 'node:path'
import {
  BASE, OUT_DIR, CACHE_ROOT, collectedAt, DELAY_MS, CONC, FORCE,
  fetchCached, pool, siteBadgeTotal, sliceDivById, imgTags, abs, atchFileId,
  decodeEntities, squish, writeJson, netSummary,
} from './nk-reunion-story-lib.mjs'

const MID = 'SM00000283'
const HUB = `${BASE}/reuni/home/pds/htgallery/info.do?mid=${MID}`
const tabUrl = (n) => `${BASE}/reuni/home/pds/htgallery/list_sub_0${n}.do?mid=${MID}`
const CACHE = path.join(CACHE_ROOT, 'htgallery')
const OUT = path.join(OUT_DIR, 'reunion-htgallery.json')

// alt 구조: "<설명> (제공 : <제공처>) N번째 사진"  — 제공처가 없는 건도 있다.
function parseAlt(alt) {
  const a = squish(alt || '')
  const seqM = a.match(/(\d+)\s*번째\s*사진\s*$/)
  const seq = seqM ? +seqM[1] : null
  let rest = seqM ? a.slice(0, seqM.index).trim() : a
  const provM = rest.match(/\(\s*제공\s*[:：]\s*([^)]*)\)\s*$/)
  const provider = provM ? squish(provM[1]) : null
  if (provM) rest = rest.slice(0, provM.index).trim()
  return { seq, provider, altDesc: rest || null, altRaw: a || null }
}

function parseTab(html, tabNo) {
  const badge = siteBadgeTotal(html)

  // 탭 이름표 — 페이지가 스스로 그린 구도명을 그대로 쓴다.
  const tabNames = []
  const tabRe = /<a[^>]*class="[^"]*titCont[^"]*"[^>]*href="list_sub_0(\d)\.do[^"]*"[^>]*>([^<]*)<\/a>/gi
  let tm
  while ((tm = tabRe.exec(html))) tabNames[+tm[1]] = squish(decodeEntities(tm[2]))

  const navBlock = sliceDivById(html, 'slick_galleryView_nav')
  const viewBlock = sliceDivById(html, 'slick_galleryView')

  const navImgs = imgTags(navBlock).filter(a => atchFileId(a.src))
  const viewImgs = imgTags(viewBlock).filter(a => atchFileId(a.src))

  // 캡션: #slick_galleryView 안의 <span data-title="...">본문</span> — 순서가 viewImgs 와 1:1.
  const caps = []
  const capRe = /<span\s+data-title="([^"]*)"\s*>([\s\S]*?)<\/span>/gi
  let cm
  while ((cm = capRe.exec(viewBlock))) {
    caps.push({ dataTitle: squish(decodeEntities(cm[1])), caption: squish(decodeEntities(cm[2].replace(/<[^>]*>/g, ' '))) })
  }

  const mismatch = []
  if (navImgs.length !== viewImgs.length) mismatch.push(`nav ${navImgs.length} != view ${viewImgs.length}`)
  if (caps.length !== viewImgs.length) mismatch.push(`caption ${caps.length} != view ${viewImgs.length}`)

  const byId = new Map()
  const push = (fileId, patch) => {
    if (!byId.has(fileId)) byId.set(fileId, { fileId })
    Object.assign(byId.get(fileId), patch)
  }

  navImgs.forEach((a) => {
    const id = atchFileId(a.src)
    push(id, { thumbUrl: abs(a.src), ...parseAlt(a.alt) })
  })
  viewImgs.forEach((a, i) => {
    const id = atchFileId(a.src)
    const c = caps[i] || {}
    const parsed = parseAlt(a.alt)
    const cur = byId.get(id) || {}
    push(id, {
      viewUrl: abs(a.src),
      // nav 쪽 alt 가 이미 있으면 그것을 정본으로 둔다(둘은 실측상 동일 문자열).
      seq: cur.seq ?? parsed.seq,
      provider: cur.provider ?? parsed.provider,
      altDesc: cur.altDesc ?? parsed.altDesc,
      altRaw: cur.altRaw ?? parsed.altRaw,
      dataTitle: c.dataTitle ?? null,
      caption: c.caption ?? null,
    })
  })

  const items = [...byId.values()].map((it) => {
    // data-title = "<명소명> - <세부지역>". 접미는 현행 북한 행정구역명일 때가 많고 없을 수도 있다.
    let placeName = null, areaRaw = null
    if (it.dataTitle && it.dataTitle.includes(' - ')) {
      const k = it.dataTitle.lastIndexOf(' - ')
      placeName = squish(it.dataTitle.slice(0, k)) || null
      areaRaw = squish(it.dataTitle.slice(k + 3)) || null
    } else if (it.dataTitle) {
      placeName = it.dataTitle
    }
    return {
      fileId: it.fileId,
      tab: tabNames[tabNo] || null,           // 구도명 — 원문 그대로
      tabNo,
      seq: it.seq ?? null,
      placeName,
      areaRaw,                                 // 현행 행정구역 접미 — 원문 그대로. 매핑 금지.
      dataTitle: it.dataTitle ?? null,
      caption: it.caption ?? null,
      altDesc: it.altDesc ?? null,
      provider: it.provider ?? null,
      thumbUrl: it.thumbUrl ?? null,
      viewUrl: it.viewUrl ?? null,
      sourceUrl: tabUrl(tabNo),                // 사진별 상세가 없다 — 탭까지가 원문 링크의 한계
      hasThumb: !!it.thumbUrl,
      hasView: !!it.viewUrl,
    }
  }).sort((a, b) => (a.seq ?? 9999) - (b.seq ?? 9999) || a.fileId.localeCompare(b.fileId))

  const seqs = items.map(i => i.seq).filter(n => Number.isInteger(n))
  const maxSeq = seqs.length ? Math.max(...seqs) : 0
  const seen = new Set(seqs)
  const missingSeq = []
  for (let s = 1; s <= Math.max(maxSeq, badge || 0); s++) if (!seen.has(s)) missingSeq.push(s)

  return {
    tabNo, tab: tabNames[tabNo] || null, url: tabUrl(tabNo),
    siteBadgeTotal: badge, renderedPhotos: items.length,
    navImgCount: navImgs.length, viewImgCount: viewImgs.length, captionCount: caps.length,
    missingSeq, mismatch, items,
  }
}

async function main() {
  console.log(`[htgallery] 수집 시작 — delay=${DELAY_MS}ms conc=${CONC}${FORCE ? ' (force)' : ''}`)
  const tabs = []
  const failed = []

  for (const n of [1, 2, 3, 4, 5]) {
    const r = await fetchCached(tabUrl(n), { cacheDir: CACHE, key: `list_sub_0${n}`, label: `htgallery tab ${n}` })
    if (!r.ok) {
      failed.push({ what: `탭 ${n}`, url: tabUrl(n), reason: `요청 실패 ${r.error || r.code}` })
      console.warn(`  ! 탭 ${n} 실패`)
      continue
    }
    const t = parseTab(r.body, n)
    tabs.push(t)
    console.log(`  탭 ${n} ${t.tab || '?'} — 배지 ${t.siteBadgeTotal ?? '?'} / 사진 ${t.renderedPhotos}장${t.mismatch.length ? '  (' + t.mismatch.join('; ') + ')' : ''}`)
    if (t.mismatch.length) failed.push({ what: `탭 ${n} 블록 개수 불일치`, url: tabUrl(n), reason: t.mismatch.join('; ') })
  }

  const items = tabs.flatMap(t => t.items)
  const badgeSum = tabs.reduce((s, t) => s + (t.siteBadgeTotal || 0), 0)
  const uniqIds = new Set(items.map(i => i.fileId))

  // 제공처 분포 — 원문 문자열 그대로 센다.
  const byProvider = {}
  for (const i of items) byProvider[i.provider ?? '(표기없음)'] = (byProvider[i.provider ?? '(표기없음)'] || 0) + 1
  const byTab = {}
  for (const t of tabs) byTab[t.tab || `탭${t.tabNo}`] = { siteBadgeTotal: t.siteBadgeTotal, collected: t.renderedPhotos, missingSeq: t.missingSeq }
  const byAreaRaw = {}
  for (const i of items) if (i.areaRaw) byAreaRaw[i.areaRaw] = (byAreaRaw[i.areaRaw] || 0) + 1

  const out = {
    source: '통일부 이산가족정보통합시스템 — 스토리 > 나의 살던 고향은',
    url: HUB,
    /* 수집일 = 실제로 받아 온 날(캐시 적중이면 그 캐시가 쓰인 날). 실행일이 아니다. */
    collectedAt: collectedAt(),
    total: badgeSum,                 // 사이트가 표시한 값의 합(등록 건수). 추정치 아님.
    items,
    meta: {
      failed,
      note: [
        '총건수(total)는 각 탭 헤더 배지 「총 N 건」의 합이다 — 사이트 표시값 그대로.',
        '배지는 등록 건수이고, 실제로 <img> 가 그려진 사진은 그보다 적다(아래 badgeVsRendered).',
        '한 사진이 썸네일 블록과 원본 블록에 각각 1번씩 나온다. fileId 로 접어 고유 사진만 담았다.',
        '사진별 상세 페이지가 없다 — sourceUrl 은 탭 목록 URL 까지가 한계다.',
        '지역은 원문 그대로만 보존한다(tab=구도명, areaRaw=data-title 접미의 현행 행정구역명). 광복 당시 7종 고향축 매핑은 통합 단계에서 한다.',
        '이미지는 URL 만 기록했다. 파일은 내려받지 않았다.',
        '권리: 페이지 어디에도 공공누리(KOGL) 표시가 없다. provider(제공처) 표기와 원문 링크를 반드시 동반해야 한다.',
        'as-of: collectedAt 은 수집일이다. 사진의 촬영·제작 기준일은 사이트가 제공하지 않는다 — 두 날짜를 섞지 말 것.',
      ].join('\n'),
      tabs: tabs.map(({ items: _drop, ...t }) => t),
      byTab,
      byProvider,
      byAreaRaw,
      withAreaRaw: items.filter(i => i.areaRaw).length,
      withoutAreaRaw: items.filter(i => !i.areaRaw).length,
      uniqueFileIds: uniqIds.size,
      badgeVsRendered: {
        siteBadgeSum: badgeSum,
        collected: items.length,
        gap: badgeSum - items.length,
        reason: '배지에는 잡히지만 <img> 가 그려지지 않는 등록건이 있다(alt 의 「N번째 사진」 일련번호가 결번). 결번은 tabs[].missingSeq 에 남겼다. 이미지가 없으므로 URL 자체를 만들 수 없어 수집 불가.',
      },
      overlapWithMuseum: 'museum.json(4,342건)과 겹치지 않는다. 박물관 이미지는 HandLttrImageView.do?file_id=<정수> 라는 별개 저장소·별개 ID 체계이고, 여기는 /reuni/atchfile/<F|P 접두 ID> 계열이다. museum.json 에 atchfile 문자열은 0회 등장한다.',
      network: netSummary(),
    },
  }

  writeJson(OUT, out)
  console.log(`[htgallery] 완료 — 배지합 ${badgeSum} / 수집 ${items.length}장 (고유 fileId ${uniqIds.size}) · 실패 ${failed.length}건`)
}

main().catch(e => { console.error(e); process.exit(1) })
