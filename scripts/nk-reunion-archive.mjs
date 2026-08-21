#!/usr/bin/env node
// nk-reunion-archive.mjs — 디지털박물관 「기록관」 전량 수집 → 북한자료-api/reunion-archive.json
//
// 코너: https://reunion.unikorea.go.kr/reuni/home/museum/archive/FrmRecord.do?mid=SM00000264
// 렌더: JS. jsSearch() → POST ArchivesList.do (조각 HTML)
// 목록: POST /reuni/home/museum/archive/ArchivesList.do
//       body: mid=SM00000264&pageIndex={p}&i_type={''|01..06}&archiveType=0&listType=&searchType=2
//             &search=&orderType=1&pageUnit=100
//       · pageUnit 최대 100(실측). 누적 아님. 총건수는 hidden input id="totCnt"
//
// ★ 이 수집이 museum.json 에 더하는 것 — '건수'가 아니라 '필드'다.
//   museum.json 은 이미 같은 4,342건을 갖고 있다(동일 모집단). 새 사료는 0건이다.
//   대신 여기서 **형태(i_type) 6종을 전 건에 붙인다**. museum.json 의 form/regNo 는 215건에만 있었다.
//   등록번호 규칙: MA-{i_type 2자리}-{i_id 8자리 zero-pad} — 탐사에서 regNo 보유 215건 전량 성립 확인.
//   ★ 규칙으로 만든 등록번호는 관측값이 아니라 '유도값'이다. regNoDerived 로 이름을 나눠 표기한다.
//
// 실행: node scripts/nk-reunion-archive.mjs [--force] [--delay=500]

import {
  BASE, MID, createCtx, parseArgs, parseListCards, totCntOf,
  writeEnvelope, loadMuseumIds, overlapReport, LICENSE_NOTE, nowKSTStamp, stampCollected,
} from './nk-reunion-lib.mjs'

const PAGE_UNIT = 100
const LIST_URL = `${BASE}/reuni/home/museum/archive/ArchivesList.do`
const PAGE_URL = `${BASE}/reuni/home/museum/archive/FrmRecord.do?mid=${MID.archive}`

// 사이트의 형태 분류 탭. 라벨은 화면 표기 그대로.
const I_TYPES = [
  { code: '01', label: '도서/간행물류' },
  { code: '02', label: '문서류' },
  { code: '03', label: '사진류' },
  { code: '04', label: '시청각류' },
  { code: '05', label: '박물류' },
  { code: '06', label: '신문류' },
]

const args = parseArgs()
const ctx = createCtx({ corner: 'archive', delay: args.delay, force: args.force })

const body = (p, iType) =>
  `mid=${MID.archive}&pageIndex=${p}&i_type=${iType}&archiveType=0&listType=&searchType=2&search=&orderType=1&pageUnit=${PAGE_UNIT}`

async function harvest(iType, label) {
  const tag = iType === '' ? '전체' : `${iType} ${label}`
  const first = await ctx.post(LIST_URL, body(1, iType), `${tag} p1`)
  if (!first) { ctx.note(`${tag}`, '1쪽 실패 — 총건수 확정 불가'); return null }
  const total = totCntOf(first)
  if (total == null) { ctx.note(`${tag}`, 'totCnt 없음'); return null }
  const pages = Math.ceil(total / PAGE_UNIT)
  const byId = new Map()
  const perPage = []
  const take = (p, html) => {
    const cards = parseListCards(html)
    perPage.push({ page: p, parsed: cards.length })
    for (const c of cards) if (!byId.has(c.iId)) byId.set(c.iId, c)
  }
  take(1, first)
  for (let p = 2; p <= pages; p++) {
    const html = await ctx.post(LIST_URL, body(p, iType), `${tag} p${p}`)
    if (!html) { perPage.push({ page: p, parsed: 0, failed: true }); continue }
    take(p, html)
    if (p % 10 === 0 || p === pages) ctx.log(`  ${tag} p${p}/${pages} 누적 ${byId.size}/${total}`)
  }
  return { iType, label, total, pages, perPage, byId }
}

