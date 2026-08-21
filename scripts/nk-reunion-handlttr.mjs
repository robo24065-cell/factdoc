#!/usr/bin/env node
// nk-reunion-handlttr.mjs — 디지털박물관 「손편지」 전량 수집 → 북한자료-api/reunion-handlttr.json
//
// 코너: https://reunion.unikorea.go.kr/reuni/home/museum/archive/letter/HandLttr.do?mid=SM00000262
// 렌더: JS. $(document).ready → jsSearch() → POST HandLttrList.do (조각 HTML)
// 목록: POST /reuni/home/museum/archive/letter/HandLttrList.do
//       body: mid=SM00000262&pageIndex={p}&archiveType=3&searchType=2&search=&orderType=1&pageUnit=120
//       · 누적(cumulative) 아님 — pageIndex 마다 그 쪽만 온다
//       · pageUnit 최대 120 (실측). 752건 → 7쪽
//       · 총건수는 hidden input id="totCnt" (화면 '총 752개의 검색 결과'와 일치)
// 상세: RecordView.do?i_id={iId}&mid=SM00000262 — 목록 카드가 내용 전문을 이미 담고 있어 상세를 따로 받지 않는다.
//
// ★ 겹침: 탐사 실측으로 752건 전량이 museum.json(4,342건) 안에 있다. 새 사료가 아니다.
//   이 산출물의 값어치는 '건수'가 아니라 **손편지라는 부분집합의 경계**(어떤 iId 가 손편지인가)다.
//
// 실행: node scripts/nk-reunion-handlttr.mjs [--force] [--delay=500] [--collected-at=YYYY-MM-DD]

import fs from 'node:fs'
import path from 'node:path'
import {
  BASE, MID, OUT_DIR, createCtx, parseArgs, parseListCards, totCntOf,
  writeEnvelope, loadMuseumIds, overlapReport, LICENSE_NOTE, nowKSTStamp, stampCollected,
} from './nk-reunion-lib.mjs'

const CORNER = '손편지'
const PAGE_UNIT = 120
const LIST_URL = `${BASE}/reuni/home/museum/archive/letter/HandLttrList.do`
const PAGE_URL = `${BASE}/reuni/home/museum/archive/letter/HandLttr.do?mid=${MID.letter}`

const args = parseArgs()
const ctx = createCtx({ corner: 'handlttr', delay: args.delay, force: args.force })

function body(p) {
  return `mid=${MID.letter}&pageIndex=${p}&archiveType=3&searchType=2&search=&orderType=1&pageUnit=${PAGE_UNIT}`
}

