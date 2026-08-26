// AI 스튜디오 엔진 — 가족 이야기를 영상·사진 생성 AI 프롬프트로 바꾸는 규칙 템플릿
//
// LLM 4원칙 (CLAUDE.md §5) — 이 파일이 스튜디오에서의 구현체다. 타협 대상이 아니다.
//   ① 규칙이 먼저 — buildStudioOutput() 이 네트워크 0에서도 5구획 전부를 완성해 낸다.
//   ② LLM 은 다듬기만 — 문장 이음새 정리와 한국어 이야기의 영어 옮김뿐.
//      validateStudio() 가 입력에 없는 숫자가 하나라도 나오면 출력 전체를 폐기한다.
//   ③ 스키마 밖이면 폐기 — 출력은 닫힌 스키마 {ko, en} 뿐이다.
//   ④ 네트워크가 죽어도 동작 — 템플릿 산출이 기본이고, 다듬기는 있으면 얹는 것이다.
//
// 이 파일은 브라우저(Vite)·Cloudflare Pages Functions·node 검증 스크립트 셋이 공유한다.
// 그래서 의존이 0개다 — theme/gohyang.ts(TS)를 끌어오지 않는다.
//
// ★ 조립은 결정적이다: 같은 입력 = 같은 출력. Math.random()·Date.now() 금지.
//   scripts/verify-studio.mjs 가 고정 입력으로 두 번 돌려 글자 단위 일치를 잰다.

/* ══════════ 지역 — pick-items regionsOld 7종과 같은 id, 영문은 확정 대응 ══════════
   직접 입력은 한글 그대로 + 일반 표현, 모름은 「북녘의 고향」으로만 말한다(없는 지명을 만들지 않는다). */
export const STUDIO_REGIONS = [
  { id: 'hwanghae-old', ko: '황해도(구)', en: 'Hwanghae Province' },
  { id: 'pyongan-s-old', ko: '평안남도(구)', en: 'South Pyongan Province' },
  { id: 'pyongan-n-old', ko: '평안북도(구)', en: 'North Pyongan Province' },
  { id: 'hamgyong-s-old', ko: '함경남도(구)', en: 'South Hamgyong Province' },
  { id: 'hamgyong-n-old', ko: '함경북도(구)', en: 'North Hamgyong Province' },
  /* ★ 미수복경기·미수복강원의 영문은 한글 라벨과 「같은 폭」이어야 한다.
     예전에 'Kaesong area' · 'Mount Kumgang area' 라고 적었는데, 이용자가 고른 적도
     사료에 있지도 한글 라벨에 있지도 않은 지명을 프롬프트에 심는 것이었다.
     미수복강원은 철원·김화·평강·회양·통천·고성을 아우른다 — 그 전부를 금강산 일대로
     좁혀 단정하면 철원 출신 이용자에게 금강산을 그리라고 시키는 셈이다.
     특정 지명은 이용자가 직접 입력했거나 사료 제목에 있을 때만 쓴다. */
  { id: 'gyeonggi-unrec', ko: '미수복경기', en: 'the unrecovered northern part of Gyeonggi Province' },
  { id: 'gangwon-unrec', ko: '미수복강원', en: 'the unrecovered northern part of Gangwon Province' },
]

export const STUDIO_MEDIA = [
  { id: 'photo', label: '사진 생성', sub: '한 장의 장면을 만드는 프롬프트' },
  { id: 'video', label: '영상 생성', sub: '짧은 영상을 만드는 프롬프트' },
]

export const STUDIO_RATIOS = [
  { id: '16:9', label: '16:9', sub: '가로 — TV·유튜브' },
  { id: '9:16', label: '9:16', sub: '세로 — 숏폼·릴스' },
  { id: '1:1', label: '1:1', sub: '정사각 — 사진·인스타그램' },
]

/* ══════════ 분위기 6종 — ko/en 절은 데이터로 내장(없는 번역을 즉석에서 만들지 않는다) ══════════ */
export const STUDIO_MOODS = [
  { id: 'docu', label: '옛 사진 다큐', ko: '빛바랜 옛 사진의 질감, 다큐멘터리 정지화면 느낌', en: 'faded archival photograph texture, documentary still' },
  { id: 'family', label: '따뜻한 가족', ko: '저녁빛이 도는 따뜻한 색, 가족의 온기', en: 'warm golden-hour light, tender family atmosphere' },
  { id: 'cinema', label: '영화적 재회', ko: '영화의 한 장면 같은 구도, 얕은 심도', en: 'cinematic composition, shallow depth of field' },
  { id: 'newsreel', label: '기록영상', ko: '오래된 기록영상 느낌, 필름 그레인', en: 'vintage newsreel look, film grain' },
  { id: 'bw-color', label: '흑백에서 컬러', ko: '흑백에서 천천히 색이 번져 드는 전환', en: 'black-and-white slowly blooming into color' },
  { id: 'past-now', label: '과거에서 현재', ko: '과거 장면에서 오늘의 풍경으로 이어지는 전환', en: 'a transition from a past scene to the present day' },
]

/* ══════════ 이야기 단서 6갈래 ══════════
   칩마다 장면 문구(ko/en)를 미리 붙박아 둔다 — 즉석 조사(을/를) 조립과 즉석 번역을 피하는 방법이다.
   scene 이 null 인 칩(「모릅니다」)은 프롬프트에 아무 문장도 만들지 않는다. */
export const STUDIO_STORY_GROUPS = [
  {
    id: 'place', title: '장소', question: '어떤 자리 이야기를 들으셨습니까?',
    placeholder: '예: 겨울이면 우물이 얼어 새벽에 물을 길으셨다고 합니다',
    chips: [
      { id: 'home', label: '집과 마당', sceneKo: '마당 있는 옛집', sceneEn: 'an old house with a courtyard' },
      { id: 'well', label: '우물가', sceneKo: '우물가가 있는 마을', sceneEn: 'a village well' },
      { id: 'market', label: '장(시장)', sceneKo: '장이 서던 저잣거리', sceneEn: 'a country market street' },
      { id: 'school', label: '학교 가는 길', sceneKo: '학교 가는 흙길', sceneEn: 'a dirt road to school' },
      { id: 'sea', label: '바닷가와 나루', sceneKo: '바닷가와 나루', sceneEn: 'a seaside and a ferry landing' },
      { id: 'field', label: '논밭과 과수원', sceneKo: '논밭과 과수원', sceneEn: 'rice fields and an orchard' },
      { id: 'station', label: '기차역', sceneKo: '작은 기차역', sceneEn: 'a small railway station' },
      { id: 'hill', label: '산과 고개', sceneKo: '산과 고갯길', sceneEn: 'mountains and a hill pass' },
    ],
  },
  {
    id: 'food', title: '음식', question: '자주 말씀하신 음식이 있습니까?',
    placeholder: '예: 명절이면 온 집이 만두를 빚었다고 하셨습니다',
    chips: [
      { id: 'noodle', label: '국수', sceneKo: '국수를 나누는 저녁상', sceneEn: 'a supper table sharing noodles' },
      { id: 'tteok', label: '떡', sceneKo: '떡을 빚는 손', sceneEn: 'hands shaping rice cakes' },
      { id: 'kimchi', label: '김치와 식해', sceneKo: '김치와 식해가 오른 상', sceneEn: 'a table with kimchi and fermented fish' },
      { id: 'holiday', label: '명절 음식', sceneKo: '명절 음식을 차린 상', sceneEn: 'a holiday feast table' },
      { id: 'etc', label: '그 밖의 음식', sceneKo: '정성껏 차린 저녁상', sceneEn: 'a carefully set supper table' },
    ],
  },
  {
    id: 'work', title: '직업·일', question: '그분은 무슨 일을 하셨습니까?',
    placeholder: '예: 장날마다 소를 끌고 장에 나가셨다고 합니다',
    chips: [
      { id: 'farm', label: '농사', sceneKo: '농사를 짓던 사람들', sceneEn: 'people farming the fields' },
      { id: 'fish', label: '고기잡이', sceneKo: '고기잡이하던 사람들', sceneEn: 'people fishing at sea' },
      { id: 'trade', label: '장사', sceneKo: '장에서 장사하던 사람들', sceneEn: 'people trading at the market' },
      { id: 'teach', label: '공부와 가르치는 일', sceneKo: '글을 가르치던 방', sceneEn: 'a room where people studied and taught' },
      { id: 'craft', label: '기술과 공장 일', sceneKo: '연장을 쥔 일하는 손', sceneEn: 'working hands holding tools' },
      { id: 'unknown', label: '모릅니다', sceneKo: null, sceneEn: null },
    ],
  },
  {
    id: 'family', title: '가족 구성', question: '그때 집에는 누가 함께 살았습니까?',
    placeholder: '예: 오남매의 맏이셨다고 들었습니다',
    chips: [
      { id: 'many', label: '형제가 많던 집', sceneKo: '형제가 많던 북적이는 집', sceneEn: 'a lively home full of siblings' },
      { id: 'three-gen', label: '조부모까지 한집', sceneKo: '조부모까지 한집에 살던 집', sceneEn: 'three generations under one roof' },
      { id: 'small', label: '단출한 집', sceneKo: '단출한 식구의 조용한 집', sceneEn: 'a small quiet household' },
      { id: 'unknown', label: '모릅니다', sceneKo: null, sceneEn: null },
    ],
  },
  {
    id: 'saying', title: '자주 하던 말', question: '입버릇처럼 하시던 말씀이 있습니까?',
    placeholder: '예: 「고향 국수만 하겠니」 하셨습니다',
    chips: [],
  },
  {
    id: 'photo', title: '사진 속 장소', question: '가지고 계신 가족 사진이 있다면, 어디에서 찍은 사진입니까?',
    placeholder: '예: 마당에서 찍은 흑백 사진이 한 장 있습니다',
    note: '본인 가족이 소장한 사진만 쓰십시오.',
    chips: [],
  },
]

/* ══════════ 사료 갈래 5종 + 규칙 분류 ══════════
   원천은 reunion.json htgallery 129장(정적 코퍼스, 수집 2026-08-21).
   scripts/nk-studio-photos.mjs 가 이 분류기를 돌려 studio-photos.ts 를 생성하고,
   scripts/verify-studio.mjs 가 같은 분류기로 재분류해 전 항목 1갈래·합 129 를 고정한다. */
export const RELIC_CATS = [
  { id: 'street', label: '거리·장터', en: 'street and market' },
  { id: 'coast', label: '바닷가', en: 'seaside' },
  { id: 'nature', label: '자연', en: 'natural landscape' },
  { id: 'living', label: '생활·마을', en: 'village life' },
  { id: 'heritage', label: '유적·옛 건물', en: 'historic building' },
]
export const RELIC_CAT_LABEL = Object.fromEntries(RELIC_CATS.map((c) => [c.id, c.label]))
export const RELIC_CAT_EN = Object.fromEntries(RELIC_CATS.map((c) => [c.id, c.en]))

/* 명시 예외 — 키워드 규칙이 틀리는 실측 확인분(129장 전수를 보고 굳혔다) */
const RELIC_OVERRIDE = {
  F000280251: 'living',    // 관덕정(觀德亭)의 아이들 — 「~정」보다 아이들이 주제
  F000280343: 'living',    // 모란봉 최승대에서 본 평양 전경 — 도시 전경
  F000280214: 'heritage',  // 평양성 동암문 — 모란봉 유적
  F000280245: 'living',    // 삼지연시 — 읍내 전경
  F000280715: 'heritage',  // 장수산 현암
  F000280288: 'street',    // 연등회가 열린 개성 시가지 옛풍경 — 시가지 우선
  F000280222: 'street',
  F000280280: 'living',    // 만월대 옆 인삼농장 옛풍경 — 농장이 주제(만월대는 곁)
}