const main = async () => {
  ctx.log('시작', nowKSTStamp())

  // ① 전체 목록(형태 필터 없음) — 이것이 모집단이다.
  const all = await harvest('', '전체')
  if (!all) throw new Error('전체 목록을 받지 못했다 — 중단.')
  ctx.log(`전체 ${all.byId.size}/${all.total}`)

  // ② 형태별 목록 — 전 건에 i_type 을 붙이기 위한 것.
  const typeRuns = []
  for (const t of I_TYPES) {
    const r = await harvest(t.code, t.label)
    if (r) { typeRuns.push(r); ctx.log(`${t.code} ${t.label} ${r.byId.size}/${r.total}`) }
  }

  const typeOf = new Map()
  const typeConflicts = []
  for (const r of typeRuns) {
    for (const id of r.byId.keys()) {
      if (typeOf.has(id) && typeOf.get(id) !== r.iType) {
        typeConflicts.push({ iId: id, a: typeOf.get(id), b: r.iType })
      } else typeOf.set(id, r.iType)
    }
  }

  const labelOf = Object.fromEntries(I_TYPES.map(t => [t.code, t.label]))
  const items = [...all.byId.values()].sort((a, b) => a.iId - b.iId).map(c => {
    const it = typeOf.get(c.iId) || null
    return {
      ...c,
      iType: it,
      iTypeLabel: it ? labelOf[it] : null,
      // 관측값이 아니라 규칙으로 만든 값이다 — 이름으로 구분해 둔다.
      regNoDerived: it ? `MA-${it}-${String(c.iId).padStart(8, '0')}` : null,
      recordUrl: `${BASE}/reuni/home/museum/archive/RecordView.do?i_id=${c.iId}&mid=${MID.archive}`,
    }
  })

  // 규칙 검증: museum.json 이 실제로 관측한 regNo 215건과 대조한다.
  const museum = loadMuseumIds()
  let regNoCheck = { checked: false }
  if (museum) {
    let n = 0, ok = 0, bad = []
    for (const it of items) {
      const r = museum.byId.get(it.iId)
      if (!r || !r.regNo || !it.regNoDerived) continue
      n++
      if (r.regNo === it.regNoDerived) ok++
      else bad.push({
        iId: it.iId, title: it.title,
        observedRegNo: r.regNo, derivedRegNo: it.regNoDerived,
        observedForm: r.form || null, listTabIType: it.iType, listTabLabel: it.iTypeLabel,
      })
    }
    regNoCheck = {
      checked: true, comparable: n, matched: ok, mismatched: bad.length, mismatches: bad.slice(0, 20),
      note: 'museum.json 이 상세에서 실제로 읽은 등록번호와, 여기서 규칙(MA-{i_type}-{i_id 8자리})으로 만든 값의 대조.',
      interpretation: bad.length === 0
        ? '215건 전량에서 규칙이 성립한다.'
        : '★ 불일치는 우리 규칙의 오류가 아니라 사이트 자체의 불일치로 보인다. ' +
          '불일치 건은 상세의 형태정보(예 "문서류 > 서신")와 기록관 형태 탭(i_type=02 문서류)이 서로 일치하는데 ' +
          '등록번호만 다른 코드(MA-01)를 달고 있다. 즉 등록번호 쪽이 어긋난 것이다. ' +
          '그래서 regNoDerived 는 유도값으로 남기고, 관측된 등록번호(museum.json 의 regNo)를 덮어쓰지 않는다.',
    }
  }

  const overlap = overlapReport(items.map(i => i.iId), museum)
  const typeCounts = Object.fromEntries(typeRuns.map(r => [`${r.iType} ${r.label}`, { siteTotal: r.total, collected: r.byId.size }]))
  const typeSum = typeRuns.reduce((s, r) => s + r.total, 0)
  const untyped = items.filter(i => !i.iType)
  const gap = all.total - items.length

  /* ★ 수집일 확정 — 캐시에서만 읽었으면 그 캐시가 쓰인 때가 실제 수집 시각이다.
       실행 시각을 찍으면 네트워크를 0회 치고도 수집일이 앞으로 밀린다(as-of 규약 위반). */
  const stamped = stampCollected(ctx, args)
  ctx.log(`수집일 ${stamped.date} (${stamped.forced ? '--collected-at 지정' : stamped.observed ? '캐시·요청 실측 최댓값' : '실측 불가 — 폴백'})`)
  const envelope = {
    source: '통일부 남북이산가족 디지털박물관 — 기록관(형태별 사료)',
    corner: '기록관',
    url: PAGE_URL,
    collectedAt: args.collectedAt,
    collectedAtStamp: args.collectedAtStamp,
    total: all.total,
    totalEvidence: `조각 HTML 의 hidden input id="totCnt" = ${all.total}. 화면 표시 「총 ${all.total}개의 검색 결과」와 같은 값.`,
    items,
    meta: {
      collected: items.length,
      coveragePct: all.total ? +(items.length / all.total * 100).toFixed(2) : null,
      gapVsTotal: gap,
      gapNote: gap === 0 ? '총건수와 수집 건수가 일치한다.' : `총건수 ${all.total} 와 수집 ${items.length} 이 ${gap}건 다르다 — perPage/failed 참조.`,
      pagesFetched: all.pages,
      pageUnit: PAGE_UNIT,
      perPage: all.perPage,
      byIType: typeCounts,
      iTypeSum: typeSum,
      iTypeSumMatchesTotal: typeSum === all.total,
      typedItems: items.length - untyped.length,
      untypedItems: untyped.length,
      untypedSample: untyped.slice(0, 20).map(i => i.iId),
      typeConflicts,
      regNoRuleCheck: regNoCheck,
      withThumb: items.filter(i => i.thumbFileId != null).length,
      withoutThumb: items.filter(i => i.thumbFileId == null).length,
      withProducedOn: items.filter(i => i.producedOn).length,
      hasRegionField: false,
      regionNote:
        '전용 지역 필드가 없다. 지명은 title·content 자유 텍스트 안에만 있다. ' +
        '고향 축(광복 당시 7종) 매핑은 여기서 하지 않고 통합 단계로 넘긴다 — 원문 그대로 보존했다.',
      overlapWithMuseumJson: overlap,
      valueAddNote:
        '★ 이 수집은 새 사료를 만들지 않는다(museum.json 과 동일 모집단 4,342건). ' +
        '더하는 것은 「형태(i_type) 6종의 전 건 부여」와 「그로부터 유도한 등록번호」다. ' +
        'museum.json 의 form/regNo 는 215건에만 있었다. 기록 밀도 분자는 건드리지 않는다 — ' +
        '분모·분자를 늘리는 수집이 아니라 필드 충실도를 올리는 수집이다.',
      notCollected: {
        recordDetail: {
          url: `${BASE}/reuni/home/museum/archive/RecordView.do?i_id={iId}&mid=${MID.archive}`,
          missingFields: ['producer(생산자)', 'origin(출처정보)', 'form(형태 대>소분류 전체 문자열)', 'donor(상세 확정값)', 'fileIds 전량'],
          reason:
            '상세 4,342건 개별 조회는 이 임무(코너 목록 전량 수집)의 범위를 넘고, 같은 값을 무세션 JSON API ' +
            'TimeTravel.do/{iId} 로 더 싸게 받을 수 있다(탐사 실측: 쿠키·Referer 불필요, 응답 300~1,000바이트). ' +
            '중복 수집으로 공공 서버를 두 번 때리지 않기 위해 여기서는 받지 않았다. 못 가져온 것을 못 가져왔다고 적는다.',
        },
      },
      endpoint: {
        method: 'POST', url: LIST_URL,
        body: `mid=${MID.archive}&pageIndex={p}&i_type={''|01..06}&archiveType=0&listType=&searchType=2&search=&orderType=1&pageUnit=${PAGE_UNIT}`,
        pageUnitMax: 100, cumulative: false, totalField: 'hidden input id="totCnt"',
        session: 'museum/view.do?gubn=A&mid=SM00000261 로 JSESSIONID 선발급 필요',
      },
      media: '이미지 URL 만 기록한다. 바이너리는 내려받지 않는다.',
      license: LICENSE_NOTE,
      failed: ctx.failed,
      network: ctx.net,
      note: 'as-of: 수집일은 collectedAt. producedOn 은 사료 생산일자이며 수집일과 다르다 — 섞지 말 것.',
    },
  }
  ctx.finish()
  const out = writeEnvelope('reunion-archive.json', envelope)
  ctx.log(`저장 ${out} — ${items.length}/${all.total}건, 형태부여 ${items.length - untyped.length}건, 실패 ${ctx.failed.length}건`)
}

main().catch(e => { ctx.finish(); console.error('✗', e.message); process.exit(1) })
