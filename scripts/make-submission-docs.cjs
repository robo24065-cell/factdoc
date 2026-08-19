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
const MARGIN = 794      // 1.8cm — 여백은 규격이 정하지 않았다. 표 여백을 감당하려고 본문 폭을 넓혀 둔다.
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
  margins: o.margins ?? { top: 50, bottom: 50, left: 120, right: 120 },
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

const TEAM = '고향잇기'
const TITLE = '「이어 적는 고향」 : 이산가족 기록 공백 분석과 세대 계승 지도'

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
  const dataTable = table(COLS, [
    row([navyLabel('활용 데이터', COL_L), blankRight(COL_M + COL_R, 2)]),
    row([
      grayLabel('공공데이터 출처', COL_L),
      cell([
        P('공공데이터포털(data.go.kr) · 통일부 북한정보포털 · 이산가족정보통합시스템(게시판 공표 HWP) · 남북이산가족 디지털박물관 · 통일부 보도자료'),
        P('연계(보조) — 통계청 KOSIS 완전생명표 · Open-Meteo 기상 · 서울대 통일평화연구원 통일의식조사'),
      ], COL_M + COL_R, { span: 2, va: VerticalAlign.TOP }),
    ]),
    row([
      grayLabel('공공데이터명', COL_L),
      cell([
        P([run('가. 화면 로직이 직접 계산에 쓰는 통일부 데이터', { b: true })]),
        P('이산가족찾기 등록현황 월별 98개월(2017-07-31~2025-08-31) · 신청현황·교류현황 공표표(2026-05-31) · 남북이산가족 연표 1,041건(1954-02-08~2021-12-16)', { num: 1 }),
        P('화면용 팩을 굽는 데 쓰는 통일부 데이터 5종 54,572건(통합 인덱스 적재 기준, 2026-08-12) — 북한 동향 42,788 · 남북관계연표 8,969 · 보도자료 2,709 · 북한 개황 93 · 북한이탈주민 재북 출신지역별 현황 13', { num: 1 }),
        P('남북이산가족 디지털박물관 사료 4,342건(14개 컬렉션) · 2024년 제4차 남북 이산가족 실태조사 결과(2025-01-24)', { num: 1 }),
        P([run('나. 팩트체커 코퍼스 26종 13,915건', { b: true }), run(' — 자연어 질문을 대조할 때만 쓰는 근거이며 지도·추계·순위 계산에는 들어가지 않는다.')]),
        P([run('다. 연계 데이터 3종', { b: true }), run(' — 통계청 완전생명표 2024년표(KOSIS DT_1B42, 404행) · Open-Meteo 실시간 기상 · 통일의식조사. 전부 보조이며 빼도 서비스는 성립한다. 화면에서 통일부 자료가 아님을 배지로 구분한다.')]),
        P([run('합계 — ', { b: true }), run('카탈로그에 선언한 통일부 데이터셋 35종(ready 34 · superseded 1) 중 레코드가 실린 것은 31종이고 4종은 선언만 되어 있다. 적재 레코드 68,487건 · 수치 37,912건 · 엔티티 721건(빌드 2026-08-12).')]),
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
      children: [headTable, GAP(80), dataTable, GAP(80), introTable,
        new Paragraph({ spacing: { line: 20, before: 0, after: 0 }, children: [run('', { sz: 2 })] })],
    }],
  })
}

/* ── 3-1 개요 : 제안 배경 · 기획 목적 · 필요성(활용 분야·빈도·중요성) ── */
function overview() {
  return [
    P([run('무엇인가 — ', { b: true }), run('통일부가 매달 공표하는 이산가족 통계와 기록물을 「고향」이라는 축으로 다시 엮어, 고향마다 기록이 얼마나 비어 있는지를 계산하고 그 공백을 다음 사람이 이어 적도록 연결한다. 보여주는 데서 멈추지 않고 분석해 순위를 내는 것이 다른 점이다. 이어 적는 사람은 자녀·손자녀만이 아니다 — 이산가족법 제2조제1호는 「8촌 이내의 친척·인척 및 배우자」까지를 이산가족으로 정하므로 조카·사촌도 같은 자격의 당사자다.')]),

    P([run('제안 배경 — 세 개의 공백', { b: true })], { before: 60 }),
    P('시간의 공백. 2026-05-31 기준 생존 신청자 33,272명, 누계 134,546명 중 101,274명이 이미 세상을 떠났다. 「이 속도면 몇 년 뒤 몇 명이 남는가」를 함께 계산해 보여 주는 화면은 찾지 못했다.', { num: 1 }),
    P('기록의 공백. 2025-08-31 기준 원적이 확인되는 생존자는 18,294명(전체 35,311명의 51.8%)이고 그중 황해도(구)가 6,851명(37.4%)으로 가장 많다. 그런데 기록은 반대로 쌓였다 — 고향별 기록 밀도가 미수복강원 1.878건/인, 황해도(구) 0.121건/인으로 15.5배 벌어져 있다. 이 격차를 공표 자료로 계산해 둔 자료는 찾지 못했다.', { num: 1 }),
    P('통로의 공백. 신청 서식에 세대를 적는 칸이 없어 후손 신청자를 셀 수 없고, 신청 경로 12종 중 후손이 주체가 될 수 있는지 판단할 근거 문장이 없는 것이 2종이다. 제도가 아직 다루지 않은 지점 11종도 정리했다.', { num: 1 }),

    P([run('기획 목적 — ', { b: true }), run('세 공백을 계산·순위·경로로 바꾼다. 남은 시간을 숫자로 내고(기록 골든타임), 어느 고향부터 남겨야 하는지 순위를 내고(기록 계승 우선순위), 후손이 오늘 할 수 있는 행동으로 잇는다(세대 계승 다리). 기존 시스템을 대체하자는 것이 아니라 그 위에 분석 층과 계승 층을 얹자는 제안이다.')], { before: 60 }),

    P([run('필요성 — ', { b: true }), run('통일부 자신의 조사 결과가 근거다. 제4차 남북 이산가족 실태조사(전체 36,017명 · 심층 5,103명, 2025-01-24 공표)에서 1순위 요청 사업은 「사진·물건 등 기록물 수집 보존」 59.9%, 위로사업 2위는 「고향 관련 사진·영상의 수집·제작, 전시」 44.5%였다.')], { before: 60 }),
    P('같은 조사에서 기록을 이어받을 의향은 후손 세대 55.7%로 1세대 37.7%보다 18.0%p 높고, 「관심을 가져야 한다」 44.7%와 「실제 관심이 있다」 31.6% 사이가 13.1%p 비어 있다. 부족한 것은 마음이 아니라 수단이다(다만 후손 문항은 1세대 4,042명이 자기 자손을 평가한 값이다).', { before: 60 }),
    P([run('활용 분야·빈도·중요성 — ', { b: true }), run('분야는 이산가족 정책(예산과 우선순위 판단)·통일교육·디지털박물관 이용 제고다. 갱신은 등록현황 월 1회, 연표·보도자료 주 1회, 기상은 실시간이다. 대상은 3만 명에 그치지 않는다 — 심층 응답 1세대의 79.2%(4,042/5,103, 2024년 조사)가 자손을 두었다. 누계 신청자 134,546명(2026-05-31, 사망 101,274명 포함)에 같은 비율을 적용하면 자손을 둔 1세대가 106,560명, 자녀를 1인당 2~4명으로 놓으면 2세대만 21만~43만 명이다. 이 범위는 공표 통계가 아니라 가정값이라 화면에서도 계산 근거와 구분해 적는다.')], { before: 60 }),
  ]
}

/* ── 3-2 상세내용 : 데이터 활용 · 창의성과 효과성 · 구현 기술과 서비스 방법 ── */
function detail() {
  const t1 = [1500, 2700, CW - 300 - 1500 - 2700]
  const t2a = Math.round((CW - 300) * 0.45)
  const t2b = (CW - 300) - t2a
  const hd = (t, w) => cell([t], w, { fill: GRAY, b: true, sz: 24, align: AlignmentType.CENTER })

  return [
    P([run('1) 자료를 고향 좌표로 모으는 처리 흐름 — ', { b: true }), run('통일부 공표 HWP·CSV·공개 API를 배치로 수집해 레코드 68,487건·수치 37,912건·엔티티 721건의 통합 인덱스로 만든다(빌드 2026-08-12). 이산가족 통계·박물관 사료 4,342건·실태조사 결과는 화면이 직접 읽는 팩으로 따로 굽는다. 지역별 기록 집계에는 연표 8,969건·보도자료 2,709건·동향 제목 42,813건·개황 93건을 통째로 스캔했다(2026-08-15 · 동향의 42,813건은 원본 파일 제목 전수 스캔값이라 인덱스 적재분 42,788건과 세는 대상이 다르다).')]),

    P([run('2) as-of 3상태 모델 — ', { b: true }), run('「모른다」와 「없다」를 구분한다. 모든 수치에 확인 시점을 세 상태로 붙이며, 색·도형·한국어 라벨의 3중 부호화라 색각 이상과 흑백 인쇄에서도 갈린다.')], { before: 60 }),
    table(t1, [
      row([hd('상태', t1[0]), hd('의미', t1[1]), hd('화면 문구(예)', t1[2])]),
      row([cell(['● 최신'], t1[0], { align: AlignmentType.CENTER }), cell(['최근 갱신됨'], t1[1]), cell(['「2026년 5월 기준 최신 자료입니다」'], t1[2])]),
      row([cell(['▲ 이후 미확인'], t1[0], { align: AlignmentType.CENTER }), cell(['자료는 있으나 그 뒤는 모름'], t1[1]), cell(['「2020년 3월 기준. 이후 상황은 확인되지 않습니다」'], t1[2])]),
      row([cell(['■ 데이터 종료'], t1[0], { align: AlignmentType.CENTER }), cell(['활동이 끝나 없다고 단정 가능'], t1[1]), cell(['「이후 데이터는 존재하지 않습니다(개성공단 전면중단)」'], t1[2])]),
    ]),
    P('■에는 이유를 반드시 붙이고, 주제 단위 종료 공지 2종(개성공단 2016-02-10 · 금강산 2008-07-11)이 데이터셋 단위 판정보다 앞선다. 남북회담은 2018-12-31 이후 자료가 없으나 「회담이 없었다」인지 「자료가 갱신되지 않았다」인지 가릴 수 없어 ▲ 이후 미확인에 둔다 — stale 을 frozen 으로 읽지 않는 것이 이 모델의 핵심이다. 같은 통계도 채널이 다르면 기준일이 다르다 — 포털 파일데이터 2025-08-31 35,311명 대 게시판 공표 HWP 2026-05-31 33,272명, 9개월 차다. 축이 다른 값을 한 문장에 묶는 것도 막는다 — 평균 나이 83.02세는 2025-08-31 축이라 2026-05-31 신청현황과 같은 줄에 쓰지 못하고, 어기면 검증기가 그 문장을 폐기한다.', { before: 60 }),

    P([run('3) 기록 골든타임 — ', { b: true }), run('등록현황 98개월 실측 위에 생잔 추계를 얹어 남은 시간을 계산한다. 모집단·연령분포·성별은 전부 통일부 공표값이고(총 33,272명 = 남 20,269 · 여 13,003, 공표 원표와 대조 일치), 완전생명표는 곱해지는 계수일 뿐이다. 단정하지 않고 두 시나리오의 범위로 낸다 — 2030년 22,172~24,544명, 2040년 8,316~10,167명, 2만 명 하회 2031~2033년, 1만 명 하회 2038~2041년. 오차도 감추지 않는다 — 1차연도 모델 사망률 9.34%는 실측 7.48%보다 1.86%p 높고 교정계수는 k=0.7306이다. 신규 등록 유입은 최근 24개월 월 중앙값 +10.0명(연 0.34%)이라 결과를 바꾸지 않는다.')], { before: 60 }),

    P([run('4) 고향별 기록 공백 분석 — ', { b: true }), run('이 아이디어의 중심이다(생존자 축 2025-08-31 월별 공표값 · 기록 집계 2026-08-15). 화면의 지역 안내가 쓰는 2026-05-31 게시판 공표값과 인원이 다른 것은 공표 채널이 달라서이며(미수복강원 516명 대 491명), 두 축을 한 문장에 섞지 않는다. 밀도 = 그 고향에 관한 공식 기록 건수 ÷ 그 고향 출신 생존자 수. 최상위 미수복강원 1.878건/인(969건 ÷ 516명), 최하위 황해도(구) 0.121건/인(829건 ÷ 6,851명)으로 15.5배 차이가 난다(동향을 뺀 보수적 집계에서는 19배, 순위는 그대로). 원적 1위 황해도(구)는 원적 확인 생존자 18,294명의 37.4%인데 연표에는 16건(1,161건의 1.4%), 보도자료에는 14건(587건의 2.4%)뿐이다. 반대로 미수복경기(개성)는 생존자 5.9%인데 연표 33.1% · 보도자료 43.3%다. 기록은 사람이 아니라 사건을 따라 쌓였다.')], { before: 60 }),

    P([run('5) 기록 계승 우선순위 — ', { b: true }), run('줄어드는 속도·기록 공백·식별 가능한 사료의 공백, 세 축의 순위를 합산해 어디부터 이어 적어야 하는지를 낸다. 1순위 평안북도(구) 순위합 4(생존 -53.1% · 기록 0.400건/인 · 식별사료 0.018건/인), 2순위 황해도(구) 9, 가장 여유 있는 곳은 미수복강원 18이다. 한 축에 업혀 있는 순위인지 스스로 검사해 공개한다 — 축을 하나씩 빼면 2/3 축에서 1위가 유지되고 감소 축을 빼면 황해도(구)가 1위다. 표본이 7개뿐이라 점수가 아니라 정렬을 돕는 값이라고 화면에 적는다.')], { before: 60 }),

    P([run('6) 성립하지 않은 분석도 지우지 않는다 — ', { b: true }), run('21개 분석을 시도해 11개 성립 · 4개 약함 · 6개 불가로 판정하고 불가 6종의 사유를 화면에 남긴다. 지역이 7개뿐이라 상관을 판정할 수 없고, 동향 42,788건 중 발생일이 붙는 것은 33.8%뿐이라 연도 곡선을 그리지 않는다. 이산가족 원적과 탈북민 재북 출신지의 차이도 함경북도(구) 5.9% 대 59.4%까지만 말하고 순위상관은 ρ=0.357 · p=0.444 · n=7로 판정 불가에 둔다. 지운 분석은 반박할 수 없지만 남긴 분석은 반박할 수 있다.')], { before: 60 }),

    P([run('7) 고향 좌표계 지도와 사료 — ', { b: true }), run('이산가족 원적(광복 당시 7종)과 탈북민 재북 출신지(현행 13종)를 한 지도의 두 좌표계로 겹치고, 지역을 누르면 종료 공지·오늘 날씨·생존자·출신지 분포·기록 건수·사료가 한 패널에 모인다. 사료 4,342건 중 1,445건(33.3%)을 고향으로 태깅했고 이미지는 저장하지 않고 원문으로 연결한다. 한계도 적는다 — 원적 「기타」 16,331명(49.1%, 2026-05-31)은 비율의 분모로 쓸 수 없고, 강원 태깅 397건 중 280건은 근거 지명이 상봉 장소(금강산·장전항·갈마)뿐이라 고향 축에서 걸러낸다. 생산연도가 판독된 사료 3,098건 중 2,832건(91.4%)이 2000~2018년, 1946~1953년은 30건(1.0%), 2019년 이후는 0건이다 — 기록은 헤어질 때가 아니라 만날 때 만들어졌다.')], { before: 60 }),

    P([run('8) 세대 계승 다리 — ', { b: true }), run('법령과 안내문 원문을 확인해 신청 경로 12종을 정리했다. 후손이 자기 이름으로 신청 주체가 될 수 있는 것 10종, 근거 문장이 없어 「불명」으로 남긴 것 2종, 1세대 전용은 0종이다. 모든 판정에 원문 인용을 붙이고 인용이 없으면 판정하지 않는다. 창구 링크 29개를 눌러 28개 생존·1개 사망을 표시하고(확인일 2026-08-19), 제도가 아직 다루지 않은 지점 11종도 같은 화면에 공개한다. 이산가족찾기 안내문의 「1세대 본인 또는 가족으로 1인 이상 신청 가능」과 「가급적 이산 1세대를 신청인으로」는 한쪽으로 정리하지 않고 나란히 인용해 후손이 스스로 판단하게 한다.')], { before: 60 }),

    P([run('9) 두 가지 밀도 · 안내인 · 기억 카드 — ', { b: true }), run('생존 신청자 평균 나이는 83.02세(2025-08-31 축)다. 같은 데이터를 「한눈에」와 「한걸음씩」 두 밀도로 낸다. 고향 안내인은 규칙이 먼저이고 AI는 해석만 하며 스키마 밖 출력은 폐기한다(규칙 계층·기준일 결합·순위 정책 검사 29건 통과). 기억 카드는 후손이 자기 집 기록을 한 장으로 적어 PNG·인쇄로 가져가는 기능이며 브라우저 안에서만 처리한다. 남의 집 기록을 내 카드의 근거로 삼지 않도록 기증자 성함 193명 전수 대조를 통과했다.')], { before: 60 }),

    P([run('10) 구현 기술과 서비스 방법 — ', { b: true }), run('화면은 React·TypeScript 정적 웹이고 갱신은 월 1회 배치다. 새 데이터베이스 없이 공표 자료를 읽어 쓰며, 수집·검증·이 문서 생성까지 전부 재실행 가능한 스크립트다. 접근성도 실측으로 고쳤다 — 48px 미만 터치 대상이 165개 중 79개였고(2026-08-19) 최소 크기를 단일 상수로 강제해 지금은 0개, 본문 대비는 2.63:1에서 4.54:1로 올렸다. 홈은 5막 13씬이며 정보를 지우지 않고 배치로 밀도를 조절한다(세로 길이 1280폭 기준 15.2화면, 2026-08-20 실측).')], { before: 60 }),
    /* 캡처는 원본 화면(1280폭, 2배 밀도)에서 판정에 필요한 구역만 잘라 확대했다.
       전체 화면을 줄여 넣으면 인쇄에서 글자가 뭉개진다 — 잘라서 크게 싣는 편이 증거가 된다. */
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { line: 240, before: 80 },
      children: [
        shot('기획서용-20260820/A-고향패널-3상태.png', 295, 415 / 1050),
        run('  '),
        shot('기획서용-20260820/B-한걸음씩.png', 368, 440 / 1370),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { line: 260, after: 60 },
      children: [run('① 고향 패널 ▲이후 미확인   ② 한걸음씩 보기', { sz: 22 })],
    }),

    P([run('11) 통일부가 운영할 때 달라지는 것 — ', { b: true }), run('본 시제품은 공개 자료만 외부에서 수집해 만든 것이라 제약이 있다. 자료와 시스템을 가진 쪽이 같은 구조를 구현하면 아래 제약은 사라진다 — 지적이 아니라 도입 시 얻는 이점이다.')], { before: 60 }),
    table([t2a, t2b], [
      row([hd('외부 구현의 제약', t2a), hd('통일부가 도입할 때', t2b)]),
      row([cell(['사료 이미지를 외부에서 표시할 수 없다'], t2a), cell(['같은 도메인이라 제약 없이 보인다'], t2b)]),
      row([cell(['채널에 따라 같은 통계의 기준일이 9개월까지 다르다'], t2a), cell(['원장이 하나이므로 시차 없이 최신값을 쓴다'], t2b)]),
      row([cell(['사료 고향 태깅이 본문 지명에 의존해 33.3%에 그친다'], t2a), cell(['기증 접수 서식에 고향란 한 칸이면 신규분은 100%'], t2b)]),
      row([cell(['세대 구분 정보가 없어 후손 이용 규모를 셀 수 없다'], t2a), cell(['신청 서식 체크박스 한 칸이면 후손 참여 통계가 생긴다'], t2b)]),
    ]),

    P([run('12) 효과성 — ', { b: true }), run('본 사람이 이어 적는 사람이 된다. 알린다(8촌 이내 친족이 당사자이고 경로가 10종 있다) → 모아 준다(통계·연표·보도·사료·오늘 날씨를 고향 이름 하나로) → 불러낸다(같은 고향의 남의 집 사진이 내 집 사진을 떠올리게 한다) → 받는다(그 자리에서 기증·유전자검사·영상편지로 잇는다). 들어온 기록은 다시 그 고향 화면의 재료가 되어 15.5배 밀도 격차를 좁힌다. 정책에는 「1만 명 하회 2038~2041년」과 「계승 1순위 평안북도(구)」라는, 예산과 순서를 논의할 때 쓸 숫자를 놓는다. 이산가족에게는 1순위 요청 사업(59.9%)에 답하고 후손에게는 없던 경로를 만든다. 같은 구조는 국군포로·납북자로 넓힐 수 있다.')], { before: 60 }),
    P('교류가 멈춘 것과 이산가족 정책이 멈춘 것은 다르다. 당국 차원 교류는 2018년 462건·2,829명을 끝으로 2026-05-31까지 89개월 연속 0건이지만, 보도자료 언급은 2010~2018년 연평균 14건에서 2019~2024년 14.7건으로 줄지 않았다(코퍼스 2025-10-24까지 · 부분 연도 2025년 제외). 교류 성사는 남측만으로 결정되지 않으므로 이 서비스는 실적이 아니라 기록으로 할 수 있는 일에 집중한다.', { before: 60 }),
    P('닿는 길은 별도 예산 없이 기존 접점에 얹는다 — ① 이산가족 정기 안내 발송에 고향별 화면 링크 동봉, ② 통일교육원·학교 통일교육 실습 자료, ③ 이북5도위원회·지자체 행사의 고향별 사료 상영. 시범운영 1년 차 목표는 사료 고향 태깅률 33.3% → 60%, 계승 1순위 두 고향(평안북도·황해도) 사료 집중 수집, 기준일 표기율 100% 유지다.', { before: 60 }),

    P([run('13) 검증 — ', { b: true }), run('측정한 것만 말한다. 회귀 평가 48/48(안전 위반 0 · 빈손 응답 0), 실사용 난문 108/108(출처 누락 0 · 시점 누락 0), 화면 검증 72/72(48px 미만 0건 · 의심 요청 0건 · 기증자 성함 193명 전수 대조 포함), 고향 안내인 29/29를 통과한다(전부 2026-08-20 실행). 데이터 정합도 검사한다 — 생존자 5개 분류의 합이 전부 33,272이고, 33,272 + 101,274 = 134,546이 맞으며, 교류현황 38개 연도행 15개 열이 공표 합계와 일치한다. 이 문서의 규격도 스크립트가 잰다.')], { before: 60 }),
  ]
}

