// 후손 세대 — 「이산가족 → 후손」 다리의 근거 데이터
//
// 왜 이 파일이 따로 있는가:
//   등록·통계 데이터(isan.json)는 전부 **1세대 본인**의 것이다. 후손은 한 명도 없다.
//   그런데 통일부 자신의 실태조사에는 「후손 세대」 전용 섹션이 있고,
//   거기 숫자가 이 서비스의 존재 이유를 그대로 말한다(아래 GAPS).
//
// 출처 — 2024년 제4차 남북 이산가족 실태조사 (통일부, 2025-01-24 배포)
//   보도자료  https://www.korea.kr/common/download.do?fileId=198036054&tblKey=GMN (hwpx)
//   본문 PDF  https://www.korea.kr/common/download.do?fileId=198036055&tblKey=GMN
//   요약자료  https://www.korea.kr/common/download.do?fileId=198036056&tblKey=GMN  ← 인포그래픽(이미지 PDF)
//   조사기관 (주)한국갤럽조사연구소 · 사업비 8억원(남북협력기금) · 근거 이산가족법 제6조
//
//   ⚠ 요약자료는 **이미지 PDF**라 기계 파싱이 안 된다(텍스트 레이어 0바이트 — 실측).
//      아래 수치는 130dpi 렌더링 후 사람이 판독해 옮긴 값이며, 각 항목에 판독한
//      페이지를 `p` 로 남겨 재검증할 수 있게 했다. 자동 수집이 아니므로
//      조사 회차가 바뀌면 이 파일을 손으로 갱신해야 한다.
//
//   node scripts/nk-isan-descendant.mjs
//   → 북한자료-api/isan-descendant.json

import fs from 'node:fs'
import path from 'node:path'

const OUT = path.resolve('북한자료-api/isan-descendant.json')
const BUILT_AT = (process.argv.find(a => a.startsWith('--built-at=')) || '').split('=')[1]
  || new Date().toISOString().slice(0, 10)

/* ── 조사 개요 ───────────────────────────────────────────── */
const survey = {
  name: '2024년 제4차 남북 이산가족 실태조사',
  publishedAt: '2025-01-24',
  fieldwork: { full: '2024-07-02~2024-12-15', deep: '2024-09-23~2024-11-17' },
  agency: '(주)한국갤럽조사연구소',
  method: { full: '전화면접(필요시 가구방문)', deep: '가구방문 대면면접' },
  bases: {
    full: 36017,          // 전수조사 — 생존 신청자 전원(국내 35,542 + 해외 475)
    deep: 5103,           // 심층조사 표본
    withDescendants: 4042, // 심층 응답자 중 **자손이 있는** 1세대 — 후손 문항의 모집단
  },
  // 조사 주기가 5년 → 3년으로 단축됐다(이산가족법 시행령 개정 2024-07-02).
  // 고령화 때문에 2026년 예정이던 조사를 2024년으로 당겨 실시했다.
  cadence: { before: 5, after: 3, reason: '고령화', changedOn: '2024-07-02' },
}

