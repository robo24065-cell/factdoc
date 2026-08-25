/* ────────────────────────────────────────────────────────────────
   우리 집 기억 밸런스 — 8문항 (참여 /pick/balance)

   원칙
     · 점수·등급·백분율을 만들지 않는다 — 없는 통계를 만들지 않는 것이
       이 서비스 전체의 규약이다. 진단은 「답에서 직접 따라 나오는 안내」뿐이다.
     · 잔인한 양자택일을 두지 않는다. 어느 쪽을 골라도 열등하지 않다.
     · 문구는 MemoryCard 의 QUESTIONS 어법을 따른다 — 담담한 높임말,
       "정확하지 않아도 됩니다".
     · pathId 는 frontend/public/gohyang/paths.json 의 실제 경로 id 다.
       화면이 그 파일에서 제목·창구·연락처를 읽는다(여기 두 벌로 적지 않는다).
   ──────────────────────────────────────────────────────────────── */

/** 댁에 남아 있는 기록의 유형 — 결과 화면이 접는 4축 */
export type RecordType = 'photo' | 'doc' | 'oral' | 'place'
export const RECORD_TYPE_LABEL: Record<RecordType, string> = {
  photo: '사진',
  doc: '글·문서',
  oral: '구술(들은 이야기)',
  place: '지명',
}
/** 유형별 안내 한 줄 — 결과 화면의 「댁에 남아 있는 것」 서술 */
export const RECORD_TYPE_NOTE: Record<RecordType, string> = {
  photo: '옛 사진첩은 그 자체가 기록물입니다. 어느 고향의 무엇인지 메모를 붙여 두시면 가치가 커집니다.',
  doc: '편지·족보·증명서 같은 글은 지명과 성함이 적혀 있어 공적 기록으로 이어지기 쉽습니다.',
  oral: '들은 이야기는 말한 분이 계시지 않으면 사라집니다 — 적거나 녹음하는 것이 보존의 시작입니다.',
  place: '군·면까지 아는 지명은 기록의 좌표입니다. 등록·기록 절차에서 원적 기재의 근거가 됩니다.',
}

export type BalanceOption = {
  key: 'a' | 'b'
  label: string
  /** 이 답이 뜻하는 것 — 결과 화면에 그대로 싣는 담담한 서술 */
  memo: string
  /** 이 답이 가리키는 기록 유형(있을 때만) */
  types?: RecordType[]
  /** paths.json 의 경로 id — 결과 화면이 제목·연락처를 그 파일에서 읽는다 */
  pathIds?: string[]
  /** 서비스 안 링크(외부 창구가 아니라 이 화면 안의 다음 걸음) */
  internal?: { href: string; label: string }
}

export type BalanceQuestion = { id: string; q: string; hint?: string; a: BalanceOption; b: BalanceOption }

