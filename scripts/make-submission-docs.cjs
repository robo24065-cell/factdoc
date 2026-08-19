/* 제출 서류 생성 — 서식3 아이디어 기획서 + 서식1 참가 신청서 (워드)
   규격: A4 · 휴먼명조 · 14pt · 줄간격 160%  (안내문 유의사항 원문)
   개인 정보는 절대 채우지 않는다 — 자리만 만든다. */
const path = require('path')
const fs = require('fs')
const D = require("docx")
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, ShadingType, BorderStyle, HeadingLevel, LevelFormat, VerticalAlign, ImageRun, PageBreak,
} = D

const OUT_DIR = 'C:/Users/PC/Downloads/2026년 통일부 공공데이터 활용 공모전/추출폴더/제출서류'
fs.mkdirSync(OUT_DIR, { recursive: true })

const FONT = '휴먼명조'
const SZ = 28            // 14pt (half-points)
const LINE = 384         // 160% (240 × 1.6)
const PAGE_W = 11906     // A4 DXA
const MARGIN = 1021      // 1.8cm — 규격이 정한 것은 글꼴·크기(14pt)·줄간격(160%)이고 여백은 자유다. 본문 폭을 조금 넓혀 10쪽 안에 담는다.
const CW = PAGE_W - MARGIN * 2   // 본문 폭 9638

const run = (text, o = {}) => new TextRun({ text, font: FONT, size: o.sz ?? SZ, bold: o.b, color: o.color })
const P = (text, o = {}) => new Paragraph({
  spacing: { line: LINE, before: o.before ?? 0, after: o.after ?? 0 },
  alignment: o.align,
  numbering: o.num ? { reference: 'dot', level: 0 } : undefined,
  children: Array.isArray(text) ? text : [run(text, o)],
})
const GAP = (h = 60) => new Paragraph({ spacing: { line: 240, after: h }, children: [] })

/* 구획 제목 — 서식의 회색 띠 형태 */
const HEAD = (t) => new Paragraph({
  spacing: { line: LINE, before: 160, after: 80 },
  shading: { type: ShadingType.CLEAR, fill: 'E8ECF2' },
  children: [run('  ' + t, { b: true })],
})
const SUB = (t) => P([run(t, { b: true })], { before: 120, after: 40 })

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '888888' }
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
const cell = (children, w, o = {}) => new TableCell({
  width: { size: w, type: WidthType.DXA },
  borders: BORDERS,
  verticalAlign: VerticalAlign.CENTER,
  shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill } : undefined,
  margins: { top: 40, bottom: 40, left: 100, right: 100 },
  columnSpan: o.span,
  children: children.map(c => typeof c === 'string'
    ? new Paragraph({ spacing: { line: LINE }, alignment: o.align, children: [run(c, { b: o.b, sz: o.sz })] })
    : c),
})
const row = (cells) => new TableRow({ children: cells })
const table = (colWidths, rows) => new Table({
  width: { size: colWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
  columnWidths: colWidths, rows,
})

const numbering = {
  config: [{
    reference: 'dot',
    levels: [{
      level: 0, format: LevelFormat.BULLET, text: '·', alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 340, hanging: 200 } }, run: { font: FONT, size: SZ } },
    }],
  }],
}

const TITLE = '고향잇기 — 사라지는 이산가족 기록을 고향이라는 축으로 후손에게 넘기는 공공데이터 서비스'

