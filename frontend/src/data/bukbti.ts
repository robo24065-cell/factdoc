/* ────────────────────────────────────────────────────────────────
   북BTI — 네 판의 마지막 선택을 그대로 접은 취향 놀이 (재미용)

   절대 규칙 (어기면 서비스 전체 신뢰가 무너진다)
     · 이것은 심리검사가 아니고 통일부 자료도 아니다 — 화면 머리마다
       그 사실을 밝힌다(BUKBTI_DISCLAIMER). 과학처럼 말하지 않는다.
     · 유형 문안은 취향·기억 방식까지만 적는다. 이산·사망·상실을
       놀이 소재로 쓰지 않는다(scripts/verify-bukbti.mjs 가 어휘를 감사한다).
     · 갈래는 전부 취향 서술이다 — 지역·정치 축이 없다.
     · 태그는 정적 맵이다. 결정적·네트워크 무관 — 같은 우승이면 같은 글자.

   축 순서 고정: ①음식 ②풍경 ③말 ④밸런스. 각 게임의 「마지막 확정 결과」
   (월드컵 우승 항목 id · 밸런스 상위 기록유형 key)가 그 축의 글자를 정한다.
   다시 하면 마지막 판 기준으로 덮어쓴다(lib/bukbti.ts).
   ──────────────────────────────────────────────────────────────── */

export type BukbtiGame = 'food' | 'scene' | 'word' | 'balance'
export type BukbtiLetter = '국' | '찬' | '산' | '길' | '밥' | '삶' | '눈' | '귀'

/** 화면 상시 고지 — 구획 머리에 1회 */
export const BUKBTI_DISCLAIMER =
  '북BTI는 재미로 보는 취향 놀이입니다 — 심리검사가 아니며 통일부 자료가 아닙니다. 네 판의 마지막 선택을 그대로 접었을 뿐입니다.'

/** 누적 분포의 정직 문구 — 분포 구획에 그대로 싣는다 */
export const BUKBTI_TALLY_HONESTY =
  '이 분포는 사람 수가 아니라 북BTI 완성 기록의 누적입니다. 게임을 다시 해 유형이 바뀌면 새 기록으로 한 번 더 세며, 이전 기록은 익명이어서 지우거나 고칠 수 없습니다.'

/** 네 축 — 순서 고정(①음식 ②풍경 ③말 ④밸런스). 화면 범례가 이 서술을 그대로 쓴다 */
export const BUKBTI_AXES: ReadonlyArray<{
  game: BukbtiGame
  gameLabel: string
  to: string
  /** 범례 제목 — 「첫째 글자 · 상의 취향」 처럼 쓰인다 */
  title: string
  a: { letter: BukbtiLetter; desc: string }
  b: { letter: BukbtiLetter; desc: string }
}> = [
  {
    game: 'food', gameLabel: '고향의 음식', to: '/pick/food', title: '상의 취향',
    a: { letter: '국', desc: '국물에 말아 넘기는 맛' },
    b: { letter: '찬', desc: '집어 먹는 찬과 별식' },
  },
  {
    game: 'scene', gameLabel: '고향의 풍경', to: '/pick/scene', title: '눈의 취향',
    a: { letter: '산', desc: '산과 물 — 자연이 남는 눈' },
    b: { letter: '길', desc: '다리·문·거리 — 사람의 자취가 남는 눈' },
  },
  {
    game: 'word', gameLabel: '북녘의 말', to: '/pick/word', title: '귀의 취향',
    a: { letter: '밥', desc: '밥상 언저리의 말' },
    b: { letter: '삶', desc: '살림과 거리의 말' },
  },
  {
    game: 'balance', gameLabel: '우리 집 기억 밸런스', to: '/pick/balance', title: '간직의 방식',
    a: { letter: '눈', desc: '사진·글처럼 눈에 보이는 것으로 간직' },
    b: { letter: '귀', desc: '들은 이야기로 간직' },
  },
]

export const BUKBTI_AXIS_OF = new Map(BUKBTI_AXES.map(a => [a.game, a]))

/* ══════════ 정적 태그 맵 — 결과 key → 글자 ══════════
   음식·말은 8:8 로 정확히 갈라진다. 풍경은 산 9 : 길 7 —
   우승 항목의 태그만 쓰므로 비대칭이 결과를 기울이지 않는다.
   밸런스는 BalanceGame 이 이미 계산한 topKey(type-*)를 그대로 접는다. */
