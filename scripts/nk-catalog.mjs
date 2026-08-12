// 통일부 데이터셋 카탈로그 — as-of 판정의 단일 진실 소스
//
// freshness
//   live   : 정기 갱신 중
//   stale  : 갱신 지연/중단. "이후는 확인되지 않음"
//   frozen : 대상 사업·활동 종료 → "이후 데이터는 존재하지 않음" (단정 가능, 사유 필수)
//
// status
//   ready   : 지금 적재 가능
//   pending : API 복구 대기 (엔드포인트/스키마는 미리 정의 — 복구 시 status만 바꾸면 흐른다)
//
// searchPriority : 검색 랭킹 가중치. 보도설명자료(판정 시드) > 공식 기록 > 통계 > 배경
// pointInTime    : true면 "최종 시점 레코드"를 우선 노출 (개성공단 2005가 아니라 2015)

export const TOPICS = {
  ik: '남북관계', 'ik.timeline': '연표', 'ik.talks': '회담', 'ik.accord': '합의서',
  'ik.travel': '왕래', 'ik.exchange': '교류협력', 'ik.conflict': '갈등·도발',
  econ: '경제협력', 'econ.kaesong': '개성공단', 'econ.kumgang': '금강산',
  'econ.trade': '남북교역', 'econ.fund': '남북협력기금',
  nk: '북한 일반', 'nk.politics': '정치', 'nk.economy': '경제', 'nk.society': '사회',
  'nk.military': '군사', 'nk.foreign': '외교', 'nk.culture': '문화',
  def: '북한이탈주민', 'def.entry': '입국', 'def.settle': '정착', 'def.edu': '교육', 'def.rights': '인권',
  who: '인물·기관', 'who.person': '인물', 'who.org': '기관·법인',
  humanitarian: '인도문제', 'humanitarian.family': '이산가족',
  'humanitarian.rights': '북한인권', 'humanitarian.aid': '인도적 지원',
  gov: '정부·정책', 'gov.policy': '통일정책', 'gov.briefing': '보도설명자료',
  media: '언론·유포', 'media.news': '뉴스', 'media.claim': '유포 주장',
}

const MOU = { provider: '통일부', origin: 'file', status: 'ready' }

// 주제 자체가 종료·중단된 경우 — 데이터셋과 무관하게 상단에 고지한다.
// "개성공단 근로자 수"처럼 우리 통계에 없는 항목을 물어도 '지금은 없다'가 먼저 나가야 한다.
export const TOPIC_STATUS = {
  'econ.kaesong': { state: 'frozen', since: '2016-02-10',
    text: '개성공단은 2016년 2월 10일 전면중단되었습니다. 이후 운영·생산·근로 관련 신규 데이터는 생성되지 않습니다.' },
  'econ.kumgang': { state: 'frozen', since: '2008-07-11',
    text: '금강산 관광은 2008년 7월 관광객 피격 사건 이후 중단되었습니다. 이후 신규 관광객 데이터는 없습니다.' },
  'ik.talks': { state: 'dormant', since: '2018-12-31',
    text: '남북 당국 회담은 2018년 이후 사실상 중단된 상태로, 그 이후의 회담 기록은 확인되지 않습니다.' },
}

/* 누적(cumulative) 지표 — 사람이 확정한다. 자동 추론으로 되돌리지 말 것.
   헤더·파일명 어디에도 '1998년 이후 누적'이라는 사실이 없다(금강산 coverageEnd 수동확정과 같은 구조).
   실측: dims 를 가진 measure 60건은 전부 이 두 데이터셋의 것이고 periodStart 보유율 0%다.
   여기에 등록되지 않은 스냅샷은 '누적'이라 말하지 않고 '기간 미분해 집계'로만 표기된다. */
export const CUMULATIVE = {
  defectorAge:    { since: '1998-01-01' },   // 북한이탈주민 연령대별 입국현황 (as-of 2020-03-31)
  defectorOrigin: { since: '1998-01-01' },   // 북한이탈주민 재북 출신지역별 현황 (동일)
}