/* ══════════════════════════ 서식3 — 아이디어 기획서 ══════════════════════════ */
function form3() {
  const L = 1800, R = CW - 1800          // 라벨/값 열
  const half = Math.floor(CW / 2)

  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { line: LINE, after: 40 },
      children: [run('[ 2026년 통일부 공공데이터 활용 공모전 ]', { sz: 24 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { line: LINE, after: 160 },
      children: [run('아이디어 기획서', { b: true, sz: 40 })],
    }),

    table([L, R], [
      row([cell(['접수번호'], L, { fill: 'F2F2F2', b: true, align: AlignmentType.CENTER }), cell(['(접수기관 발급)'], R)]),
      row([cell(['참가자/팀 명'], L, { fill: 'F2F2F2', b: true, align: AlignmentType.CENTER }), cell(['(팀명 기재 · 팀 3인)'], R)]),
      row([cell(['아이디어 제목'], L, { fill: 'F2F2F2', b: true, align: AlignmentType.CENTER }), cell([TITLE], R)]),
    ]),
    GAP(),

    /* ── 활용 데이터 ── */
    HEAD('활용 데이터'),
    SUB('공공데이터 출처'),
    P('공공데이터 포털(data.go.kr) · 북한정보포털 · 이산가족정보통합시스템 · 남북이산가족 디지털박물관'),
    SUB('공공데이터명 — 가. 이 서비스의 화면 로직이 직접 쓰는 통일부 데이터 (10종)'),
    P('통일부_이산가족찾기 등록현황 월별 98개월(2017.7~2025.8) · 신청현황·교류현황 통계(누계 134,546명, 교류 38개 연도, 기준 2026.5.31)', { num: 1 }),
    P('통일부_남북이산가족 연표 1,041건 · 남북관계연표 8,969건 · 보도자료 2,709건 · 북한이탈주민 재북 출신지역별 현황 13개 지역(기준 2020.3.31)', { num: 1 }),
    P('북한 동향 42,813건 · 북한 개황 93건 · 통일부_북한날씨(일별 기상, 이미지형) · 남북이산가족 디지털박물관 14개 컬렉션 사료 4,342건', { num: 1 }),
    P('위 10종이 지도·기록 골든타임·후손 다리 화면을 직접 구성한다.', { before: 40 }),
    SUB('나. 자연어 질의 대조에 쓰는 통일부 코퍼스 (26종 13,915건)'),
    P('같은 시제품의 「사실은ON」 팩트체커가 쓰는 자료다. 지도 화면의 계산에는 들어가지 않고, 지도에서 답이 안 나오는 질문을 문장으로 물었을 때 대조 근거가 된다.'),
    SUB('다. 연계 데이터 — 전부 보조 역할이며, 빼도 서비스는 성립한다'),
    P('통계청 완전생명표(KOSIS) — 추계의 계수. 모집단·연령·성별은 전부 통일부 값', { num: 1 }),
    P('Open-Meteo 기상(무료 공개) — 통일부_북한날씨가 이미지(JPG)라 기계 판독이 어려워, 지점 체계는 통일부를 따르되 실시간 수치만 보완', { num: 1 }),
    P('서울대 통일평화연구원 통일의식조사 — 참고 지표. 출처가 다름을 화면에 배지로 구분', { num: 1 }),
    P([run('합계 — ', { b: true }), run('통일부 데이터 36종 68,487건을 적재했고, 그중 10종이 화면의 직접 입력이다. 인덱스 실측 수치다.')], { before: 40 }),
    GAP(),

    /* ── 개요 ── */
    HEAD('아이디어 소개 — 개요'),
    P([run('한 줄 요약 — ', { b: true }), run('사라지는 이산가족 정보를 통계로만 남기지 않고, "고향"이라는 공간축으로 재구성해 후손의 기록 계승 행동까지 연결하는 공공데이터 서비스다.')], { after: 40 }),
    P([run('제안 형태 — ', { b: true }), run('민간이 별도 사이트를 차리자는 제안이 아니라, 자료를 보유한 통일부가 기존 시스템 위에 이 구조를 얹으시라는 제안이다. 함께 제출하는 화면은 완성품이 아니라 "이런 느낌이 된다"를 보이는 최소 구현이며, 접근성·사용편의는 본 사업에서 다시 설계되어야 한다.')], { after: 60 }),

    SUB('1. 공모 부문 요건과의 대응'),
    P([run('새로운 제도·서비스 제안 — ', { b: true }), run('이산가족 통계를 고향이라는 공간축으로 재구성한 지도, 남은 시간을 계산해 보이는 기록 골든타임, 후손이 신청 가능한 제도를 모아 잇는 후손 다리. 모두 지금 없는 서비스다.')], { num: 1 }),
    P([run('타 공공·민간데이터 접목으로 기존제도 개선 — ', { b: true }), run('이산가족 통계와 통계청 완전생명표로 기록 골든타임을, 지역 자료와 무료 공개 기상으로 살아 있는 고향을, 사료와 지역 사전으로 고향별 기록을 만든다. 그 위에 신청서·기증 안내·박물관 접근 경로의 개선안을 제시한다(상세 6).')], { num: 1 }),
    P('통일부 개방 데이터 1건 이상 활용 요건은 위 「활용 데이터」로 충족한다 — 화면 로직이 직접 쓰는 10종만으로도 요건을 넘고, 코퍼스까지 더하면 36종 68,487건이다.', { before: 40 }),

    SUB('2. 배경 — 매달 세고 있지만, 몇 년 남았는지는 아무도 말하지 않는다'),
    P('통일부는 이산가족 생존자 수를 매월 공표한다. 2026년 5월 기준 33,272명, 평균 83.0세이고 누계 134,546명 중 101,274명이 이미 세상을 떠났다. 그런데 이 숫자는 매달 따로 발표되고 끝나, "이 속도면 몇 년 뒤 몇 명이 남는가"를 계산해 보여주는 곳이 없다.'),
    P('둘째, 자료의 시점이 감춰져 있다. "모른다"와 "없다"는 다르다 — 탈북민 출신지 통계가 2020년에 멈춘 것은 그 뒤를 모르는 것이고, 개성공단 통계가 2016년에 멈춘 것은 그 뒤가 없는 것이다(2016.2.10 전면중단).', { before: 60 }),
    P('셋째, 1세대가 떠난 뒤 기록을 이어받을 통로가 구조적으로 닫혀 있다. 이산가족법 제2조는 이산가족을 8촌 이내로 정의해 손자녀도 법적 당사자인데 그렇게 안내하는 화면이 없고, 신청서에 세대를 적는 칸조차 없어 후손 신청자 수를 셀 수 없다. 박물관 기증 절차는 안내 페이지의 주석 속에 숨어 있고 화면에는 전화번호 한 줄뿐이다.', { before: 60 }),

    SUB('3. 필요성 — 통일부 자신의 조사가 이 서비스를 요구했다'),
    P('「2024년 제4차 남북 이산가족 실태조사」(심층 5,103명)에서 이산가족이 1순위로 요청한 사업은 「사진·물건 등 기록물 수집 보존」 59.9%, 위로사업 2위는 「고향 관련 사진·영상의 수집·제작, 전시」 44.5%였다. 이 서비스가 하는 일이 곧 그 요청이다.'),
    P('같은 조사의 후손 항목은 통념을 뒤집는다. 1세대 사후 자손 세대 간 교류 희망이 1세대 37.7%, 후손 세대 55.7%로 후손 쪽이 18.0%p 높다. "관심을 가져야 한다" 44.7% 대 "실제 관심 있다" 31.6%로 당위와 행동 사이가 13.1%p 비어 있다. 문제는 무관심이 아니라 수단의 부재이고, 그 사이를 메우는 것이 이 서비스의 일이다.', { before: 60 }),
    P('규모도 3만 명의 문제가 아니다. 심층 응답자의 79.2%가 자손을 두어, 2세대만 세어도 약 21만~43만 명이다. 활용 분야는 이산가족 정책·통일교육·박물관 이용 제고이며, 갱신은 통계 월 1회·연표 주 1회·기상 실시간이다.', { before: 60 }),
    GAP(),

    HEAD('아이디어 소개 — 상세내용'),
    P('기능은 세 층으로 본체에 복무한다. 알게 한다(1·2) → 느끼게 한다(3) → 행동하게 한다(4). 5·6·7은 그것을 나르는 그릇과 바닥이다.', { after: 60 }),

    SUB('1) as-of 3상태 모델 — "모른다"와 "없다"를 구분한다 (창의성)'),
    P('모든 수치에 확인 시점을 3상태로 붙인다. 색·도형·한국어 라벨의 3중 부호화라 색맹·흑백 인쇄에서도 구분된다.'),
    table([1300, 2600, CW - 3900], [
      row([cell(['상태'], 1300, { fill: 'F2F2F2', b: true, align: AlignmentType.CENTER }), cell(['의미'], 2600, { fill: 'F2F2F2', b: true, align: AlignmentType.CENTER }), cell(['화면 문구(예)'], CW - 3900, { fill: 'F2F2F2', b: true, align: AlignmentType.CENTER })]),
      row([cell(['● 최신'], 1300, { align: AlignmentType.CENTER }), cell(['최근 갱신됨'], 2600), cell(['"2026년 8월 기준 최신 자료입니다"'], CW - 3900)]),
      row([cell(['▲ 이후 미확인'], 1300, { align: AlignmentType.CENTER }), cell(['자료는 있으나 그 뒤는 모름'], 2600), cell(['"2020년 3월 기준. 이후 상황은 확인되지 않습니다"'], CW - 3900)]),
      row([cell(['■ 데이터 종료'], 1300, { align: AlignmentType.CENTER }), cell(['활동 종료 → 없다고 단정 가능'], 2600), cell(['"이후 데이터는 존재하지 않습니다(개성공단 전면중단)"'], CW - 3900)]),
    ]),
    P('■에는 이유를 반드시 붙이며, 문구 규칙이 아니라 데이터베이스 제약으로 강제한다. 같은 통계의 채널별 기준일 차이(포털 2025.8 대 게시판 2026.5, 9개월)도 화면이 경고한다.', { before: 60 }),

    SUB('2) 기록 골든타임 — 남은 시간을 계산해 보여준다 (창의성·효과성)'),
    P('통일부 등록현황 98개월 실측 위에 생잔 추계를 얹는다. 모집단·연령분포·성별은 전부 통일부 공표값이고 통계청 완전생명표의 사망확률은 곱해지는 계수일 뿐이다. 전망: 2만 명 하회 2031~2033년, 1만 명 하회 2038~2041년.'),
    P('단일 수치로 단정하지 않는다. 생명표 원값이 실측 대비 감소를 과대추정하므로(유입 보정 후에도 연 2.4%p) 두 시나리오의 범위로 내고, 임의 보정계수 없이 모델 오차를 함께 공개한다.', { before: 60 }),

    SUB('3) 고향 좌표계 지도와 사료 (적합성·창의성)'),
    P('이산가족 출신지(광복 당시 구행정구역 7종)와 탈북민 재북 출신지(현행 13종)는 지금까지 서로 다른 표에 따로 있었다. 이를 한 지도의 두 좌표계로 겹치고, 지역을 누르면 종료 공지·오늘 날씨·이산가족 생존자·탈북민 출신·공식 기록·사료가 한 패널에 모인다. 박물관 사료 4,342건을 연계해 설명문의 지명("함흥에서 촬영한 사진")으로 1,190건을 고향별로 분류했고, 원본 이미지는 저장·재배포하지 않고 박물관 원문으로 연결한다.'),
    P('날씨는 장식이 아니라 과거의 고향을 현재의 시간으로 잇는 실시간 정보다. 고향에 오늘 비가 온다는 사실이 보일 때 고향은 지금도 존재하는 장소가 된다. 한계도 감추지 않는다 — 「기타」가 16,331명(49.1%)이라 비율의 분모로 쓸 수 없고, "강원도" 사료 397건 중 280건은 근거 지명이 금강산(상봉 행사장)뿐이라 고향 축에서 걸러 표시한다.', { before: 60 }),

    SUB('4) 후손 다리 — 진단에서 행동으로 (효과성)'),
    P('법령·안내문 원문을 확인해 후손이 신청 가능한 제도 10종을 실측했다 — 이산가족찾기 신청, 유전자검사(2025년부터 2~3세대 포함), 생애기록물 수집 동의(별지 제2호의5서식, 신분 제한 없음), 디지털박물관 기증, 영상편지, 북한주민 접촉신고, 민간교류경비 지원 등. 가장 앞에 기증을 둔다 — 1순위 요구(59.9%)에 후손이 직접 답하는 행동이기 때문이다.'),
    P('1세대 본인에게만 열린 제도와 아직 닫힌 지점도 그대로 공개한다. 화면에는 관계(손자녀 등)를 고르면 신청 가능한 제도와 공식 서식으로 연결되는 "자격 길잡이"를 둔다 — 손자녀도 법적 당사자라는 사실을 후손이 처음 안내받는 지점이다.', { before: 60 }),

    SUB('5) 두 가지 밀도와 고향 안내인 (접근성)'),
    P('실사용자 평균 나이가 83.0세다. 같은 데이터를 「한눈에」(대시보드)와 「한걸음씩」(카드 하나씩 8단계, 큰 버튼, 카드당 수치 1~2개, 키보드 조작) 두 모드로 제공한다. 고향 안내인(AI)은 보조 인터페이스이며 서비스는 AI 없이 완결된다 — 공식 수치를 문장으로 엮어 주기만 하고(판정·수치 생성 금지, 스키마 밖 출력 폐기, 실패 시 규칙 문장), AI 문장과 공식 수치는 시각적으로 구분한다.'),

    SUB('6) 운영 주체 — 서버를 가진 쪽이라야 할 수 있는 것'),
    P('본 시제품은 공개 자료만 외부에서 수집해 만든 것이라 구조적 제약이 있었다. 통일부는 원본과 시스템을 직접 보유하므로 같은 구조를 내부에서 구현하면 아래 제약이 자연히 해소된다. 행정에 대한 지적이 아니라 도입 시 얻는 이점을 정리한 것이다.'),
    table([Math.floor(CW * 0.44), CW - Math.floor(CW * 0.44)], [
      row([cell(['외부 구현의 제약'], Math.floor(CW * 0.44), { fill: 'F2F2F2', b: true, align: AlignmentType.CENTER }), cell(['통일부 도입 시'], CW - Math.floor(CW * 0.44), { fill: 'F2F2F2', b: true, align: AlignmentType.CENTER })]),
      row([cell(['사료 이미지를 외부에서 표시할 수 없음'], Math.floor(CW * 0.44)), cell(['같은 도메인이라 제약 없이 표시된다'], CW - Math.floor(CW * 0.44))]),
      row([cell(['공표 채널에 따라 기준일이 9개월까지 다름'], Math.floor(CW * 0.44)), cell(['원장이 하나이므로 시차 없이 최신값을 쓴다'], CW - Math.floor(CW * 0.44))]),
      row([cell(['사료의 고향 태깅이 본문 지명에 의존(27.4%)'], Math.floor(CW * 0.44)), cell(['기증 접수 서식에 고향란 1칸을 더하면 신규분은 100%'], CW - Math.floor(CW * 0.44))]),
      row([cell(['세대 구분 정보가 없어 후손 이용 규모를 알 수 없음'], Math.floor(CW * 0.44)), cell(['신청 서식에 체크박스 1칸이면 후손 참여 통계가 생긴다'], CW - Math.floor(CW * 0.44))]),
      row([cell(['개인 단위 연결(유전자·가족관계) 불가'], Math.floor(CW * 0.44)), cell(['기존 로그인·본인확인 위에서 "우리 집 기록"이 가능하다'], CW - Math.floor(CW * 0.44))]),
    ]),
    P('요구 자원은 크지 않다. 화면은 정적 웹, 갱신은 월 1회 배치이며 수집·검증은 재실행 가능한 스크립트로 제출한다. 새 데이터베이스 없이 기존 자료를 읽어 쓰고, 도입 시 통일부 누리집 표준과 공공 웹 접근성 지침(KWCAG)을 따른다. 개인 단위 기능은 1단계 범위가 아니다 — 1단계는 공표 통계와 공개 사료만 쓰는 익명 화면이고, 개인 연결은 기존 시스템의 본인확인 체계를 전제로 한 2단계 확장으로 둔다.', { before: 60 }),

    SUB('7) 기존 시스템의 화면 개선과 무엇이 다른가'),
    P('현행 이산가족정보통합시스템은 1세대 본인의 신청을 처리하는 행정 시스템이고 디지털박물관은 사료를 전시하는 아카이브다. 둘 다 축이 사람과 사료에 있고 이용자는 1세대 본인이다. 본 아이디어는 축을 고향으로 돌리고 이용자를 후손으로 넓히며, 어느 시스템에도 없는 두 가지를 새로 만든다 — 공표 통계에서 남은 시간을 산출하는 계산, 그리고 통계·기록·사료·제도를 고향 하나로 꿰는 연결이다. 화면을 고쳐 될 일이 아니라 데이터를 다시 엮어야 나오는 결과다.'),
    SUB('8) 검증 — 측정한 것만 말한다 (구체성)'),
    P('회귀 평가 48건과 실사용 난문 108건을 자동화해 각각 48/48·108/108을 통과한다. 데이터 정합도 스스로 검사한다 — 생존자 5개 분류 합이 전부 33,272로 일치하고, 개요 항등식(33,272+101,274=134,546)이 맞으며, 교류현황 38개 연도행 15개 열이 공표 합계와 일치한다. 원자료의 미세 오차도 고치지 않고 기록했다.'),
    GAP(),

    HEAD('기대효과'),
    SUB('작동 원리 — 알림에서 제보로 도는 한 바퀴'),
    P('기대효과는 화면을 몇 명이 봤는가가 아니라, 본 사람이 기록을 내놓는 쪽으로 돌아섰는가다.'),
    P([run('알린다 — ', { b: true }), run('후손도 법적 당사자이며 신청 가능한 제도가 10종 있다는 사실을 알린다(후손 교류 희망 55.7%).')], { num: 1 }),
    P([run('모아 준다 — ', { b: true }), run('흩어진 통계·연표·보도·사료·오늘 날씨를 고향 이름 하나로 모은다.')], { num: 1 }),
    P([run('불러낸다 — ', { b: true }), run('고향을 오늘 비가 오는 장소로 보여 준다. 같은 고향의 남의 집 사진이 내 집 사진을 떠올리게 한다(요구 2위 44.5%).')], { num: 1 }),
    P([run('받는다 — ', { b: true }), run('그 자리에서 기증·유전자검사·영상편지로 연결한다. 본 사람이 자료를 내놓는 사람이 된다(1순위 59.9%).')], { num: 1 }),
    P('들어온 기록은 다시 둘째 걸음의 재료가 되어 고향 화면이 두꺼워진다. 다만 이 서비스는 슬픔을 연출하지 않는다 — 수치와 기록을 그대로 놓는다.', { before: 60 }),

    SUB('부문별 기대효과와 목표'),
    P('정책 — "1만 명 하회 2038~2041년"이라는 계산 결과를 예산·우선순위 논의에 놓는다. 이산가족 — 1순위 요청 사업에 직접 답한다. 후손 — 없던 경로를 만든다. 확장 — 같은 구조를 국군포로·납북자·이북5도민으로 넓힐 수 있다.'),
    SUB('배포 전략 — 후손은 어떻게 이 화면에 닿는가'),
    P('정부 누리집은 청년층이 자발적으로 찾아오지 않는다. 별도 예산 없이 기존 접점에 얹는 세 경로를 제안한다.'),
    P('이산가족 대상 정기 안내(명절 인사·실태조사 안내 등) 발송 시 고향별 화면 링크를 함께 보낸다. 1세대가 후손에게 전달하는 경로가 된다.', { num: 1 }),
    P('통일교육원 교원 연수와 학교 통일교육 자료에 고향 화면을 실습 자료로 넣는다.', { num: 1 }),
    P('이북5도위원회·지자체 하나센터 행사에서 고향별 사료를 상영·배포한다.', { num: 1 }),
    P('시범운영 1년 차 목표: 박물관 사료 유입 월 500건, 후손 기증 문의 연 50건, 구행정구역 7종 전부 월 1회 이상 조회, 자료 기준일 표기율 100%. 위 배포 경로를 통한 도달률을 보수적으로 잡은 값이며, 시범운영 실측으로 대체한다.', { before: 60 }),
    GAP(),

    HEAD('기타 참고 사항 등'),
    SUB('생성형 AI 활용 내역'),
    P('본 기획서 작성과 시제품 구현에 생성형 AI(Anthropic Claude)를 활용했다 — 아이디어 발굴, 수집 스크립트와 파싱·정합성 검증, 화면·엔진 코드와 회귀 테스트, 문서 초안. 모든 수치는 사람이 원자료로 재확인했으며 AI가 만들어 낸 수치는 이 문서에 없다.'),
    SUB('참고 자료'),
    P('통일부 「2024년 제4차 남북 이산가족 실태조사 결과」(2025.1.24) · 이산가족정보통합시스템 · 공공데이터포털 통일부 개방 데이터 · 통계청 완전생명표(KOSIS) · 남북이산가족 디지털박물관 · 서울대학교 통일평화연구원에서 실시한 통일의식조사'),
    SUB('2025년 수상작과의 차이 (중복 검토)'),
    P('2025년 수상작은 모두 탈북민 정착을 다뤘다(위기가구 예측·지원시설 지도·정착 경로 추천). 본 아이디어는 모집단·축·목적이 전부 다르다.'),

    HEAD('별첨 — 시제품 화면'),
    ...(() => {
      /* 표 대신 한 문단에 나란히 — 셀 여백이 사라져 마지막 쪽에 들어간다 */
      const CAP_DIR = 'C:/Users/PC/Downloads/2026년 통일부 공공데이터 활용 공모전/추출폴더/기획서-캡처/gohyang'
      const FILES = ['02-고향패널-황해도.png', '05-한걸음씩.png']   // 2장만 크게 — 4장은 판독이 안 됐다
      const IW = 150, IH = Math.round(150 * 1720 / 2560)
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { line: 240, after: 40 },
          children: FILES.map(f => new ImageRun({
            type: 'png', data: fs.readFileSync(path.join(CAP_DIR, f)),
            transformation: { width: IW, height: IH },
          })),
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER, spacing: { line: 240 },
          children: [run('① 고향을 누르면 열리는 지역 화면(실시간 기상·기준일 구분)      ② 한걸음씩 보기', { sz: 20 })],
        }),
      ]
    })(),
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

