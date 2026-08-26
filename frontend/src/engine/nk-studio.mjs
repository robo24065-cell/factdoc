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
  { id: 'gyeonggi-unrec', ko: '미수복경기', en: 'Kaesong area, northern Gyeonggi' },
  { id: 'gangwon-unrec', ko: '미수복강원', en: 'Mount Kumgang area, northern Gangwon' },
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
   imagined 도 2벌 — 이야기 입력이 0인 풍경 중심 경로에서 「들려주신 이야기」가 거짓이 된다(imaginedScenery). */
export const STUDIO_NOTICES = {
  privacy: '입력하신 이야기는 이 브라우저 안에서만 처리되며 어디에도 저장되지 않습니다. 「AI로 다듬기」를 누르실 때에만 문장을 다듬기 위해 저희 서버를 거쳐 Gemini에 한 번 전달되고, 전달된 내용은 저장하지 않습니다. 누르지 않으면 아무것도 전송되지 않습니다.',
  privacyNoLlm: '입력하신 이야기는 이 브라우저 안에서만 처리되며 어디에도 저장되지 않습니다. 이 화면에서는 어떤 내용도 서버로 전송되지 않습니다.',
  rights: '생성 AI에 올리는 사진은 본인 가족이 소장한 사진만 쓰십시오. 이 화면의 사료 사진은 통일부 「나의 살던 고향은」 게재분으로 저작권이 각 제공처에 있어, 화면에서 보며 참고만 하고 생성 AI 입력으로 쓰지 않습니다.',
  imagined: '생성물은 들려주신 이야기를 바탕으로 한 상상의 재현입니다. 실제 고향의 모습, 실제 가족의 모습과 다를 수 있습니다.',
  imaginedScenery: '생성물은 옛 자료를 참고한 상상의 재현입니다. 실제 고향의 모습과 다를 수 있습니다.',
  sourceSplit: '사료 사진: 통일부 이산가족정보통합시스템 게재 · 저작권은 각 제공처. 그 밖의 안내 문구는 통일부 자료가 아닙니다.',
  relicUse: '이 사료는 보며 참고하는 자료입니다 — 저작권이 각 제공처에 있어 생성 AI에 올리지 않습니다. 화면에 띄워 두고 장면 묘사와 맞는지 견주어 보십시오.',
  memoryOnly: '이 화면을 떠나면 입력한 내용이 사라집니다 — 어디에도 저장되지 않습니다.',
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
    return { ko: t, en: `${t} (a town in the northern part of Korea)` }
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

export function buildStudioOutput(input) {
  const medium = input.medium === 'photo' ? 'photo' : 'video'
  const ratio = ['16:9', '9:16', '1:1'].includes(input.ratio) ? input.ratio : '16:9'
  const mood = STUDIO_MOODS.find((m) => m.id === input.mood) ?? STUDIO_MOODS[0]
  const reg = regionWords(input.region)
  const relics = (input.relics ?? []).slice(0, 4)
  const picks = input.story?.picks ?? []
  const sceneryOnly = Boolean(input.story?.sceneryOnly)
  const unknownRegion = !(input.region?.kind === 'old' || (input.region?.kind === 'custom' && String(input.region?.text ?? '').trim()))

  /* ── 이야기 재료 모으기 ── */
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

  /* ── 사료 묘사 — 캡션(제목) 원문과 갈래명만 옮긴다. 새 지명·묘사를 만들지 않는다 ── */
  const relicKo = relics.length
    ? `참고한 사료 사진: ${relics.map((r) => `「${r.name}」(${RELIC_CAT_LABEL[r.category] ?? r.category})`).join(' · ')} — 이 풍경의 지형과 분위기를 배경으로 삼는다.`
    : null
  const relicEn = relics.length
    ? `Background reference: archival photo${relics.length > 1 ? 's' : ''} ${relics.map((r) => `"${r.name}" (${RELIC_CAT_EN[r.category] ?? r.category})`).join(', ')}.`
    : null

  /* ── 한글 프롬프트 ── */
  const koLines = []
  koLines.push(`${reg.ko}의 옛 고향을 담은 ${medium === 'photo' ? '사진 한 장' : '짧은 영상'}.`)
  if (sceneryOnly) {
    koLines.push(unknownRegion ? '북녘 고향의 옛 모습을 중심으로 한 장면들.' : '고향의 당시 모습을 중심으로 한 장면들.')
  } else {
    if (fragsKo.length) koLines.push(`담기는 것: ${fragsKo.join(' · ')}.`)
    for (const t of freeTexts) koLines.push(t)
    if (sayingText) koLines.push(`자주 하시던 말씀: 「${sayingText}」`)
  }
  if (relicKo) koLines.push(relicKo)
  koLines.push(`분위기: ${mood.ko}. 화면 비율 ${ratio}.`)
  /* 시대는 단정하지 않는다 — 사용자가 시기를 말한 적이 없으므로 「분단 이전~1950년대 초」로 폭을 둔다
     (가족 시간대가 1930년대·한국전쟁기여도 어긋나지 않는 범위) */
  koLines.push('분단 이전부터 1950년대 초 사이, 한국 북부 지방의 옛 생활상. 과장된 연출 없이 담담하게.')
  const promptKo = koLines.join('\n')

  /* ── 영문 프롬프트 — 칩·분위기·지역은 내장 대응, 자유 입력은 한글 그대로 + 꼬리 표기 ── */
  const enLines = []
  enLines.push(`A ${medium === 'photo' ? 'photograph' : 'short film'} of an old hometown in ${reg.en}.`)
  if (sceneryOnly) {
    enLines.push('Scenes centered on the hometown scenery of that time.')
  } else {
    if (fragsEn.length) enLines.push(`Elements: ${fragsEn.join('; ')}.`)
    for (const t of freeTexts) enLines.push(`Family story, in Korean: "${t}" ${FREE_EN_TAIL}`)
    if (sayingText) enLines.push(`A phrase the elder often said, in Korean: "${sayingText}" ${FREE_EN_TAIL}`)
  }
  if (relicEn) enLines.push(relicEn)
  enLines.push(`Mood: ${mood.en}. Aspect ratio ${ratio}.`)
  enLines.push('Everyday life in the northern part of Korea, from before the division to the early 1950s. Calm and understated; no exaggerated drama.')
  const promptEn = enLines.join('\n')

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

  /* ── 산출 ③ 영상 구성(장면별) / 사진 구도 제안 ── */
  const s1 = `고향 원경 — ${relics.length ? `「${relics[0].name}」 사료의 지형처럼` : `${reg.ko}의 산과 들을`} 멀리서 본 장면.`
  const s2 = `이야기의 자리 — ${fragsKo[0] ?? (relics.length ? `사료 속 ${RELIC_CAT_LABEL[relics[0].category] ?? '풍경'}` : '마을의 골목과 집')}.`
  const s3Base = sayingText
    ? `가족의 요소 — 「${sayingText}」 하시던 말씀이 어울리는 자리.`
    : `가족의 요소 — ${fragsKo.find((f) => /상|손|저녁|음식|집/.test(f)) ?? '저녁상에 둘러앉은 식구'}.`
  const s4 =
    mood.id === 'bw-color' ? '맺음 — 흑백이던 화면에 천천히 색이 번져 든다.'
      : mood.id === 'past-now' ? '맺음 — 과거 장면이 오늘의 풍경으로 이어진다.'
        : '맺음 — 카메라가 잔잔히 멀어진다.'
  const scenes = medium === 'video'
    ? (ratio === '1:1'
        ? [s1, `${s2} ${s3Base}`, s4]
        : [s1, s2, s3Base, s4])
    : null
  const compositions = medium === 'photo'
    ? [
        `원경 — ${reg.ko}의 지형이 보이는 넓은 화면${relics.length ? ` (「${relics[0].name}」 사료 참고)` : ''}.`,
        `중경 — ${fragsKo[0] ?? '마을과 집'}이 화면의 가운데 무게가 되는 구도.`,
        `근경 — ${sayingText ? `「${sayingText}」 말씀이 어울리는 손·상·문가의 가까운 장면` : (fragsKo[1] ?? fragsKo[0] ?? '살림살이가 보이는 가까운 장면')}.`,
      ]
    : null

  const lg = lengthGuideOf(medium, ratio)

  return {
    medium, ratio, moodId: mood.id,
    regionKo: reg.ko,
    promptKo, promptEn,
    storyRaw: [...freeTexts, ...(sayingText ? [sayingText] : []), ...(photoPlaceText ? [photoPlaceText] : [])],
    sceneryOnly,
    ownPhotos,
    relics: relics.map((r) => ({ fileId: r.fileId, name: r.name, category: r.category, provider: r.provider, sourceUrl: r.sourceUrl })),
    scenes, compositions,
    lengthLine: lg.length, sceneLine: lg.scenes,
  }
}

/* ══════════ Gemini 다듬기 — 프롬프트(서버 고정)와 검증(클라이언트) ══════════ */

export const STUDIO_PROMPT = `너는 프롬프트 문장 다듬기 도구다. 입력 JSON의 ko(한글 프롬프트)와 en(영문 프롬프트)을 자연스럽게 다듬어라.
· 하는 일은 오직: 어색한 이음새 정리, story(한국어 가족 이야기)의 영어 옮김을 en에 녹이기, 중복 제거.
· 금지 — 위반 시 출력 전체가 폐기된다: 입력에 없는 지명·연도·수치·인명·사건·시설을 만들지 마라.
  입력에 있는 숫자만 그대로 옮긴다. 분위기·장면 수·길이·비율을 바꾸지 마라.
· 슬픔을 연출하지 마라. 과장 수식과 감탄을 넣지 마라. 담담한 묘사문으로 유지한다.
출력은 JSON 하나뿐이다: {"ko":"...","en":"..."}`

const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u

/** 다듬기 출력 검증 — 닫힌 스키마 {ko,en} 밖이거나, 입력에 없는 숫자가 하나라도 있으면 null(폐기). */
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
  return { ko, en }
}