const main = async () => {
  ctx.log('시작', nowKSTStamp())

  // 1쪽으로 총건수를 확정한다. 총건수는 사이트가 준 값만 쓴다(추정 금지).
  const first = await ctx.post(LIST_URL, body(1), 'list p1')
  if (!first) throw new Error('1쪽을 받지 못했다 — 총건수를 확정할 수 없어 중단한다.')
  const total = totCntOf(first)
  if (total == null) throw new Error('totCnt 를 찾지 못했다 — 총건수 근거 없이 진행하지 않는다.')
  const pages = Math.ceil(total / PAGE_UNIT)
  ctx.log(`총건수(사이트 표시) ${total} · ${PAGE_UNIT}건/쪽 · ${pages}쪽`)

  const byId = new Map()
  const perPage = []
  const addAll = (p, cards) => {
    perPage.push({ page: p, parsed: cards.length })
    for (const c of cards) {
      if (byId.has(c.iId)) continue
      byId.set(c.iId, {
        ...c,
        recordUrl: `${BASE}/reuni/home/museum/archive/RecordView.do?i_id=${c.iId}&mid=${MID.letter}`,
        archiveRecordUrl: `${BASE}/reuni/home/museum/archive/RecordView.do?i_id=${c.iId}&mid=${MID.archive}`,
      })
    }
  }
  addAll(1, parseListCards(first))

  for (let p = 2; p <= pages; p++) {
    const html = await ctx.post(LIST_URL, body(p), `list p${p}`)
    if (!html) { perPage.push({ page: p, parsed: 0, failed: true }); continue }
    const cards = parseListCards(html)
    addAll(p, cards)
    ctx.log(`  p${p}/${pages} +${cards.length} (누적 ${byId.size}/${total})`)
  }

  const items = [...byId.values()].sort((a, b) => a.iId - b.iId)
  const museum = loadMuseumIds()

  // 손편지가 정말로 「문서류(i_type=02)」 안에 들어가는지, 형태 정보를 가진 reunion-archive.json 으로 확인한다.
  // (추측하지 않는다 — 파일이 없으면 확인 못 했다고 적는다.)
  let typeCheck = { checked: false, reason: 'reunion-archive.json 이 없어 확인하지 못했다. 먼저 nk-reunion-archive.mjs 를 돌릴 것.' }
  try {
    const arc = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'reunion-archive.json'), 'utf8'))
    const typeOf = new Map(arc.items.map(x => [x.iId, x.iType]))
    const dist = {}
    let unknown = 0
    for (const it of items) {
      const t = typeOf.get(it.iId)
      if (t == null) { unknown++; continue }
      dist[t] = (dist[t] || 0) + 1
    }
    typeCheck = {
      checked: true,
      sourceFile: '북한자료-api/reunion-archive.json',
      distribution: dist,
      notFoundInArchive: unknown,
      allInDocumentType: Object.keys(dist).length === 1 && dist['02'] === items.length && unknown === 0,
      note: '손편지 목록의 각 iId 를 기록관 형태(i_type)에 대조한 결과다. 02 = 문서류.',
    }
  } catch { /* 없으면 checked:false 그대로 */ }
  const overlap = overlapReport(items.map(i => i.iId), museum)

  const gap = total - items.length
  /* ★ 수집일 확정 — 캐시에서만 읽었으면 그 캐시가 쓰인 때가 실제 수집 시각이다.
       실행 시각을 찍으면 네트워크를 0회 치고도 수집일이 앞으로 밀린다(as-of 규약 위반). */
  const stamped = stampCollected(ctx, args)
  ctx.log(`수집일 ${stamped.date} (${stamped.forced ? '--collected-at 지정' : stamped.observed ? '캐시·요청 실측 최댓값' : '실측 불가 — 폴백'})`)
  const envelope = {
    source: '통일부 남북이산가족 디지털박물관 — 손편지',
    corner: CORNER,
    url: PAGE_URL,
    collectedAt: args.collectedAt,
    collectedAtStamp: args.collectedAtStamp,
    total,
    totalEvidence: `조각 HTML 의 hidden input id="totCnt" = ${total}. 화면 표시 문구 「총 ${total}개의 검색 결과」와 같은 값.`,
    items,
    meta: {
      collected: items.length,
      coveragePct: total ? +(items.length / total * 100).toFixed(2) : null,
      gapVsTotal: gap,
      gapNote: gap === 0
        ? '총건수와 수집 건수가 일치한다.'
        : `총건수 ${total} 와 수집 ${items.length} 이 ${gap}건 다르다. 아래 perPage 와 failed 를 볼 것 — 덮지 않았다.`,
      perPage,
      withThumb: items.filter(i => i.thumbFileId != null).length,
      withoutThumb: items.filter(i => i.thumbFileId == null).length,
      withProducedOn: items.filter(i => i.producedOn).length,
      distinctNames: [...new Set(items.map(i => i.name).filter(Boolean))].length,
      hasRegionField: false,
      regionNote:
        '구조화된 지역 필드가 없다. 지명은 title·content 자유 텍스트 안에만 있다. ' +
        '광복 당시 7종 고향 축 매핑은 여기서 하지 않는다 — 통합 단계로 넘긴다(원문 그대로 보존).',
      overlapWithMuseumJson: overlap,
      subsetNote:
        '손편지 = 기록관 전체(4,342) 안의 부분집합이다. archiveType=3 으로 걸러진 목록이다.',
      iTypeCheck: typeCheck,
      endpoint: {
        method: 'POST',
        url: LIST_URL,
        body: `mid=${MID.letter}&pageIndex={p}&archiveType=3&searchType=2&search=&orderType=1&pageUnit=${PAGE_UNIT}`,
        pageUnitMax: 120,
        cumulative: false,
        totalField: 'hidden input id="totCnt"',
        session: 'museum/view.do?gubn=A&mid=SM00000261 로 JSESSIONID 선발급 필요',
      },
      media: '이미지 URL 만 기록한다. 바이너리는 내려받지 않는다.',
      imageNote:
        'HandLttrImageView.do 는 JPEG 바이트를 Content-Type: text/html + nosniff 로 내려준다 — ' +
        '교차출처 <img> 직접 표시가 막히는 계열이다(atchfile 계열과 다르다). 화면에 쓰려면 프록시나 파생본이 필요하다.',
      license: LICENSE_NOTE,
      failed: ctx.failed,
      network: ctx.net,
      note:
        'as-of: 수집일은 collectedAt 이다. 항목의 producedOn 은 사료의 생산일자이지 수집일이 아니다 — 섞지 말 것.',
    },
  }
  ctx.finish()
  const out = writeEnvelope('reunion-handlttr.json', envelope)
  ctx.log(`저장 ${out} — ${items.length}/${total}건, 실패 ${ctx.failed.length}건`)
}

main().catch(e => { ctx.finish(); console.error('✗', e.message); process.exit(1) })