/* ══════════════════════════ 서식1 — 참가 신청서 ══════════════════════════ */
function form1() {
  const L = 1700
  const blank = (w, o = {}) => cell([''], w, o)
  const c4 = [1400, 2800, 1400, CW - 5600]

  const children = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: LINE, after: 40 }, children: [run('[ 통일부 공공데이터 활용 공모전 ]', { sz: 24 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: LINE, after: 140 }, children: [run('참가 신청서', { b: true, sz: 40 })] }),

    table([L, CW - L], [
      row([cell(['접수번호'], L, { fill: 'F2F2F2', b: true, align: AlignmentType.CENTER }), cell(['(접수기관 발급)'], CW - L)]),
      row([cell(['공모 부문'], L, { fill: 'F2F2F2', b: true, align: AlignmentType.CENTER }), cell(['■ 아이디어 기획      □ 공공데이터 활용 사례'], CW - L)]),
      row([cell(['제안 명'], L, { fill: 'F2F2F2', b: true, align: AlignmentType.CENTER }), cell([TITLE], CW - L)]),
      row([cell(['참가 구분'], L, { fill: 'F2F2F2', b: true, align: AlignmentType.CENTER }), cell(['□ 개인      ■ 팀 (3인)'], CW - L)]),
    ]),
    GAP(80),

    P([run('신청자 정보 ', { b: true }), run('(팀 신청 시, 대표 신청자 1인 기재)', { sz: 24 })], { before: 60, after: 40 }),
    table(c4, [
      row([cell(['성  명'], c4[0], { fill: 'F2F2F2', align: AlignmentType.CENTER }), blank(c4[1]), cell(['생년월일'], c4[2], { fill: 'F2F2F2', align: AlignmentType.CENTER }), cell(['(주민등록번호 앞 6자리)'], c4[3], { sz: 22 })]),
      row([cell(['소  속'], c4[0], { fill: 'F2F2F2', align: AlignmentType.CENTER }), blank(c4[1]), cell(['직  위'], c4[2], { fill: 'F2F2F2', align: AlignmentType.CENTER }), blank(c4[3])]),
      row([cell(['연락처'], c4[0], { fill: 'F2F2F2', align: AlignmentType.CENTER }), blank(c4[1]), cell(['이메일'], c4[2], { fill: 'F2F2F2', align: AlignmentType.CENTER }), blank(c4[3])]),
      row([cell(['주  소'], c4[0], { fill: 'F2F2F2', align: AlignmentType.CENTER }), cell([''], CW - c4[0], { span: 3 })]),
    ]),
    GAP(80),

    P([run('공동 참가자 ', { b: true }), run('(팀 신청 시 대표 신청자 이외 팀원 정보 기재)', { sz: 24 })], { before: 60, after: 40 }),
    table([L, CW - L], [
      row([cell(['팀  명'], L, { fill: 'F2F2F2', b: true, align: AlignmentType.CENTER }), cell(['(팀명 기재)'], CW - L)]),
    ]),
    (() => {
      const c6 = [1000, 1500, 2200, 1500, 1600, CW - 7800]
      return table(c6, [
        row(['구분', '성 명', '소 속', '생년월일', '연락처', '이메일'].map((t, i) => cell([t], c6[i], { fill: 'F2F2F2', b: true, align: AlignmentType.CENTER }))),
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