export const DATASETS = {
  // ══ 시간축 척추 ═════════════════════════════════════════════
  timeline: { ...MOU, file: '남북관계연표.csv', kind: 'csv', parser: 'timeline',
    name: '남북관계연표', topic: 'ik.timeline',
    asOf: '2026-07-27', coverageStart: '1945-01-01', coverageEnd: '2026-07-27',
    freshness: 'live', updateCycle: '일 1회', searchPriority: 70,
    url: 'https://www.data.go.kr/data/15090949/fileData.do' },

  // ══ 인물 ═══════════════════════════════════════════════════
  people: { ...MOU, file: '북한인물.csv', kind: 'csv', parser: 'people',
    name: '북한 주요 인물', topic: 'who.person',
    asOf: '2025-01-01', coverageEnd: '2025-01-01', freshness: 'stale',
    note: '갱신 주기 불명 — 직책 변동·사망은 별도 확인 필요', searchPriority: 75,
    url: 'https://www.data.go.kr/data/15079264/openapi.do' },

  kjuActivity: { ...MOU, file: '김정은공개활동.csv', kind: 'csv', parser: 'kju',
    name: '김정은 공개활동 동향', topic: 'who.person',
    asOf: '2026-07-29', coverageEnd: '2026-07-29', freshness: 'live',
    updateCycle: '수시', searchPriority: 80,
    url: 'https://www.data.go.kr/data/15035233/fileData.do' },

  // ══ 배경지식 (계층 카테고리 내장) ════════════════════════════
  overview: { ...MOU, file: '통일부_북한개황_20210930.xml', kind: 'xml', parser: 'overviewXml',
    name: '북한개황', topic: 'nk',
    asOf: '2021-09-30', coverageEnd: '2021-09-30', freshness: 'stale',
    note: '2021년 발간본 — 제도·조직 변동 가능', searchPriority: 50,
    url: 'https://www.data.go.kr/data/15043013/fileData.do' },

  // ══ 회담 ═══════════════════════════════════════════════════
  talks: { ...MOU, file: '통일부_남북회담 정보_20181231.csv', kind: 'csv', parser: 'talks',
    name: '남북회담 정보', topic: 'ik.talks',
    asOf: '2018-12-31', coverageStart: '1971-01-01', coverageEnd: '2018-12-31',
    freshness: 'stale', note: '2018년 이후 남북 당국 회담이 사실상 중단되어 신규 기록 없음',
    searchPriority: 70, url: 'https://www.data.go.kr/data/15018924/fileData.do' },

  // ══ 개성공단 — frozen ★ ════════════════════════════════════
  ...frozenSet('econ.kaesong', '2015-12-31',
    '2016년 2월 10일 개성공단 전면중단으로 이후 데이터 미생성', {
    ksFirmsProd: ['개성공단 현황_입주기업수 및 생산액 현황.csv', '개성공단 입주기업수·생산액'],
    ksFirms:     ['개성공단 현황_입주기업현황.csv', '개성공단 입주기업(월별)'],
    ksProduction:['개성공단 현황_생산현황.csv', '개성공단 생산현황(월별)'],
    ksVisitors:  ['개성공단 현황_방문인원.csv', '개성공단 방문인원(월별)'],
  }),

  // ══ 금강산 — frozen ★ (파일 날짜 2020이지만 관광은 2008 중단) ═
  kumgang: { ...MOU, file: '남북교류협력_남북 관광협력사업_금강산 관광객 현황.csv',
    kind: 'csv', parser: 'stat', name: '금강산 관광객 현황', topic: 'econ.kumgang',
    asOf: '2020-12-01', coverageEnd: '2008-07-31', freshness: 'frozen',
    frozenReason: '2008년 7월 관광객 피격 사건으로 금강산 관광 중단, 이후 신규 관광객 없음',
    pointInTime: true, searchPriority: 65 },

  // ══ 왕래 ═══════════════════════════════════════════════════
  travelPeople: statDs('남북인적·물적 왕래_남북 인원 왕래 현황표.csv', '남북 인원 왕래', 'ik.travel', '2020-12-01'),
  travelShip:   statDs('남북인적·물적 왕래_남북 선박 왕래 현황(편도기준).csv', '남북 선박 왕래', 'ik.travel', '2020-12-01'),
  travelCar:    statDs('남북인적·물적 왕래_남북 차량왕래현황(차량운영횟수).csv', '남북 차량 왕래', 'ik.travel', '2020-12-01'),
  travelAir:    statDs('남북인적·물적 왕래_남북 항공기 왕래 현황(편도기준).csv', '남북 항공기 왕래', 'ik.travel', '2020-12-01'),

  // ══ 교역 ═══════════════════════════════════════════════════
  tradeItem: { ...statDs('통일부_남북교역_품목별_통계_20220531.csv', '남북교역 품목별 통계', 'econ.trade', '2022-05-31'),
    coverageStart: '1989-01-01', note: '2016년 개성공단 중단 이후 교역액 대부분 소멸' },
  tradeMonthly:  statDs('남북교역_연도별·월별_통계.csv', '남북교역 연도별·월별 통계', 'econ.trade', '2022-05-31'),
  tradeType:     statDs('남북교역_거래유형별_통계.csv', '남북교역 거래유형별 통계', 'econ.trade', '2022-05-31'),
  tradeCount:    statDs('남북교류협력_현황_연도별 남북교역 건수 현황.csv', '연도별 남북교역 건수', 'econ.trade', '2020-12-01'),
  tradeItemCount:statDs('남북교류협력_현황_연도별 남북교역 품목수 현황.csv', '연도별 남북교역 품목수', 'econ.trade', '2020-12-01'),

  // ══ 북한이탈주민 ════════════════════════════════════════════
  defectorSettle: { ...statDs('북한이탈주민 통계_북한이탈주민 정착 현황.csv', '북한이탈주민 정착현황', 'def.settle', '2020-03-31'),
    note: '더 최신 수치는 「북한이탈주민 주요 현황(2025-06-30)」 참조' },
  defectorAge:    statDs('북한이탈주민 통계_연령대별 입국현황(’20.3월말).csv', '북한이탈주민 연령대별 입국현황', 'def.entry', '2020-03-31'),
  defectorOrigin: statDs('북한이탈주민 통계_재북 출신지역별 현황(’20.3월말).csv', '북한이탈주민 재북 출신지역별 현황', 'def.entry', '2020-03-31'),

  // ══ 기타 ═══════════════════════════════════════════════════
  corps:       statDs('통일부_허가법인 현황_20240630.csv', '대북지원 허가법인 현황', 'who.org', '2024-06-30'),
  culturalCoop:statDs('통일부_사회문화협력사업 승인내역_20181231.csv', '사회문화협력사업 승인내역', 'ik.exchange', '2018-12-31'),

  // ══════════════════════════════════════════════════════════
  // API 복구 대기 — 엔드포인트·파서를 미리 정의해 둔다.
  // 서버가 살아나면 status를 'ready'로 바꾸는 것만으로 파이프라인에 편입된다.
  // ══════════════════════════════════════════════════════════
  briefing: { provider: '통일부', origin: 'api', status: 'pending',
    name: '통일부 보도자료·보도설명자료', topic: 'gov.briefing',
    endpoint: 'https://apis.data.go.kr/1250000/nesdta/getNesdta',
    params: { bgng_ymd: 'YYYYMMDD', end_ymd: 'YYYYMMDD', pageNo: 1, numOfRows: 100, type: 'json' },
    incrementalBy: 'bgng_ymd',            // 마지막 수집일+1부터
    kind: 'api', parser: 'briefing',
    asOf: null, coverageEnd: null,        // 수집 시 갱신
    freshness: 'live', updateCycle: '일 1회',
    searchPriority: 100,                  // ★ 최우선 — 판정 시드
    note: '#사실은 이렇습니다의 원천. 정부가 특정 보도의 특정 주장을 부인·정정한 공식 기록',
    url: 'https://www.data.go.kr/data/15079284/openapi.do' },

  trend: { provider: '통일부', origin: 'api', status: 'pending',
    name: '북한 동향(일일·주간·월간)', topic: 'nk',
    endpoint: 'https://apis.data.go.kr/1250000/trend/getTrend',
    params: { cl: 'ARGUMENT_DAIL', bgng_ymd: 'YYYYMMDD', end_ymd: 'YYYYMMDD', pageNo: 1, numOfRows: 100 },
    incrementalBy: 'bgng_ymd', kind: 'api', parser: 'trend',
    asOf: null, coverageEnd: null, freshness: 'live', updateCycle: '일 1회',
    searchPriority: 85, url: 'https://www.data.go.kr/data/15079311/openapi.do' },

  accord: { provider: '통일부', origin: 'api', status: 'pending',
    name: '남북합의서', topic: 'ik.accord',
    endpoint: 'https://apis.data.go.kr/1250000/nktalkmng/getNktalkmng',
    params: { pageNo: 1, numOfRows: 100, type: 'json' },
    incrementalBy: 'full', kind: 'api', parser: 'accord',
    asOf: null, coverageEnd: null, freshness: 'stale',
    searchPriority: 90, url: 'https://www.data.go.kr/data/15079225/openapi.do' },

  nkinfo: { provider: '통일부', origin: 'api', status: 'pending',
    name: '북한정보포털 통합검색', topic: 'nk',
    endpoint: 'https://apis.data.go.kr/1250000/nkinfo/getNkinfo',
    params: { pageNo: 1, numOfRows: 100 }, incrementalBy: 'full',
    kind: 'api', parser: 'generic', asOf: null, coverageEnd: null,
    freshness: 'stale', searchPriority: 60 },

  // 엔드포인트 미확인 — 페이지에서 확보 후 endpoint만 채우면 됨
  lexicon: { provider: '통일부', origin: 'api', status: 'pending',
    name: '북한 용어사전 / 남북한 언어비교', topic: 'nk.culture',
    endpoint: null, kind: 'api', parser: 'lexicon',
    asOf: null, coverageEnd: null, freshness: 'stale', searchPriority: 40,
    note: '★ 질의 정규화 전용 — 검색 근거가 아니라 entity_alias 적재용',
    url: 'https://www.data.go.kr/data/15151324/openapi.do' },
}

