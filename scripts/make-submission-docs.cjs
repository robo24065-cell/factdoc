/* 제출 서류 생성 — 서식3 아이디어 기획서 + 서식1 참가 신청서 (워드)
   규격: A4 10쪽 이내 · 휴먼명조 · 14pt · 줄간격 160%  (안내문 유의사항 원문)

   ★ 시각 구조는 공식 hwpx 원본에서 그대로 읽어 왔다.
     제출서류/작성서류서식/서식3. 아이디어 기획서.hwpx → Contents/header.xml
       borderFill 6  = #315F97 (진한 남색)  ← 대구획 머리(활용 데이터 / 아이디어 소개 / 머리 표 라벨)
       borderFill 11 = #D9D9D9 (회색)       ← 항목 머리(공공데이터 출처·명 / 개요 / 상세내용 / 기타 참고 사항 등)
       borderFill 4  = 흰 내용 셀(사방 실선 0.12mm)
       라벨 열 폭 12472 / 47624 = 26.2%,  머리 표 오른쪽 접수번호 칸 9076 / 47624 = 19.1%
     양식의 ※ 안내문(회색 기울임)은 **작성 지시**이므로 산출물에 남기지 않는다 — 그 자리에 실제 내용을 채운다.
     양식 맨 아래 「유의 사항」 칸도 지시문이라 산출물에 넣지 않는다.

   개인 정보는 절대 채우지 않는다 — 자리만 만든다.
   수치는 전부 저장소 산출물(frontend/public/gohyang/*.json · 북한자료-api/analysis.json ·
   scripts/nk-catalog.mjs · eval/wild 실행 결과)에서 나온 실측값이다. */
const path = require('path')
const fs = require('fs')
/* docx 는 이 저장소에 지역 설치돼 있지 않고 전역(npm -g)에 있다.
   그냥 require 하면 재실행이 깨지므로 전역 경로를 폴백으로 붙인다. */
const D = (() => {
  try { return require('docx') } catch { /* 아래에서 전역을 찾는다 */ }
  const roots = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules'),
    path.join(path.dirname(process.execPath), 'node_modules'),
    '/usr/local/lib/node_modules',
    '/usr/lib/node_modules',
  ].filter(Boolean)
  for (const r of roots) {
    try { return require(path.join(r, 'docx')) } catch { /* 다음 후보 */ }
  }
  throw new Error(`docx 모듈을 찾지 못했다. npm i -g docx 로 설치하거나 지역 설치하라. 찾아본 곳: ${roots.join(' , ')}`)
})()
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, ShadingType, BorderStyle, LevelFormat, VerticalAlign, ImageRun,
} = D

const ROOT = 'C:/Users/PC/Downloads/2026년 통일부 공공데이터 활용 공모전/추출폴더'
const OUT_DIR = path.join(ROOT, '제출서류')
fs.mkdirSync(OUT_DIR, { recursive: true })

/* ── 규격 상수 (건드리면 실격) ── */
const FONT = '휴먼명조'
const SZ = 28            // 14pt (half-points)
const LINE = 384         // 160% (240 × 1.6)

/* ── 지면 ── */
const PAGE_W = 11906     // A4 DXA
const MARGIN = 737      // 1.3cm — 여백은 규격(글꼴·크기·줄간격·쪽수)이 정하지 않는다.
                        // 표가 늘어난 만큼 본문 폭을 넓혀 잡았다. 이 값을 키우면 쪽수가 는다.
/* ★ 한글(HWP) 옮김 쪽수 — 2026-08-20 실측
   공식 양식 hwpx(Contents/section0.xml)의 판면은 pagePr 210×297mm · margin 좌우 20mm ·
   상하 10mm + 머리/꼬리 15mm → 본문 170.0×247.0mm 다. 여기(1.3cm 여백)는 184.0×271.4mm 로
   면적이 1.19배 넓다. 같은 원고를 양식 판면(MARGIN 1134 · 상하 1417)으로 다시 뽑아 Word 로 재면
   14쪽이 아니라 17쪽이 나온다. 안내문 상한은 A4 10쪽이므로, 한글로 옮길 때는
   ① 양식 여백을 이 값(1.3cm)으로 맞추거나 ② 본문을 더 줄여야 한다. 사람이 한글에서 다시 잴 것. */
const CW = PAGE_W - MARGIN * 2

/* ── 원본 hwpx 비율을 그대로 옮긴 3열 ── */
const COL_L = Math.round(CW * 12472 / 47624)   // 라벨 열
const COL_R = Math.round(CW * 9076 / 47624)    // 머리 표 오른쪽(접수번호) 열
const COL_M = CW - COL_L - COL_R
const COLS = [COL_L, COL_M, COL_R]

/* ── 원본 hwpx 색 ── */
const NAVY = '315F97'
const GRAY = 'D9D9D9'

/* ══════════════ 문단·표 기본 도구 ══════════════ */
const run = (text, o = {}) => new TextRun({
  text, font: FONT, size: o.sz ?? SZ, bold: o.b, color: o.color,
})
const P = (text, o = {}) => new Paragraph({
  spacing: { line: LINE, before: o.before ?? 0, after: o.after ?? 0 },
  alignment: o.align ?? AlignmentType.JUSTIFIED,
  numbering: o.num ? { reference: 'dot', level: 0 } : undefined,
  indent: o.indent,
  children: Array.isArray(text) ? text : [run(text, o)],
})
const GAP = (h = 60) => new Paragraph({ spacing: { line: 240, after: h }, children: [] })

const LINE_B = { style: BorderStyle.SINGLE, size: 4, color: '7F7F7F' }
const NO_B = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const allB = { top: LINE_B, bottom: LINE_B, left: LINE_B, right: LINE_B }

/* 셀 — 원본이 변마다 다른 선을 쓰므로 변별로 지정할 수 있게 열어 둔다 */
const cell = (children, w, o = {}) => new TableCell({
  width: { size: w, type: WidthType.DXA },
  borders: o.borders ?? allB,
  verticalAlign: o.va ?? VerticalAlign.CENTER,
  shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill } : undefined,
  margins: o.margins ?? { top: 16, bottom: 16, left: 64, right: 64 },
  columnSpan: o.span,
  children: children.map((c) => (typeof c === 'string'
    ? new Paragraph({
      spacing: { line: LINE },
      alignment: o.align ?? AlignmentType.JUSTIFIED,
      children: [run(c, { b: o.b, sz: o.sz, color: o.color })],
    })
    : c)),
})
const row = (cells) => new TableRow({ children: cells })
const table = (colWidths, rows) => new Table({
  width: { size: colWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
  columnWidths: colWidths,
  rows,
})

/* 대구획 머리 — 남색 채움 + 흰 굵은 글씨, 왼쪽 라벨 열만 차지하고 오른쪽은 흰 빈칸 */
const navyLabel = (t, w, span) => cell([t], w, {
  fill: NAVY, b: true, color: 'FFFFFF', sz: 24, span,
  align: AlignmentType.CENTER,
})
/* 항목 머리 — 회색 채움 + 검은 굵은 글씨, 가운데 정렬 */
const grayLabel = (t, w, o = {}) => cell([t], w, {
  fill: GRAY, b: true, sz: o.sz ?? 24, span: o.span,
  align: AlignmentType.CENTER,
})
/* 남색 라벨 오른쪽의 흰 빈칸 — 원본 borderFill 10 (왼·아래만 실선) */
const blankRight = (w, span) => cell([''], w, {
  span, borders: { top: NO_B, bottom: LINE_B, left: LINE_B, right: NO_B },
})

const numbering = {
  config: [{
    reference: 'dot',
    levels: [{
      level: 0, format: LevelFormat.BULLET, text: '·', alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 300, hanging: 190 } }, run: { font: FONT, size: SZ } },
    }],
  }],
}

/* ══════════════════════════════════════════════════════════════════════════
   ★ 수치는 여기서 **산출물 파일을 읽어** 채운다. 하드코딩하지 않는다.

   왜: 예전에는 밀도 표·격차 배수·1순위 수치가 이 파일에 문자열로 박혀 있었다.
   그래서 분석이 갱신돼도(이산가족정보통합시스템 신규 수집분이 분자에 들어가 15.5배 → 13.9배)
   문서만 옛 값을 그대로 갖고 있었고, 다시 생성해도 옛 값이 다시 나왔다.
   이제 record-density-gap · legacy-priority 카드가 바뀌면 문서도 함께 바뀐다.
   카드가 없거나 모양이 달라지면 **죽는다** — 조용히 옛 값으로 돌아가지 않는다.
   ══════════════════════════════════════════════════════════════════════════ */