const KW = {
  coast: ['항 ', '항풍경', '어촌', '몽금포', '해금강'],
  street: ['시장', '거리', '도로', '시가지', '다리', '성천교', '만세교', '선죽교', '좌견교',
    '대동문', '보통문', '남대문', '도찰문', '눌리문', '통덕문', '개성역'],
  heritage: ['개심사', '신계사', '장안사', '휴정사', '관음사', '성불사', '귀진사', '월정사', '삼성사', '계성사',
    '육승정', '애련정', '청류정', '불영대', '승전대', '경암루', '백상루', '인풍루',
    '서원', '성균관', '만월대', '고인돌', '산성', '읍성', '나성', '성곽', '암문', '표충각', '현암'],
  living: ['마을', '모내기', '추수', '밭', '농장', '농촌', '국수집', '아이들', '그네', '수학여행',
    '중학교', '떼몰이', '도시풍경', '연풍동', '옛 모습', '옛풍경', '연등회', '시 전경'],
}

/** placeName(NFC) → 갈래 id. 위에서부터 첫 일치 승 — 순서가 곧 모호성 해소다. 기본값은 자연. */
export function classifyRelic(fileId, placeName) {
  if (RELIC_OVERRIDE[fileId]) return RELIC_OVERRIDE[fileId]
  const s = String(placeName ?? '').normalize('NFC')
  const pad = s + ' '                           // 「나진항 풍경」의 '항 ' 꼬리 일치용
  if (KW.coast.some((k) => pad.includes(k)) || /항$/.test(s)) return 'coast'
  if (KW.street.some((k) => s.includes(k))) return 'street'
  if (KW.heritage.some((k) => s.includes(k))) return 'heritage'
  /* 「묘」는 꼬리 일치만 본다 — 부분 일치로 재면 묘향산을 능묘로 오인한다 */
  if (/묘$/.test(s.replace(/\([^()]*\)/g, '').trim())) return 'heritage'
  if (KW.living.some((k) => s.includes(k))) return 'living'
  return 'nature'
}


/* ══════════ 권장 길이 — 고정 표 ══════════ */
export const LENGTH_GUIDE = [
  { medium: 'video', ratio: '9:16', length: '15~30초', scenes: '3~4장면(장면당 5~8초)' },
  { medium: 'video', ratio: '16:9', length: '30~60초', scenes: '4~6장면' },
  { medium: 'video', ratio: '1:1', length: '15~30초', scenes: '3장면' },
  { medium: 'photo', ratio: '*', length: '—', scenes: '구도 1~3안' },
]
export function lengthGuideOf(medium, ratio) {
  return LENGTH_GUIDE.find((r) => r.medium === medium && (r.ratio === ratio || r.ratio === '*')) ?? LENGTH_GUIDE[3]
}

/* ══════════ 플랫폼 안내 — 정적 큐레이션(지어낸 스펙 0) ══════════
   요금·길이 상한·해상도 같은 구체 조건은 적지 않는다(자주 바뀐다).
   verify-studio.mjs 가 이 텍스트에 가격·해상도·초 단위 숫자가 없는지 검사한다. */
export const PLATFORM_GUIDE = {
  asOfLine: '2026년 8월 기준의 일반 안내입니다. 요금·길이 상한·해상도 같은 구체 조건은 자주 바뀌므로 여기 적지 않습니다 — 반드시 각 서비스의 공식 안내에서 확인하십시오.',
  video: [
    { name: 'OpenAI Sora', desc: '문장으로 짧은 영상을 만드는 도구입니다. 위의 영문 프롬프트를 붙여 넣고, 비율 설정이 있으면 고른 비율로 맞추십시오.', official: 'openai.com/sora' },
    { name: 'Google Veo (Gemini·Flow)', desc: '구글의 영상 생성 모델로, Gemini 앱 등에서 쓸 수 있습니다. 제공 여부와 기능은 계정·지역에 따라 다릅니다.', official: 'gemini.google' },
    { name: 'Runway', desc: '웹에서 쓰는 영상 생성·편집 도구입니다. 이미지 참조 기능이 있는 도구에서는 본인 가족이 소장한 사진을 출발점으로 쓸 수 있습니다.', official: 'runwayml.com' },
    { name: '그 밖의 서비스', desc: 'Kling, Pika 등도 대체로 「프롬프트 + 참조 이미지」 방식입니다. 사용 전 공식 문서를 확인하십시오.', official: null },
  ],
  photo: [
    { name: 'ChatGPT 이미지 생성(OpenAI)', desc: '대화창에 프롬프트를 붙여 넣으면 됩니다.', official: 'chatgpt.com' },
    { name: 'Google Gemini 이미지 생성', desc: '같은 방식입니다.', official: 'gemini.google.com' },
    { name: 'Midjourney', desc: '프롬프트 끝에 화면 비율을 지정하는 옵션이 있습니다(공식 문서 참조).', official: 'midjourney.com' },
    { name: 'Adobe Firefly', desc: '어도비 계정으로 웹에서 씁니다.', official: 'adobe.com/products/firefly' },
  ],
  common: [
    '서비스 접속·로그인',
    '영문 프롬프트 붙여넣기(한글 지원 여부는 서비스마다 다름)',
    '비율 설정(지원 시)',
    '본인 소장 사진 업로드(이미지 참조 기능이 있는 경우에만, 본인 가족 소장분만)',
    '결과 검토 — 생성물은 상상의 재현임을 기억하십시오',
  ],
}

/* ══════════ 고지 문구 — 확정 전문(화면과 검증이 같은 원본을 본다) ══════════
   privacy 는 2벌이다 — 「AI로 다듬기」 단추가 없는 환경(/api/llm 부재, dev 포함)에서
   화면에 없는 단추를 가리키는 문장을 내보내지 않기 위해서다(privacyNoLlm).
   imagined 도 2벌 — 이야기 입력이 0인 풍경 중심 경로에서 「들려주신 이야기」가 거짓이 된다(imaginedScenery).

   ★ 아래 8키는 확정 전문이다. 한 글자도 바꾸지 마라(verify-studio 가 문장을 붙들고 있다).
     directionNote / periodGeneric / reproNote / negFallback 4키는 정밀 프롬프트와 함께 들어온
     신규분이며, 각각 「연출 설정은 사실이 아니다」·「시대 일반 표현은 이 고향의 주장이 아니다」·
     「재현성을 과장하지 않는다」·「네거티브 칸이 없는 도구에서는 부정어를 본문에 넣지 마라」를 맡는다. */
export const STUDIO_NOTICES = {
  privacy: '입력하신 이야기는 이 브라우저 안에서만 처리되며 어디에도 저장되지 않습니다. 「AI로 다듬기」를 누르실 때에만 문장을 다듬기 위해 저희 서버를 거쳐 Gemini에 한 번 전달되고, 전달된 내용은 저장하지 않습니다. 누르지 않으면 아무것도 전송되지 않습니다.',
  privacyNoLlm: '입력하신 이야기는 이 브라우저 안에서만 처리되며 어디에도 저장되지 않습니다. 이 화면에서는 어떤 내용도 서버로 전송되지 않습니다.',
  rights: '생성 AI에 올리는 사진은 본인 가족이 소장한 사진만 쓰십시오. 이 화면의 사료 사진은 통일부 「나의 살던 고향은」 게재분으로 저작권이 각 제공처에 있어, 화면에서 보며 참고만 하고 생성 AI 입력으로 쓰지 않습니다.',
  imagined: '생성물은 들려주신 이야기를 바탕으로 한 상상의 재현입니다. 실제 고향의 모습, 실제 가족의 모습과 다를 수 있습니다.',
  imaginedScenery: '생성물은 옛 자료를 참고한 상상의 재현입니다. 실제 고향의 모습과 다를 수 있습니다.',
  sourceSplit: '사료 사진: 통일부 이산가족정보통합시스템 게재 · 저작권은 각 제공처. 그 밖의 안내 문구는 통일부 자료가 아닙니다.',
  relicUse: '이 사료는 보며 참고하는 자료입니다 — 저작권이 각 제공처에 있어 생성 AI에 올리지 않습니다. 화면에 띄워 두고 장면 묘사와 맞는지 견주어 보십시오.',
  memoryOnly: '이 화면을 떠나면 입력한 내용이 사라집니다 — 어디에도 저장되지 않습니다.',
  directionNote: '「연출 설정」의 시각·렌즈·색은 저희가 정한 촬영값입니다. 그 고향에 실제로 그랬다는 뜻이 아닙니다.',
  periodGeneric: '「시대 일반 표현」 블록은 그 시기 한반도 북부에서 일반적으로 볼 수 있던 모습을 적은 것이며, 이 고향에 실제로 그것이 있었다는 뜻이 아닙니다.',
  reproNote: '같은 모델에 같은 시드와 같은 설정을 쓰시면 거의 같은 그림이 나옵니다. 모델이 다르면 결만 비슷해집니다. 시드 칸이 없는 도구에서는 매번 달라집니다. 프롬프트만으로 완전히 같은 그림을 만들 수는 없습니다.',
  negFallback: '네거티브 프롬프트 칸이 없는 도구에서는 금지 목록을 본문에 붙이지 마십시오 — 오히려 그것이 불려 나옵니다. 대신 아래 긍정 치환문을 쓰십시오.',
}

/* ══════════ ★ 출처 라벨 4종 — 이 서비스의 정체성 ══════════
   프롬프트를 「출처가 다른 블록」으로 갈라 라벨을 붙인다. 라벨을 뗀 복사본을 만들지 마라.
     account   들려주신 이야기 — 이용자가 적은 말. 원문 그대로. 손대지 않는다.
     archive   고른 사료에서   — 실제로 고른 사료의 제목·갈래에서만 나온 묘사.
     direction 연출 설정       — 렌즈·광원·입자·색. 사실 주장이 아니라 우리가 정한 값이다.
     period    시대 일반 표현  — 그 시기 한반도 북부의 일반적 표현. 이 고향에 대한 주장이 아니다.
   tone 은 theme/gohyang.ts 의 TEXT 토큰 키다(새 색을 만들지 않는다). */
export const STUDIO_SOURCE_LABELS = [
  { id: 'account', badge: '● 들려주신 이야기', tone: 'ink', note: '적어 주신 말 그대로입니다 — 저희가 고치지 않았습니다' },
  { id: 'archive', badge: '● 고른 사료에서', tone: 'blue', note: '고르신 사료의 제목과 갈래에서만 왔습니다' },
  { id: 'direction', badge: '● 연출 설정', tone: 'soft', note: '저희가 정한 촬영값입니다 — 그 고향의 사실이 아닙니다' },
  { id: 'period', badge: '● 시대 일반 표현', tone: 'stale', note: '그 시기 한반도 북부의 일반적 표현입니다 — 이 고향에 대한 주장이 아닙니다' },
]

/* 산출 ③(영상 구성·구도 제안)의 줄 조각에 붙는 배지 — 프롬프트 본문과 같은 낱말을 쓴다.
   화면에서도 출처를 갈라 보여야 한다는 규약이 프롬프트 밖에서 깨지지 않게 하는 자리다.
   'none' 만 새로 있다 — 「출처가 없다」가 아니라 「이야기를 적지 않으셨다」는 뜻이라, 없는 이야기를
   지어내는 대신 자리를 비웠음을 화면에 그대로 적는다. */
export const STUDIO_LINE_BADGES = Object.fromEntries([
  ...STUDIO_SOURCE_LABELS.filter((s) => s.id !== 'period').map((s) => [s.id, { badge: s.badge, tone: s.tone }]),
  ['none', { badge: '● 비어 있음', tone: 'stale' }],
])

/* ══════════ 블록 머리 문자열 ══════════
   ko/en = 정밀판, koShort/enShort = 간단판. 간단판도 라벨을 반드시 달고 나간다 —
   토큰이 아까워도 출처 표기를 떼지 않는다. 다만 설명 꼬리만 줄인다. */