/* ★ 아직 못 실은 자료가 답할 질문들 — "없다"와 "우리가 아직 못 가져왔다"는 다르다.
   통일부에 실제로 있는 자료인데 API 가 죽어 연동을 못 한 것이라면 그렇게 말해야 한다.
   "안녕하세요 북한말로?" 는 「남북한 언어비교」가 답할 질문이지 자료가 없는 질문이 아니다.
   PENDING 5종이 ready 로 바뀌면 이 안내는 자동으로 사라진다(아래 pendingSourceFor 참조). */
export const PENDING_HINTS = {
  lexicon:  /북한말|북한어|북한식|말로\s*(뭐|어떻게)|문화어|사투리|용어|어휘|낱말|단어|표현|무슨\s*뜻|뜻이\s*(뭐|무엇)|어떻게\s*말|뭐라고\s*(해|하나|불러)/,
  briefing: /사실은\s*이렇|보도설명|해명|반박|정정보도|가짜뉴스|허위\s*보도|사실이\s*아니/,
  accord:   /합의서|합의문|공동선언|공동성명|판문점\s*선언|기본합의서/,
  trend:    /일일\s*동향|주간\s*동향|월간\s*동향|동향\s*보고/,
}

/** 질의가 '아직 못 실은 자료'의 영역인지 — 맞으면 그 데이터셋을 알려준다 */
export function pendingSourceFor(q, datasets = DATASETS) {
  const text = String(q || '')
  for (const [key, re] of Object.entries(PENDING_HINTS)) {
    const ds = datasets[key]
    if (ds?.status === 'pending' && re.test(text)) {
      return { key, name: ds.name, url: ds.url || null, note: ds.note || null }
    }
  }
  return null
}