/* ── 3-3 기타 참고 사항 등 : 생성형 AI 활용 내용 · 참고 문헌 ── */
function etc() {
  return [
    P([run('생성형 AI 활용 내용 — ', { b: true }), run('Gemini를 두 곳에만 쓴다. 첫째는 자연어 질문의 해석으로, 규칙이 먼저 처리하고 못 잡은 질문만 넘기며 닫힌 스키마 밖 출력이면 폐기하고 규칙 결과로 되돌린다. 둘째는 분석 덱 요약 문장의 정리로, 빌드 때 한 번 생성해 9문장을 만들고 원본 analysis.json의 해시(sha256:56b17ac9…99e0c9)를 함께 기록해 어느 판을 요약한 것인지 고정했다. 두 곳 모두 AI가 수치와 판정을 만들지 않는다. 요약의 수치 27개는 전량 원본 카드로 기계가 역추적했고, 검사 14종을 통과한 문장만 화면에 올리며 통과하지 못하면 폐기한다(이번 산출은 2차 시도에서 통과 — deck-summary.json attempt=2). 네트워크가 죽어도 규칙 계층만으로 동작한다.')]),
    P('본 기획서와 시제품 코드의 작성에는 Anthropic Claude를 사용했다. 이 문서의 모든 수치는 저장소의 실제 산출물 파일에서 나왔고 수치마다 출처 파일·경로·기준일을 댈 수 있다.', { before: 60 }),

    P([run('참고 문헌·자료 — ', { b: true }), run('통일부 「2024년 제4차 남북 이산가족 실태조사 결과」(2025-01-24) · 이산가족정보통합시스템 게시판 공표 자료(국가통계 승인번호 제103003호) · 공공데이터포털 통일부 개방 데이터 · 남북이산가족 디지털박물관 · 「남북 이산가족 생사확인 및 교류 촉진에 관한 법률」 제2조 · 통계청 완전생명표 2024년(KOSIS DT_1B42) · 서울대 통일평화연구원 통일의식조사')], { before: 60 }),

    P([run('중복 검토 · 시제품 — ', { b: true }), run('2025년 수상작 가운데 「AI 위기가구 예측」·「나와 닮은 선배가 걸어온 길」·「동행 MAP」은 탈북민 정착을, 「북킷리스트」는 도서를 다뤘다. 본 아이디어는 모집단(이산가족과 8촌 이내 친족)·축(고향)·목적(기록 공백의 측정과 계승)이 다르며 개인 예측도 추천도 하지 않는다. 시제품은 완성품이 아니라 실현 가능성을 보이려고 만든 동작 화면이다(배포 주소 factdoc.pages.dev).')], { before: 60 }),
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
    GAP(80),

    P([run('신청자 정보 ', { b: true }), run('(팀 신청 시, 대표 신청자 1인 기재)', { sz: 24 })], { before: 60, after: 40 }),
    table(c4, [
      row([grayLabel('성  명', c4[0]), blank(c4[1]), grayLabel('생년월일', c4[2]), cell(['(주민등록번호 앞 6자리)'], c4[3], { sz: 22 })]),
      row([grayLabel('소  속', c4[0]), blank(c4[1]), grayLabel('직  위', c4[2]), blank(c4[3])]),
      row([grayLabel('연락처', c4[0]), blank(c4[1]), grayLabel('이메일', c4[2]), blank(c4[3])]),
      row([grayLabel('주  소', c4[0]), cell([''], CW - c4[0], { span: 3 })]),
    ]),
    GAP(80),

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
    P('참가 신청서에 기재된 내용은 모두 사실이며, 동의 사항을 준수할 것을 서약합니다.', { before: 80 }),
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