export const STUDIO_BLOCK_HEADS = {
  format: {
    ko: '[화면]', en: '[FORMAT]',
    koShort: '[화면]', enShort: '[FORMAT]',
  },
  account: {
    ko: '[들려주신 이야기 — 적어 주신 말 그대로]',
    en: "[FAMILY ACCOUNT — the user's own words, kept in Korean, do not translate or alter]",
    koShort: '[들려주신 이야기]', enShort: '[FAMILY ACCOUNT — Korean, keep as-is]',
  },
  archive: {
    ko: '[고른 사료에서 — 제목과 갈래만]',
    en: '[ARCHIVAL REFERENCE — title and category only, nothing added]',
    koShort: '[고른 사료에서]', enShort: '[ARCHIVAL REFERENCE]',
  },
  direction: {
    ko: '[연출 설정 — 저희가 정한 촬영값. 그 고향의 사실이 아닙니다]',
    en: '[DIRECTION — camera, light, film and colour values chosen by us; not factual claims]',
    koShort: '[연출 설정]', enShort: '[DIRECTION]',
  },
  period: {
    ko: '[시대 일반 표현 — 그 시기 한반도 북부의 일반적 표현. 이 고향에 대한 주장이 아닙니다]',
    en: '[PERIOD-GENERIC — typical of northern Korea in this era; not a claim about this particular hometown]',
    koShort: '[시대 일반 표현]', enShort: '[PERIOD-GENERIC]',
  },
  negative: {
    ko: '[금지 — 화면에 나오면 안 되는 것]', en: '[NEGATIVE — must not appear]',
    koShort: '[금지]', enShort: '[NEGATIVE]',
  },
  repro: {
    ko: '[재현 설정]', en: '[REPRODUCIBILITY]',
    koShort: '[재현 설정]', enShort: '[REPRODUCIBILITY]',
  },
}
export const STUDIO_BLOCK_ORDER = ['format', 'account', 'archive', 'direction', 'period', 'negative', 'repro']

/** 8구획 — 정밀 프롬프트가 반드시 값을 못 박아야 하는 사양 영역. verify-studio 가 이 이름으로 잰다. */
export const STUDIO_SPEC_SECTIONS = ['매체·화면', '촬영', '광원', '매체 질감', '색', '구도', '금지', '재현']

/* ══════════ 분위기 6종 × 촬영 프리셋 ══════════
   ★ 여기 값은 전부 「연출 설정」이다 — 그 고향의 사실이 아니라 저희가 정한 촬영 선택이다.
     그래서 마음껏 정밀해도 된다. 정밀도의 대부분을 여기서 얻는다.
   ★ 색 이름은 「일반 색명 + hex」만 쓴다. 지명·인명과 결합하지 마라(지역 특산처럼 읽힌다).
   ★ 복식·건축은 여기 두지 않는다 — PERIOD_GENERIC(시대 일반 표현)에만 둔다. */
export const MOOD_SHOT = {
  docu: {
    shotPhotoKo: '와이드 설정샷, 35mm, f/8, 카메라 높이 1.6미터, 수평 앵글 0도, 과초점 3미터부터 무한대까지 전역 선명',
    shotPhotoEn: 'wide establishing shot, 35mm lens, f/8, camera height 1.6 m, level angle, hyperfocal focus 3 m to infinity, deep focus throughout',
    /* 영상 줄은 사진 줄을 참조하지 않고 광학을 통째로 다시 못박는다 —
       영상 프롬프트에는 사진 줄이 실리지 않으므로 「위와 같은 광학」이라고 쓰면 값이 통째로 사라진다(실측). */
    shotVideoKo: '와이드 설정샷, 35mm, f/8, 카메라 높이 1.6미터, 수평 앵글 0도, 과초점 3미터부터 무한대까지 전역 선명, 삼각대 완전 고정 또는 초당 1퍼센트의 느린 푸시인, 초당 24프레임, 셔터 1/48',
    shotVideoEn: 'wide establishing shot, 35mm lens, f/8, camera height 1.6 m, level angle, hyperfocal focus 3 m to infinity, deep focus throughout, locked tripod or a slow 1 percent per second push-in, 24 fps, 1/48 shutter',
    lightKo: '오전 10시 30분, 태양 고도 42도, 카메라 왼쪽 45도 측광, 옅은 실안개로 반쯤 부드러워진 빛, 5200K, 중간 대비 약 4스톱, 그림자 길이는 피사체 높이의 1.1배',
    lightEn: '10:30 in the morning, sun elevation 42 degrees, three-quarter side light from camera left, half-softened by light haze, 5200 K, medium contrast about 4 stops, shadows about 1.1 times subject height',
    textureKo: '은염 인화지를 스캔한 결, 입자 중간(ISO 200 상당), 비네팅 약함(모서리 -0.3스톱), 헐레이션 없음, 먼지와 잔스크래치 드문드문, 가장자리 선예도가 중심보다 낮음',
    textureEn: 'scanned silver-gelatin print, medium grain equivalent to ISO 200, light vignette of -0.3 stop at the corners, no halation, sparse dust and fine scratches, edge sharpness lower than the centre',
    paletteKo: '종이 아이보리 #E8DFCC 40퍼센트, 중간 웜그레이 #9A8F7E 30퍼센트, 짙은 세피아 #4A3B2A 20퍼센트, 바랜 하늘빛 #CFC9BA 10퍼센트, 채도 10퍼센트, 세피아 쪽으로 기움',
    paletteEn: 'paper ivory #E8DFCC 40 percent, mid warm grey #9A8F7E 30 percent, deep sepia #4A3B2A 20 percent, faded sky #CFC9BA 10 percent, saturation 10 percent, tinted toward sepia',
    negKo: ['얕은 심도', '보케', '선명한 원색', '디지털 샤프닝', '모션블러'],
    negEn: ['shallow depth of field', 'bokeh', 'vivid primary colours', 'digital sharpening', 'motion blur'],
    briefKo: '와이드 35mm f/8, 오전 측광 5200K, 입자 중간, 바랜 세피아',
    briefEn: 'wide 35mm f/8, mid-morning side light 5200K, medium grain, faded sepia',
  },
  family: {
    shotPhotoKo: '미디엄샷, 50mm, f/2.8, 카메라 높이 1.15미터(앉은 눈높이), 위로 4도, 초점은 상 위의 손, 배경은 3미터 뒤부터 흐림',
    shotPhotoEn: 'medium shot, 50mm lens, f/2.8, camera height 1.15 m at seated eye level, tilted up 4 degrees, focus on the hands at the table, background falling out of focus from 3 m back',
    shotVideoKo: '미디엄샷, 50mm, f/2.8, 카메라 높이 1.15미터(앉은 눈높이), 위로 4도, 초점은 상 위의 손, 고정 삼각대에 아주 느린 좌에서 우 팬 8도(초당 1도), 초당 24프레임',
    shotVideoEn: 'medium shot, 50mm lens, f/2.8, camera height 1.15 m at seated eye level, tilted up 4 degrees, focus on the hands at the table, locked tripod with a very slow 8 degree pan from left to right at 1 degree per second, 24 fps',
    lightKo: '해 지기 40분 전 오후 5시 40분, 태양 고도 10도, 카메라 뒤 왼쪽 3/4 역광, 창호지와 흰 벽 반사로 부드러움, 키 3200K 그늘 4500K, 낮은 대비 2.5스톱, 그림자 길이는 피사체 높이의 4배',
    lightEn: '40 minutes before sunset at 17:40, sun elevation 10 degrees, three-quarter backlight from behind camera left, softened by paper-screen and white-wall bounce, key 3200 K and shade 4500 K, low contrast about 2.5 stops, shadows about 4 times subject height',
    textureKo: '컬러 네거티브 필름, 입자 곱고 옅음, 비네팅 중간 -0.5스톱, 하이라이트에 헐레이션 번짐, 스크래치 없음, 가장자리 부드러움',
    textureEn: 'colour negative film, fine light grain, medium vignette of -0.5 stop, visible halation bloom on highlights, no scratches, soft edges',
    paletteKo: '호박빛 #D9A05B 35퍼센트, 쌀빛 흰색 #EFE3CE 25퍼센트, 짙은 나무 갈색 #5A3E28 20퍼센트, 흐린 올리브 #7B8B63 12퍼센트, 그늘 남색 #2E3A46 8퍼센트, 채도 85퍼센트, 따뜻한 호박색 쪽',
    paletteEn: 'amber #D9A05B 35 percent, rice white #EFE3CE 25 percent, deep wood brown #5A3E28 20 percent, muted olive #7B8B63 12 percent, shadow navy #2E3A46 8 percent, saturation 85 percent, warm amber cast',
    negKo: ['한낮 정수리 그림자', '푸른 색조', '형광등', '군중'],
    negEn: ['harsh midday top light', 'blue cast', 'fluorescent lighting', 'crowds'],
    briefKo: '미디엄 50mm f/2.8, 해질녘 역광 3200K, 고운 입자, 따뜻한 호박색',
    briefEn: 'medium 50mm f/2.8, backlit late afternoon 3200K, fine grain, warm amber',
  },
  cinema: {
    shotPhotoKo: '미디엄 클로즈, 85mm, f/2.0, 카메라 높이 1.5미터, 수평 0도, 초점은 인물 어깨선, 배경은 1.5미터 뒤부터 크게 흐림',
    shotPhotoEn: 'medium close shot, 85mm lens, f/2.0, camera height 1.5 m, level angle, focus on the shoulder line, background strongly defocused from 1.5 m back',
    shotVideoKo: '미디엄 클로즈, 85mm, f/2.0, 카메라 높이 1.5미터, 수평 0도, 초점은 인물 어깨선, 어깨 높이 슬로 트래킹 인(초당 0.15미터), 초당 24프레임, 셔터 1/48',
    shotVideoEn: 'medium close shot, 85mm lens, f/2.0, camera height 1.5 m, level angle, focus on the shoulder line, slow tracking-in at shoulder height at 0.15 m per second, 24 fps, 1/48 shutter',
    lightKo: '이른 아침 7시, 태양 고도 14도, 뒤쪽 오른쪽 역광 림, 얇은 구름으로 확산된 키, 키 5600K 필 5000K, 높은 대비지만 그늘 경계는 부드러움, 그림자 길이는 피사체 높이의 3.5배',
    lightEn: 'early morning at 07:00, sun elevation 14 degrees, rim backlight from behind camera right, key diffused through thin cloud, key 5600 K and fill 5000 K, high contrast with soft shadow edges, shadows about 3.5 times subject height',
    textureKo: '디지털 시네마에 필름 에뮬레이션, 입자 약함, 비네팅 중간, 실내 등불에 헐레이션, 스크래치 없음, 중심부 선명',
    textureEn: 'digital cinema with film emulation, light grain, medium vignette, halation around practical lamps, no scratches, sharp centre',
    paletteKo: '탁한 청록 #3C5560 30퍼센트, 따뜻한 살빛 #C9A184 25퍼센트, 목탄 #22262A 25퍼센트, 옅은 하늘 #B7C4C9 12퍼센트, 흐린 적갈 #8C4A3F 8퍼센트, 채도 70퍼센트, 청록과 주황으로 갈린 색조',
    paletteEn: 'muted teal #3C5560 30 percent, warm skin #C9A184 25 percent, charcoal #22262A 25 percent, pale sky #B7C4C9 12 percent, muted rust #8C4A3F 8 percent, saturation 70 percent, teal and orange split tone',
    negKo: ['평평한 정면광', '어수선한 배경', '광각 왜곡', '과장된 표정'],
    negEn: ['flat frontal lighting', 'cluttered background', 'wide-angle distortion', 'exaggerated expressions'],
    briefKo: '미디엄 클로즈 85mm f/2.0, 이른 아침 림라이트 5600K, 옅은 입자, 청록과 주황',
    briefEn: 'medium close 85mm f/2.0, early morning rim light 5600K, light grain, teal and orange',
  },
  newsreel: {
    shotPhotoKo: '아래 영상 광학으로 뽑아낸 정지 1프레임 — 와이드, 16mm 필름 25mm 렌즈(35mm 환산 약 40mm), f/5.6, 카메라 높이 1.5미터, 수평',
    shotPhotoEn: 'a single frozen frame from the film optics below: wide shot, 25mm lens on 16mm film equivalent to about 40mm, f/5.6, camera height 1.5 m, level',
    shotVideoKo: '와이드, 16mm 필름 25mm 렌즈(35mm 환산 약 40mm), f/5.6, 카메라 높이 1.5미터 어깨 받침, 수평, 미세한 흔들림 0.4도, 초당 24프레임, 셔터 180도',
    shotVideoEn: 'wide shot, 25mm lens on 16mm film equivalent to about 40mm, f/5.6, camera height 1.5 m braced at the shoulder, level, slight sway of 0.4 degrees, 24 fps, 180 degree shutter',
    lightKo: '정오 12시, 태양 고도 66도, 정면 위 직사광, 거친 빛, 5500K, 높은 대비 6스톱, 그림자 길이는 피사체 높이의 0.45배',
    lightEn: 'noon, sun elevation 66 degrees, hard direct light from overhead front, 5500 K, high contrast about 6 stops, shadows about 0.45 times subject height',
    textureKo: '16mm 흑백 리버설, 입자 굵음, 게이트 위브 0.5퍼센트, 세로 스크래치 선 간헐, 노출 플리커 3퍼센트, 비네팅 중간, 가장자리 부드러움',
    textureEn: '16mm black-and-white reversal stock, coarse grain, gate weave of 0.5 percent, intermittent vertical scratch lines, exposure flicker of 3 percent, medium vignette, soft edges',
    paletteKo: '흑 #1A1A1A 30퍼센트, 중간 회색 #7E7E7E 35퍼센트, 밝은 회색 #D6D4CF 25퍼센트, 날아간 흰색 #F2F1EE 10퍼센트, 채도 0퍼센트, 아주 옅은 차가운 중성',
    paletteEn: 'black #1A1A1A 30 percent, mid grey #7E7E7E 35 percent, light grey #D6D4CF 25 percent, blown white #F2F1EE 10 percent, saturation 0 percent, very slightly cool neutral',
    negKo: ['색', '디지털 선예도', '짐벌처럼 매끄러운 이동', '슬로모션'],
    negEn: ['colour', 'digital sharpness', 'smooth gimbal movement', 'slow motion'],
    briefKo: '와이드 40mm 상당 f/5.6, 정오 직사광 5500K, 굵은 입자, 흑백 리버설',
    briefEn: 'wide 40mm equivalent f/5.6, hard noon light 5500K, coarse grain, black-and-white reversal',
  },
  'bw-color': {
    shotPhotoKo: '미디엄 와이드, 35mm, f/4, 카메라 높이 1.5미터, 수평',
    shotPhotoEn: 'medium wide shot, 35mm lens, f/4, camera height 1.5 m, level',
    shotVideoKo: '미디엄 와이드, 35mm, f/4, 카메라 높이 1.5미터, 수평, 초당 1퍼센트 푸시인, 초당 24프레임',
    shotVideoEn: 'medium wide shot, 35mm lens, f/4, camera height 1.5 m, level, 1 percent per second push-in, 24 fps',
    lightKo: '오후 3시, 태양 고도 34도, 왼쪽 측광, 반쯤 부드러움, 5000K, 중간 대비, 그림자 길이는 피사체 높이의 1.5배',
    lightEn: '15:00, sun elevation 34 degrees, side light from the left, half-soft, 5000 K, medium contrast, shadows about 1.5 times subject height',
    textureKo: '앞쪽은 입자 중간에 비네팅 약하고 잔스크래치, 뒤쪽은 입자 곱고 헐레이션 있으며 스크래치 없음',
    textureEn: 'the first half with medium grain, a light vignette and fine scratches, the second half with fine grain, halation and no scratches',
    paletteKo: '끝 상태 기준으로 호박빛 #D9A05B 30퍼센트, 아이보리 #EFE3CE 26퍼센트, 나무 갈색 #5A3E28 20퍼센트, 청록 그늘 #47606B 14퍼센트, 흐린 초록 #7B8B63 10퍼센트, 채도 70퍼센트',
    paletteEn: 'at the end state, amber #D9A05B 30 percent, ivory #EFE3CE 26 percent, wood brown #5A3E28 20 percent, teal shadow #47606B 14 percent, muted green #7B8B63 10 percent, saturation 70 percent',
    negKo: ['딱 잘린 반반 분할 화면', '네온과 형광색', '무지개', '색이 한 번에 켜지는 컷'],
    negEn: ['hard half-and-half split screen', 'neon or fluorescent colours', 'rainbow', 'colour switching on in a single cut'],
    briefKo: '미디엄 와이드 35mm f/4, 오후 측광 5000K, 흑백에서 컬러로 번짐',
    briefEn: 'medium wide 35mm f/4, afternoon side light 5000K, black and white blooming into colour',
    stateVideoKo: '앞 60퍼센트는 은염 흑백, 뒤 40퍼센트는 컬러 네거티브. 화면 중앙에서 바깥으로 2.5초에 걸쳐 색이 번진다 — 경계선 없이 부드럽게 넓어진다.',
    stateVideoEn: 'The first 60 percent in silver-gelatin black and white, the last 40 percent in colour negative. Colour blooms outward from the centre of the frame over 2.5 seconds, spreading softly with no visible boundary line.',
    statePhotoKo: '사진에서는 화면 중앙에만 색이 들어오고 바깥으로 갈수록 흑백으로 남은 한 순간을 담는다. 경계선을 긋지 않는다.',
    statePhotoEn: 'In a still, capture one moment in which colour has reached only the centre of the frame while the outer area stays black and white, with no drawn boundary line.',
  },
  'past-now': {
    shotPhotoKo: '와이드, 35mm, f/5.6, 카메라 높이 1.6미터, 수평',
    shotPhotoEn: 'wide shot, 35mm lens, f/5.6, camera height 1.6 m, level',
    shotVideoKo: '와이드, 35mm, f/5.6, 카메라 높이 1.6미터, 수평, 완전 고정으로 움직임 없음, 초당 24프레임',
    shotVideoEn: 'wide shot, 35mm lens, f/5.6, camera height 1.6 m, level, completely locked with no movement, 24 fps',
    lightKo: '두 상태 모두 오전 10시 30분, 태양 고도 42도, 같은 방향. 과거 5200K, 현재 5600K, 둘 다 중간 대비',
    lightEn: 'both states at 10:30 with sun elevation 42 degrees from the same direction, 5200 K in the past state and 5600 K in the present state, medium contrast in both',
    textureKo: '과거 상태는 입자 중간에 잔스크래치 드문드문, 비네팅 약함. 현재 상태는 입자 없음, 스크래치 없음, 비네팅 없음, 가장자리까지 선명',
    textureEn: 'the past state with medium grain, sparse fine scratches and a light vignette, the present state with no grain, no scratches, no vignette and sharpness to the edges',
    paletteKo: '과거는 종이 아이보리 #E8DFCC 40퍼센트, 중간 웜그레이 #9A8F7E 30퍼센트, 짙은 세피아 #4A3B2A 20퍼센트, 바랜 하늘빛 #CFC9BA 10퍼센트, 채도 10퍼센트. 현재는 회록 #6E7A63 28퍼센트, 콘크리트 회색 #B4B7B2 24퍼센트, 하늘 #9FB6C8 20퍼센트, 흙갈색 #7A6550 18퍼센트, 흰색 #EDEEEC 10퍼센트, 채도 100퍼센트',
    paletteEn: 'the past state uses paper ivory #E8DFCC 40 percent, mid warm grey #9A8F7E 30 percent, deep sepia #4A3B2A 20 percent, faded sky #CFC9BA 10 percent, saturation 10 percent; the present state uses grey-green #6E7A63 28 percent, concrete grey #B4B7B2 24 percent, sky #9FB6C8 20 percent, earth brown #7A6550 18 percent, white #EDEEEC 10 percent, saturation 100 percent',
    negKo: ['좌우 분할 화면', '이중 노출 유령', '화면 위 연도 자막', '시계와 달력 클로즈업'],
    negEn: ['side-by-side split screen', 'double-exposure ghosting', 'year captions on screen', 'close-ups of clocks or calendars'],
    briefKo: '와이드 35mm f/5.6, 오전 측광, 과거 결에서 오늘 결로, 프레이밍 고정',
    briefEn: 'wide 35mm f/5.6, mid-morning side light, past texture shifting to present texture, framing locked',
    stateVideoKo: '앞 55퍼센트는 과거의 결, 뒤 45퍼센트는 오늘의 결. 렌즈와 카메라 높이와 프레이밍은 두 상태가 완전히 같고 질감과 색만 바뀐다.',
    stateVideoEn: 'The first 55 percent in a past texture and the last 45 percent in a present-day texture. Lens, camera height and framing stay identical between the two states and only texture and colour change.',
    statePhotoKo: '사진에서는 과거의 결 한 상태만 담는다.',
    statePhotoEn: 'In a still, render only the past state.',
  },
}