const PACK = path.join(ROOT, 'frontend', 'public', 'gohyang')
const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const ANALYSIS = readJSON(path.join(PACK, 'analysis.json'))
const REUNION = readJSON(path.join(PACK, 'reunion.json'))
const COLLECTION = readJSON(path.join(ROOT, '북한자료-api', 'reunion-collection.json'))
const cardOf = (id) => {
  const c = (ANALYSIS.cards || []).find((x) => x.id === id)
  if (!c) throw new Error(`analysis.json 에 카드가 없다: ${id} — 먼저 node scripts/nk-analysis.mjs 를 돌려라`)
  return c
}
const DENS = cardOf('record-density-gap')
const PRIO = cardOf('legacy-priority')
/* 덱 요약과 고향 안내인 하니스의 실적 — 손으로 옮겨 적지 않는다.
   (요약 수치를 27개로 적어 두었는데 실제 산출물은 21개였고, 안내인은 29 로 적혀 있었는데
    실측은 36 이었다. 둘 다 손으로 옮긴 자리에서 어긋났다.) */
const SUMMARY = readJSON(path.join(PACK, 'deck-summary.json'))
const GUIDE = (() => {
  const p = path.join(ROOT, '북한자료-api', 'guide-check.json')
  if (!fs.existsSync(p)) throw new Error('guide-check.json 이 없다 — 먼저 node scripts/nk-guide-check.mjs 를 돌려라')
  return readJSON(p)
})()
const findOf = (card, label) => {
  const f = (card.findings || []).find((x) => x.label === label)
  if (!f) throw new Error(`${card.id} 카드에 finding 이 없다: ${label}`)
  return f
}
/** "13.9배" → "13.9" · "미수복강원 1.944건/인" → "1.944" 처럼 첫 수를 꺼낸다 */
const numIn = (s) => {
  const m = String(s).match(/[\d,]+(?:\.\d+)?/)
  if (!m) throw new Error(`수치를 찾지 못했다: ${s}`)
  return m[0]
}
const nfmt = (n) => Number(n).toLocaleString('en-US')

/* 대표 수치 — 문서 본문이 부르는 이름 그대로 */
const F = {
  gapX: numIn(findOf(DENS, '격차').value),                          // 13.9 (배)
  /* 보수 집계 배수는 격차 finding 의 note 안에 있다 — 「동향·개황을 뺀 보수 집계 … 15배」 */
  gapNarrowX: (() => {
    const m = String(findOf(DENS, '격차').note).match(/([\d.]+)배/)
    if (!m) throw new Error('보수 집계 배수를 찾지 못했다')
    return m[1]
  })(),
  topName: String(findOf(DENS, '밀도 최상위').value).split(' ')[0],
  topDensity: numIn(findOf(DENS, '밀도 최상위').value.replace(/^\S+\s/, '')),
  botName: String(findOf(DENS, '밀도 최하위').value).split(' ')[0],
  botDensity: numIn(findOf(DENS, '밀도 최하위').value.replace(/^\S+\s/, '')),
  /* 계승 1순위 — 「생존 53.1% 감소 · 기록 0.424건/인 · 식별기록 0.041건/인 (순위합 4)」 */
  prio1: findOf(PRIO, '1순위').value,
  prio1Note: findOf(PRIO, '1순위').note,
  prio1Drop: (String(findOf(PRIO, '1순위').note).match(/생존 ([\d.]+)%/) || [])[1],
  prio1Density: (String(findOf(PRIO, '1순위').note).match(/기록 ([\d.]+)건\/인/) || [])[1],
  prio1Ident: (String(findOf(PRIO, '1순위').note).match(/식별기록 ([\d.]+)건\/인/) || [])[1],
  prio1Sum: (String(findOf(PRIO, '1순위').note).match(/순위합 (\d+)/) || [])[1],
  prio2: findOf(PRIO, '2순위').value,
  prio2Sum: (String(findOf(PRIO, '2순위').note).match(/순위합 (\d+)/) || [])[1],
  prioLast: findOf(PRIO, '가장 여유 있는 곳').value,
  prioLastSum: (String(findOf(PRIO, '가장 여유 있는 곳').note).match(/순위합 (\d+)/) || [])[1],
  /* 신규 수집분 */
  reunionAdded: (REUNION.numeratorDelta?.distinctRecordsAdded ?? 0),
  photoMapped: REUNION.htgallery.mapped,
  photoCollected: REUNION.htgallery.collected,
  photoBadge: REUNION.htgallery.siteBadgeTotal,
  vleMapped: REUNION.vletter.mapped,
  vleCollected: REUNION.vletter.collected,
  vleBadge: REUNION.vletter.siteBadgeTotal,
  collectedAt: REUNION.collectedAt.htgallery,
  collections: COLLECTION.total,
  collectionContainers: COLLECTION.containers,
  /* ── 집계 기준일 — 카드가 말하는 것을 그대로 옮긴다 ────────────────────────
     예전에는 '2026-08-21' 을 네 자리에 손으로 박아 두어, 화면(지역 인덱스 2026-08-15)과
     문서가 서로 다른 날짜를 말했다. 이제 카드의 asOfAxes.aggregation 하나가 진실이다. */
  aggregation: (() => {
    const a = DENS.asOfAxes && DENS.asOfAxes.aggregation
    if (!a) throw new Error('record-density-gap 카드에 asOfAxes.aggregation 이 없다')
    return a
  })(),
  /* 보수 집계로 순위가 그대로인지 — 카드가 계산한 결과 문장에서 읽는다(단언하지 않는다) */
  narrowOrder: /순서도 그대로/.test(String(findOf(DENS, '격차').note))
    ? '순위도 그대로다'
    : '가장 많은 곳과 가장 적은 곳은 그대로이고 중간 순서는 바뀐다',
}
for (const [k, v] of Object.entries(F)) {
  if (v == null || v === '') throw new Error(`대표 수치를 뽑지 못했다: ${k} — 카드 문구가 바뀌었는지 확인하라`)
}
/* ── 이산가족정보통합시스템 12개 코너 실측 ──
   ★ 건수는 각 수집 산출물에서 읽는다. 「고향 정보」·「쓰임」은 reunion-region.json 의 judgement 판정을
     그대로 옮긴 것이고, 판정 근거(A~D 네 조건)는 그 파일에 문장으로 남아 있다. */
const REU_FILES = [
  ['나의 살던 고향은', 'htgallery'], ['영상편지', 'vletter'], ['이산가족상봉 이모저모', 'photo'],
  ['시간여행', 'timetravel'], ['웹툰', 'webtoon'], ['박물관 소개', 'museum-intro'],
  ['손편지', 'handlttr'], ['컬렉션', 'collection'], ['기록관', 'archive'],
  ['기증현황', 'donation'], ['연표', 'yearbook'], ['통합검색(질의)', 'search'],
]
const REU_JUDGE = Object.fromEntries(
  readJSON(path.join(ROOT, '북한자료-api', 'reunion-region.json')).judgement
    .map((j) => [String(j.corner).replace(/^.*\(|\)$/g, ''), j]),
)
/* 쓰임 문구는 **한 줄에 들어가게** 짧게 쓴다 — 표가 두 줄로 부풀면 쪽수가 늘고 규격을 넘긴다.
   판정 근거 전문은 reunion-region.json judgement 에 있고 여기는 결론만 옮긴다. */
const REU_USE = {
  htgallery: ['원문 확정', '사진 격자 · 밀도 분자'],
  vletter: ['자막에서만', '영상 목록 · 밀도 분자'],
  photo: ['없음', '개최지는 남측이라 제외'],
  timetravel: ['사료와 동일', '해설문만 활용(전량 중복)'],
  webtoon: ['없음', '창작물 — 기록물 아님'],
  'museum-intro': ['없음', '코너 구조 확인용'],
  handlttr: ['사료와 동일', '사료와 전량 중복'],
  collection: ['사료와 동일', '설명·계층만(중복)'],
  archive: ['사료와 동일', '사료 원본 계열'],
  donation: ['없음', '통계표 — 건수 아님'],
  yearbook: ['없음', '지역 필드 없어 제외'],
  /* 통합검색의 total 은 「질의 수」다 — 결과 건수가 아니다. 그대로 「32건」으로 적으면 32건을 수집한 것처럼 읽힌다. */
  search: ['사료와 동일', '결과 1,889건 전부 기존 사료'],
}
const REUNION_CORNERS = REU_FILES.map(([name, key]) => {
  const j = readJSON(path.join(ROOT, '북한자료-api', `reunion-${key}.json`))
  const collected = j.collected ?? (Array.isArray(j.items) ? j.items.length : null)
  if (collected == null) throw new Error(`수집 건수를 읽지 못했다: reunion-${key}.json`)
  const [region, use] = REU_USE[key]
  return {
    name, key,
    /* 컬렉션은 사이트가 총건수를 표시하지 않는다 — total 이 우리 스캔값이라 「미표시」로 적는다 */
    siteTotal: key === 'collection' || j.totalDisplayedBySite === false ? null : (j.total ?? null),
    collected: key === 'collection' ? (j.meta?.uniqueRecords ?? collected) : collected,
    region, use,
    verdict: REU_JUDGE[key]?.verdict ?? null,
  }
})

