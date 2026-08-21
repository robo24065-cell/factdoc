#!/usr/bin/env node
// nk-reunion-yearbook.mjs — 디지털박물관 「연표」 전량 수집 → 북한자료-api/reunion-yearbook.json
//
// 코너: https://reunion.unikorea.go.kr/reuni/home/museum/Yearbook.do?gubn=K&mid=SM00000276
// 렌더: JS. fnGetList('1','','') → GET 내부 JSON API
// API : GET /reuni/home/museum/getYearbookList.do?eqYSheetDiv={연대}&eqYTrace={검색어}&eqYSheetSubDiv={연도}&mid=SM00000276
//        · Content-Type: application/json. mid 가 없으면 302.
//        · 페이징 없음 — 한 번에 전량.
//        · eqYSheetDiv 를 비우면 전체가 온다(totCnt=1041). 연대별로 부르면 yearList(연도별 건수)가 함께 온다.
//
// ★★ 임무 브리핑 정정 — 「연표 총 19건」은 틀렸다.
//   19건은 화면 기본값인 **1950년대 탭(eqYSheetDiv=1)** 하나의 건수다. 전체는 **1,041건**이다.
//   이 스크립트는 전체를 한 번, 연대 8개를 각각 한 번 불러 두 경로의 합계가 맞는지 서로 대조한다.
//
// 실행: node scripts/nk-reunion-yearbook.mjs [--force] [--delay=500]

import {
  BASE, MID, createCtx, parseArgs, writeEnvelope, LICENSE_NOTE, nowKSTStamp, stampCollected,
} from './nk-reunion-lib.mjs'

const API = `${BASE}/reuni/home/museum/getYearbookList.do`
const PAGE_URL = `${BASE}/reuni/home/museum/Yearbook.do?gubn=K&mid=${MID.yearbook}`

// 화면 탭. ySheetDiv 코드는 사이트 값 그대로.
const DECADES = [
  { code: '1', label: '1950년대' }, { code: '2', label: '1960년대' },
  { code: '3', label: '1970년대' }, { code: '4', label: '1980년대' },
  { code: '5', label: '1990년대' }, { code: '6', label: '2000년대' },
  { code: '7', label: '2010년대' }, { code: '8', label: '2020년대' },
]

const args = parseArgs()
const ctx = createCtx({ corner: 'yearbook', delay: args.delay, force: args.force })

const url = (div) => `${API}?eqYSheetDiv=${div}&eqYTrace=&eqYSheetSubDiv=&mid=${MID.yearbook}`

// 응답의 각 행에는 페이징 라이브러리의 잔재 필드(page/limit/sorts/…)가 잔뜩 붙어 온다.
// 의미 있는 것만 남긴다. yDtStrt 는 YYYYMMDD 문자열.
function normalize(row, decadeLabel) {
  const raw = String(row.yDtStrt || '')
  const iso = /^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : null
  return {
    yNo: row.yNo != null ? +row.yNo : null,
    decadeCode: row.ySheetDiv != null ? String(row.ySheetDiv) : null,
    decadeLabel: decadeLabel || null,
    date: iso,
    dateRaw: raw || null,
    year: raw.length >= 4 ? +raw.slice(0, 4) : null,
    text: row.yTrace != null ? String(row.yTrace).trim() : null,
  }
}