/* ★ past-now 의 「현재」 절반은 반드시 시대 일반 표현 블록에 둔다 —
   그 고향의 오늘을 우리가 알 수 없으므로 「연출 설정」에 두면 사실 주장이 된다(설계 §2-6·§10-G). */
const PAST_NOW_PRESENT_KO = '뒤 절반의 오늘 풍경은 특정 장소의 현재가 아니라 일반적인 오늘의 시골 풍경 표현입니다.'
const PAST_NOW_PRESENT_EN = 'The present-day half is a generic contemporary rural scene, not the actual present-day condition of any specific place.'

/* ══════════ 비율별 구도 — 분위기와 무관하게 비율이 이긴다 ══════════
   heritage 사료를 골랐을 때만 지평선 규칙 대신 건물 상단선 규칙을 쓴다(설계 §3 예외 1개). */
export const COMPOSITION_BY_RATIO = {
  '16:9': {
    horizonKo: '지평선은 화면 위에서 58퍼센트 지점.',
    horizonEn: 'Horizon at 58 percent from the top.',
    restKo: '주피사체는 좌측 삼분할 교점, 화면 폭 33퍼센트·높이 66퍼센트에 놓는다. 전경이 하단 20퍼센트를 채우고, 원경은 상단 25퍼센트. 우측 30~40퍼센트를 비운다. 좌우 최소 여백 8퍼센트. 주피사체를 정중앙에 두지 않는다.',
    restEn: 'The main subject sits on the left third, at 33 percent of the width and 66 percent of the height. The foreground fills the bottom 20 percent and the distance occupies the top 25 percent. Leave the right 30 to 40 percent empty. At least 8 percent margin on the left and right. Do not centre the main subject.',
  },
  '9:16': {
    horizonKo: '지평선은 화면 위에서 38퍼센트 지점.',
    horizonEn: 'Horizon at 38 percent from the top.',
    restKo: '주피사체는 세로 중심축, 화면 폭 50퍼센트·높이 68퍼센트에 놓는다. 전경이 하단 45퍼센트를 채우고, 상단 25퍼센트는 하늘만. 상단 12퍼센트와 하단 18퍼센트는 자막 안전 영역으로 비운다. 좌우 최소 여백 10퍼센트. 가로로 긴 원경을 나열하지 않는다.',
    restEn: 'The main subject sits on the vertical centre line, at 50 percent of the width and 68 percent of the height. The foreground fills the bottom 45 percent and the top 25 percent is sky only. Keep the top 12 percent and the bottom 18 percent empty as a caption-safe area. At least 10 percent margin on the left and right. Do not lay out a wide row of distant scenery.',
  },
  '1:1': {
    horizonKo: '지평선은 화면 위에서 50퍼센트 지점, 오차 2퍼센트 안.',
    horizonEn: 'Horizon at 50 percent from the top, within 2 percent.',
    restKo: '주피사체는 화면 폭 50퍼센트·높이 58퍼센트에 놓는다. 전경이 하단 25퍼센트, 원경이 상단 30퍼센트. 사방 10퍼센트를 균등하게 비운다. 좌우 최소 여백 10퍼센트. 대각선을 강조하는 구도를 쓰지 않는다.',
    restEn: 'The main subject sits at 50 percent of the width and 58 percent of the height. The foreground takes the bottom 25 percent and the distance the top 30 percent. Leave an even 10 percent margin on all four sides. At least 10 percent margin on the left and right. Do not use a diagonally driven composition.',
  },
}
const HERITAGE_TOPLINE_KO = '건물 윗선을 상단 삼분할선, 화면 위에서 33퍼센트에 맞춘다.'
const HERITAGE_TOPLINE_EN = 'Align the top line of the building with the upper third, at 33 percent from the top.'