export const BUKBTI_TAG: Record<string, BukbtiLetter> = {
  /* ── ①음식 — 국(국물·말이 상) 대 찬(집어 먹는 찬·별식) ── */
  'food-pyeongyang-naengmyeon': '국',   // 차게 식힌 국물을 부어 냄
  'food-eobok-jaengban': '국',          // 육수를 부어 여럿이 먹음
  'food-chalgangnaengi-tteok': '찬',    // 떡 — 집어 먹음
  'food-ganggye-guksu': '국',           // 눌러 낸 국물 국수
  'food-hamhung-naengmyeon': '찬',      // 본래 회를 얹은 회국수(비빔형)
  'food-gajami-sikhae': '찬',           // 삭힌 밥반찬
  'food-myeongtae-sundae': '찬',        // 쪄 낸 음식
  'food-yeongchae-kimchi': '찬',        // 김치
  'food-haeju-bibimbap': '찬',          // 볶은 밥에 얹은 비빔
  'food-kimchi-mari': '국',             // 국물에 말아 먹음
  'food-nammae-juk': '국',              // 끓이는 죽
  'food-joraengi-tteokguk': '국',       // 끓이는 떡국
  'food-gaeseong-pyeonsu': '찬',        // 빚어 먹는 만두
  'food-gaeseong-juak': '찬',           // 지져 꿀에 재운 과줄
  'food-geumgang-jatjuk': '국',         // 쑤는 죽
  'food-goseong-haesamtang': '국',      // 끓이는 국

  /* ── ②풍경 — 산(자연이 남는 눈) 대 길(사람의 자취가 남는 눈) ── */
  'scene-F000280740': '길',   // 청천강 승리다리
  'scene-F000280220': '길',   // 묘향산 불영대(누대 건축)
  'scene-F000280345': '길',   // 영변읍성 육승정
  'scene-F000280733': '산',   // 대동강에 비친 석양
  'scene-F000280241': '길',   // 대동문
  'scene-F000280741': '길',   // 함흥 성천교와 만세교
  'scene-F000280201': '산',   // 백두산
  'scene-F000280192': '산',   // 칠보산
  'scene-F000280248': '산',   // 두만강 상류
  'scene-F000280285': '산',   // 구월산 전경
  'scene-F000280717': '산',   // 몽금포 전경(자연 해안)
  'scene-F000280218': '길',   // 수양산성
  'scene-F000280226': '길',   // 선죽교
  'scene-F000280207': '산',   // 박연폭포
  'scene-F000280277': '산',   // 금강산 삼일포
  'scene-F000280204': '산',   // 금강산 해금강

  /* ── ③말 — 밥(밥상 언저리의 말) 대 삶(살림·거리의 말) ── */
  'word-도시락|곽밥': '밥',
  'word-누룽지|가마치': '밥',
  'word-노크|손기척': '삶',
  'word-젤리|단묵': '밥',
  'word-도넛|가락지빵': '밥',
  'word-주스|과일단물': '밥',
  'word-수제비|뜨더국': '밥',
  'word-달걀|닭알': '밥',
  'word-거위|게사니': '삶',
  'word-원피스|달린옷': '삶',
  'word-주차장|차마당': '삶',
  'word-헬리콥터|직승기': '삶',
  'word-볼펜|원주필': '삶',
  'word-골키퍼|문지기': '삶',
  'word-어묵|물고기떡': '밥',
  'word-에스컬레이터|계단승강기': '삶',

  /* ── ④밸런스 — BalanceGame 의 topKey 를 그대로 접는다(새 계산 없음) ── */
  'type-photo': '눈',   // 사진 — 눈으로 보는 기록이 남은 집
  'type-doc': '눈',     // 글·문서 — 눈으로 보는 기록이 남은 집
  'type-oral': '귀',    // 구술 — 귀로 전해진 집
  'type-place': '귀',   // 지명 — 귀로 전해진 집
  'type-none': '귀',    // 유형 없음 — 이야기로 남은 집
}

/* ══════════ 16유형 — 코드·별칭·문안 ══════════
   문안은 담담한 높임말, 취향과 기억 방식까지만. 이산·사망·상실 어휘 금지. */
export type BukbtiType = { code: string; alias: string; text: string }

