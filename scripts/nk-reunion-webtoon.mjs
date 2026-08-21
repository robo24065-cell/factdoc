#!/usr/bin/env node
// nk-reunion-webtoon.mjs — 이산가족정보통합시스템 스토리 「웹툰」 전량 수집
//   → 북한자료-api/reunion-webtoon.json
//
// 구조 (2026-08-21 실측):
//   · 목록 GET /reuni/home/cms/page/webtoonList.do?page={1..6}&mid=SM00000278 — 쪽당 9건 고정.
//     limit 파라미터는 링크에 붙어 있으나 서버가 무시한다(limit=60 을 줘도 9건).
//     ★정렬이 뒤집힌다: 1~4쪽은 webToonNum 내림차순(50→15), 5~6쪽은 오름차순(1→14).
//       id 순서를 가정하지 말고 쪽을 전부 읽어야 한다.
//     사이트 표시 총건수 = div.totalNum 의 「총 <span>50</span> 건」.
//   · 상세 GET /reuni/home/cms/page/Webtoon.do?webToonNum={N}&mid=SM00000278 (mid 없으면 302)
//     ★ 이 코너의 진짜 자산은 그림이 아니라 텍스트다 — 각 패널 <image> 의 alt 속성에
//       대사·내레이션 전문이 접근성 대체텍스트로 통째로 들어 있다.
//       본문 끝 숨김 div(font-size:1px;color:transparent)에 같은 전문이 '■/○' 기호로 한 번 더 실린다.
//     ★ webToonNum ≠ 회차 폴더 번호다(실측: webToonNum=50 → ep48, 23 → ep21, 1 → tmp/webtoon_001).
//       파일 경로에서 ep 번호를 따로 뽑아 epFolder 로 남긴다.
//     상세 페이지에는 제목이 없다 — 제목은 목록에서만 온다.
//   · 날짜·작가·게시일 필드가 어디에도 없다. 없는 것은 없다고 적는다.
//
// 미디어는 URL 만 기록한다. 파일을 내려받지 않는다(표지 235KB · 패널 최대 약 4MB).
// 실행: node scripts/nk-reunion-webtoon.mjs [--force] [--delay=700] [--no-detail]

import {
  BASE, args, FORCE, DELAY_MS, NET,
  makeSession, decodeEntities, htmlToText, oneLine, abs, readTotalBadge, writeEnvelope, collectedIso, collectedKst,
} from './nk-reunion-common.mjs'

const MID = 'SM00000278'
const LIST = (page) => `${BASE}/reuni/home/cms/page/webtoonList.do?page=${page}&mid=${MID}`
const VIEW = (n) => `${BASE}/reuni/home/cms/page/Webtoon.do?webToonNum=${n}&mid=${MID}`
const NO_DETAIL = args.includes('--no-detail')
const MAX_PAGE_GUARD = 30

const S = makeSession('webtoon')
const failed = []

function parseList(html) {
  const out = []
  const i = html.indexOf('<ul class="listUnit">')
  if (i < 0) return out
  const j = html.indexOf('</ul>', i)
  const block = html.slice(i, j < 0 ? html.length : j)
  const re = /<a href="Webtoon\.do\?webToonNum=(\d+)"[\s\S]*?<img src="([^"]*)"[^>]*>[\s\S]*?<b class="titUnit">([\s\S]*?)<\/b>/g
  let m
  while ((m = re.exec(block))) {
    out.push({ webToonNum: +m[1], coverUrl: abs(m[2]), title: oneLine(m[3]) })
  }
  return out
}

/** 「마지막 페이지」 링크(.btn_next_last)의 page 값. 없으면 null. */
function lastPageFromPager(html) {
  const m = html.match(/btn_next_last[\s\S]{0,200}?href="[^"]*?page=(\d+)/)
  return m ? +m[1] : null
}