/* ══════════ 갈래별 전경·중경·원경 배치 — 「연출 설정」이다, 사료에서 온 것이 아니다 ══════════
   ★ 이 표는 한때 「고른 사료에서 — 제목과 갈래만 / nothing added」 블록 안에 실렸다. 그것이 거짓이었다:
     동굴 사진에 「계곡·물·나무·안개」가, 평야·호수 사료에 「돌계단·기둥·처마」가 사료에서 온 묘사처럼
     붙었다. 그래서 블록을 옮겼다 — 여기는 「연출 설정」이고, 문구가 스스로 「이 갈래의 사진에서 흔히
     보이는 배치」라고 밝힌다. 고른 사료에 그것이 있다는 주장이 아니다.
   ★ 갈래가 섞인 다중 선택에서는 아예 내지 않는다(relics[0] 갈래만 보고 나머지에 씌우지 않는다).
   ★ 어휘 금고 — 아래 vault 밖의 낱말을 쓰지 않는다. verify-studio 가 금고를 검사한다.
   ★ 고유명사는 여기에 한 개도 넣지 않는다. */
export const RELIC_SCENE = {
  street: {
    ko: '전경은 흙길 노면과 바퀴 자국, 중경은 사람들과 좌판, 처마와 담장, 원경은 능선.',
    en: 'Foreground: earth road, ruts. Mid-ground: people, stalls, eaves, wall. Distance: ridge.',
    vaultKo: ['흙길', '노면', '바퀴 자국', '사람들', '좌판', '처마', '담장', '능선'],
    vaultEn: ['earth road', 'ruts', 'people', 'stalls', 'eaves', 'wall', 'ridge'],
  },
  coast: {
    ko: '전경은 모래와 자갈, 중경은 배와 나루, 그물, 원경은 수평선과 바다, 섬.',
    en: 'Foreground: sand, pebbles. Mid-ground: wooden boat, ferry landing, nets. Distance: horizon, sea, island.',
    vaultKo: ['모래', '자갈', '배', '나루', '그물', '수평선', '바다', '섬'],
    vaultEn: ['sand', 'pebbles', 'wooden boat', 'ferry landing', 'nets', 'horizon', 'sea', 'island'],
  },
  nature: {
    ko: '전경은 풀과 바위, 중경은 계곡과 물, 나무, 원경은 산줄기와 안개.',
    en: 'Foreground: grass, rocks. Mid-ground: valley, stream, trees. Distance: mountain ridges, mist.',
    vaultKo: ['풀', '바위', '계곡', '물', '나무', '산줄기', '안개'],
    vaultEn: ['grass', 'rocks', 'valley', 'stream', 'trees', 'mountain ridges', 'mist'],
  },
  living: {
    ko: '전경은 마당의 항아리와 멍석, 중경은 지붕과 집, 담장, 원경은 언덕과 밭.',
    en: 'Foreground: yard, jars, straw mat. Mid-ground: roofs, houses, wall. Distance: hill, fields.',
    vaultKo: ['마당', '항아리', '멍석', '지붕', '집', '담장', '언덕', '밭'],
    vaultEn: ['yard', 'jars', 'straw mat', 'roofs', 'houses', 'wall', 'hill', 'fields'],
  },
  heritage: {
    ko: '전경은 돌계단과 마당, 중경은 기둥과 처마, 지붕, 원경은 숲과 산.',
    en: 'Foreground: stone steps, earthen yard. Mid-ground: pillars, eaves, roof. Distance: woods, mountain.',
    vaultKo: ['돌계단', '마당', '기둥', '처마', '지붕', '숲', '산'],
    vaultEn: ['stone steps', 'earthen yard', 'pillars', 'eaves', 'roof', 'woods', 'mountain'],
  },
}
/** 어휘 금고 검사용 연결어 — 금고 밖 낱말 검출은 「금고 + 이 목록」을 지운 뒤 한글이 남는지로 잰다.
 *  이 목록을 늘리면 검사가 헐거워진다. 새 묘사어를 넣고 싶으면 금고에 넣어라. */
export const RELIC_SCENE_GLUE_KO = ['전경은', '중경은', '원경은', '과', '와', '의']
export const RELIC_SCENE_GLUE_EN = ['Foreground', 'Mid-ground', 'Distance']
const RELIC_SPLIT_KO = '사료가 둘 이상이면 한 화면에 섞지 말고 장면을 나누십시오.'
const RELIC_SPLIT_EN = 'Do not merge two archival references into one frame; keep them in separate shots.'
/** 갈래 배치를 「연출 설정」 블록에 실을 때 앞에 붙는 머리 — 사료 주장이 아님을 문장 안에서 밝힌다 */
const RELIC_SCENE_LEAD_KO = '배치(이 갈래의 사진에서 흔히 보이는 배치입니다 — 고르신 사료에 그것이 있다는 뜻이 아닙니다):'
const RELIC_SCENE_LEAD_EN = 'Layout typical of photographs in this category, not a claim about the chosen archival photo:'

/* ══════════ 시대 일반 표현 — 전 분위기 공통 고정 문구 ══════════
   복식·건축은 오직 여기 있다. 지역명과 양식어를 결합하지 마라(「황해도식 초가지붕」 금지). */
const PERIOD_GENERIC_KO = '분단 이전부터 1950년대 초 사이, 한반도 북부에서 일반적으로 볼 수 있던 살림살이와 옷차림. 특정 마을의 실제 모습이 아니라 그 시기의 일반적 표현입니다. 과장된 연출 없이 담담하게.'
const PERIOD_GENERIC_EN = 'Everyday objects and clothing generally seen in the northern part of Korea, from before the division to the early 1950s. This is a period-generic rendering, not a depiction of any specific village. Calm and understated; no exaggerated drama.'

/* ══════════ 네거티브 — 공통 30항목, 순서 고정 ══════════ */
export const NEG_COMMON_KO = [
  '현대 자동차', '아스팔트 포장도로', '플라스틱 물건', '휴대전화', '에어컨 실외기', '위성 안테나', '전광 간판',
  '청바지·운동화·프린트 티셔츠 같은 현대 옷', '글자', '자막', '워터마크', '서명', '로고',
  '왜곡된 손', '손가락 개수 이상', '팔다리 겹침', '일그러진 얼굴',
  '과장된 울음과 비명', '연극적인 자세', '국기', '군 표지', '정치 초상화와 동상',
  '관광객', '스튜디오 배경천', 'HDR 광채', '과채도', '인공적인 매끈한 피부', '보정된 얼굴',
  '어안 왜곡', '같은 인물 복제',
]
export const NEG_COMMON_EN = [
  'modern cars', 'asphalt roads', 'plastic objects', 'mobile phones', 'air-conditioning units', 'satellite dishes',
  'illuminated signage', 'modern clothing such as jeans sneakers or printed t-shirts',
  'text', 'subtitles', 'watermark', 'signature', 'logo',
  'distorted hands', 'extra fingers', 'extra limbs', 'deformed faces',
  'exaggerated crying or screaming', 'theatrical poses', 'national flags', 'military insignia',
  'political portraits or statues', 'tourists', 'studio backdrop', 'HDR glow', 'oversaturation',
  'plastic skin', 'beauty retouching', 'fisheye distortion', 'duplicated people',
]
/** 간단판용 상위 6개 — 짧은 프롬프트만 받는 도구에서 가장 크게 어긋나는 것부터 */
export const NEG_SIMPLE_KO = ['현대 자동차', '아스팔트 길', '글자', '워터마크', '왜곡된 손', '과채도']
export const NEG_SIMPLE_EN = ['modern cars', 'asphalt roads', 'text', 'watermark', 'distorted hands', 'oversaturation']

/* ══════════ 네거티브 칸이 없는 도구용 — 긍정 치환표 ══════════
   부정어를 본문에 그대로 옮기면 오히려 그것이 불려 나온다. 긍정문으로 바꿔 넣는다. */
export const NEG_SWAP = [
  { itemKo: '자동차·아스팔트', ko: '소달구지 바퀴 자국만 난 흙길', en: 'an unpaved earth road with only ox-cart ruts' },
  { itemKo: '현대 옷', ko: '무명과 삼베로 지은 저고리와 바지 차림', en: 'people in plain cotton and hemp jeogori and trousers' },
  { itemKo: '글자·워터마크·자막', ko: '간판도 표지도 없는 맨 나무 벽과 흙담', en: 'bare wooden walls and earthen fences with no signage of any kind' },
  { itemKo: '과장된 표정', ko: '표정을 크게 짓지 않고 카메라에서 눈을 돌린 얼굴', en: 'calm unposed faces looking away from the camera' },
  { itemKo: '왜곡된 손', ko: '그릇을 쥔 손이 화면 가장자리에서 반쯤 잘려 있음', en: 'hands holding a bowl, partly cropped at the frame edge' },
  { itemKo: '과채도', ko: '이미 바랜 색, 낮은 채도', en: 'colours already faded, low saturation' },
]

/* 인물 규약 — 실제 가족을 닮은 얼굴을 유도하지 않는다(설계 §10-J). 전 분위기 공통. */
const PEOPLE_RULE_KO = '인물은 뒷모습·옆모습·손·중경까지만 담고, 얼굴 정면 클로즈업은 쓰지 않는다.'
const PEOPLE_RULE_EN = 'Show people only from behind, in profile, by their hands, or at mid-ground distance; no frontal face close-up.'

/* ══════════ 도구 계열별 권장값 — 화면 표 ══════════ */
export const STUDIO_REPRO_TOOLS = [
  { name: 'SD·SDXL 계열', guidance: '6.5 (범위 6.0~7.5)', steps: '34 (범위 30~40)', note: 'DPM++ 2M Karras · 네거티브 칸 있음' },
  { name: 'Flux 계열', guidance: '3.5 (범위 3.0~4.0)', steps: '28 (범위 24~32)', note: 'Euler · 네거티브 지원이 약해 긍정 치환문을 함께 쓰십시오' },
  { name: 'Midjourney', guidance: '--s 150 --chaos 0 --seed', steps: '—', note: '간단판을 권합니다' },
  { name: 'ChatGPT·Gemini 이미지·Firefly', guidance: '조절 칸 없음', steps: '—', note: '시드를 지정할 수 없어 매번 달라집니다' },
  { name: '영상(Runway·Veo·Kling·Pika)', guidance: '모션 강도 낮음', steps: '—', note: '시드 칸이 있으면 고정하십시오' },
]

/* ══════════ 시드 — 결정적으로 계산한다 (Math.random 금지) ══════════
   FNV-1a 32bit 를 「재현 설정 블록을 뺀 정밀 영문 프롬프트」 위에 돌린다.
   재현 설정 블록을 계산 대상에서 뺀 이유는 순환을 피하기 위함이다 — 이 순서를 지켜야 재현성이 성립한다. */
export function studioSeed(basis) {
  let h = 0x811c9dc5
  const s = String(basis)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i) & 0xff
    h = Math.imul(h, 0x01000193) >>> 0
    /* 코드포인트가 0xff 를 넘는 한글도 상위 바이트까지 먹인다 — 한글 입력이 시드에 반영되게 */
    const hi = s.charCodeAt(i) >>> 8
    if (hi) { h ^= hi; h = Math.imul(h, 0x01000193) >>> 0 }
  }
  return 100000 + (h % 900000)
}

/* ══════════ 조립 — 순수 함수. 같은 입력 = 같은 출력 ══════════
   input = {
     medium: 'photo'|'video',
     ratio: '16:9'|'9:16'|'1:1',
     region: { kind:'old', id } | { kind:'custom', text } | { kind:'unknown' },
     story: { sceneryOnly: bool,
              picks: [{ group, chipIds: [], text }] },   // group = STUDIO_STORY_GROUPS id
     mood: STUDIO_MOODS id,
     relics: [{ fileId, name, category, provider, sourceUrl }],   // 0~4장
   } */