/* 밀도 표 — 카드 table 을 생존자 많은 순으로 그대로 옮긴다(손으로 적지 않는다) */
const DENS_ROWS = [...(DENS.table || [])]
  .sort((a, b) => b['생존자'] - a['생존자'])
  .map((r) => [r['고향'], nfmt(r['생존자']), nfmt(r['기록계']), String(r['밀도']), String(r['생존자비중'])])
if (DENS_ROWS.length !== 7) throw new Error(`밀도 표 행이 7개가 아니다: ${DENS_ROWS.length}`)

const TEAM = '고향잇기'
/* 부제는 「서비스」로 끝난다 — 부문(아이디어 기획 = 제도·서비스 제안)과 즉시 맞물리게 하고,
   대상(이산가족)·차별점(공백을 '계산')·귀결(기증으로 잇는다)을 한 줄에 모두 담는다. */
const TITLE = '「이어 적는 고향」 : 이산가족의 고향별 기록 공백을 계산해 기증으로 잇는 서비스'

/* 화면 캡처 — 상세내용의 「구현 기술·서비스 방법」 안에 인라인으로 넣는다(별첨 구획을 새로 만들지 않는다) */
const CAP_DIR = path.join(ROOT, '기획서-캡처')
const shot = (rel, wpx, ratio = 1720 / 2560) => new ImageRun({
  type: 'png',
  data: fs.readFileSync(path.join(CAP_DIR, rel)),
  transformation: { width: wpx, height: Math.round(wpx * ratio) },
})

/* ══════════════════════════ 서식3 — 아이디어 기획서 ══════════════════════════ */
function form3() {
  /* ── ① 머리 표 ── */
  const headTable = table(COLS, [
    row([
      cell([
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { line: 300 },
          children: [run('[ 2026년 통일부 공공데이터 활용 공모전 ]', { b: true, sz: 24 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { line: 300 },
          children: [run('아이디어 기획서', { b: true, sz: 40, color: '214368' })],
        }),
      ], COL_L + COL_M, { span: 2, borders: { top: NO_B, bottom: NO_B, left: NO_B, right: NO_B } }),
      cell([
        table([COL_R - 300], [
          row([navyLabel('접수번호', COL_R - 300)]),
          row([cell(['(접수기관 발급)'], COL_R - 300, { align: AlignmentType.CENTER, sz: 22 })]),
        ]),
      ], COL_R, { borders: { top: NO_B, bottom: NO_B, left: NO_B, right: NO_B }, margins: { top: 0, bottom: 0, left: 0, right: 0 } }),
    ]),
    row([
      navyLabel('참가자/팀 명', COL_L),
      cell([`${TEAM}  (팀 3인 — 팀원 성명·연락처는 서식1에 기재)`], COL_M + COL_R, { span: 2 }),
    ]),
    row([
      navyLabel('아이디어 제목', COL_L),
      cell([TITLE], COL_M + COL_R, { span: 2 }),
    ]),
  ])

  /* ── ② 활용 데이터 ── */
  /* 이산가족정보통합시스템 12개 코너 표 — 값은 전부 수집 산출물에서 읽는다(손으로 적지 않는다).
     「사이트 표시 총건수」는 사이트가 실제로 띄운 배지값이고, 없으면 「미표시」다.
     수집 건수와 다른 코너가 있다 — 배지에는 잡히는데 화면에 그려지지 않는 자리가 있기 때문이며,
     그 사유는 각 산출물의 meta 에 남아 있다. */
  /* 12행을 그대로 세로로 쌓으면 표 하나가 한 쪽을 먹는다(실측: 15쪽). 6행 2단으로 접는다. */
  const HALF = Math.round((CW - 120) / 2)
  const REU_T = [Math.round(HALF * 0.34), Math.round(HALF * 0.24), HALF - Math.round(HALF * 0.34) - Math.round(HALF * 0.24),
    120,
    Math.round(HALF * 0.34), Math.round(HALF * 0.24), HALF - Math.round(HALF * 0.34) - Math.round(HALF * 0.24)]
  const hdD = (t, w) => cell([t], w, { fill: GRAY, b: true, align: AlignmentType.CENTER, sz: 24 })
  const spacer = (w) => cell([''], w, { borders: { top: NO_B, bottom: NO_B, left: NO_B, right: NO_B } })
  const cornerCells = (c, off) => (c
    ? [
        cell([c.name], REU_T[off], { sz: 24 }),
        cell([`${c.siteTotal == null ? '미표시' : nfmt(c.siteTotal)} / ${nfmt(c.collected)}`], REU_T[off + 1], { align: AlignmentType.CENTER, sz: 24 }),
        cell([c.use], REU_T[off + 2], { sz: 24 }),
      ]
    : [cell([''], REU_T[off]), cell([''], REU_T[off + 1]), cell([''], REU_T[off + 2])])
  const REUNION_TOTAL = REUNION_CORNERS.reduce((a, c) => a + c.collected, 0)
  const dataTable = table(COLS, [
    row([navyLabel('활용 데이터', COL_L), blankRight(COL_M + COL_R, 2)]),
    row([
      grayLabel('공공데이터 출처', COL_L),
      cell([
        P('공공데이터포털(data.go.kr) · 통일부 북한정보포털 · 이산가족정보통합시스템(게시판 공표 HWP · 남북이산가족찾기 12개 코너) · 남북이산가족 디지털박물관 · 통일부 보도자료'),
        P('연계(보조) — 통계청 완전생명표 · Open-Meteo 기상 · 서울대 통일평화연구원 통일의식조사'),
      ], COL_M + COL_R, { span: 2, va: VerticalAlign.TOP }),
    ]),
    row([
      grayLabel('공공데이터명', COL_L),
      cell([
        P([run('가. 화면이 직접 계산에 쓰는 통일부 데이터', { b: true })]),
        P('이산가족찾기 등록현황 월별 98개월(2017-07-31~2025-08-31) · 신청현황·교류현황 공표표(2026-05-31) · 남북이산가족 연표 1,041건(1954-02-08~2021-12-16)', { num: 1 }),
        P('화면용 정적 데이터셋 생성에 쓰는 통일부 데이터 5종 54,572건(통합 인덱스 적재 기준, 2026-08-12) — 북한 동향 42,788 · 남북관계연표 8,969 · 보도자료 2,709 · 북한 개황 93 · 북한이탈주민 재북 출신지역별 현황 13', { num: 1 }),
        P('남북이산가족 디지털박물관 사료 4,342건(컬렉션 13개) · 2024년 제4차 남북 이산가족 실태조사 결과(2025-01-24)', { num: 1 }),
        P(`이산가족정보통합시스템 12개 코너 ${nfmt(REUNION_TOTAL)}건(수집일 ${F.collectedAt}) — 고향이 원문으로 확정되는 것은 「나의 살던 고향은」 사진(제공처 표기 포함)이고, 영상편지는 자막에서 고향이 확인되는 건만 쓴다. 상봉 이모저모(개최지가 남측)·웹툰(창작물)·기증현황(통계표)·연표(지역 없음)는 고향 축에서 제외했고, 시간여행·손편지·컬렉션·기록관·통합검색은 기존 사료와 전량 중복이라 세지 않았다 — 코너별 판정 근거는 수집 산출물에 문장으로 남아 있다.`),
        P(`이 가운데 고향이 원문으로 확정되는 ${nfmt(F.reunionAdded)}건(사진 ${F.photoMapped}/${F.photoCollected} · 영상편지 ${F.vleMapped}/${nfmt(F.vleCollected)})만 기록 밀도 분자에 더했다. 나머지 10개 코너는 기존 사료와 중복이거나 지역 귀속이 없다. 팩트체커 인덱스와 다른 계열이라 아래 68,487건에 더하지 않는다.`),
        P([run('나. 팩트체커에서만 쓰이는 26종 13,915건', { b: true }), run(' — 가의 5종을 뺀 나머지다. 자연어 질문을 대조할 때만 쓰고 지도·추계·순위 계산에는 들어가지 않는다.')]),
        P([run('다. 연계 데이터 3종', { b: true }), run(' — 통계청 완전생명표(1세별) 2024년(404행) · Open-Meteo 실시간 기상 · 통일의식조사. 전부 보조이며 빼도 서비스는 성립한다. 화면에서 통일부 자료가 아님을 배지로 구분한다.')]),
        P([run('합계 — ', { b: true }), run('카탈로그에 선언한 통일부 데이터셋 35종(수집 완료 34 · 후속 자료로 대체 1, 이산가족정보통합시스템 12개 코너는 카탈로그 밖의 화면 전용 수집분이다) 중 레코드 인덱스에 실린 것은 31종이고, 나머지 4종 가운데 2종(용어사전·남북한 언어비교)은 다른 형식으로 수집·배포돼 팩트체커가 쓴다. 적재 레코드 68,487건 · 수치 37,912건 · 엔티티 721건(빌드 2026-08-12).')]),
      ], COL_M + COL_R, { span: 2, va: VerticalAlign.TOP }),
    ]),
  ])

  /* ── ③ 아이디어 소개 ── */
  const introTable = table(COLS, [
    row([navyLabel('아이디어 소개', COL_L), blankRight(COL_M + COL_R, 2)]),

    /* 3-1 개요 */
    row([grayLabel('개요', CW, { span: 3 })]),
    row([cell(overview(), CW, { span: 3, va: VerticalAlign.TOP })]),

    /* 3-2 상세내용 */
    row([grayLabel('상세내용', CW, { span: 3 })]),
    row([cell(detail(), CW, { span: 3, va: VerticalAlign.TOP })]),

    /* 3-3 기타 참고 사항 등 */
    row([grayLabel('기타 참고 사항 등', CW, { span: 3, sz: 28 })]),
    row([cell(etc(), CW, { span: 3, va: VerticalAlign.TOP })]),
  ])

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: SZ } } } },
    numbering,
    sections: [{
      properties: { page: { margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
      /* 표로 문서가 끝나면 워드가 표 뒤에 빈 문단을 하나 만든다. 그 문단이 본문 크기(14pt·160%)로
         잡히면 마지막 표가 지면 끝에 딱 맞을 때 그 빈 줄 하나 때문에 11쪽이 된다.
         그래서 높이 없는 빈 문단을 우리가 직접 놓는다 — 규격 검사 대상(30자 이상 본문)이 아니다. */
      children: [headTable, GAP(50), dataTable, GAP(50), introTable,
        new Paragraph({ spacing: { line: 20, before: 0, after: 0 }, children: [run('', { sz: 2 })] })],
    }],
  })
}