function parseDetail(html, webToonNum) {
  const i = html.indexOf('class="uni-body"')
  const j = html.indexOf('newBtnWrap', i < 0 ? 0 : i)
  if (i < 0) return null
  const seg = html.slice(i, j < 0 ? html.length : j)

  const panels = []
  const re = /<(?:image|img)\s+([^>]*?)>/g
  let m
  while ((m = re.exec(seg))) {
    const a = m[1]
    const src = (a.match(/src="([^"]*)"/) || [])[1]
    const alt = (a.match(/alt="([\s\S]*?)"/) || [])[1]
    if (!src) continue
    panels.push({
      index: panels.length + 1,
      imageUrl: abs(src),
      // ★ alt = 대사·내레이션 전문(접근성 대체텍스트). 원문 줄바꿈을 살린다.
      script: alt != null ? decodeEntities(alt).split('\n').map(s => s.trim()).join('\n').trim() : null,
    })
  }

  // 숨김 div 안의 동일 전문('■ 웹툰제목: …' / '○ 화자: …')
  let hiddenScript = null
  const hm = seg.match(/<div style="[^"]*color:\s*transparent[^"]*">([\s\S]*?)<\/div>/)
  if (hm) hiddenScript = htmlToText(hm[1])

  // 파일 경로에서 ep 폴더 번호
  let epFolder = null
  for (const p of panels) {
    const em = p.imageUrl && p.imageUrl.match(/\/webtoon\/ep(\d+)\//)
    if (em) { epFolder = +em[1]; break }
  }

  return { panels, hiddenScript, epFolder }
}

async function main() {
  /* ★ 수집 시각은 fetch 가 끝난 뒤에 정한다 — 캐시에서만 읽었으면 그 캐시가 쓰인 때가
       실제 수집 시각이다(nk-reunion-common.mjs observe/collectedIso). 실행 시각을 찍으면
       네트워크를 0회 치고도 수집일이 앞으로 밀린다(as-of 규약 위반). */
  console.log(`[웹툰] 수집 시작 — delay=${DELAY_MS}ms force=${FORCE}`)

  // ── 목록 ───────────────────────────────────────────────────────────────────
  const first = await S.fetchText(LIST(1), '목록 page=1')
  if (!first) throw new Error('목록 1쪽을 못 받았다 — 중단(재실행하면 이어서 받는다)')
  const totalBadge = readTotalBadge(first.text)          // 사이트 표시 총건수
  const lastPage = lastPageFromPager(first.text)
  if (totalBadge == null) failed.push({ kind: 'total', reason: '사이트의 「총 N 건」 배지를 못 읽었다 — 총건수 근거 없음' })

  const byNum = new Map()
  const pages = []
  const endPage = lastPage || (totalBadge ? Math.ceil(totalBadge / 9) : MAX_PAGE_GUARD)
  for (let p = 1; p <= Math.min(endPage, MAX_PAGE_GUARD); p++) {
    const r = p === 1 ? first : await S.fetchText(LIST(p), `목록 page=${p}`)
    if (!r) { failed.push({ kind: 'list', page: p, url: LIST(p), reason: 'HTTP 실패 — 이 쪽 9건 미수집' }); continue }
    const rows = parseList(r.text)
    pages.push({ page: p, rows: rows.length, nums: rows.map(x => x.webToonNum) })
    for (const row of rows) if (!byNum.has(row.webToonNum)) byNum.set(row.webToonNum, row)
    console.log(`  목록 page=${p} — ${rows.length}건 ${r.cached ? '[캐시]' : ''}`)
    if (rows.length === 0) break
  }

  const items = [...byNum.values()].sort((a, b) => a.webToonNum - b.webToonNum)

  // 사이트 표시 총건수와 실제 수집 건수가 다르면 조용히 덮지 않는다
  const gap = totalBadge != null ? totalBadge - items.length : null
  if (gap) failed.push({ kind: 'coverage', reason: `사이트 표시 ${totalBadge}건 vs 수집 ${items.length}건 — 차이 ${gap}건` })

  // 번호 결번 확인 (사이트가 1..N 연속이라고 보장하지 않는다 — 실측으로 적는다)
  const nums = items.map(i => i.webToonNum)
  const maxNum = nums.length ? Math.max(...nums) : 0
  const missingNums = []
  for (let n = 1; n <= maxNum; n++) if (!byNum.has(n)) missingNums.push(n)

  // ── 상세 ───────────────────────────────────────────────────────────────────
  let withScript = 0
  if (!NO_DETAIL) {
    console.log(`[웹툰] 상세 ${items.length}건`)
    for (const it of items) {
      const url = VIEW(it.webToonNum)
      const r = await S.fetchText(url, `상세 webToonNum=${it.webToonNum}`)
      it.viewUrl = url
      if (!r) { failed.push({ kind: 'detail', webToonNum: it.webToonNum, url, reason: 'HTTP 실패' }); continue }
      const d = parseDetail(r.text, it.webToonNum)
      if (!d) { failed.push({ kind: 'detail', webToonNum: it.webToonNum, url, reason: 'uni-body 블록 없음' }); continue }
      it.epFolder = d.epFolder
      it.panels = d.panels
      it.panelCount = d.panels.length
      it.hiddenScript = d.hiddenScript
      // 패널 alt 를 이어붙인 대본 전문
      const joined = d.panels.map(p => p.script).filter(Boolean).join('\n').trim()
      it.script = joined || null
      it.scriptChars = joined.length
      if (joined) withScript++
    }
  }

  const envelope = {
    source: '통일부 이산가족정보통합시스템 — 스토리 「웹툰」',
    url: LIST(1),
    collectedAt: collectedIso(),
    collectedOnKst: collectedKst(),
    total: totalBadge,                       // 사이트가 표시한 값 그대로
    totalDisplayedBySite: totalBadge != null,
    collected: items.length,
    items,
    meta: {
      pages,
      coverage: {
        siteTotal: totalBadge,
        collected: items.length,
        ratio: totalBadge ? +(items.length / totalBadge * 100).toFixed(1) : null,
        gap,
        gapNote: gap ? '차이가 있다. 위 failed 항목을 보라.' : '사이트 표시 총건수와 수집 건수가 일치한다.',
        webToonNumRange: nums.length ? `${Math.min(...nums)}~${maxNum}` : null,
        missingWebToonNums: missingNums,
        lastPageFromPager: lastPage,
      },
      fieldCoverage: {
        withCover: items.filter(i => i.coverUrl).length,
        withDetail: items.filter(i => i.panels).length,
        withScript: withScript,
        withoutScript: items.filter(i => i.panels && !i.script).length,
        withHiddenScript: items.filter(i => i.hiddenScript).length,
        totalPanels: items.reduce((a, i) => a + (i.panelCount || 0), 0),
        totalScriptChars: items.reduce((a, i) => a + (i.scriptChars || 0), 0),
        epFolderResolved: items.filter(i => i.epFolder != null).length,
        note: 'webToonNum 과 ep 폴더 번호는 다르다(실측 50→ep48, 23→ep21). 일부 회차는 /res/theme/…/tmp/webtoon_00N.jpg 를 쓰고 ep 폴더가 없어 epFolder 가 null 이다.',
      },
      absentFields: ['게시일', '작가', '회차 공개일'],
      absentFieldsNote: '목록·상세 어디에도 날짜·작가 필드가 없다. 없는 것을 지어내지 않았다.',
      region: {
        hasStructuredRegionField: false,
        note: '지역 필드가 없다. 지명은 제목과 대본(script) 자유 텍스트에만 등장한다(예 「흥남부두」, 제목 「사라진 고향」·「고향의 봄」). 확정 도명이 아니므로 광복 당시 7개 고향 축에 직결하면 신뢰도 낮은 추론이 된다 — 원문을 그대로 보존했고 매핑은 통합 단계로 넘긴다. 서사 코퍼스로 쓰는 편이 정직하다.',
      },
      overlapWithMuseum: {
        checked: true,
        overlappingRecords: 0,
        method: '웹툰은 iId·file_id 체계가 없고 /contents/page/webtoon/ 정적 파일만 쓴다. museum.json(4,342건)과 키가 겹칠 수 없는 완전 신규 계열이다.',
        countsAsNewRecords: true,
        numeratorNote: '★ 이 50건은 박물관 사료가 아니다. 기록 밀도(사료 건수) 분자에 섞어 넣으면 계열이 다른 것을 더하는 셈이다 — 서사 코퍼스로 따로 세라.',
      },
      rights: {
        koglMark: false,
        note: '공공누리(KOGL) 표시 없음, 푸터 저작권 문구뿐. 상세 페이지에 우클릭 차단 스크립트가 있다(수집 자체를 막지는 않는다). 이미지는 URL 만 기록했다.',
      },
      failed,
      network: { calls: NET.calls, fromCache: NET.fromCache, failures: NET.fail, bytes: NET.bytes, delayMs: DELAY_MS },
      note: [
        `as-of: 수집일 ${collectedKst()}(KST). 사이트가 회차 게시일을 제공하지 않으므로 자료의 기준일은 알 수 없다 — 수집일과 섞지 말 것.`,
        '총건수 근거: 목록 1쪽 div.totalNum 의 「총 50 건」 배지.',
      ].join('\n'),
    },
  }

  const p = writeEnvelope('reunion-webtoon.json', envelope)
  console.log(`[웹툰] 완료 — ${items.length}/${totalBadge}건 · 대본 ${withScript}건 · 실패 ${failed.length}건`)
  console.log(`  → ${p}`)
}

main().catch(e => { console.error('X ' + (e.message || e)); process.exit(1) })
