// 통일부 OpenAPI 18종 레지스트리 — 공모전 안내문 PDF 목록(#108~125) 전량
//
// 엔드포인트는 공공데이터포털 각 상세페이지에서 직접 확인했다(추측 아님).
// URL 이 본문에 안 나온 5종은 오퍼레이션명(getXxx)만 노출돼 있어 1250000/<service>/<op> 규약으로 구성했다.
//
// ⚠ 확인된 카탈로그 오류: 기존 nk-catalog 는 `nkinfo/getNkinfo` 를 '북한정보포털 통합검색'으로
//    등록했으나 그 데이터셋(15108107)은 실제로 **북한 개황**이다.
//    진짜 통합검색은 `search/getSearch`(15079225). accord 의 url(15079225)도 잘못이었다 — 실제 15131895.
//
// 사용자 지시: "나중에라도 필요해보이는거도 긁어놓자. 나중에 필요할때 받아쓰려면 또 수집시간이 걸리니까"
// → 지금 쓰는 5종만이 아니라 18종 전량을 원본 그대로 보관한다. API 는 오래 죽어 있었고 또 죽을 수 있다.

const B = 'https://apis.data.go.kr/1250000'

/** priority: 1=팩트체크 코어 · 2=보조 근거 · 3=보관용(당장 안 씀) */
export const MOU_APIS = {
  // ── 1순위: 판정 근거 ────────────────────────────────────────
  briefing:  { id: '15079284', name: '통일부 보도자료',            url: `${B}/nesdta/getNesdta`,        priority: 1,
               note: '「#사실은 이렇습니다」의 원천. 정부가 특정 보도의 주장을 부인·정정한 공식 기록' },
  trend:     { id: '15079311', name: '북한 동향',                 url: `${B}/trend/getTrend`,          priority: 1,
               extra: { cl: 'ARGUMENT_DAIL' }, note: '일일·주간·월간 동향' },
  accord:    { id: '15131895', name: '남북관계 남북합의서',        url: `${B}/nktalkmng/getNktalkmng`,  priority: 1 },
  kjuAct:    { id: '15108096', name: '김정은 공개활동',            url: `${B}/othbcact/getOthbcact`,    priority: 1 },
  person:    { id: '15079264', name: '북한 인물',                 url: `${B}/prsn/getPrsn`,            priority: 1 },
  overview:  { id: '15108107', name: '북한 개황',                 url: `${B}/nkinfo/getNkinfo`,        priority: 1 },
  corps:     { id: '15108108', name: '허가법인',                  url: `${B}/prmisncpr/getPrmisncpr`,  priority: 1 },

  // ── 2순위: 질의 정규화·보조 ─────────────────────────────────
  nkword:    { id: '15151324', name: '북한 용어사전',              url: `${B}/nkword/getNkword`,        priority: 2,
               note: '★ 검색 근거가 아니라 질의 정규화·entity_alias 적재용' },
  wordCmp:   { id: '15151340', name: '남북한 언어비교',            url: `${B}/nskwordcmp/getNskwordCmp`, priority: 2,
               note: '★ 남북 표기 대응(오물풍선 ↔ 대남 쓰레기 풍선)' },
  search:    { id: '15079225', name: '북한정보포털 통합검색',       url: `${B}/search/getSearch`,        priority: 2 },
  research:  { id: '15131892', name: '북한 연구자료',              url: `${B}/udbresearch/getUdbresearch`, priority: 2 },
  hist:      { id: '15079276', name: '북한 약사(略史)',            url: `${B}/hist/getHist`,            priority: 2 },

  // ── 3순위: 지금은 안 쓰지만 받아둔다 ────────────────────────
  tvprgm:    { id: '15079329', name: '북한 TV 프로그램 편성표',     url: `${B}/tvprgm/getTvprgm`,        priority: 3 },
  textbook:  { id: '15079243', name: '북한교과서·어린이도서',       url: `${B}/textbook/getTextbook`,    priority: 3 },
  pblictn:   { id: '15079299', name: '북한 및 국내외 연속간행물',   url: `${B}/pblictn/getPblictn`,      priority: 3 },
  lonbook:   { id: '15079804', name: '연도별 인기 대출 도서',       url: `${B}/lonbook/getLonbook`,      priority: 3 },
  newbook:   { id: '15108105', name: '신착자료',                   url: `${B}/newbook/getNewbook`,      priority: 3 },
  rcrit:     { id: '15079125', name: '통일부 채용공고',            url: `${B}/rcrit/getRcrit`,          priority: 3 },
}

/* 필수 파라미터가 빠지면 resultCode 11 이 온다. 이름이 서비스마다 달라서
   문서 대신 '사다리'로 좁힌다 — 위에서부터 하나씩 얹어보고 통과하는 조합을 채택한다.
   추측을 난사하지 않기 위해 후보는 통일부 API 에서 실제로 관찰된 것들로만 짰다. */
export const PARAM_LADDER = [
  {},
  { type: 'json' },
  { _type: 'json' },
  { bgng_ymd: '19480101', end_ymd: 'TODAY', type: 'json' },
  { bgng_ymd: '19480101', end_ymd: 'TODAY' },
  { searchWrd: '', type: 'json' },
  { keyword: '', type: 'json' },
  { srchwrd: '', type: 'json' },
  { cl: 'ALL', type: 'json' },
]

export const BASE_PARAMS = { pageNo: 1, numOfRows: 10 }