function regionWords(region) {
  if (region?.kind === 'old') {
    const r = STUDIO_REGIONS.find((x) => x.id === region.id)
    if (r) return { ko: r.ko, en: r.en }
  }
  if (region?.kind === 'custom' && String(region.text ?? '').trim()) {
    const t = String(region.text).trim()
    /* ★ 규모를 단정하지 않는 중립 꼬리만 붙인다. 예전 꼬리 '(a town in ...)' 는
       이용자가 쓴 적 없는 행정 단위 단정이었다 — 「평안북도 의주군」(군)도,
       「개성 만월대 옆 우리집」(집)도, 도 이름만 적은 경우도 전부 town 이 됐다.
       town/city/village/county 같은 규모 낱말을 여기 넣지 마라(verify-studio 가 검사한다). */
    return { ko: t, en: `${t} (place name as written by the family, in Korean; northern Korea)` }
  }
  /* 모름 — 지명을 만들지 않는다. 문장 자리에 「…의 옛 고향」이 이어지므로 「북녘」만 쓴다
     (「북녘의 고향의 옛 고향」처럼 겹치는 것을 실측으로 잡았다) */
  return { ko: '북녘', en: 'the northern part of Korea' }
}

const FREE_EN_TAIL = '(family story in Korean — most video models accept it as-is)'

function chipOf(groupId, chipId) {
  const g = STUDIO_STORY_GROUPS.find((x) => x.id === groupId)
  return g?.chips.find((c) => c.id === chipId) ?? null
}

/* ── 영상 장면 표 — 샷·렌즈·조리개·움직임·초. 초 합계는 LENGTH_GUIDE 범위 안이다.
      ★ 여기 문장에는 이야기 내용을 넣지 않는다 — 프롬프트의 이 자리는 「연출 설정」이고,
        이야기는 블록 2가 맡는다. 산출 ③(out.scenes)에만 이야기 내용을 얹는다. ── */
const VIDEO_SHOTS = {
  '16:9': [
    { key: 's1', roleKo: '원경', roleEn: 'establishing', ko: '익스트림 와이드, 24mm f/8, 3초 고정 후 초당 1퍼센트 푸시인, 10초', en: 'extreme wide, 24mm f/8, held 3 seconds then a 1 percent per second push-in, 10 seconds', sec: 10 },
    { key: 's2', roleKo: '이야기의 자리', roleEn: 'the place of the story', ko: '와이드, 35mm f/5.6, 좌에서 우로 8도 팬(초당 1.6도), 14초', en: 'wide, 35mm f/5.6, an 8 degree pan from left to right at 1.6 degrees per second, 14 seconds', sec: 14 },
    { key: 's3', roleKo: '가까운 자리', roleEn: 'the close detail', ko: '미디엄 클로즈, 85mm f/2.8, 고정 후 마지막 3초에 5도 틸트다운, 14초', en: 'medium close, 85mm f/2.8, locked then a 5 degree tilt-down over the last 3 seconds, 14 seconds', sec: 14 },
    { key: 's4', roleKo: '맺음', roleEn: 'closing', ko: '와이드, 35mm f/5.6, 달리 백(초당 0.2미터), 8초', en: 'wide, 35mm f/5.6, dolly back at 0.2 m per second, 8 seconds', sec: 8 },
  ],
  '9:16': [
    { key: 's1', roleKo: '원경', roleEn: 'establishing', ko: '세로 와이드, 28mm f/8, 완전 고정, 6초', en: 'vertical wide, 28mm f/8, completely locked, 6 seconds', sec: 6 },
    { key: 's2', roleKo: '이야기의 자리', roleEn: 'the place of the story', ko: '세로 미디엄, 40mm f/4, 위에서 아래로 10도 틸트(초당 1.25도), 8초', en: 'vertical medium, 40mm f/4, a 10 degree tilt down at 1.25 degrees per second, 8 seconds', sec: 8 },
    { key: 's3', roleKo: '가까운 자리', roleEn: 'the close detail', ko: '세로 클로즈, 65mm f/2.5, 완전 고정, 8초', en: 'vertical close, 65mm f/2.5, completely locked, 8 seconds', sec: 8 },
    { key: 's4', roleKo: '맺음', roleEn: 'closing', ko: '세로 와이드, 28mm f/8, 초당 1퍼센트 풀백, 6초', en: 'vertical wide, 28mm f/8, a 1 percent per second pull-back, 6 seconds', sec: 6 },
  ],
  '1:1': [
    { key: 's1', roleKo: '원경', roleEn: 'establishing', ko: '와이드, 35mm f/8, 완전 고정, 8초', en: 'wide, 35mm f/8, completely locked, 8 seconds', sec: 8 },
    { key: 's23', roleKo: '이야기의 자리', roleEn: 'the place of the story', ko: '미디엄, 50mm f/3.5, 초당 1퍼센트 푸시인, 10초', en: 'medium, 50mm f/3.5, a 1 percent per second push-in, 10 seconds', sec: 10 },
    { key: 's4', roleKo: '맺음', roleEn: 'closing', ko: '와이드, 35mm f/8, 완전 고정, 6초', en: 'wide, 35mm f/8, completely locked, 6 seconds', sec: 6 },
  ],
}
/** 분위기별 S4 처리 — 2상태 분위기만 다르다 */
const S4_OVERRIDE = {
  'bw-color': { ko: 'S4 시작 1초 뒤부터 2.5초에 걸쳐 중앙에서 바깥으로 색이 번진다. 컷 없음.', en: 'In S4, starting 1 second in, colour blooms outward from the centre over 2.5 seconds. No cut.' },
  'past-now': { ko: 'S4 한가운데에서 과거에서 현재로 매치컷 1회. 컷 전환 0프레임, 프레이밍 완전 동일.', en: 'A single match cut from the past state to the present state at the middle of S4, a 0 frame transition with identical framing.' },
}
const S4_PLAIN_KO = 'S4 는 카메라가 잔잔히 멀어지며 마지막 1초 페이드 아웃.'
const S4_PLAIN_EN = 'In S4 the camera eases back and fades out over the last 1 second.'

/** 사진 구도 3안의 촬영 사양 — 사료 2·3장째를 2안·3안에 배당한다(한 화면에 합치지 않는다) */
const PHOTO_SHOTS = [
  { labelKo: '1안 원경', ko: '와이드, 24mm f/8, 카메라 높이 1.6미터, 수평', en: 'wide, 24mm f/8, camera height 1.6 m, level' },
  { labelKo: '2안 중경', ko: '미디엄, 50mm f/4, 카메라 높이 1.5미터, 수평', en: 'medium, 50mm f/4, camera height 1.5 m, level' },
  { labelKo: '3안 근경', ko: '미디엄 클로즈, 85mm f/2.8, 카메라 높이 1.2미터, 위로 4도', en: 'medium close, 85mm f/2.8, camera height 1.2 m, tilted up 4 degrees' },
]

/** 블록 배열 → 프롬프트 평문. head 를 반드시 함께 낸다(라벨을 뗀 복사본을 만들지 않는다). */
export function renderStudioPrompt(blocks, lang) {
  const ko = lang !== 'en'
  return blocks
    .map((b) => {
      const head = ko ? b.headKo : b.headEn
      const body = ko ? b.bodyKo : b.bodyEn
      return b.id === 'format' ? `${head} ${body}` : `${head}\n${body}`
    })
    .join('\n\n')
}