// ── 헬퍼 ────────────────────────────────────────────────────
function statDs(file, name, topic, asOf) {
  return { ...MOU, file, kind: 'csv', parser: 'stat', name, topic,
    asOf, coverageEnd: asOf, freshness: 'stale', pointInTime: true, searchPriority: 60 }
}
function frozenSet(topic, asOf, reason, defs) {
  const out = {}
  for (const [key, [file, name]] of Object.entries(defs)) {
    out[key] = { ...MOU, file, kind: 'csv', parser: 'stat', name, topic,
      asOf, coverageEnd: asOf, freshness: 'frozen', frozenReason: reason,
      pointInTime: true, searchPriority: 65 }
  }
  return out
}

// ── 시점 문구 ────────────────────────────────────────────────
const fmt = (d) => `${d.getFullYear()}년 ${d.getMonth() + 1}월`
export function asOfNotice(ds, askedAt = new Date()) {
  const end = new Date(ds.coverageEnd || ds.asOf)
  const gapDays = Math.floor((askedAt - end) / 86400000)
  if (ds.freshness === 'frozen')
    return { level: 'frozen', gapDays,
      text: `${fmt(end)} 기준이며, 이후 데이터는 존재하지 않습니다. (${ds.frozenReason})` }
  if (ds.freshness === 'live' && gapDays <= 7)
    return { level: 'live', gapDays, text: `${fmt(end)} 기준 최신 자료입니다.` }
  return { level: 'stale', gapDays,
    text: `가장 최근 확인 자료는 ${fmt(end)} 기준입니다. 이후 상황은 확인되지 않습니다.`
      + (ds.note ? ` (${ds.note})` : '') }
}

export const READY = Object.fromEntries(Object.entries(DATASETS).filter(([, d]) => d.status === 'ready'))
export const PENDING = Object.fromEntries(Object.entries(DATASETS).filter(([, d]) => d.status === 'pending'))