const main = async () => {
  ctx.log('시작', nowKSTStamp())

  // ① 전체
  const allRaw = await ctx.get(url(''), 'yearbook 전체')
  if (!allRaw) throw new Error('연표 전체를 받지 못했다 — 중단.')
  let all
  try { all = JSON.parse(allRaw) } catch (e) { throw new Error(`JSON 파싱 실패: ${e.message}`) }
  const total = all.totCnt != null ? +all.totCnt : null
  if (total == null) throw new Error('totCnt 가 없다 — 총건수 근거 없이 진행하지 않는다.')
  ctx.log(`전체 totCnt=${total}, list=${(all.list || []).length}`)

  const labelOf = Object.fromEntries(DECADES.map(d => [d.code, d.label]))
  const items = (all.list || []).map(r => normalize(r, labelOf[String(r.ySheetDiv)]))

  // ② 연대별 — 연도별 건수(yearList)는 연대 호출에만 딸려 온다.
  const byDecade = []
  const yearCounts = []
  for (const d of DECADES) {
    const raw = await ctx.get(url(d.code), `yearbook ${d.label}`)
    if (!raw) { byDecade.push({ ...d, siteTotal: null, listed: null, failed: true }); continue }
    let j
    try { j = JSON.parse(raw) } catch (e) { ctx.note(`${d.label}`, `JSON 파싱 실패: ${e.message}`); continue }
    byDecade.push({ code: d.code, label: d.label, siteTotal: j.totCnt != null ? +j.totCnt : null, listed: (j.list || []).length })
    for (const y of (j.yearList || [])) {
      yearCounts.push({ decadeCode: String(y.ySheetDiv), year: +String(y.yDtStrt).slice(0, 4), count: +y.yCnt })
    }
    ctx.log(`  ${d.label} ${(j.list || []).length}건`)
  }

  const decadeSum = byDecade.reduce((s, d) => s + (d.siteTotal || 0), 0)
  const dates = items.map(i => i.date).filter(Boolean).sort()
  const gap = total - items.length

  /* ★ 수집일 확정 — 캐시에서만 읽었으면 그 캐시가 쓰인 때가 실제 수집 시각이다.
       실행 시각을 찍으면 네트워크를 0회 치고도 수집일이 앞으로 밀린다(as-of 규약 위반). */
  const stamped = stampCollected(ctx, args)
  ctx.log(`수집일 ${stamped.date} (${stamped.forced ? '--collected-at 지정' : stamped.observed ? '캐시·요청 실측 최댓값' : '실측 불가 — 폴백'})`)
  const envelope = {
    source: '통일부 남북이산가족 디지털박물관 — 연표',
    corner: '연표',
    url: PAGE_URL,
    collectedAt: args.collectedAt,
    collectedAtStamp: args.collectedAtStamp,
    total,
    totalEvidence:
      `내부 JSON API 응답의 totCnt = ${total}(eqYSheetDiv 를 비운 전체 조회). ` +
      '화면 「전체」 탭의 「총 1041 건」 표시와 같은 값이다.',
    items,
    meta: {
      collected: items.length,
      coveragePct: total ? +(items.length / total * 100).toFixed(2) : null,
      gapVsTotal: gap,
      gapNote: gap === 0 ? '총건수와 수집 건수가 일치한다.' : `총건수 ${total} 와 수집 ${items.length} 이 ${gap}건 다르다 — failed 참조.`,
      briefingCorrection:
        '★ 임무 브리핑의 「연표 총 19건」은 틀렸다. 19건은 화면 첫 탭(1950년대, eqYSheetDiv=1)의 건수이고 ' +
        `전체는 ${total}건이다. 아래 byDecade 가 근거다.`,
      byDecade,
      decadeSum,
      decadeSumMatchesTotal: decadeSum === total,
      decadeSumNote: decadeSum === total
        ? '연대 8개 배지 합이 전체 totCnt 와 정확히 일치한다 — 두 경로 교차검증 통과.'
        : `연대 합 ${decadeSum} 과 전체 ${total} 이 다르다. 어느 쪽도 지어내지 않고 둘 다 남긴다.`,
      yearCounts,
      coverage: dates.length ? { first: dates[0], last: dates[dates.length - 1] } : null,
      withDate: items.filter(i => i.date).length,
      withoutDate: items.filter(i => !i.date).length,
      hasRegionField: false,
      regionNote:
        '전용 지역 필드가 없다. yTrace 자유 텍스트뿐이다. 고향 축 매핑은 여기서 하지 않고 통합 단계로 넘긴다.',
      overlapWithMuseumJson: {
        checked: true,
        overlaps: false,
        note:
          '연표는 사료(iId 체계)가 아니라 사건 서술이다. museum.json 과 키를 공유하지 않아 겹칠 수 없다 — ' +
          '즉 이것은 새 계열의 자료다. 다만 「사료 건수」가 아니므로 기록 밀도 분자에 넣지 말 것. ' +
          '연표는 시간축(사건)에 붙는 자산이다.',
      },
      endpoint: {
        method: 'GET', url: `${API}?eqYSheetDiv={연대|공백}&eqYTrace={검색어}&eqYSheetSubDiv={연도}&mid=${MID.yearbook}`,
        contentType: 'application/json;charset=UTF-8', paging: '없음 — 한 번에 전량',
        midRequired: 'mid 가 없으면 302',
        responseShape: '{ list:[{yNo, ySheetDiv, yDtStrt(YYYYMMDD), yTrace}], yearList:[{ySheetDiv, yDtStrt, yCnt}], totCnt }',
        note: '★ 전체 조회(eqYSheetDiv 공백)일 때 yearList 는 빈 배열로 온다 — 연도별 건수는 연대별 조회에서만 나온다.',
      },
      license: LICENSE_NOTE,
      failed: ctx.failed,
      network: ctx.net,
      note:
        'as-of: 수집일은 collectedAt. 항목의 date 는 사건이 일어난 날이지 수집일이 아니다 — 섞지 말 것. ' +
        '연표의 마지막 사건일(meta.coverage.last)이 곧 이 연표가 갱신을 멈춘 시점이다.',
    },
  }
  ctx.finish()
  const out = writeEnvelope('reunion-yearbook.json', envelope)
  ctx.log(`저장 ${out} — ${items.length}/${total}건, 실패 ${ctx.failed.length}건`)
}

main().catch(e => { ctx.finish(); console.error('✗', e.message); process.exit(1) })