export function buildStudioOutput(input) {
  const medium = input.medium === 'photo' ? 'photo' : 'video'
  const ratio = ['16:9', '9:16', '1:1'].includes(input.ratio) ? input.ratio : '16:9'
  const mood = STUDIO_MOODS.find((m) => m.id === input.mood) ?? STUDIO_MOODS[0]
  const shot = MOOD_SHOT[mood.id] ?? MOOD_SHOT.docu
  const reg = regionWords(input.region)
  const relics = (input.relics ?? []).slice(0, 4)
  const picks = input.story?.picks ?? []
  const sceneryOnly = Boolean(input.story?.sceneryOnly)
  const unknownRegion = !(input.region?.kind === 'old' || (input.region?.kind === 'custom' && String(input.region?.text ?? '').trim()))
  const isVideo = medium === 'video'

  /* ── 이야기 재료 모으기 (블록 2 전용) ── */
  const fragsKo = []
  const fragsEn = []
  const freeTexts = []          // 자유 입력 원문(한글 그대로 — 번역하지 않는다)
  let sayingText = null
  let photoPlaceText = null
  if (!sceneryOnly) {
    for (const p of picks) {
      for (const cid of p.chipIds ?? []) {
        const c = chipOf(p.group, cid)
        if (c?.sceneKo) { fragsKo.push(c.sceneKo); fragsEn.push(c.sceneEn) }
      }
      const t = String(p.text ?? '').trim()
      if (!t) continue
      if (p.group === 'saying') sayingText = t
      else if (p.group === 'photo') photoPlaceText = t
      else freeTexts.push(t)
    }
  }

  /* ══════════ 블록 1 — 매체·화면 ══════════ */
  const totalSec = isVideo ? VIDEO_SHOTS[ratio].reduce((a, s) => a + s.sec, 0) : 0
  const sceneCount = isVideo ? VIDEO_SHOTS[ratio].length : 0
  const fmtKo = isVideo
    ? `${reg.ko}의 옛 고향을 담은 짧은 영상. 화면 비율 ${ratio}. 초당 24프레임. 전체 길이 ${totalSec}초, ${sceneCount}장면. 분위기: ${mood.ko}.`
    : `${reg.ko}의 옛 고향을 담은 사진 한 장. 화면 비율 ${ratio}. 고해상도 정지 이미지. 분위기: ${mood.ko}.`
  const fmtEn = isVideo
    ? `A short film of an old hometown in ${reg.en}. Aspect ratio ${ratio}. 24 frames per second. Total length ${totalSec} seconds in ${sceneCount} shots. Mood: ${mood.en}.`
    : `A photograph of an old hometown in ${reg.en}. Aspect ratio ${ratio}. High-resolution still image. Mood: ${mood.en}.`

  /* ══════════ 블록 2 — 들려주신 이야기 (원문 그대로, 번역하지 않는다) ══════════ */
  const accKo = []
  const accEn = []
  if (fragsKo.length) {
    accKo.push(`담기는 것: ${fragsKo.join(' · ')}.`)
    accEn.push(`Elements: ${fragsEn.join('; ')}.`)
  }
  for (const t of freeTexts) {
    accKo.push(t)
    accEn.push(`Family story, in Korean: "${t}" ${FREE_EN_TAIL}`)
  }
  if (sayingText) {
    accKo.push(`자주 하시던 말씀: 「${sayingText}」`)
    accEn.push(`A phrase the elder often said, in Korean: "${sayingText}" ${FREE_EN_TAIL}`)
  }
  /* 간단판 영문은 꼬리 표기를 뺀다 — 머리 라벨이 이미 「Korean, keep as-is」라고 못박고,
     짧은 프롬프트만 받는 도구에서 같은 꼬리를 두 번 싣는 것이 가장 크게 낭비되는 자리다.
     원문(한글)은 여기서도 손대지 않는다. */
  const accEnSimple = []
  if (fragsEn.length) accEnSimple.push(`Elements: ${fragsEn.join('; ')}.`)
  for (const t of freeTexts) accEnSimple.push(`"${t}"`)
  if (sayingText) accEnSimple.push(`A phrase often said: "${sayingText}"`)

  /* ══════════ 블록 3 — 고른 사료에서 (제목·갈래만. 없는 지명·건물·지형을 만들지 않는다) ══════════
     ★ 갈래별 전경·중경·원경 배치는 여기 없다 — 「연출 설정」 블록으로 옮겼다.
       사료에서 오지 않은 묘사가 이 라벨 아래 있으면 라벨이 거짓이 된다. */
  const arcKo = []
  const arcEn = []
  if (relics.length) {
    arcKo.push(`참고한 사료 사진: ${relics.map((r) => `「${r.name}」(${RELIC_CAT_LABEL[r.category] ?? r.category})`).join(' · ')}.`)
    arcEn.push(`Archival photo reference${relics.length > 1 ? 's' : ''}: ${relics.map((r) => `"${r.name}" (${RELIC_CAT_EN[r.category] ?? r.category})`).join(', ')}.`)
    if (relics.length > 1) { arcKo.push(RELIC_SPLIT_KO); arcEn.push(RELIC_SPLIT_EN) }
  }

  /* ══════════ 블록 4 — 연출 설정 (8구획 중 촬영·광원·질감·색·구도) ══════════ */
  /* 갈래 규칙 2종은 「고른 사료 전부가 한 갈래일 때」만 쓴다 — 갈래가 섞이면 relics[0] 갈래를
     나머지에 씌우게 되고(평야·호수 사료에 돌계단·처마가 붙던 실측 버그), 그것이 곧 날조다. */
  const oneCat = relics.length > 0 && relics.every((r) => r.category === relics[0].category)
    ? relics[0].category : null
  const heritageOnly = oneCat === 'heritage'
  const comp = COMPOSITION_BY_RATIO[ratio]
  const compKo = `${heritageOnly ? HERITAGE_TOPLINE_KO : comp.horizonKo} ${comp.restKo}`
  const compEn = `${heritageOnly ? HERITAGE_TOPLINE_EN : comp.horizonEn} ${comp.restEn}`

  const dirKo = []
  const dirEn = []
  dirKo.push(`촬영: ${isVideo ? shot.shotVideoKo : shot.shotPhotoKo}.`)
  dirEn.push(`Camera: ${isVideo ? shot.shotVideoEn : shot.shotPhotoEn}.`)
  dirKo.push(`광원: ${shot.lightKo}.`)
  dirEn.push(`Light: ${shot.lightEn}.`)
  dirKo.push(`매체 질감: ${shot.textureKo}.`)
  dirEn.push(`Film texture: ${shot.textureEn}.`)
  dirKo.push(`색: ${shot.paletteKo}.`)
  dirEn.push(`Colour: ${shot.paletteEn}.`)
  dirKo.push(`구도: ${compKo}`)
  dirEn.push(`Composition: ${compEn}`)
  if (oneCat) {
    const sc = RELIC_SCENE[oneCat] ?? RELIC_SCENE.nature
    dirKo.push(`${RELIC_SCENE_LEAD_KO} ${sc.ko}`)
    dirEn.push(`${RELIC_SCENE_LEAD_EN} ${sc.en}`)
  }
  dirKo.push(`인물: ${PEOPLE_RULE_KO}`)
  dirEn.push(`People: ${PEOPLE_RULE_EN}`)
  const stateKo = isVideo ? shot.stateVideoKo : shot.statePhotoKo
  const stateEn = isVideo ? shot.stateVideoEn : shot.statePhotoEn
  if (stateKo) { dirKo.push(`상태 전환: ${stateKo}`); dirEn.push(`State change: ${stateEn}`) }
  if (isVideo) {
    const shots = VIDEO_SHOTS[ratio]
    dirKo.push('장면:')
    dirEn.push('Shots:')
    shots.forEach((s, i) => {
      dirKo.push(`S${i + 1}. ${s.roleKo} — ${s.ko}.`)
      dirEn.push(`S${i + 1}. ${s.roleEn} — ${s.en}.`)
    })
    const ov = S4_OVERRIDE[mood.id]
    dirKo.push(ov ? ov.ko : S4_PLAIN_KO)
    dirEn.push(ov ? ov.en : S4_PLAIN_EN)
  }

  /* ══════════ 블록 5 — 시대 일반 표현 ══════════ */
  const perKo = [PERIOD_GENERIC_KO]
  const perEn = [PERIOD_GENERIC_EN]
  if (mood.id === 'past-now' && isVideo) { perKo.push(PAST_NOW_PRESENT_KO); perEn.push(PAST_NOW_PRESENT_EN) }

  /* ══════════ 블록 6 — 금지 ══════════ */
  const negKo = [...NEG_COMMON_KO, ...(shot.negKo ?? [])]
  const negEn = [...NEG_COMMON_EN, ...(shot.negEn ?? [])]

  /* ── 여기까지로 시드 기준 문자열을 만든다(재현 설정 블록 제외 — 순환 방지) ── */
  const H = STUDIO_BLOCK_HEADS
  const preBlocks = [
    { id: 'format', headKo: H.format.ko, headEn: H.format.en, bodyKo: fmtKo, bodyEn: fmtEn },
    ...(accKo.length ? [{ id: 'account', headKo: H.account.ko, headEn: H.account.en, bodyKo: accKo.join('\n'), bodyEn: accEn.join('\n') }] : []),
    ...(arcKo.length ? [{ id: 'archive', headKo: H.archive.ko, headEn: H.archive.en, bodyKo: arcKo.join('\n'), bodyEn: arcEn.join('\n') }] : []),
    { id: 'direction', headKo: H.direction.ko, headEn: H.direction.en, bodyKo: dirKo.join('\n'), bodyEn: dirEn.join('\n') },
    { id: 'period', headKo: H.period.ko, headEn: H.period.en, bodyKo: perKo.join('\n'), bodyEn: perEn.join('\n') },
    { id: 'negative', headKo: H.negative.ko, headEn: H.negative.en, bodyKo: negKo.join(', '), bodyEn: negEn.join(', ') },
  ]
  const seedBasis = renderStudioPrompt(preBlocks, 'en')
  const seed = studioSeed(seedBasis)

  /* ══════════ 블록 7 — 재현 설정 ══════════ */
  const repKo = [
    `권장 시드 ${seed} — 이 프롬프트에서 계산한 값입니다. 다른 수를 쓰셔도 됩니다.`,
    'SD·SDXL 계열: 가이던스 6.5(범위 6.0~7.5), 스텝 34(범위 30~40), 샘플러 DPM++ 2M Karras.',
    'Flux 계열: 가이던스 3.5(범위 3.0~4.0), 스텝 28(범위 24~32), 샘플러 Euler.',
    `Midjourney: --s 150 --chaos 0 --seed ${seed}.`,
    ...(isVideo ? ['영상 도구(Runway·Veo·Kling·Pika)에서는 모션 강도를 낮게 두고, 시드 칸이 있으면 고정하십시오.'] : []),
    STUDIO_NOTICES.reproNote,
  ]
  const repEn = [
    `Suggested seed ${seed}, derived from this prompt. Any other integer is fine.`,
    'SD and SDXL family: guidance 6.5 in a range of 6.0 to 7.5, 34 steps in a range of 30 to 40, sampler DPM++ 2M Karras.',
    'Flux family: guidance 3.5 in a range of 3.0 to 4.0, 28 steps in a range of 24 to 32, sampler Euler.',
    `Midjourney: --s 150 --chaos 0 --seed ${seed}.`,
    ...(isVideo ? ['For video tools such as Runway, Veo, Kling and Pika keep the motion strength low and fix the seed if a seed field is offered.'] : []),
    'With the same model, the same seed and the same settings this prompt gives a nearly identical image. A different model gives only a similar feel. Tools without a seed field will differ every time. A prompt alone cannot produce an exactly identical image.',
  ]
  const blocks = [...preBlocks, { id: 'repro', headKo: H.repro.ko, headEn: H.repro.en, bodyKo: repKo.join('\n'), bodyEn: repEn.join('\n') }]

  const promptKo = renderStudioPrompt(blocks, 'ko')
  const promptEn = renderStudioPrompt(blocks, 'en')

  /* ══════════ 간단판 — 블록 1·2·3 + 4 압축 1줄 + 6 상위 6개 + 7 시드만 ══════════
     같은 시드를 쓴다(정밀 영문 기준 1회 계산). 값이 적어 결과가 더 흔들린다 — 화면에 그렇게 적는다. */
  const simpleFmtKo = isVideo
    ? `${reg.ko}의 옛 고향을 담은 짧은 영상. 비율 ${ratio}, ${totalSec}초.`
    : `${reg.ko}의 옛 고향을 담은 사진 한 장. 비율 ${ratio}.`
  const simpleFmtEn = isVideo
    ? `A short film of an old hometown in ${reg.en}. Aspect ratio ${ratio}, ${totalSec} seconds.`
    : `A photograph of an old hometown in ${reg.en}. Aspect ratio ${ratio}.`
  const blocksSimple = [
    { id: 'format', headKo: H.format.koShort, headEn: H.format.enShort, bodyKo: simpleFmtKo, bodyEn: simpleFmtEn },
    ...(accKo.length ? [{ id: 'account', headKo: H.account.koShort, headEn: H.account.enShort, bodyKo: accKo.join('\n'), bodyEn: accEnSimple.join('\n') }] : []),
    ...(relics.length ? [{
      id: 'archive', headKo: H.archive.koShort, headEn: H.archive.enShort,
      bodyKo: `「${relics[0].name}」(${RELIC_CAT_LABEL[relics[0].category] ?? relics[0].category}).`,
      bodyEn: `"${relics[0].name}" (${RELIC_CAT_EN[relics[0].category] ?? relics[0].category}).`,
    }] : []),
    { id: 'direction', headKo: H.direction.koShort, headEn: H.direction.enShort, bodyKo: `${shot.briefKo}.`, bodyEn: `${shot.briefEn}.` },
    { id: 'negative', headKo: H.negative.koShort, headEn: H.negative.enShort, bodyKo: `${NEG_SIMPLE_KO.join(', ')}.`, bodyEn: `${NEG_SIMPLE_EN.join(', ')}.` },
    { id: 'repro', headKo: H.repro.koShort, headEn: H.repro.enShort, bodyKo: `권장 시드 ${seed}.`, bodyEn: `Seed ${seed}.` },
  ]
  const promptKoSimple = renderStudioPrompt(blocksSimple, 'ko')
  const promptEnSimple = renderStudioPrompt(blocksSimple, 'en')

  /* ── 산출 ② 사용할 이미지 순서 — 본인 소장(있을 때만)과 참고 사료를 가른다(권리 규약) ── */
  const ownPhotos = photoPlaceText
    ? {
        place: photoPlaceText,
        order: [
          '가장 오래된 인물 사진',
          '장소가 보이는 사진',
          '비교적 최근의 가족 사진',
          ...(mood.id === 'past-now' ? ['「과거에서 현재」 분위기이므로, 현재의 사진을 맨 마지막에 둡니다'] : []),
        ],
      }
    : null

  /* ── 산출 ③ 영상 구성(장면별) / 사진 구도 제안 ──
     ★ 여기도 프롬프트 본문과 같은 규약을 따른다 — 조각마다 출처 라벨을 붙인다.
       예전에는 이야기·사료·연출을 라벨 없이 한 줄에 섞었고, 그 결과 두 가지가 깨졌다:
         · 무관한 도의 사료를 「고향의 지형」이라고 단정했다(「평안남도 강동군」 + 「칠보산 동굴」).
           → 이제 지역과 사료를 한 문장에 묶지 않는다. 사료는 「참고 사료」로만 병기한다.
         · 이야기를 하나도 적지 않은 경로에서 「가족의 요소 — 저녁상에 둘러앉은 식구」를 지어냈다.
           → 이제 없는 이야기를 만들지 않고 자리를 비운다(src 'none'). 역할 이름도 장면표의
             「가까운 자리」를 그대로 쓴다 — 「가족의 요소」라는 이름 자체를 없앴다.
     사료가 여러 장이면 장면마다 하나씩 배당한다 — 한 화면에 섞지 않는다(설계 §4·§10-H). */
  const part = (src, text) => ({ src, text })
  const mkLine = (roleKo, parts) => ({ roleKo, parts, text: parts.map((p) => p.text).join(' ') })
  /* 없는 이야기를 지어내는 대신 자리를 비운다. 「적어 주신 내용이 없습니다」라고 뭉뚱그리지 않는다 —
     다른 자리에는 적으셨을 수 있으므로, 이 자리에 쓸 것이 없다는 뜻으로만 말한다. */
  const EMPTY_STORY_KO = '이 자리에 넣을 이야기를 따로 적지 않으셨습니다 — 연출 설정만 따릅니다.'
  /* 이야기 후보 — 칩 장면 + 자유 입력 원문. 한 조각을 두 자리에 겹쳐 쓰지 않는다. */
  const storyPool = [...fragsKo, ...freeTexts]
  const s2Text = storyPool[0] ?? null
  const storyRest = storyPool.filter((t) => t !== s2Text)
  const s3Text = storyRest.find((f) => /상|손|저녁|음식|집/.test(f)) ?? storyRest[0] ?? null
  /** 사료는 「참고」로만 병기한다. 「그 고향의 지형」이라고 단정하지 않는다(갈래·지역을 함께 적어 대조하게 한다). */
  const relicPart = (i) => (relics[i]
    ? part('archive', `참고 사료: 「${relics[i].name}」(${RELIC_CAT_LABEL[relics[i].category] ?? relics[i].category}).`)
    : null)
  const storyPart = (text) => (text ? part('account', `${text}.`) : null)

  const s1Parts = [part('direction', '넓은 지형이 보이는 화면.'), relicPart(0)].filter(Boolean)
  const s2Subject = relicPart(1) ?? storyPart(s2Text) ?? part('none', EMPTY_STORY_KO)
  const s3Subject = relicPart(2)
    ?? (sayingText ? part('account', `「${sayingText}」 하시던 말씀이 어울리는 자리.`) : null)
    ?? storyPart(s3Text)
    ?? part('none', EMPTY_STORY_KO)
  const s4Subject =
    mood.id === 'bw-color' ? part('direction', '흑백이던 화면에 천천히 색이 번져 든다.')
      : mood.id === 'past-now' ? part('direction', '과거의 결이 오늘의 결로 이어진다.')
        : part('direction', '카메라가 잔잔히 멀어진다.')
  const s4Parts = [s4Subject, relicPart(3)].filter(Boolean)

  let scenes = null
  if (isVideo) {
    const shots = VIDEO_SHOTS[ratio]
    const shotPart = (i) => part('direction', `${shots[i].ko}.`)
    scenes = ratio === '1:1'
      ? [
          mkLine(shots[0].roleKo, [...s1Parts, shotPart(0)]),
          /* 1:1 은 S2·S3 이 한 장면으로 합쳐진다. 둘 다 비었으면 「내용 없음」을 두 번 적지 않는다 */
          mkLine(shots[1].roleKo, [s2Subject, ...(s3Subject.text === s2Subject.text ? [] : [s3Subject]), shotPart(1)]),
          mkLine(shots[2].roleKo, [...s4Parts, shotPart(2)]),
        ]
      : [
          mkLine(shots[0].roleKo, [...s1Parts, shotPart(0)]),
          mkLine(shots[1].roleKo, [s2Subject, shotPart(1)]),
          mkLine(shots[2].roleKo, [s3Subject, shotPart(2)]),
          mkLine(shots[3].roleKo, [...s4Parts, shotPart(3)]),
        ]
  }
  const compositions = isVideo
    ? null
    : [
        mkLine('원경', [part('direction', '넓은 지형이 보이는 화면.'), relicPart(0), part('direction', `${PHOTO_SHOTS[0].ko}.`)].filter(Boolean)),
        mkLine('중경', [
          relicPart(1) ?? storyPart(s2Text) ?? part('none', EMPTY_STORY_KO),
          part('direction', `화면의 가운데 무게가 되는 구도. ${PHOTO_SHOTS[1].ko}.`),
        ]),
        mkLine('근경', [
          relicPart(2)
            ?? (sayingText ? part('account', `「${sayingText}」 말씀이 어울리는 손·상·문가의 가까운 장면.`) : null)
            ?? storyPart(s3Text ?? s2Text)
            ?? part('none', EMPTY_STORY_KO),
          part('direction', `${PHOTO_SHOTS[2].ko}.`),
        ]),
      ]

  const lg = lengthGuideOf(medium, ratio)

  return {
    medium, ratio, moodId: mood.id,
    regionKo: reg.ko,
    promptKo, promptEn,
    promptKoSimple, promptEnSimple,
    seed,
    blocks, blocksSimple,
    /** 다듬기에 내보낼 조각 — 「들려주신 이야기」 블록 하나뿐이다(설계 §10-B 를 한 칸 더 좁혔다).
     *  촬영값(블록 4~7)은 LLM 을 지나가지 않는다 — 숫자 자리바꿈을 아예 불가능하게 만드는 유일한 방법이다.
     *  「고른 사료에서」 블록도 보내지 않는다 — 제목·갈래·어휘 금고로만 짜인 결정적 문장이라
     *  다듬어서 얻을 것이 없고, 의역이 곧 날조가 된다(실측: 「청진시 수성천」 → 없는 수식). */
    refineKo: accKo.join('\n'),
    refineEn: accEn.join('\n'),
    relicNames: relics.map((r) => r.name),
    /** 다듬기 전송분 — 「들려주신 이야기」 블록 본문에 실제로 실린 원문만 담는다.
     *  「사진 속 장소」는 프롬프트에 들어가지 않으므로 여기에도 넣지 않는다 —
     *  화면 고지가 「들려주신 이야기 블록만 전송됩니다」라고 말하기 때문이다(전에는 함께 나갔다).
     *  validateStudio 가 이 각 원문이 다듬은 결과 안에 글자 그대로 남아 있는지 검사한다. */
    storyRaw: [...freeTexts, ...(sayingText ? [sayingText] : [])],
    sceneryOnly,
    ownPhotos,
    relics: relics.map((r) => ({ fileId: r.fileId, name: r.name, category: r.category, provider: r.provider, sourceUrl: r.sourceUrl })),
    scenes, compositions,
    totalSec,
    negative: { commonKo: NEG_COMMON_KO, commonEn: NEG_COMMON_EN, moodKo: shot.negKo ?? [], moodEn: shot.negEn ?? [], swap: NEG_SWAP },
    lengthLine: lg.length, sceneLine: lg.scenes,
  }
}

