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
const API = { provider: '통일부', origin: 'api', kind: 'api' }

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
  // API 수집분 — scripts/fetch-mou-api.mjs → 북한자료-api/<key>.json
  //
  // asOf/coverageEnd 는 여기 적힌 값이 '사람이 확인한 기준선'이다.
  // ingest 는 수집 파일의 _meta 가 더 최신일 때만 앞으로 민다(autoCoverage). 뒤로는 절대 안 민다.
  // 금강산처럼 사람이 수동 확정한 항목에는 autoCoverage 를 주지 않는다.
  // ══════════════════════════════════════════════════════════
  briefing: { ...API, status: 'ready',
    name: '통일부 보도자료·보도설명자료', topic: 'gov.briefing',
    endpoint: 'https://apis.data.go.kr/1250000/nesdta/getNesdta',
    params: { bgng_ymd: 'YYYYMMDD', end_ymd: 'YYYYMMDD', pageNo: 1, numOfRows: 100 },
    file: 'briefing.json', parser: 'briefing', incrementalBy: 'bgng_ymd',
    asOf: '2026-08-12', coverageStart: '2010-01-05', coverageEnd: '2025-10-24',
    autoCoverage: true, freshness: 'stale', updateCycle: '원본 게시판 기준 일 1회',
    searchPriority: 100,
    note: 'API 피드가 2025-10-24 에서 원본과 끊겼다(갭 292일). 원본 게시판에는 2026-08 자료까지 게시 중 '
        + '— 이후는 부존재가 아니라 미수집이다',
    url: 'https://www.data.go.kr/data/15079284/openapi.do' },

  // trend 를 3개로 쪼갠 이유: coverageEnd 가 서로 다르다.
  // 한 덩어리면 월간이 항상 최대 38일 과대평가된다(7/8 게시 = 6월분) = as-of 모델 정면 위반.
  trendDaily: { ...API, status: 'ready',
    name: '일일 북한동향', topic: 'nk',
    endpoint: 'https://apis.data.go.kr/1250000/trend/getTrend',
    params: { cl: 'ARGUMENT_DAIL', bgng_ymd: 'YYYYMMDD', end_ymd: 'YYYYMMDD', pageNo: 1, numOfRows: 100 },
    file: 'trendDaily.json', parser: 'trendDaily', incrementalBy: 'bgng_ymd',
    asOf: '2026-08-12', coverageStart: '2021-11-21', coverageEnd: '2026-08-11',
    autoCoverage: true, freshness: 'live', updateCycle: '일 1회', searchPriority: 85,
    note: '일일동향은 2021-11-21 이전이 제공되지 않는다 — 그 이전 질문엔 "없다"가 아니라 "미제공"이라고 답해야 한다',
    url: 'https://www.data.go.kr/data/15079311/openapi.do' },

  trendWeekly: { ...API, status: 'ready',
    name: '주간 북한동향', topic: 'nk',
    endpoint: 'https://apis.data.go.kr/1250000/trend/getTrend',
    params: { cl: 'ARGUMENT_WIK', bgng_ymd: 'YYYYMMDD', end_ymd: 'YYYYMMDD', pageNo: 1, numOfRows: 100 },
    file: 'trendWeekly.json', parser: 'trendPeriodical', incrementalBy: 'bgng_ymd',
    asOf: '2026-08-12', coverageStart: '1991-01-01', coverageEnd: '2026-08-02',
    autoCoverage: true, freshness: 'live', updateCycle: '주 1회', searchPriority: 55,
    note: '본문이 없다 — 실체는 hwpx/hwp/pdf 첨부다. 제목·기간만 색인된다',
    url: 'https://www.data.go.kr/data/15079311/openapi.do' },

  trendMonthly: { ...API, status: 'ready',
    name: '월간 북한동향', topic: 'nk',
    endpoint: 'https://apis.data.go.kr/1250000/trend/getTrend',
    params: { cl: 'ARGUMENT_MNTHNG', bgng_ymd: 'YYYYMMDD', end_ymd: 'YYYYMMDD', pageNo: 1, numOfRows: 100 },
    file: 'trendMonthly.json', parser: 'trendPeriodical', incrementalBy: 'bgng_ymd',
    asOf: '2026-08-12', coverageStart: '2006-01-31', coverageEnd: '2026-06-30',
    autoCoverage: true, freshness: 'live', updateCycle: '월 1회', searchPriority: 55,
    note: '본문 없음(hwpx 첨부). coverageEnd 는 게시일이 아니라 다루는 달의 말일이다',
    url: 'https://www.data.go.kr/data/15079311/openapi.do' },

  // ★ 엔드포인트 정정: nkinfo/getNkinfo 는 존재하지 않는 경로였다(게이트웨이가 rc=11 로 되돌려 오진 유발).
  //   진짜 통합검색은 search/getSearch 이고 문서는 15079225 다.
  nkinfoTrend: { ...API, status: 'ready',
    name: '북한정보포털 동향', topic: 'nk',
    endpoint: 'https://apis.data.go.kr/1250000/search/getSearch',
    params: { cl: '동향', thema: '1~5', pageNo: 1, numOfRows: 100 },
    file: 'nkinfoTrend.json', parser: 'nkinfoTrend', incrementalBy: 'full',
    asOf: '2026-08-12', coverageEnd: '2026-08-11', autoCoverage: true,
    freshness: 'live', updateCycle: '일 1회', searchPriority: 45,
    /* 상한을 풀었다(8,000 → 전량).
       ★ 왜 8,000이 문제였나: 최신 pk 순으로 자르는데 인물동향(pk 6,596~121,809)이
         적재 하한 126,513 아래라 **14,468건 전부가 잘려 나갔다.** 엘리트 수행 일지가
         통째로 빠진 채였다. 상한이 '최신 우선'처럼 보였지만 실제로는 특정 구간을 지웠다.
       ★ 웹 부피는 다른 방법으로 푼다: Cloudflare 상한은 **파일당** 25MiB 이므로
         포털동향만 별도 파일(nk-trend.json)로 내보낸다 — build-web-index.mjs 참조.
         본문을 150자로 잘라 22.2MB(상한의 89%), gzip 4.2MB 다. */
    ingestLimit: 0,         // 0 = 전량
    note: '★ 본문은 통일부의 판정이 아니라 북한 매체 주장의 채록이다. 화면에 반드시 그렇게 표기할 것. '
        + '레코드에 날짜 필드가 없어 occurredOn 이 null 이다',
    url: 'https://www.data.go.kr/data/15079225/openapi.do' },

  nkinfoOverview: { ...API, status: 'ready',
    name: '북한개황(포털)', topic: 'nk',
    endpoint: 'https://apis.data.go.kr/1250000/search/getSearch',
    params: { cl: '개황', thema: '1~5', pageNo: 1, numOfRows: 100 },
    file: 'nkinfoOverview.json', parser: 'nkinfoOverview', incrementalBy: 'full',
    asOf: '2026-08-12', coverageEnd: '2025-05-31', autoCoverage: true,
    freshness: 'stale', searchPriority: 55, perRecordAsOf: true,
    note: '★ as-of 가 레코드마다 다르다(2023.7 / 2024.8 / 2025.5 작성분 혼재). '
        + '데이터셋 하나에 기준일 하나를 붙이면 2023년 문서가 최신인 척하게 된다',
    url: 'https://www.data.go.kr/data/15079225/openapi.do' },

  // ── 아직 못 가져온 것 ───────────────────────────────────────
  // 2026-08-12 실측: 둘 다 HTTP 200 + {"resultCode":"2","resultMsg":"db_error"}.
  // 인증·파라미터 문제가 아니다(같은 키로 briefing/trend/search 는 정상). 제공기관 백엔드 DB 장애다.
  accord: { ...API, status: 'pending',
    name: '남북합의서', topic: 'ik.accord',
    endpoint: 'https://apis.data.go.kr/1250000/nktalkmng/getNktalkmng',
    params: { bgng_ymd: 'YYYYMMDD', end_ymd: 'YYYYMMDD', pageNo: 1, numOfRows: 100 },
    file: 'accord.json', parser: 'accord', incrementalBy: 'full',
    asOf: null, coverageEnd: '2018-09-19',    // 원본(남북회담본부)에서 확인한 최신 합의일
    freshness: 'stale', searchPriority: 90,
    pendingReason: '제공기관 백엔드 db_error (2026-08-12 실측). 같은 URL 이 0건→504→db_error 로 오락가락한다',
    note: '원본 시스템 기준 남북합의서 168 + 공동보도문 90 = 258건. 회담일자가 없는 6건은 '
        + '날짜가 필수 파라미터인 이 API 로는 영구 도달 불가',
    url: 'https://www.data.go.kr/data/15131895/openapi.do' },   // ★ 15079225 는 통합검색 문서였다

  lexicon: { ...API, status: 'pending',
    name: '북한 용어사전', topic: 'nk.culture',
    endpoint: 'https://apis.data.go.kr/1250000/nkword/getNkword',   // ★ 미확인 → 확정
    params: { pageNo: 1, numOfRows: 100 },
    file: 'lexicon.json', parser: 'lexicon', incrementalBy: 'full',
    asOf: null, coverageEnd: null, freshness: 'stale', searchPriority: 40,
    pendingReason: '제공기관 백엔드 db_error (2026-08-12 실측, 파라미터 13종·재시도 12회 전부 동일). 엔드포인트는 확정됨',
    note: '★ 질의 정규화·entity_alias 전용 — 검색 근거로 인용하지 않는다. '
        + '스키마가 word+descript 뿐이라 남→북 대응어가 구조적으로 없다. '
        + '남북관계지식사전(15129686, 233건)·북한지식사전(15129687, 273건)은 XLS 파일로 지금도 받을 수 있다',
    url: 'https://www.data.go.kr/data/15151324/openapi.do' },
}