/* ── 3-1 개요 : 제안 배경 · 기획 목적 · 필요성(활용 분야·빈도·중요성) ──
   개요는 심사위원의 첫 5초다. 「문제 → 발견 → 해결 → 근거」 순으로 읽히도록 배열하고,
   첫 문단에는 전문 용어와 법조문을 두지 않는다(법조문은 ③ 통로의 공백으로 내렸다). */
function overview() {
  return [
    P([run('무엇을 만드는가 — ', { b: true }), run('「이어 적는 고향」은 고향 이름 하나를 누르면 그 고향의 기록이 얼마나 비어 있는지 계산해 알려 주고, 남은 기록을 보여 준 뒤 새 기록을 기증으로 잇는 웹 서비스다. 다른 점은 둘이다. 첫째, 통일부가 따로 공표하는 이산가족 통계와 기록물을 고향 이름으로 묶어 어느 고향의 기록이 비어 있는지 순위를 매긴다. 둘째, 모든 수치에 언제까지 확인된 값인지를 붙이고 「모른다(▲)」와 「없다(■)」를 갈라 적는다(상세 라-12).')]),

    P([run('제안 배경 — 세 개의 공백', { b: true })], { before: 45 }),
    P('시간의 공백. 고향을 기억하는 분들이 얼마나 빠르게 줄고 몇 년 뒤 몇 분이 남는지 계산해 보여 주는 화면을 찾지 못했다. 2026-05-31 기준 생존 신청자는 33,272명이고, 누계 134,546명 중 101,274명이 이미 세상을 떠났다.', { num: 1 }),
    P(`기록의 공백. 사람이 가장 많이 그리는 고향에 기록이 가장 적게 남았는데, 이 격차를 공표 자료로 계산해 둔 자료를 찾지 못했다. 원적이 확인되는 생존자는 18,294명이고(2025-08-31 공표, 전체 35,311명의 51.8%) 그중 황해도(구)가 6,851명으로 가장 많다(37.4%). 그런데 그 고향에 남은 공식 기록은 1인당 ${F.botDensity}건으로 가장 적고 가장 많은 ${F.topName}은 ${F.topDensity}건이다 — ${F.gapX}배다(기록 계는 여러 자료를 합친 값이라 단일 기준일이 없다 — ${F.aggregation}). 이 문서에서 「밀도」는 확인 시점이 이렇게 다른 두 계열의 나눗셈이며, 뒤에 나오는 ${F.gapX}배는 전부 같은 조합이다.`, { num: 1 }),
    P('통로의 공백. 이어 적을 사람은 자녀·손자녀만이 아닌데 자기 이름으로 갈 창구가 한자리에 정리되어 있지 않다. 이산가족법 제2조제1호는 「8촌 이내의 친척·인척 및 배우자」까지를 이산가족으로 정하므로 조카·사촌도 같은 자격의 당사자다. 신청 서식에 세대 칸이 없어 후손 신청자를 셀 수 없고, 경로 12종 중 후손이 주체가 되는지 판단할 근거가 없는 것이 2종이며, 제도가 아직 다루지 않은 지점 11종도 정리했다.', { num: 1 }),

    P([run('발견 — ', { b: true }), run('두 가지를 확인했다. 첫째, 기록은 사람이 아니라 사건을 따라 쌓였다 — 기록이 많이 남은 곳은 사람이 많은 고향이 아니라 남북 사건의 무대가 된 고향이었다. 둘째, 그 공백을 메우는 일을 이산가족 자신이 1순위로 요청해 두었다 — 제4차 실태조사에서 가장 높은 요청 사업이 「기록물 수집 보존」 59.9%였다. 할 일은 정해져 있고 어디부터 할지 정하는 계산이 없었을 뿐이다.')], { before: 45 }),

    P([run('기획 목적 — ', { b: true }), run('세 공백을 계산·순위·경로로 바꾼다. 남은 시간을 숫자로 내고(기록 골든타임), 어느 고향부터 남겨야 하는지 순위를 매기고(기록 계승 우선순위), 후손이 오늘 할 수 있는 행동으로 잇는다(세대 계승 다리). 기존 시스템을 대체하자는 것이 아니라 그 위에 분석과 계승 두 층을 더하자는 제안이다.')], { before: 45 }),

    P([run('필요성 — ', { b: true }), run('통일부 자신의 조사가 근거다. 제4차 남북 이산가족 실태조사(전체 36,017명 · 심층 5,103명, 2025-01-24 공표)에서 1순위 요청 사업은 「사진·물건 등 기록물 수집 보존」 59.9%, 위로사업 2위는 「고향 관련 사진·영상의 수집·제작, 전시」 44.5%였다.')], { before: 45 }),
    P('같은 조사에서 기록을 이어받을 의향은 후손 세대 55.7%로 1세대 37.7%보다 18.0%p 높고, 「관심을 가져야 한다」 44.7%와 「실제 관심이 있다」 31.6% 사이가 13.1%p 비어 있다. 부족한 것은 마음이 아니라 수단이다(다만 후손 문항은 1세대 4,042명이 자기 자손을 평가한 값이다).', { before: 45 }),
    P([run('활용 분야·빈도·중요성 — ', { b: true }), run('분야는 이산가족 정책(예산과 우선순위 판단)·통일교육·디지털박물관 이용 제고, 갱신은 등록현황 월 1회 · 연표·보도자료 주 1회 · 기상 실시간이다. 대상은 3만 명에 그치지 않는다 — 심층 응답 1세대의 79.2%(4,042/5,103, 2024년 조사)가 자손을 두었다. 누계 신청자 134,546명(2026-05-31, 사망 101,274명 포함)에 같은 비율을 적용하면 자손을 둔 1세대가 106,560명, 자녀를 1인당 2~4명으로 놓으면 2세대만 21만~43만 명이다. 공표 통계가 아니라 가정값이라 화면에서도 구분해 적는다.')], { before: 45 }),
  ]
}

/* ── 3-2 상세내용 : 데이터 활용 · 창의성과 효과성 · 구현 기술과 서비스 방법 ──
   서식이 요구하는 세 항목을 그대로 두되, 그 안에서 다섯 묶음으로 재배열한다.
     가. 서비스(무엇을 만드는가) → 나. 창의성(계산) → 다. 데이터 활용과 구현 기술
     → 라. 데이터 신뢰성 확보 → 마. 효과성
   묶음 제목에 심사지표 용어를 그대로 넣어 심사표와 1:1로 맞물리게 했다.
   첫 항목이 「한 줄 정의와 이용 흐름」인 이유: 첫 15줄만 읽어도 무엇을 만드는지가 종결되어야
   뒤의 계산·데이터·신뢰성이 전부 "그게 왜 되는가"의 근거로 읽힌다. */