/** 정밀↔간단 두 판을 같은 자리에서 꺼내 쓰기 위한 얇은 선택기 */
export function studioPromptOf(out, variant, lang) {
  const simple = variant === 'simple'
  if (lang === 'en') return simple ? out.promptEnSimple : out.promptEn
  return simple ? out.promptKoSimple : out.promptKo
}

/** 다듬은 「들려주신 이야기」 블록을 원래 자리에 끼워 넣어 정밀판 전문을 다시 만든다.
 *  블록 순서·라벨·다른 블록의 값은 한 글자도 건드리지 않는다(그래서 촬영값이 흔들릴 수 없다).
 *  account 블록이 없는 산출(풍경 중심 경로)에서는 원본을 그대로 돌려준다. */
export function applyStudioRefine(out, refined) {
  if (!refined?.ko || !refined?.en) return { ko: out.promptKo, en: out.promptEn }
  const spliced = out.blocks.map((b) =>
    b.id === 'account' ? { ...b, bodyKo: refined.ko, bodyEn: refined.en } : b)
  return { ko: renderStudioPrompt(spliced, 'ko'), en: renderStudioPrompt(spliced, 'en') }
}

/* ══════════ Gemini 다듬기 — 프롬프트(서버 고정)와 검증(클라이언트) ══════════ */

export const STUDIO_PROMPT = `너는 프롬프트 문장 다듬기 도구다. 입력 JSON의 ko(한글 프롬프트)와 en(영문 프롬프트)을 자연스럽게 다듬어라.
· 이 대목은 이용자가 직접 적은 가족의 말이다. 화면에 「적어 주신 말 그대로 · 저희가 고치지 않았습니다」라고 붙어 나간다.
· 하는 일은 오직: 이음새 문장 정리와 중복 제거뿐이다.
· story 배열의 각 문장은 ko와 en 양쪽에 한 글자도 바꾸지 말고 그대로 두어라. 줄이거나 늘리거나 고쳐 쓰지 마라.
  en 에서도 원문을 그대로 두고, 필요하면 그 옆에 영어 요약을 덧붙여라 — 원문을 영어로 갈아치우지 마라.
· 금지 — 위반 시 출력 전체가 폐기된다: 입력에 없는 지명·연도·수치·인명·사건·시설·인물관계를 만들지 마라.
  입력에 있는 숫자만 그대로 옮긴다. 분위기·장면 수·길이·비율을 바꾸지 마라.
· 사료 제목은 한글 원문 그대로 두고 절대 번역·풀이하지 마라. 「」 안의 글자를 한 자도 바꾸지 마라.
· 슬픔을 연출하지 마라. 과장 수식과 감탄을 넣지 마라. 담담한 묘사문으로 유지한다.
출력은 JSON 하나뿐이다: {"ko":"...","en":"..."}`

const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u

/** 다듬기 출력 검증 — 닫힌 스키마 {ko,en} 밖이거나, 입력에 없는 숫자가 하나라도 있으면 null(폐기).
 *
 *  ★ 검증 범위를 정직하게 적는다:
 *    · 숫자 검사의 허용 집합은 「페이로드에 실제로 실린 숫자」다. 페이로드에는 블록 2·3(이야기·사료)만
 *      담기므로, 연출 설정의 상수(렌즈 35mm·5200K·f/8·시드 6자리 따위)는 애초에 LLM 을 지나가지
 *      않는다 — 그래서 검증 대상이 아니다. 그 값들은 우리가 정한 상수이고 템플릿이 원본을 그대로 들고 있다.
 *    · relicNames 가 오면 사료 제목이 한글 원문 그대로 살아 있는지 검사한다. 실측으로 잡힌 날조가
 *      「청진시 수성천」을 "Suseong Stream in Chongjin, upper Tumen River border area" 로 의역하며
 *      없는 수식을 붙인 것이었다. 제목이 글자 그대로 남지 않으면 폐기한다.
 *    · story 가 오면 이용자 원문도 같은 강도로 검사한다 — ko·en 양쪽에 글자 그대로 남아야 한다.
 *      다듬기가 닿는 블록이 하필 「저희가 고치지 않았습니다」라고 라벨 붙은 그 블록이기 때문이다. */
export function validateStudio(raw, payload) {
  const ko = typeof raw?.ko === 'string' ? raw.ko.trim() : ''
  const en = typeof raw?.en === 'string' ? raw.en.trim() : ''
  if (!ko || !en) return null
  if (ko.length > 4000 || en.length > 4000) return null
  if (EMOJI.test(ko) || EMOJI.test(en)) return null
  /* 원칙 ② 의 강제 — 허용 숫자 집합 = 입력 페이로드의 모든 숫자 토큰(앞자리 0 제거 변형 포함) */
  const allowed = new Set()
  for (const m of JSON.stringify(payload ?? {}).match(/\d+/g) ?? []) {
    allowed.add(m)
    const z = m.replace(/^0+/, '')
    if (z) allowed.add(z)
  }
  for (const s of [ko, en]) {
    const flat = s.replace(/(\d),(?=\d)/g, '$1')
    for (const m of flat.match(/\d+/g) ?? []) if (!allowed.has(m)) return null
  }
  /* 고유명사 보존 — 사료 제목은 한글 원문 그대로 ko·en 양쪽에 남아 있어야 한다 */
  const names = Array.isArray(payload?.relicNames) ? payload.relicNames : []
  for (const n of names) {
    const t = String(n ?? '').trim()
    if (!t) continue
    if (!ko.includes(t) || !en.includes(t)) return null
  }
  /* ★ 이용자 원문 보존 — 사료 제목과 같은 강도로 검사한다.
     다듬기가 닿는 블록은 하필 「적어 주신 말 그대로 · 저희가 고치지 않았습니다」라고 라벨 붙은 그 블록이다.
     실측 날조: 「겨울이면 우물이 얼어 새벽에 물을 길으셨다고 합니다」 → 「… 어머니의 시린 손」(없는 인물),
     「고향 국수만 하겠니」 → 「고향의 국수만 하랴」(말씀 개작), 영문에서는 한글 원문이 통째로 사라짐.
     숫자 검사·사료 제목 검사는 그 셋을 전부 통과시켰다. 그래서 원문을 글자 단위로 붙든다. */
  const story = Array.isArray(payload?.story) ? payload.story : []
  for (const s of story) {
    const t = String(s ?? '').trim()
    if (!t) continue
    if (!ko.includes(t) || !en.includes(t)) return null
  }
  return { ko, en }
}