/* ── ① 후손 세대 — 요약자료 p10 「4) 후손 세대 교류 및 이산가족 정체성에 대한 인식」 ── */
const descendants = {
  // 북한 가족이 사망한 뒤에도 그 **자손**과 교류할 의향
  exchangeWithDescendantsOfNK: { pct: 42.0, base: 5103, p: 10 },

  /* ★ 이 서비스의 근거 1 — 후손이 1세대보다 **더** 원한다.
     1세대 사후에 자손 세대끼리 교류하기를 희망하는가: 1세대 37.7% vs 후손세대 55.7% */
  wantsCrossGenerationExchange: {
    gen1: 37.7, descendants: 55.7, base: 5103, p: 10,
    note: '후손세대 응답이 1세대보다 높다',   // 수치는 화면이 계산해 보여준다 — 문장과 막대가 어긋나지 않게
  },

  preferredForm: {   // 희망하는 교류 형태 (상위 3)
    gen1: { 당국차원_대면상봉: 54.9, 당국차원_서신영상편지: 32.8, 당국차원_화상상봉: 6.6 },
    descendants: { 당국차원_대면상봉: 46.7, 당국차원_서신영상편지: 38.8, 당국차원_화상상봉: 7.1 },
    base: 5103, p: 10,
  },

  /* 후손 세대의 이산가족 정체성 — 자손이 있는 1세대 4,042명이 **자기 자손을 평가**한 값이다.
     (후손 본인에게 직접 물은 게 아니다. 이 한계를 화면에도 적어야 한다.) */
  identity: {
    base: 4042, p: 10,
    respondent: '자손이 있는 이산 1세대(후손 본인 아님)',
    items: [
      { label: '이산가족 문제에 관심이 있다', pct: 31.6 },
      { label: '이산가족 문제에 관심을 가져야 한다고 생각한다', pct: 44.7 },
      { label: '이산가족의 정체성을 가지고 살아가기를 원한다', pct: 39.6 },
      { label: '기회가 된다면 북한의 고향을 방문하기를 원한다', pct: 40.0 },
      { label: '기회가 되었을 때 북한의 고향을 방문할 것으로 예상한다', pct: 26.8 },
      { label: '이산가족의 후손임을 밝히면 사회적으로 불이익을 받을 것으로 생각한다', pct: 6.9 },
    ],
  },
}

/* ── ② 1세대 본인의 정체성 (대조군) — 요약자료 p10 ── */
const gen1Identity = {
  base: 5103, p: 10,
  items: [
    { label: '통일이 되어야 한다고 생각한다', pct: 73.4 },
    { label: '이산가족 문제가 해결되어야 한다고 생각한다', pct: 73.0 },
    { label: '이산가족이라는 사실을 누구에게나 이야기할 수 있다', pct: 62.1 },
    { label: '이산가족 배경에 대해 잘 안다', pct: 50.0 },
    { label: '이산가족에 대해 강한 소속감을 느낀다', pct: 44.8 },
    { label: '북한에 대한 인도적 지원이 필요하다고 생각한다', pct: 44.5 },
    { label: '이산가족의 역사/전통/관습 등에 대해 알려고 노력한다', pct: 40.3 },
    { label: '이산가족 구성 조직체/사회단체 참여한다', pct: 16.7 },
  ],
}

/* ── ③ 기록·위로 사업 선호도 — 요약자료 p9 ────────────────
   ★ 이 서비스의 근거 2 — 이산가족이 **1순위로 원하는 사업이 기록물 수집·보존**이다.
   우리가 만들려는 것이 곧 그들이 요구한 것이다. */
const recordPrograms = {
  base: 5103, p: 9,
  기록및공감대: [
    { label: '이산가족들이 사진, 물건 등 기록물 수집 보존사업', pct: 59.9 },
    { label: '이산가족 소식지, 책자, 영화 등 문화예술 보급 확대', pct: 23.6 },
    { label: '이산가족 박물관 또는 기념관 건립', pct: 16.5 },
  ],
  위로사업: [   // 복수응답
    { label: '이산가족 관련 특집방송 제작·지원', pct: 52.8 },
    { label: '고향 관련 사진·영상의 수집·제작, 전시', pct: 44.5 },
    { label: '소장 중인 오래된 기록사진 복원', pct: 34.4 },
    { label: '이산가족 위로물품 발송', pct: 24.1 },
    { label: '이산가족 초청 위로행사', pct: 20.6 },
    { label: '기타', pct: 0.5 },
  ],
}

/* ── ④ 고향 — 요약자료 p8 ────────────────────────────────
   고향 방문 의향은 갈렸다(52.4 / 47.6). 포기 이유의 1위가 건강이고,
   3위가 **"나와는 무관한 (조)부모님의 문제라서"** 6.8% 다 — 세대 단절의 직접 증거. */