/* ★ 아직 못 실은 자료가 답할 질문들 — "없다"와 "우리가 아직 못 가져왔다"는 다르다.
   ready 가 되면 pendingSourceFor 가 자동으로 걸러내므로 여기서 지울 필요는 없다.
   (briefing·trend 는 2026-08-12 수집 성공으로 ready — 그래서 목록에서 뺐다)

   `exclusive` 는 "준비된 데이터셋 중 이 질문에 **부분적으로라도** 답할 수 있는 것이 있는가"다.
   - lexicon(어휘) — 없다. 코퍼스에 남↔북 대응어 자료가 0건이다. 따라서 문서를 아무리
     찾아도 답이 될 수 없다. **실측 사고**: "안녕하세요 북한말로?" 가 「인민의 **안녕**」에
     걸려 자강력제일주의 선전문을 "확인된 가장 가까운 공식 기록"이라고 내놓았다.
     안녕(인사)과 안녕(평안)은 다른 말인데 토큰이 같아서 벌어진 일이다.
     이런 질문은 문서를 근거로 올리면 안 된다 — 없는 것을 아는 척하는 것이다.
   - accord(합의서) — 있다. 연표·보도자료가 판문점선언·기본합의서를 실제로 다룬다.
     그래서 안내는 띄우되 문서 근거는 그대로 살린다. */
export const PENDING_HINTS = {
  lexicon: { exclusive: true,
    re: /북한말|북한어|북한식|말로\s*(뭐|어떻게)|문화어|사투리|용어|어휘|낱말|단어|표현|무슨\s*뜻|뜻이\s*(뭐|무엇)|어떻게\s*말|뭐라고\s*(해|하나|하니|하냐|불러|부르)/ },
  accord: { exclusive: false,
    re: /합의서|합의문|공동선언|공동성명|판문점\s*선언|기본합의서/ },
}

/** 질의가 '아직 못 실은 자료'의 영역인지 — 맞으면 그 데이터셋을 알려준다 */
export function pendingSourceFor(q, datasets = DATASETS) {
  const text = String(q || '')
  for (const [key, h] of Object.entries(PENDING_HINTS)) {
    const ds = datasets[key]
    if (ds?.status === 'pending' && h.re.test(text)) {
      return { key, name: ds.name, url: ds.url || null, exclusive: !!h.exclusive,
        note: ds.pendingReason || ds.note || null }
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