function detail() {
  const t1 = [1500, 2700, CW - 300 - 1500 - 2700]
  const t2a = Math.round((CW - 300) * 0.45)
  const t2b = (CW - 300) - t2a
  const IW = CW - 300                       // 상세내용 칸 안쪽 표 폭
  const flowT = [2300, IW - 2300]
  const funcT = [2750, IW - 2750 - 1250, 1250]
  const densT = [2418, 1900, 1900, 1900, IW - 2418 - 5700]
  const projT = [1800, 3400, IW - 1800 - 3400]
  /* 저자가 만든 표 머리는 본문과 같은 14pt 로 둔다. 12pt 짜리 라벨은 원본 양식이 주는 것
     (접수번호·참가자/팀 명·개요·상세내용 등)만 남긴다 — 안내문의 「글자 폰트 크기 14」는
     응모자가 쓰는 글에 걸리는 규칙이고, 우리가 새로 만든 표 머리는 그 응모자의 글이다. */
  const hd = (t, w) => cell([t], w, { fill: GRAY, b: true, align: AlignmentType.CENTER })
  /* 묶음 머리 — 회색 라벨(서식 소유)과 구분되도록 본문 굵은 줄로만 쓴다. 표 구조는 건드리지 않는다. */
  const GRP = (t) => new Paragraph({
    spacing: { line: LINE, before: 50, after: 12 },
    children: [run(t, { b: true })],
  })
  /* 캡션 — 30자를 넘는 캡션은 본문으로 잡히므로 반드시 14pt·160%를 유지한다(규격 검사 대상) */
  const CAP = (t) => new Paragraph({
    spacing: { line: LINE, before: 15, after: 0 },
    alignment: AlignmentType.JUSTIFIED,
    children: [run(`※ ${t}`)],
  })

  return [
    GRP('가. 서비스 — 무엇을 만드는가'),

    P([run('1) 한 줄 정의와 이용 흐름 — ', { b: true }), run('개요에 적은 대로 고향 이름 하나에서 시작해 기증으로 끝나는 웹 서비스다. 이용 흐름은 일곱 걸음이고, 마지막 걸음의 결과가 다시 두 번째 걸음으로 돌아온다.')]),
    table(flowT, [
      row([hd('단계', flowT[0]), hd('화면에서 벌어지는 일', flowT[1])]),
      row([cell(['① 고향 선택'], flowT[0]), cell(['광복 당시 구행정구역 7종 중 하나를 누른다.'], flowT[1])]),
      row([cell(['② 고향의 오늘'], flowT[0]), cell(['남은 분·날씨·연표·보도자료·동향·사료가 한 패널에 모이고 수치마다 기준일이 붙는다.'], flowT[1])]),
      row([cell(['③ 공백 확인'], flowT[0]), cell([`「남은 분은 가장 많고 기록은 가장 적습니다」 — ${F.botName} 1인당 ${F.botDensity}건, 최상위와 ${F.gapX}배.`], flowT[1])]),
      row([cell(['④ 기록 열람'], flowT[0]), cell(['그 고향의 사료를 보고 원문은 디지털박물관으로 연결한다.'], flowT[1])]),
      row([cell(['⑤ 기억 기록'], flowT[0]), cell(['기억 카드에 적어 한 장으로 만든다. 서버로 보내지 않는다.'], flowT[1])]),
      row([cell(['⑥ 기증 연결'], flowT[0]), cell(['생애기록물 수집 동의·유전자검사 등 후손이 주체가 되는 경로 10종으로 보낸다.'], flowT[1])]),
      row([cell(['⑦ 데이터 축적'], flowT[0]), cell(['기증분이 사료에 더해지면 ②의 건수와 ③의 공백이 바뀐다.'], flowT[1])]),
      row([cell([`돌아오는 고리 — ⑦로 들어온 기록이 ②의 건수를 늘리고 ③의 공백을 줄인다. ${F.gapX}배 격차를 좁히는 길은 이 고리 하나뿐이다.`], IW, { span: 2, b: true })]),
    ]),
    CAP('③의 분모는 생존자 2025-08-31 공표값이고, 분자인 기록 계는 합산값이라 단일 기준일이 없다(확인 하한 2025-05-31). 확인 시점이 다른 값을 한 문장에 묶지 않는 규약은 도해에도 적용한다.'),

    P([run('2) 화면과 기능 10종 — ', { b: true }), run(`열 가지 기능이 위 일곱 걸음 위에 놓이며, 자리는 홈 화면(한 화면에 한 가지만 보이도록 나눈 13개 장면)과 분석 요약 화면 두 곳이다. 쓰는 자료는 시점의 성격이 다르다 — 등록현황 기준일 2025-08-31 · 재북 출신지 2020-03-31 · 기록 ${F.aggregation} · 사료 수집일 2026-08-19 · 이산가족정보통합시스템 수집일 2026-08-21이며 수치마다 화면에 붙는다. 오른쪽 칸은 상술 항목이다.`)], { before: 24 }),
    P('고향별 공백 분석(기록 밀도를 순위로, 나-4) · 기록 계승 우선순위(세 지표 합산, 나-5) · 기록 골든타임(98개월 실측+추계, 나-6) · 고향 좌표계 지도(두 좌표계 겹침, 나-7) · 사료 탐색(고향이 붙은 1,445건, 나-7) · 세대 계승 경로(12종 자격 판정, 나-8) · 참여 화면(월드컵·문답, 3-1) · 고향 안내인(규칙이 답하고 AI는 해석, 다-10) · 기억 카드(다-11) · 기증 연결(나-8) · 기준일 표시(● ▲ ■, 라-12).'),
    /* 캡처는 원본 화면(1280폭, 2배 밀도)에서 판정에 필요한 구역만 잘라 확대했다.
       전체 화면을 줄여 넣으면 인쇄에서 글자가 뭉개진다 — 잘라서 크게 싣는 편이 증거가 된다. */
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { line: 240, before: 80 },
      children: [
        /* C 는 gohyang-20260820/02-고향패널-황해도.png(1280폭 2배 밀도 원본)에서 오른쪽 열의
           머리(6,321명 + ▲ 배지 + 공표 원문 줄)와 아래쪽 채널 차이 안내 상자를 잘라 위아래로 이어 붙인 것이다.
           문서가 라-12에서 말로 설명하는 「같은 통계의 두 공표 채널 9개월 차이」가 화면 안에 그대로 찍혀 있다. */
        shot('기획서용-20260820/C-고향패널-채널차이.png', 215, 585 / 1050),
        run('  '),
        shot('기획서용-20260820/B-한걸음씩.png', 262, 440 / 1370),
      ],
    }),
    CAP('① 고향 패널 — 같은 통계의 두 공표 채널(2026-05-31 6,321명 · 2025-08-31 6,851명)이 왜 다른지 화면이 스스로 설명한다  ② 한걸음씩 보기'),

    P([run('3) 사용 시나리오 — ', { b: true }), run(`아래 두 인물은 설명을 위한 가상 인물이고 인용한 수치만 실측값이다. 후손 — 손주가 할아버지의 고향 「황해도」를 누른다. 남은 분 6,851명으로 원적 1위인데 기록은 1인당 ${F.botDensity}건으로 최하위라는 안내를 읽고, 그 고향의 사료와 「나의 살던 고향은」 사진을 넘기다 집에 있는 사진을 떠올려 기억 카드에 적고 생애기록물 수집 동의 창구로 간다. 「기록이 많은 고향」이 아니라 「내 고향이 비어 있다」는 사실이 이 사람을 움직였다. 정책 담당자 — 「기록 계승 우선순위」 1순위 ${F.prio1}(순위합 ${F.prio1Sum})와 「1만 명 하회 2038~2041년」을 함께 보고 다음 연도 사료 수집 대상 고향을 정한다.`)], { before: 24 }),

    P([run('3-1) 가벼운 입구 — 참여 화면. ', { b: true }), run('정작 이어 적을 사람은 이산 3·4세대인데 통계와 사료에서 시작하는 동선은 진입 문턱이 높아, 취향으로 고향을 먼저 만나는 입구를 별도 화면으로 두었다 — 오락이 목적이 아니라 유입 경로다. 고향의 음식·풍경·북녘의 말 월드컵과 「우리 집 기억」 문답은 결과 화면에서 그 고향의 기록 계승 우선순위(전국 N위/7)·생존 신청자·1인당 공식 기록을 통일부 공공데이터로 보여 주고, 기억 카드 작성과 그 고향의 기록 열람으로 바로 잇는다. 음식·풍경의 지역 귀속은 향토음식 문헌 등 문화적 통설이라 통일부 공표 자료가 아님을 화면과 공유 그림 양쪽에 구분해 적었고, 북녘의 말 월드컵은 통일부 공공데이터 「남북한 언어비교」 21,985쌍을 그대로 쓴다. 참여 집계는 게임 종류·고른 항목·고향 이름만 익명으로 저장하며(나이·기기·위치 없음), 게임별 실시간 순위와 전체 항목 상세보기에 참여 인원수를 항상 함께 적고 표본이 작을 때는 비율보다 인원수를 앞세우며, 총 판수·불러온 시각을 붙인다. 음식·말 카드의 참고 사진은 위키미디어 공용에서 이용 조건을 확인한 것만 쓰고 화면에 저작자를 표시한다. 참여가 없으면 빈 순위표 대신 「아직 참여 기록이 없습니다」라고 그대로 적고, 집계 서버가 응답하지 않아도 게임은 정상 동작한다.')], { before: 24 }),

    GRP('나. 창의성 — 다른 곳이 하지 않는 계산'),

    P([run('먼저 겹침부터 끊는다 — ', { b: true }), run('2025년 수상작 「AI 위기가구 예측」·「나와 닮은 선배가 걸어온 길」·「동행 MAP」은 탈북민 정착을, 「북킷리스트」는 도서를 다뤘다. 이 아이디어는 모집단(이산가족과 8촌 이내 친족)·기준(고향)·목적(기록 공백의 측정과 계승)이 다르고, 개인을 예측하지도 추천하지도 않는다.')]),

    P([run('4) 고향별 기록 공백 분석 — ', { b: true }), run('이 아이디어의 중심이다. 화면의 지역 안내가 쓰는 2026-05-31 게시판 공표값과 인원이 다른 것은 공표 채널이 달라서이며(미수복강원 516명 대 491명), 확인 시점이 다른 값을 한 문장에 섞지 않는다. 밀도 = 그 고향에 관한 공식 기록 건수 ÷ 그 고향 출신 생존자 수. 나눗셈 한 번이고 추정·보간·가중이 없다.')], { before: 24 }),
    table(densT, [
      row([hd('고향', densT[0]), hd('생존자(명)', densT[1]), hd('기록 계(건)', densT[2]), hd('밀도(건/인)', densT[3]), hd('원적 비중(%)', densT[4])]),
      /* ★ 행은 analysis.json 의 record-density-gap 카드 table 을 그대로 옮긴 것이다(DENS_ROWS).
           손으로 적으면 분석이 갱신될 때 여기만 옛 값으로 남는다 — 실제로 그랬다(15.5배 세대). */
      ...DENS_ROWS.map((r) => row(r.map((v, i) => cell([v], densT[i], { align: i === 0 ? AlignmentType.JUSTIFIED : AlignmentType.CENTER })))),
    ]),
    CAP(`생존자는 2025-08-31 공표값이다. 기록 계(연표·보도자료·동향·개황·사료·고향사진·영상편지의 합)는 합산값이라 단일 기준일이 없다 — 확인 하한 2025-05-31(개황), ${F.aggregation}, 사료 수집 2026-08-19, 이산가족정보통합시스템 수집 2026-08-21. 강원 사료 397건 중 280건은 근거 지명이 상봉 장소(금강산·장전항·갈마)뿐이라 미수복강원 행에서만 뺐고, 사료의 「함경도(구)」 태그 59건은 남·북 판정이 불가능해 두 행에 모두 걸었다.`),
    P(`사람이 가장 많은 곳에 기록이 가장 적다. 최상위와 최하위가 ${F.gapX}배, 동향과 개황을 뺀 보수적 집계(연표·보도자료·사료·신규 수집분만)로도 ${F.gapNarrowX}배이며 ${F.narrowOrder}. 원적 1위 황해도(구)는 원적 확인 생존자 18,294명의 37.4%인데, 7개 고향 중 하나로 지역이 판정된 남북관계연표 1,161건 가운데 16건(1.4%) · 같은 기준 보도자료 587건 가운데 14건(2.4%)뿐이고, 반대로 미수복경기(개성)는 생존자 5.9%인데 연표 33.1% · 보도자료 43.3%다. 기록은 사람이 아니라 사건을 따라 쌓였다 — 평양은 수도, 개성은 공단, 금강산은 상봉 장소였기 때문이다.`, { before: 45 }),

    P([run('5) 기록 계승 우선순위 — ', { b: true }), run(`줄어드는 속도·기록 공백·식별 가능한 기록의 공백, 세 지표의 순위를 합산해 어디부터 이어 적어야 하는지를 산출한다. 1순위 ${F.prio1} 순위합 ${F.prio1Sum}(생존 -${F.prio1Drop}% · 기록 ${F.prio1Density}건/인 · 식별기록 ${F.prio1Ident}건/인), 2순위 ${F.prio2} ${F.prio2Sum}, 가장 큰 곳은 ${F.prioLast} ${F.prioLastSum}이다. 한 지표에 매달린 순위인지 자체 검사해 공개한다 — 지표를 하나씩 빼면 셋 중 둘에서 1위가 유지되고 감소 지표를 빼면 황해도(구)가 1위다. 식별 축에는 이산가족정보통합시스템 신규 수집분이 들어가는데, 그것을 빼고 다시 돌려도 1순위는 바뀌지 않는다. 표본이 7개뿐이라 점수가 아니라 정렬을 돕는 값이라고 화면에 적는다.`)], { before: 24 }),

    P([run('6) 기록 골든타임 — ', { b: true }), run('등록현황 98개월(2017-07-31~2025-08-31) 실측치로 모델을 교정하고, 2026-05-31 공표 원표의 생존자 구성(총 33,272명 = 남 20,269 · 여 13,003, 공표 원표와 일치)을 출발점으로 해마다 사망확률을 적용해 남는 인원을 세는 추계를 돌린다. 모집단·연령분포·성별은 전부 통일부 공표값이고 완전생명표는 곱해지는 계수일 뿐이다. 단일 값으로 단정하지 않고 두 시나리오의 범위로 낸다.')], { before: 24 }),
    table(projT, [
      row([hd('시점', projT[0]), hd('남는 인원(추계)', projT[1]), hd('임계선에 닿는 해', projT[2])]),
      row([cell(['2030년'], projT[0], { align: AlignmentType.CENTER }), cell(['22,172~24,544명'], projT[1], { align: AlignmentType.CENTER }), cell(['2만 명 하회 2031~2033년'], projT[2], { align: AlignmentType.CENTER })]),
      row([cell(['2040년'], projT[0], { align: AlignmentType.CENTER }), cell(['8,316~10,167명'], projT[1], { align: AlignmentType.CENTER }), cell(['1만 명 하회 2038~2041년'], projT[2], { align: AlignmentType.CENTER })]),
    ]),
    P('오차도 감추지 않는다 — 1차연도 모델 사망률 9.34%는 실측 7.48%보다 1.86%p 높고, 그만큼을 교정계수 0.73으로 되돌린다. 신규 유입은 최근 24개월 월 중앙값 +10.0명(연 0.34%)이라 결과를 바꾸지 않는다.', { before: 45 }),

    P([run('7) 고향 좌표계 지도와 사료 — ', { b: true }), run('이산가족 원적(광복 당시 7종)과 탈북민 재북 출신지(현행 13종)를 한 지도에 두 좌표계로 겹치고, 지역을 누르면 종료 공지·날씨·생존자·기록·사료가 한 패널에 모인다. 사료 4,342건 중 1,445건(33.3%)에 고향을 붙였고, 이미지는 저장하지 않고 원문으로 연결한다(사유는 다-11). 한계도 적는다 — 원적 「기타」 16,331명(49.1%, 2026-05-31)은 분모로 쓸 수 없다. 생산연도가 판독된 사료 3,098건 중 2,832건(91.4%)이 2000~2018년, 1946~1953년은 30건(1.0%), 2019년 이후는 0건이다 — 기록은 헤어질 때가 아니라 만날 때 만들어졌다(다만 생산연도가 없는 1,244건이 이 분포에서 빠졌고, 2019년 이후 0건은 수집이 그때 멈춘 탓일 수 있어 단정하지 않는다).')], { before: 24 }),

    P([run('8) 세대 계승 다리 — 신청 경로 12종 — ', { b: true }), run('법령과 안내문 원문을 확인해 정리했다. 후손이 자기 이름으로 주체가 될 수 있는 것 10종, 근거 문장이 없어 「불명」으로 남긴 것 2종, 1세대 전용 0종이며, 판정마다 원문을 인용하고 인용이 없으면 판정하지 않는다. 창구 링크 29개를 점검해 정상 28개·연결 불가 1개로 표시하고(2026-08-19), 제도가 아직 다루지 않은 11종도 같은 화면에 공개한다. 이산가족찾기 안내문의 「1세대 본인 또는 가족으로 1인 이상 신청 가능」과 「가급적 이산 1세대를 신청인으로」는 한쪽으로 정리하지 않고 나란히 인용해 후손이 스스로 판단하게 한다.')], { before: 24 }),

    GRP('다. 데이터 활용과 구현 기술'),

    P([run('9) 자료를 고향 좌표로 모으는 처리 흐름 — ', { b: true }), run(`통일부 공표 HWP·CSV·공개 API를 배치로 수집해 레코드 68,487건·수치 37,912건·엔티티 721건의 통합 인덱스로 만든다(빌드 2026-08-12). 이산가족 통계·박물관 사료 4,342건·실태조사 결과는 화면이 직접 읽는 정적 데이터셋으로 미리 만들어 둔다. 지역별 기록 집계에는 연표 8,969건·보도자료 2,709건·동향 제목 42,813건·개황 93건을 전수 집계했다(${F.aggregation} · 동향 42,813건은 원본 파일 제목의 전수값이라 인덱스 적재분 42,788건과 세는 대상이 다르다).`)]),
    P([run('10) 화면 구현 · 접근성 · 서비스 방법 — ', { b: true }), run(`화면은 React·TypeScript 정적 웹이고 갱신은 월 1회 배치다. 수집·검증·이 문서 생성까지 전부 재실행 가능한 스크립트다. 생존 신청자 평균 나이가 83.02세(2025-08-31 확인값)라 같은 데이터를 「한눈에」와 「한걸음씩」 두 밀도로 낸다. 고향 안내인은 규칙이 먼저 답하고 AI는 해석만 담당하며 미리 정한 출력 형식을 벗어난 것은 폐기한다(검사 ${GUIDE.passed}건 통과). 팩트체커는 통합 인덱스 전량(31종 68,487건, 빌드 2026-08-12)에 질문을 대조하는 별도 화면이고, 앞의 「나」 26종 13,915건은 그중 팩트체커만 쓰는 몫이다. 지도·추계·순위 계산에는 관여하지 않는다. 접근성도 실측으로 고쳤다 — 48px 미만 터치 대상 79개 → 0개, 본문 대비 2.63:1 → 4.54:1로 올렸다. 홈 화면은 한 화면에 한 가지만 보이도록 13개 장면으로 나누며, 정보를 삭제하지 않고 배치로 밀도를 조절한다(1280폭에서 홈 전체 높이 13,430px, 2026-08-20 실측).`)], { before: 24 }),

    P([run('11) 개인정보 · 저작권 · 자료 이용 조건 — ', { b: true }), run(`쓰는 것은 전부 공표 집계와 공개 사료이고, 개인을 식별하거나 예측하는 계산은 설계에 없다. 기억 카드는 후손이 자기 집 기록을 한 장으로 적어 그림·인쇄로 가져가는 기능이며, 적은 내용은 서버로 보내지 않고 그 기기의 브라우저에만 임시로 남는다 — 화면에 그 사실과 「이 기기에서 지우기」 단추를 함께 둔다. 사료 이미지는 저장하지 않는다 — 기증자 저작물인데 개방형 라이선스 표기를 확인하지 못했기 때문이며, 주소만 참조하고 자세히 보기는 박물관으로 보낸다. 타 기관 자료는 그 기관이 요구하는 표기를 그대로 적는다 — 통일의식조사는 「서울대학교 통일평화연구원에서 실시한 통일의식조사 자료임.」을 싣고, 지도 지오메트리는 Natural Earth(Public Domain)임을 밝히며, 이산가족 공표 통계에는 국가통계 승인번호 제103003호를 병기한다.`)], { before: 24 }),

    GRP('라. 데이터 신뢰성 확보 — 앞의 계산이 성립하는 전제'),

    P([run('12) 「모른다」와 「없다」를 구분한다 — as-of 3상태 모델 — ', { b: true }), run('앞의 모든 계산이 성립하는 근거다. 모든 수치에 확인 시점을 세 상태로 붙이며, 색·도형·한국어 라벨의 3중 부호화라 색각 이상과 흑백 인쇄에서도 구분된다.')]),
    table(t1, [
      row([hd('상태', t1[0]), hd('의미', t1[1]), hd('화면 문구(예)', t1[2])]),
      row([cell(['● 최신'], t1[0], { align: AlignmentType.CENTER }), cell(['지금 값이라고 말할 수 있음'], t1[1]), cell(['「지금 이 시각 값입니다」(실시간 기상)'], t1[2])]),
      row([cell(['▲ 이후 미확인'], t1[0], { align: AlignmentType.CENTER }), cell(['자료는 있으나 그 뒤는 모름'], t1[1]), cell(['「2020년 3월 기준. 이후 상황은 확인되지 않습니다」'], t1[2])]),
      row([cell(['■ 데이터 종료'], t1[0], { align: AlignmentType.CENTER }), cell(['활동이 끝나 없다고 단정 가능'], t1[1]), cell(['「이후 데이터는 존재하지 않습니다(개성공단 전면중단)」'], t1[2])]),
    ]),
    P('■에는 이유를 반드시 붙이고, 주제 단위 종료 공지(개성공단·금강산)가 데이터셋 단위 판정보다 앞선다. 남북회담은 2018-12-31 이후 자료가 없으나 「회담이 없었다」인지 「갱신되지 않았다」인지 가릴 수 없어 ▲에 둔다 — 「모른다」를 「없다」로 읽지 않는 것이 이 모델의 핵심이다. 같은 통계도 채널이 다르면 기준일이 다르다 — 포털 파일데이터 2025-08-31 35,311명 대 게시판 HWP 2026-05-31 33,272명으로 9개월 차이가 난다. 확인 시점이 다른 값을 한 문장에 묶는 것도 막는다 — 평균 나이 83.02세는 2025-08-31 확인값이라 2026-05-31 신청현황과 같은 줄에 쓰지 못하고, 합산값에 기준일 하나를 붙이지도 못한다. 어긴 문장은 자체 검증 절차에서 폐기된다.', { before: 45 }),

    P([run('13) 성립하지 않은 분석도 지우지 않는다 — ', { b: true }), run('21개 분석을 시도해 11개 성립 · 4개 약함 · 6개 불가로 판정하고 불가 6종의 사유를 화면에 남긴다. 동향 42,788건 중 발생일이 붙는 것은 33.8%뿐이라 연도 곡선을 그리지 않는다. 원적과 탈북민 재북 출신지의 차이도 함경북도(구) 5.9% 대 59.4%까지만 말하고, 지역이 7개뿐이라 판정 불가에 둔다(순위상관 0.357, 유의확률 0.444). 지운 분석은 반박할 수 없지만 남긴 분석은 반박할 수 있다.')], { before: 24 }),

    GRP('마. 효과성 — 도입하면 무엇이 달라지는가'),

    P([run('14) 통일부가 운영할 때 달라지는 것 — ', { b: true }), run('본 시제품은 공개 자료만 외부에서 수집해 만든 것이라 제약이 있다. 자료와 시스템을 가진 쪽이 같은 구조를 구현하면 아래 제약은 사라진다 — 지적이 아니라 도입의 이점이다.')]),
    table([t2a, t2b], [
      row([hd('외부 구현의 제약', t2a), hd('통일부가 도입할 때', t2b)]),
      row([cell(['사료 이미지를 외부에서 표시할 수 없다'], t2a), cell(['같은 도메인이라 제약 없이 보인다'], t2b)]),
      row([cell(['채널에 따라 같은 통계의 기준일이 9개월까지 다르다'], t2a), cell(['원본 통계가 한 곳에 있어 시차가 없다'], t2b)]),
      row([cell(['사료 고향 태깅이 본문 지명에 의존해 33.3%에 그친다'], t2a), cell(['기증 접수 서식에 고향란 한 칸이면 신규분은 100%'], t2b)]),
      row([cell(['세대 구분 정보가 없어 후손 이용 규모를 셀 수 없다'], t2a), cell(['신청 서식 체크박스 한 칸이면 후손 참여 통계가 생긴다'], t2b)]),
    ]),

    P([run('15) 도입 로드맵과 확산 — ', { b: true }), run('현행 운영을 평가하는 것이 아니라 도입 순서를 제안하는 것이며, 확산은 별도 예산 없이 기존 접점을 쓴다.')], { before: 24 }),
    P('1단계 시범(1년) — 고향별 화면을 공개하고 이산가족 정기 안내 발송에 링크를 동봉한다. 통일교육원·학교 실습 자료로 쓰고 이북5도위원회·지자체 행사에서 고향별 사료를 상영하며, 청년층에는 참여 화면(월드컵·문답, 3-1)이 가벼운 문 역할을 한다. 끝나면 사료 고향 태깅률 33.3% → 60%, 계승 1·2순위 고향 사료 집중 수집, 기준일 표기율 100%가 확인된다. 2단계 접수 서식 개선 — 기증 서식에 고향란 한 칸, 신청 서식에 세대 구분 한 칸. 그 두 칸이 전부이며, 끝나면 신규 기증분 고향 태깅 100%와 후손 참여 규모의 최초 집계가 가능해진다. 3단계 내부 운영 전환 — 같은 도메인에서 사료 이미지를 표시하고 원본 통계를 한 곳으로 모아 채널 간 9개월 차이를 없앤다. 별도 예산·인력 소요는 숫자로 적지 않았다 — 근거로 댈 산출물이 없기 때문이다.', { num: 1 }),

    P([run('16) 기대효과 — ', { b: true }), run(`본 사람이 이어 적는 사람이 된다. 알린다(8촌 이내 친족도 당사자이고 경로가 10종) → 모은다(통계·연표·보도자료·사료·날씨를 고향 이름 하나로) → 불러낸다(남의 집 사진이 내 집 사진을 떠올리게 한다) → 받는다(그 자리에서 기증·유전자검사·영상편지로). 들어온 기록은 다시 그 고향 화면의 재료가 되어 ${F.gapX}배 밀도 격차를 좁힌다. 정책에는 「1만 명 하회 2038~2041년」과 「계승 1순위 ${F.prio1}」라는, 예산과 순서를 논의할 숫자를 놓는다. 이산가족에게는 1순위 요청 사업(59.9%)에 답하고 후손에게는 없던 경로를 만든다. 정량 목표는 15)의 「끝나면 확인되는 것」이 전부다. 이용자·유입·기증 건수 목표는 넣지 않았다 — 근거로 댈 실측이 없어 세우는 순간 지어낸 숫자가 된다.`)], { before: 24 }),
    P('당국 차원 교류는 2018년을 끝으로 89개월 연속 0건이지만 보도자료의 이산가족 언급은 줄지 않았다(연평균 14건 → 14.7건, 확인 하한 2025-10-24). 성사는 남측만으로 결정되지 않으므로 이 서비스는 실적이 아니라 기록으로 할 수 있는 일에 집중하며, 같은 구조는 국군포로·납북자로 넓힐 수 있다.', { before: 45 }),

    P([run('17) 검증 — ', { b: true }), run(`측정한 것만 말한다. 회귀 평가 48/48(안전 규칙 위반 0 · 근거 미제시 0), 실사용 난문 108/108(출처 누락 0 · 시점 누락 0), 화면 검증 96/96(48px 미만 0 · 기증자 성함 193명 전수 대조 포함), 참여 화면 검증 42/42, 고향 안내인 ${GUIDE.passed}/${GUIDE.total}을 통과한다(화면·참여 검사 2026-08-26 실행 · 안내인 검사 ${GUIDE.ranAt} 실행). 데이터 정합도 검사한다 — 생존자 5개 분류의 합이 전부 33,272이고 33,272 + 101,274 = 134,546이 맞으며, 교류현황 38개 연도행 15개 열이 공표 합계와 일치한다. 이 문서의 규격도 검사 스크립트로 확인한다.`)], { before: 24 }),
  ]
}