const homeland = {
  base: 5103, p: 8,
  visitIntent: { yes: 52.4, no: 47.6 },
  reasonsNotToVisit: [
    { label: '내 건강이 좋지 않아 장거리 여행이 어려워서', pct: 58.7 },
    { label: '생사 등 소식확인 결과 북한에 있는 가족이나 친척이 이미 사망해서', pct: 21.7 },
    { label: '나와는 무관한 (조)부모님의 문제라서', pct: 6.8 },
  ],
  // 2021년 대비 '고향 방문' 희망이 26.7%p 급감했다(69.7 → 43.0). 본문 PDF p2.
  visitDemandTrend: { 2021: 69.7, 2024: 43.0, deltaPp: -26.7, p: 'press p2' },
}

/* ── ⑤ 유전자검사 — 사후에도 남는 유일한 '다리' ────────────
   1세대가 사망해도 유전자 정보는 후손에게 이어진다. 통일부가 이미 DB를 쌓고 있고
   2025년부터 **2~3세대 후손**을 대상에 넣었다 — 정책은 이미 후손을 향해 있는데
   후손이 접속할 화면이 없다. 그 자리가 우리 서비스다. */
const geneticDb = {
  cumulative: { persons: 29319, asOf: '2024-12-31' },
  plan2025: {
    persons: 1550,
    targets: ['이산가족 2~3세대 후손', '북한이탈주민', '납북자 가족', '해외 이산가족'],
    source: '2025년 남북협력기금 안건 의결',
  },
  purpose: '이산가족 사후에도 남북 이산가족의 가족관계 확인 및 법적 분쟁 해결',
  note: '누적 인원은 언론 보도 기준이며 통일부 원자료로 재확인이 필요하다',
}

/* ── ⑥ ★ 간극 — 제품의 논지 ───────────────────────────────
   서비스 기획서의 문제 정의는 이 세 숫자로 끝난다.
   "후손은 이어받을 의향이 있는데, 이어받을 수단이 없다." */
const GAPS = [
  {
    id: 'will-vs-owner',
    title: '이어받을 의향은 후손이 더 크다',
    a: { label: '후손세대가 세대 간 교류를 희망', pct: 55.7 },
    b: { label: '1세대가 그것을 희망', pct: 37.7 },
    gapPp: +18.0,
    reading: '문제는 후손의 무관심이 아니다. 후손 쪽 수요가 오히려 크다.',
  },
  {
    id: 'ought-vs-is',
    title: '관심을 가져야 한다고 보지만, 실제 관심은 그만큼 아니다',
    a: { label: '이산가족 문제에 관심을 가져야 한다고 생각', pct: 44.7 },
    b: { label: '실제로 관심이 있다', pct: 31.6 },
    gapPp: 13.1,
    reading: '당위와 행동 사이가 13.1%p 비어 있다. 그 사이를 메우는 것이 서비스의 일이다.',
  },
  {
    id: 'want-vs-expect',
    title: '고향에 가고 싶지만, 가게 될 것이라고는 믿지 않는다',
    a: { label: '기회가 되면 북한 고향을 방문하기를 원함', pct: 40.0 },
    b: { label: '실제로 방문할 것으로 예상', pct: 26.8 },
    gapPp: 13.2,
    reading: '물리적 귀향이 닫힌 만큼, 고향을 데이터로 만나는 경로가 필요하다.',
  },
]

/* ── ⑦ 세대 규모 — 이 문제가 몇 명의 문제인가 ──────────────
   1세대만 세면 33,272명이지만, 후손까지 세면 자릿수가 달라진다.
   **추정이므로 가정을 전부 드러낸다.** 곱셈 한 번으로 끝나는 계산에
   출처 없는 계수를 넣지 않으려고, 자손 보유율만 실측값을 쓰고
   자녀 수는 범위로 남긴다. */