export const BUKBTI_TYPES: ReadonlyArray<BukbtiType> = [
  {
    code: '국산밥눈', alias: '아랫목 사진첩',
    text: '더운 국물이 오르는 상과 산과 강의 먼 풍경에 마음이 가는 분입니다. 귀에는 곽밥·가마치 같은 밥상 언저리의 말이 먼저 남습니다. 기억은 사진과 글처럼 눈에 보이는 것으로 간직하는 편입니다.',
  },
  {
    code: '국산밥귀', alias: '아랫목 옛말',
    text: '더운 상과 산의 풍경을 좋아하시고, 밥상에서 오가던 말이 오래 남는 분입니다. 기억은 들은 이야기로 간직하는 편이라, 말한 이의 목소리째 떠올리십니다.',
  },
  {
    code: '국산삶눈', alias: '산기슭 일기장',
    text: '국물 있는 상과 산과 강의 풍경에 마음이 머무는 분입니다. 귀에는 손기척·차마당 같은 살림과 거리의 말이 남습니다. 기억은 적어 두고 들춰 보는 쪽 — 눈으로 간직하는 편입니다.',
  },
  {
    code: '국산삶귀', alias: '산마을 사랑방',
    text: '더운 국 한 그릇과 산자락 풍경이 취향인 분입니다. 살림살이와 거리의 말이 귀에 남고, 기억은 둘러앉아 주고받는 이야기로 이어 가는 편입니다.',
  },
  {
    code: '국길밥눈', alias: '나루터 사진첩',
    text: '국물 음식과, 다리·성문·거리처럼 사람의 자취가 남은 풍경을 좋아하시는 분입니다. 밥상 언저리의 말이 귀에 남고, 기억은 사진과 글로 간직하는 편입니다.',
  },
  {
    code: '국길밥귀', alias: '나루터 옛말',
    text: '더운 상과 길가의 풍경 — 다리와 문과 저잣거리에 눈이 가는 분입니다. 밥상의 말이 오래 남고, 기억은 들은 이야기로 품는 편입니다.',
  },
  {
    code: '국길삶눈', alias: '길목 일기장',
    text: '국물 음식이 취향이고, 풍경도 사람의 자취가 있는 쪽을 고르시는 분입니다. 살림과 거리의 말이 귀에 남으며, 기억은 적히고 찍힌 것으로 간직하는 편입니다.',
  },
  {
    code: '국길삶귀', alias: '길목 사랑방',
    text: '더운 상, 길과 다리의 풍경, 거리의 말 — 사람 사는 소리 쪽으로 취향이 모인 분입니다. 기억은 이야기로 간직하는 편이라, 한 자리 이야기가 길어지는 쪽입니다.',
  },
  {
    code: '찬산밥눈', alias: '산자락 사진첩',
    text: '집어 먹는 찬과 별식, 그리고 산과 강의 풍경에 마음이 가는 분입니다. 밥상 언저리의 말이 귀에 남고, 기억은 사진과 글처럼 보이는 것으로 간직하는 편입니다.',
  },
  {
    code: '찬산밥귀', alias: '산자락 옛말',
    text: '마른 찬과 주전부리의 맛, 산의 먼 풍경이 취향인 분입니다. 밥상에서 오가던 말이 오래 남으며, 기억은 들은 이야기로 이어 가는 편입니다.',
  },
  {
    code: '찬산삶눈', alias: '산자락 일기장',
    text: '별식을 집어 먹는 재미와 자연 풍경을 좋아하시는 분입니다. 살림과 거리의 말이 귀에 남고, 기억은 적어 두는 쪽 — 눈으로 간직하는 편입니다.',
  },
  {
    code: '찬산삶귀', alias: '산마을 마실',
    text: '마른 찬과 별식, 산과 강의 풍경, 그리고 살림의 말이 취향인 분입니다. 기억은 마실 다니듯 이야기로 오가며 간직하는 편입니다.',
  },
  {
    code: '찬길밥눈', alias: '골목길 사진첩',
    text: '집어 먹는 별식과 골목·다리·문처럼 사람의 자취가 남은 풍경을 고르시는 분입니다. 밥상의 말이 귀에 남고, 기억은 사진과 글로 간직하는 편입니다.',
  },
  {
    code: '찬길밥귀', alias: '골목길 옛말',
    text: '주전부리의 맛과 저잣거리 풍경이 취향인 분입니다. 밥상 언저리의 말이 오래 남으며, 기억은 들은 이야기로 품는 편입니다.',
  },
  {
    code: '찬길삶눈', alias: '골목길 일기장',
    text: '별식과 거리 풍경, 살림과 거리의 말 — 일상 가까운 쪽으로 취향이 모인 분입니다. 기억은 적히고 찍힌 것으로 간직하는 편입니다.',
  },
  {
    code: '찬길삶귀', alias: '골목길 사랑방',
    text: '집어 먹는 찬과 골목 풍경, 그리고 사람 사는 말이 취향인 분입니다. 기억은 이야기로 간직하는 편이라, 듣고 옮기는 데서 힘이 나는 쪽입니다.',
  },
]

export const BUKBTI_TYPE_OF = new Map(BUKBTI_TYPES.map(t => [t.code, t]))

/** 16코드 목록 — supabase/migrations/0015_bukbti.sql 의 check 목록과 글자 단위로 같아야 한다
 *  (scripts/verify-bukbti.mjs 가 대조한다) */
export const BUKBTI_CODES: ReadonlyArray<string> = BUKBTI_TYPES.map(t => t.code)

/** 코드 표시 — 「국산밥눈」 → 「국·산·밥·눈」 (가운뎃점) */
export function bukbtiDisplay(code: string): string {
  return [...code].join('·')
}