/* ── 3-3 기타 참고 사항 등 : 생성형 AI 활용 내용 · 참고 문헌 ── */
function etc() {
  return [
    P([run('생성형 AI 활용 내용 — ', { b: true }), run(`Gemini를 두 곳에만 쓴다. 첫째는 자연어 질문의 해석으로, 규칙이 먼저 처리하고 못 잡은 것만 넘기며 미리 정한 출력 형식 밖이면 폐기해 규칙 결과로 되돌린다. 둘째는 분석 요약 화면의 문장 정리로, 빌드 때 한 번 ${SUMMARY.verified.lines}문장을 생성하고 원본 분석 파일의 지문값을 함께 기록해 어느 판을 요약했는지 고정했다. 두 곳 모두 AI가 수치와 판정을 만들지 않는다. 요약에 쓰인 수치 ${SUMMARY.verified.figures}개는 전량 원본 분석 카드로 자동 역추적했고, 검사 ${SUMMARY.verified.checks}종을 통과한 문장만 화면에 올린다. 네트워크가 끊겨도 규칙만으로 동작한다.`)]),
    P('본 기획서와 시제품 코드의 작성에는 Anthropic Claude를 사용했다. 이 문서의 모든 수치는 저장소의 산출물 파일에서 나왔고 수치마다 출처 파일과 기준일을 댈 수 있다.', { before: 45 }),

    P([run('참고 자료 — ', { b: true }), run('통일부 「2024년 제4차 남북 이산가족 실태조사 결과」(2025-01-24) · 이산가족정보통합시스템 게시판 공표 자료(국가통계 승인번호 제103003호) · 공공데이터포털 통일부 개방 데이터 · 남북이산가족 디지털박물관 · 「남북 이산가족 생사확인 및 교류 촉진에 관한 법률」 제2조 · 통계청 완전생명표(1세별) 2024년 · 통일의식조사(서울대)')], { before: 45 }),

    P([run('중복 검토 · 시제품 — ', { b: true }), run('2025년 수상작과 겹치지 않는 이유는 「나. 창의성」 첫머리에 적었다. 시제품은 완성품이 아니라 실현 가능성을 보이려고 만든 동작 화면이다(factdoc.pages.dev).')], { before: 45 }),
  ]
}