const scale = {
  gen1Cumulative: 134546,      // 신청자 누계 (isan.json latest, 2026-05-31)
  gen1Alive: 33272,
  withDescendantsRate: +(survey.bases.withDescendants / survey.bases.deep * 100).toFixed(1), // 79.2%
  assumptions: [
    '자손 보유율 79.2% = 심층조사에서 자손이 있는 1세대 4,042명 ÷ 전체 응답자 5,103명 (실측)',
    '1세대 1인당 자녀 수는 공표값이 없어 2~4명 범위로 둔다 — 1950~70년대 한국의 합계출산율이 4~6명대였던 점을 상한 근거로, 이산 상황의 가구 축소를 하한 근거로 삼았다',
    '2세대의 자녀(3세대)는 세지 않았다 — 포함하면 규모는 더 커진다',
    '중복(형제자매가 각각 신청) 보정은 하지 않았다 — 실제 후손 수는 이 추정보다 작을 수 있다',
  ],
  estimate: null,   // 아래에서 계산
}
{
  const owners = Math.round(scale.gen1Cumulative * scale.withDescendantsRate / 100)
  scale.estimate = {
    ownersOfDescendants: owners,
    gen2Low: owners * 2,
    gen2High: owners * 4,
    phrase: `2세대만 세도 ${(owners * 2 / 10000).toFixed(0)}만~${(owners * 4 / 10000).toFixed(0)}만 명 규모`,
  }
}

/* ── 출력 ───────────────────────────────────────────────── */
const out = {
  builtAt: BUILT_AT,
  sources: [
    { name: '2024년 제4차 남북 이산가족 실태조사 — 보도자료(본문)', url: 'https://www.korea.kr/common/download.do?fileId=198036055&tblKey=GMN', asOf: '2025-01-24' },
    { name: '2024년 제4차 남북 이산가족 실태조사 — 주요결과 요약자료(인포그래픽)', url: 'https://www.korea.kr/common/download.do?fileId=198036056&tblKey=GMN', asOf: '2025-01-24', note: '이미지 PDF — 사람 판독' },
    { name: '통일부 이산가족 유전자검사 사업(2025년 남북협력기금 안건)', url: 'https://www.unikorea.go.kr/web/unikorea/contents/reunion_current', asOf: '2025' },
  ],
  survey, descendants, gen1Identity, recordPrograms, homeland, geneticDb,
  gaps: GAPS, scale,
  caveats: [
    '후손 관련 문항은 후손 본인이 아니라 **자손이 있는 1세대 4,042명**이 자기 자손을 평가한 값이다. 후손 본인 조사는 아직 없다.',
    '요약자료가 이미지 PDF라 이 파일의 수치는 자동 검증되지 않는다. 조사 회차가 바뀌면 손으로 갱신할 것.',
    '유전자검사 누적 인원은 언론 보도 기준이다.',
  ],
}

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(out, null, 1), 'utf8')

const pct = n => String(n).padStart(5)
console.log('═'.repeat(64))
console.log(' 후손 다리 — 근거 데이터')
console.log('═'.repeat(64))
console.log(` 조사   ${survey.name} (${survey.publishedAt})`)
console.log(`        전수 ${survey.bases.full.toLocaleString()}명 · 심층 ${survey.bases.deep.toLocaleString()}명 · 자손보유 ${survey.bases.withDescendants.toLocaleString()}명`)
console.log('─'.repeat(64))
console.log(' 간극 3종')
for (const g of GAPS) {
  console.log(`  · ${g.title}`)
  console.log(`      ${pct(g.a.pct)}%  ${g.a.label}`)
  console.log(`      ${pct(g.b.pct)}%  ${g.b.label}`)
  console.log(`      → ${g.gapPp > 0 ? '+' : ''}${g.gapPp}%p`)
}
console.log('─'.repeat(64))
console.log(' 이산가족이 1순위로 원한 사업')
recordPrograms.기록및공감대.forEach(x => console.log(`   ${pct(x.pct)}%  ${x.label}`))
console.log('─'.repeat(64))
console.log(` 규모   1세대 누계 ${scale.gen1Cumulative.toLocaleString()}명 · 생존 ${scale.gen1Alive.toLocaleString()}명`)
console.log(`        자손 보유 1세대 ${scale.estimate.ownersOfDescendants.toLocaleString()}명 → ${scale.estimate.phrase}`)
console.log('═'.repeat(64))
console.log(` → ${OUT}  (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`)