export const BALANCE_QUESTIONS: BalanceQuestion[] = [
  {
    id: 'who',
    q: '고향 이야기를 주로 들려주신 분은 어느 쪽 어른이십니까?',
    hint: '정확하지 않아도 됩니다. 기록을 어느 쪽 지명·성함부터 적을지의 시작점이 됩니다.',
    a: { key: 'a', label: '친가 쪽 어른', memo: '기록을 시작하신다면 친가 쪽 지명과 성함부터 적으시면 됩니다.' },
    b: { key: 'b', label: '외가 쪽 어른', memo: '기록을 시작하신다면 외가 쪽 지명과 성함부터 적으시면 됩니다.' },
  },
  {
    id: 'scene',
    q: '그 이야기를 들은 자리는 주로 어느 쪽이었습니까?',
    a: {
      key: 'a', label: '명절에 여럿이 모인 자리', types: ['oral'],
      memo: '다음 명절이 기록할 기회입니다 — 여럿이 기억을 맞춰 보면 지명·연도가 또렷해집니다.',
    },
    b: {
      key: 'b', label: '단둘이 있던 자리', types: ['oral'], pathIds: ['video-letter'],
      memo: '그 대화가 유일한 통로일 수 있습니다. 목소리를 영상으로 남기는 국가 사업이 있습니다.',
    },
  },
  {
    id: 'relic',
    q: '댁에 남은 것은 어느 쪽이 더 많습니까?',
    a: {
      key: 'a', label: '사진이 더 많다', types: ['photo'], pathIds: ['life-record-donation', 'museum-donation'],
      memo: '사진은 생애기록물 수집 동의(시행령 제4조의3제2항)와 디지털박물관 기증의 대상입니다.',
    },
    b: {
      key: 'b', label: '글(편지·족보·증명서)이 더 많다', types: ['doc'], pathIds: ['life-record-donation', 'museum-donation'],
      memo: '편지·족보·증명서도 같은 절차로 국가 기록이 됩니다. 지명·성함이 적힌 글은 특히 그렇습니다.',
    },
  },
  {
    id: 'voice',
    q: '어른의 목소리를 녹음해 둔 적이 있으십니까?',
    a: {
      key: 'a', label: '녹음해 둔 적 있다', types: ['oral'], pathIds: ['life-record-donation'],
      memo: '그 녹음도 생애기록물입니다 — 수집 동의 절차로 보존을 문의하실 수 있습니다.',
    },
    b: {
      key: 'b', label: '아직 없다', pathIds: ['video-letter'],
      memo: '영상편지는 국가 비용으로 제작·보관됩니다(시행령 제4조의3제1항). 지금 신청할 수 있는 사업입니다.',
    },
  },
  {
    id: 'placename',
    q: '고향 지명을 어디까지 알고 계십니까?',
    a: {
      key: 'a', label: '군·면까지 안다', types: ['place'], internal: { href: '/', label: '고향 지도에서 그 지역 보기' },
      memo: '군·면까지 아는 지명은 드뭅니다. 지도에서 그 지역의 기록을 확인하실 수 있습니다.',
    },
    b: {
      key: 'b', label: '도 이름 정도', pathIds: ['isan-apply'],
      memo: '이산가족찾기 등록 때 원적을 기재하면 어렴풋한 지명도 공적 기록으로 남습니다.',
    },
  },
  {
    id: 'apply',
    q: '집안에서 이산가족찾기 신청을 해 두셨습니까?',
    a: {
      key: 'a', label: '해 두셨다고 들었다', pathIds: ['dna-test'],
      memo: '유전자검사는 1세대가 떠난 뒤에도 가족관계를 증명하는 장치입니다 — 통일부가 대상을 2~3세대로 넓히겠다고 밝힌 사업입니다.',
    },
    b: {
      key: 'b', label: '모른다', pathIds: ['isan-apply'],
      memo: '신청자가 돌아가신 경우에도 자녀·형제 등 다른 가족이 신청할 수 있습니다(이산가족정보통합시스템 안내).',
    },
  },
  {
    id: 'food',
    q: '고향 음식은 어느 쪽에 가깝습니까?',
    a: {
      key: 'a', label: '집에서 해 먹었다', types: ['oral'], pathIds: ['life-record-donation'],
      memo: '조리법도 생애기록입니다 — 누가 어떻게 만들었는지 적어 두시면 기록이 됩니다.',
    },
    b: {
      key: 'b', label: '이야기로만 들었다', internal: { href: '/pick/food', label: '고향의 음식 월드컵 해 보기' },
      memo: '이야기로만 남은 음식은 이름부터 찾으면 됩니다. 이 화면의 음식 월드컵이 그 입구입니다.',
    },
  },
  {
    id: 'channel',
    q: '기록을 맡길 국가 창구가 있다는 것을 알고 계셨습니까?',
    a: {
      key: 'a', label: '알고 있었다', pathIds: ['museum-donation'],
      memo: '디지털박물관 기증 창구는 연중 상시입니다 — 준비되셨을 때 언제든 문의하실 수 있습니다.',
    },
    b: {
      key: 'b', label: '처음 알았다', internal: { href: '/#actions', label: '후손이 할 수 있는 일 전체 보기' },
      memo: '후손에게 열려 있는 경로가 여럿 있습니다. 한 번에 다 하실 필요는 없습니다.',
    },
  },
]