/* ══════════════════════════ 서식1 — 참가 신청서 ══════════════════════════ */
function form1() {
  const L = 1700
  const blank = (w, o = {}) => cell([''], w, o)
  const c4 = [1400, 2800, 1400, CW - 5600]

  const children = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: LINE, after: 40 }, children: [run('[ 2026년 통일부 공공데이터 활용 공모전 ]', { sz: 24 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: LINE, after: 140 }, children: [run('참가 신청서', { b: true, sz: 40 })] }),

    table([L, CW - L], [
      row([navyLabel('접수번호', L), cell(['(접수기관 발급)'], CW - L)]),
      row([navyLabel('공모 부문', L), cell(['■ 아이디어 기획      □ 공공데이터 활용 사례'], CW - L)]),
      row([navyLabel('제안 명', L), cell([TITLE], CW - L)]),
      row([navyLabel('참가 구분', L), cell(['□ 개인      ■ 팀 (3인)'], CW - L)]),
    ]),
    GAP(50),

    P([run('신청자 정보 ', { b: true }), run('(팀 신청 시, 대표 신청자 1인 기재)', { sz: 24 })], { before: 60, after: 40 }),
    table(c4, [
      row([grayLabel('성  명', c4[0]), blank(c4[1]), grayLabel('생년월일', c4[2]), cell(['(주민등록번호 앞 6자리)'], c4[3], { sz: 22 })]),
      row([grayLabel('소  속', c4[0]), blank(c4[1]), grayLabel('직  위', c4[2]), blank(c4[3])]),
      row([grayLabel('연락처', c4[0]), blank(c4[1]), grayLabel('이메일', c4[2]), blank(c4[3])]),
      row([grayLabel('주  소', c4[0]), cell([''], CW - c4[0], { span: 3 })]),
    ]),
    GAP(50),

    P([run('공동 참가자 ', { b: true }), run('(팀 신청 시 대표 신청자 이외 팀원 정보 기재)', { sz: 24 })], { before: 60, after: 40 }),
    table([L, CW - L], [
      row([navyLabel('팀  명', L), cell([TEAM], CW - L)]),
    ]),
    (() => {
      const c6 = [1000, 1500, 2200, 1500, 1600, CW - 7800]
      return table(c6, [
        row(['구분', '성 명', '소 속', '생년월일', '연락처', '이메일'].map((t, i) => grayLabel(t, c6[i]))),
        row([cell(['팀원1'], c6[0], { align: AlignmentType.CENTER }), blank(c6[1]), blank(c6[2]), blank(c6[3]), blank(c6[4]), blank(c6[5])]),
        row([cell(['팀원2'], c6[0], { align: AlignmentType.CENTER }), blank(c6[1]), blank(c6[2]), blank(c6[3]), blank(c6[4]), blank(c6[5])]),
        row([cell(['팀원3'], c6[0], { align: AlignmentType.CENTER }), cell(['(3인 팀 — 해당 없음)'], c6[1], { sz: 22 }), blank(c6[2]), blank(c6[3]), blank(c6[4]), blank(c6[5])]),
        row([cell(['팀원4'], c6[0], { align: AlignmentType.CENTER }), cell(['(해당 없음)'], c6[1], { sz: 22 }), blank(c6[2]), blank(c6[3]), blank(c6[4]), blank(c6[5])]),
      ])
    })(),
    GAP(120),

    P([run('참가 서약서', { b: true })], { before: 80, after: 40 }),
    P('본인은 통일부에서 개최하는 「2026년 통일부 공공데이터 활용 공모전」에 참가하면서, 다음 각호의 규정을 지킬 것을 서약합니다.'),
    P('1. 대회의 제반 규정을 준수하겠습니다.'),
    P('2. 참가 신청서, 기획서 및 활용 수기에 기재한 내용이 사실임을 확인하며, 허위 사실 기재 등으로 인하여 문제가 발생하면 모든 책임은 본인에게 있음을 확인합니다.'),
    P('3. 응모작에 대한 저작권으로 인하여 발생하는 민·형사상 책임은 참가자에게 있습니다.'),
    P('4. 동일 아이템으로 타 경진대회에서 입상하였거나 타인의 저작권을 침해한 경우, 제출 내용이 허위로 밝혀지면 접수 및 입상이 취소되는 것에 동의합니다.'),
    P('5. 심사 결과에 대해 이의를 제기하지 않으며, 원활한 대회 진행에 적극적으로 협조하겠습니다.'),
    P('참가 신청서에 기재된 내용은 모두 사실이며, 동의 사항을 준수할 것을 서약합니다.', { before: 24 }),
    GAP(120),
    P('2026년    월    일', { align: AlignmentType.CENTER, before: 80 }),
    P('신청자(대표자)                    (인)', { align: AlignmentType.CENTER, before: 40 }),
    GAP(120),
    P([run('통일부장관 귀하', { b: true })], { align: AlignmentType.CENTER, before: 80 }),
  ]

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: SZ } } } },
    numbering,
    sections: [{
      properties: { page: { margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
      children,
    }],
  })
}

;(async () => {
  for (const [doc, name] of [[form3(), '서식3_아이디어기획서_고향잇기.docx'], [form1(), '서식1_참가신청서_고향잇기.docx']]) {
    const buf = await Packer.toBuffer(doc)
    const p = path.join(OUT_DIR, name)
    fs.writeFileSync(p, buf)
    console.log('→', p, (buf.length / 1024).toFixed(1) + 'KB')
  }
})()
