#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   북BTI 정적 검증 — 태그 전수·이항 균형·16코드=DB check 일치·문안 어휘·이모지 0

   왜 스크립트인가
     북BTI 는 정적 맵(데이터)이 곧 규칙이다. 항목 id 오타 하나면 그 우승은
     조용히 글자를 못 채우고, DB check 목록과 코드가 어긋나면 INSERT 가
     조용히 실패한다 — 둘 다 화면에서는 「조용히」라서 눈으로 못 잡는다.
     그래서 소스·마이그레이션·항목 자료를 글자 단위로 맞춰 본다.

   무엇을 재는가
     [1] 태그 전수 — 음식·풍경·말 각 16건이 pick-items.ts 의 id 와 정확히 일치
     [2] 이항 균형 — 음식 국8:찬8 · 말 밥8:삶8 · 풍경 산9:길7(비대칭 무해 확인값)
     [3] 밸런스 접기 — type-photo/doc → 눈 · type-oral/place/none → 귀 (5키 전수)
     [4] 16유형 — 코드 16종 = {국|찬}×{산|길}×{밥|삶}×{눈|귀} 전곱 · 별칭 유일
     [5] DB 대조 — 0015_bukbti.sql 의 check 목록 = 데이터 파일의 16코드(글자 단위)
     [6] 문안 어휘 — 이산·사망·상실 계열 금지(놀이 소재로 쓰지 않는다) · 점수/등급 화법 금지
     [7] 고지 — 「심리검사가 아니며」·「통일부 자료가 아닙니다」·누적(완성 기록) 정직 문구
     [8] 이모지 0 — 새 파일 4종(data/lib/components/pages)
     [9] ★ 축 비율 산식 — 화면이 실제로 쓰는 bukbti-ratio.mjs 를 그대로 불러 단위 검사
         (대비 매치만 셈 · 정확히 반반·대비 0회 폴백 · 비율 합 100 · 되돌린 선택 제외)
    [10] ★ 밸런스 — 여덟 문항에 「눈 답 대 귀 답」이 0개임을 단언(비율을 내지 않는 근거).
         누가 나중에 답에 눈/귀 태그를 붙이면 여기서 알람이 울린다
    [11] ★ 한 줄 요약 16종 · 자리 설명(measures·from) 4축
    [12] ★ 저장·서버 — bukbti_v1 유지(키를 올리면 집계가 오염된다) · 옛 저장분 호환 ·
         비율을 못 내는 경로가 축 통계를 지운다 · 0015 는 유형 4글자뿐(스키마 무변경)
    [13] ★ 화면 — 축 막대·자세히 보기·유형 순위·게임 결과 한 줄
    [14] ★ 모바일 축 막대 — 375px 에서 네 축이 한 줄(좌우 양 끝). 줄바꿈을 CSS 로 막았는지,
         폭을 먹던 「내 글자」 배지가 형태 신호(● · 굵기 · 밑줄)로 바뀌었는지를 소스에서 단언한다
    [15] ★ 정직 문구의 사실성 — 표본 안내가 실측 분포와 맞는지 · 맥락 밖으로 나가는 공유 그림과
         게임 결과 조각이 사유(note)와 한계 고지를 떨어뜨리지 않는지 · 내부 용어 누출

   사용법: node scripts/verify-bukbti.mjs
   나가는 값: 전부 통과 0 · 실패 1
   ────────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { countContrast, decideLetter, ratioPct } from '../frontend/src/lib/bukbti-ratio.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass: Boolean(pass) })
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`)
}

/* ── 원본 자료 ── */
const itemsTs = read('frontend/src/data/pick-items.ts')
const items = JSON.parse(itemsTs.slice(itemsTs.indexOf('const data = ') + 'const data = '.length, itemsTs.lastIndexOf('\n\nexport default')))
const bukbtiTs = read('frontend/src/data/bukbti.ts')
const libTs = read('frontend/src/lib/bukbti.ts')
const sql = read('supabase/migrations/0015_bukbti.sql')

/* ── 태그 맵 추출 — 'key': '글자' 꼴을 전부 긁는다 ── */
const tag = new Map()
for (const m of bukbtiTs.matchAll(/'([^']+)':\s*'(국|찬|산|길|밥|삶|눈|귀)'/g)) tag.set(m[1], m[2])

console.log('▶ [1] 태그 전수 — 항목 id 일치')
{
  const foodIds = items.foods.map((f) => f.id)
  const sceneIds = items.sceneries.map((s) => s.id)
  const wordIds = items.words.pairs.map((w) => w.id)
  const tagged = (prefix) => [...tag.keys()].filter((k) => k.startsWith(prefix))
  const same = (a, b) => a.length === b.length && a.every((x) => b.includes(x))
  check('음식 16건 — 태그 키 = pick-items 의 food id 전수', same(tagged('food-'), foodIds), tagged('food-').filter((k) => !foodIds.includes(k)).join(','))
  check('풍경 16건 — 태그 키 = pick-items 의 scene id 전수', same(tagged('scene-'), sceneIds), tagged('scene-').filter((k) => !sceneIds.includes(k)).join(','))
  check('말 16건 — 태그 키 = pick-items 의 word id 전수', same(tagged('word-'), wordIds), tagged('word-').filter((k) => !wordIds.includes(k)).join(','))
  check('태그 총 53건(48 항목 + 밸런스 5키), 그 외 잡키 없음',
    tag.size === 53 && [...tag.keys()].every((k) => /^(food-|scene-|word-|type-)/.test(k)), `실측 ${tag.size}건`)
}

console.log('▶ [2] 이항 균형')
{
  const count = (prefix, letter) => [...tag].filter(([k, v]) => k.startsWith(prefix) && v === letter).length
  check('음식 — 국 8 : 찬 8', count('food-', '국') === 8 && count('food-', '찬') === 8, `국 ${count('food-', '국')} · 찬 ${count('food-', '찬')}`)
  check('말 — 밥 8 : 삶 8', count('word-', '밥') === 8 && count('word-', '삶') === 8, `밥 ${count('word-', '밥')} · 삶 ${count('word-', '삶')}`)
  check('풍경 — 산 9 : 길 7 (우승 태그만 쓰므로 비대칭 무해)', count('scene-', '산') === 9 && count('scene-', '길') === 7, `산 ${count('scene-', '산')} · 길 ${count('scene-', '길')}`)
  const wrongAxis = [...tag].filter(([k, v]) =>
    (k.startsWith('food-') && !'국찬'.includes(v)) || (k.startsWith('scene-') && !'산길'.includes(v)) ||
    (k.startsWith('word-') && !'밥삶'.includes(v)) || (k.startsWith('type-') && !'눈귀'.includes(v)))
  check('축 밖 글자 없음(음식=국/찬 · 풍경=산/길 · 말=밥/삶 · 밸런스=눈/귀)', wrongAxis.length === 0, wrongAxis.map(([k]) => k).join(','))
}

console.log('▶ [3] 밸런스 접기 — BalanceGame topKey 5종 전수')
{
  const want = { 'type-photo': '눈', 'type-doc': '눈', 'type-oral': '귀', 'type-place': '귀', 'type-none': '귀' }
  const bad = Object.entries(want).filter(([k, v]) => tag.get(k) !== v)
  check('type-photo/doc → 눈 · type-oral/place/none → 귀', bad.length === 0, bad.map(([k]) => k).join(','))
}

console.log('▶ [4] 16유형 — 전곱·별칭')
const codes = [...bukbtiTs.matchAll(/code:\s*'([국찬][산길][밥삶][눈귀])'/g)].map((m) => m[1])
{
  const product = []
  for (const a of ['국', '찬']) for (const b of ['산', '길']) for (const c of ['밥', '삶']) for (const d of ['눈', '귀']) product.push(a + b + c + d)
  check('코드 16종 · 중복 없음', codes.length === 16 && new Set(codes).size === 16, `실측 ${codes.length}`)
  check('코드 집합 = {국|찬}×{산|길}×{밥|삶}×{눈|귀} 전곱', product.every((p) => codes.includes(p)))
  const aliases = [...bukbtiTs.matchAll(/alias:\s*'([^']+)'/g)].map((m) => m[1])
  check('별칭 16종 · 전부 유일', aliases.length === 16 && new Set(aliases).size === 16)
  const texts = [...bukbtiTs.matchAll(/text:\s*'([^']+)'/g)].map((m) => m[1])
  check('문안 16종 · 전부 높임말(…입니다/…십니다 꼴 맺음)', texts.length === 16 && texts.every((t) => /니다\.$/.test(t)))
}

console.log('▶ [5] DB 대조 — 0015 check 목록')
{
  const m = sql.match(/type_code in \(([\s\S]*?)\)\)/)
  const sqlCodes = m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : []
  check('0015 check 목록 16코드 = 데이터 파일 16코드(글자 단위)',
    sqlCodes.length === 16 && codes.length === 16 && sqlCodes.every((c) => codes.includes(c)) && codes.every((c) => sqlCodes.includes(c)),
    `sql ${sqlCodes.length}코드`)
  check('0015 — anon INSERT 정책만 있고 SELECT 정책이 없다', /for insert to anon/.test(sql) && !/for select/.test(sql))
  check('0015 — 권한 이중 차단(revoke all + grant insert)', /revoke all\s+on bukbti_event/.test(sql) && /grant\s+insert on bukbti_event/.test(sql))
  check('0015 — 홍수 차단 문턱 240(완성 이벤트는 드묾)', /interval '1 minute'\) >= 240/.test(sql))
  check('0015 — 집계 뷰가 type_code·n 만 내보낸다(created_at 비노출)',
    /create or replace view bukbti_tally as\s+select type_code, count\(\*\)::bigint as n/.test(sql) && /grant select on bukbti_tally to anon/.test(sql))
  check('0015 — 개인 식별 컬럼 없음(테이블 컬럼 = id·type_code·created_at 뿐)',
    !/user|session|ip |device|age|home_old/i.test(sql.match(/create table[\s\S]*?\);/)[0]))
}

console.log('▶ [6] 문안 어휘 — 놀이 소재 금지')
{
  const texts = [...bukbtiTs.matchAll(/text:\s*'([^']+)'/g)].map((m) => m[1]).join('\n')
  const banned = ['이산', '사망', '상실', '죽음', '이별', '눈물', '실향', '전쟁', '헤어']
  const hit = banned.filter((w) => texts.includes(w))
  check('문안에 이산·사망·상실 계열 어휘가 없다', hit.length === 0, hit.join(','))
  check('문안에 점수·등급·백분율 화법이 없다', !/점수|등급|%|퍼센트/.test(texts))
}

console.log('▶ [7] 고지')
{
  check('상시 고지 — 「심리검사가 아니며 통일부 자료가 아닙니다」', bukbtiTs.includes('심리검사가 아니며 통일부 자료가 아닙니다'))
  check('상시 고지 — 「고르신 선택을 그대로 세었을 뿐」(축 비율 도입 후 사실이 되는 문구)', bukbtiTs.includes('고르신 선택을 그대로 세었'))
  check('누적 정직 문구 — 「사람 수가 아니라 북BTI 완성 기록의 누적」', bukbtiTs.includes('사람 수가 아니라 북BTI 완성 기록의 누적'))
  check('결과 화면 — 같은 유형 수를 「명」이 아니라 「N번 기록」으로 적는다',
    read('frontend/src/pages/pick/BukbtiResult.tsx').includes('번 기록되었습니다'))
  check('lib — 항상 덮어쓰기(마지막 판 기준) 주석·구현', /항상 덮어쓴다|덮어쓴다/.test(libTs) && /s\.letters\[game\] = tag/.test(libTs))
  check('lib — 재기록 2겹(유형 불변 + 같은 날 같은 유형 표식)', /recorded === code/.test(libTs) && /bukbti_sent_/.test(libTs))
}

console.log('▶ [8] 이모지 0 — 새 파일')
{
  const BANNED = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/gu
  const files = [
    'frontend/src/data/bukbti.ts', 'frontend/src/lib/bukbti.ts', 'frontend/src/lib/bukbti-ratio.mjs',
    'frontend/src/components/pick/BukbtiBoard.tsx', 'frontend/src/components/pick/BukbtiNudge.tsx',
    'frontend/src/pages/pick/BukbtiResult.tsx', 'supabase/migrations/0015_bukbti.sql',
  ]
  const bad = files.filter((f) => (read(f).match(BANNED) ?? []).length > 0)
  check(`새 파일 ${files.length}종 이모지 0`, bad.length === 0, bad.join(','))
}

/* ══════════════════════════════════════════════════════════════════════════
   여기부터 — 축별 비율(2026-08-26 추가). 산식은 화면이 쓰는 파일을 그대로 부른다.
   검사가 규칙을 베껴 적으면 베낀 쪽만 맞고 화면은 틀린다.
   ══════════════════════════════════════════════════════════════════════════ */

console.log('▶ [9] 축 비율 산식 — 화면이 쓰는 bukbti-ratio.mjs 단위 검사')
{
  const T = (k) => tag.get(k)
  const 국1 = 'food-kimchi-mari', 국2 = 'food-nammae-juk', 국3 = 'food-geumgang-jatjuk'
  const 찬1 = 'food-gajami-sikhae', 찬2 = 'food-myeongtae-sundae', 찬3 = 'food-yeongchae-kimchi'
  const sane = [T(국1), T(국2), T(국3)].every((v) => v === '국') && [T(찬1), T(찬2), T(찬3)].every((v) => v === '찬')
  check('시험용 항목 6건의 태그가 국 3 · 찬 3 (아래 손계산의 전제)', sane)

  /* ① 같은 편끼리 붙은 대결은 분모에서 빠진다 — 무엇을 골라도 같은 글자라 취향을 말해 주지 않는다 */
  const mixed = [
    { win: 국1, lose: 국2 },   // 국 대 국 — 세지 않는다
    { win: 국1, lose: 찬1 },   // 대비 · 국 쪽
    { win: 찬3, lose: 국2 },   // 대비 · 찬 쪽
    { win: 찬1, lose: 찬2 },   // 찬 대 찬 — 세지 않는다
    { win: 국3, lose: 찬2 },   // 대비 · 국 쪽
  ]
  const r1 = countContrast(mixed, T, '국')
  check('대비 매치만 센다 — 다섯 대결 중 대비 3, 국 쪽 2 (분모는 15가 아니다)', r1.d === 3 && r1.a === 2, `a ${r1.a} · d ${r1.d}`)
  const d1 = decideLetter(r1.a, r1.d, '국', '찬')
  check('과반이면 그 쪽이 글자 — 2/3 이면 「국」', d1.letter === '국' && d1.src === 'ratio', `${d1.letter} · ${d1.src}`)
  const p1 = ratioPct(r1.a, r1.d)
  check('비율 반올림 — 2/3 은 67% · 33% (합 100)', p1.pctA === 67 && p1.pctB === 33 && p1.pctA + p1.pctB === 100, `${p1.pctA}/${p1.pctB}`)

  /* ② 정확히 반반 — 글자를 비율로 정하지 않고 결승 선택으로 넘긴다(화면이 그 사실을 밝힌다) */
  const tie = [{ win: 국1, lose: 찬1 }, { win: 찬2, lose: 국2 }, { win: 국3, lose: 국1 }]
  const r2 = countContrast(tie, T, '국')
  const d2 = decideLetter(r2.a, r2.d, '국', '찬')
  check('정확히 반반이면 글자를 비율로 정하지 않는다(src=final)', r2.d === 2 && r2.a === 1 && d2.letter === null && d2.src === 'final', `a ${r2.a} · d ${r2.d} · ${d2.src}`)

  /* ③ 대비 매치 0회 — 대진표가 한쪽으로만 붙은 판 */
  const none = [{ win: 국1, lose: 국2 }, { win: 찬1, lose: 찬2 }]
  const r3 = countContrast(none, T, '국')
  const d3 = decideLetter(r3.a, r3.d, '국', '찬')
  check('대비 매치 0회면 비율을 내지 않는다(src=none)', r3.d === 0 && d3.letter === null && d3.src === 'none', `d ${r3.d} · ${d3.src}`)

  /* ④ 태그 밖 key 는 조용히 건너뛴다 — 놀이가 깨지지 않는다 */
  const r4 = countContrast([{ win: 'food-없는것', lose: 찬1 }, { win: 국1, lose: 찬1 }], T, '국')
  check('태그에 없는 항목이 섞여도 그 대결만 건너뛴다', r4.d === 1 && r4.a === 1, `a ${r4.a} · d ${r4.d}`)

  /* ⑤ 비율 합은 언제나 100 — 분모 1~15 전수 */
  let sum100 = true
  for (let d = 1; d <= 15; d += 1) for (let a = 0; a <= d; a += 1) {
    const p = ratioPct(a, d)
    if (p.pctA + p.pctB !== 100 || p.pctA < 0 || p.pctA > 100) sum100 = false
  }
  check('분모 1~15 · 분자 전수에서 두 쪽 비율 합이 항상 100', sum100)

  /* ⑥ 되돌린 선택은 분모·분자 어디에도 남지 않는다 — Tournament 의 push/pop 을 그대로 재현 */
  const picks = []
  picks.push({ win: 국1, lose: 찬1 })     // 국 쪽
  picks.push({ win: 찬2, lose: 국2 })     // 찬 쪽
  picks.pop()                              // ← 한 판 되돌리기
  picks.push({ win: 국3, lose: 찬2 })     // 다시 고름 — 국 쪽
  const r5 = countContrast(picks, T, '국')
  check('되돌린 선택은 비율에 남지 않고, 다시 고른 선택이 들어간다 — 2/2', r5.d === 2 && r5.a === 2, `a ${r5.a} · d ${r5.d}`)
}

console.log('▶ [10] 밸런스 — 「눈 답 대 귀 답」 문항이 0개(그래서 비율을 내지 않는다)')
{
  const balTs = read('frontend/src/data/pick-balance.ts')
  const arr = balTs.slice(balTs.indexOf('export const BALANCE_QUESTIONS'))
  const blocks = arr.split(/\n {2}\{\n/).slice(1)
  const letters = (chunk) => {
    const m = chunk.match(/types:\s*\[([^\]]*)\]/)
    if (!m) return new Set()
    return new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => tag.get(`type-${x[1]}`)).filter(Boolean))
  }
  const contrast = []
  for (const b of blocks) {
    const cut = b.indexOf('\n    b: {')
    if (cut < 0) continue
    const la = letters(b.slice(0, cut))
    const lb = letters(b.slice(cut))
    if (la.size === 1 && lb.size === 1 && [...la][0] !== [...lb][0]) contrast.push(b.slice(0, b.indexOf('\n')))
  }
  check('밸런스 8문항을 훑어 대비 문항 0개 확인', blocks.length === 8 && contrast.length === 0, `문항 ${blocks.length} · 대비 ${contrast.length}`)
  check('데이터 파일이 밸런스 축은 비율을 내지 않는다고 밝힌다', bukbtiTs.includes('눈과 귀로 갈리지 않아 비율을 내지 않습니다'))
  check('lib — 밸런스 축은 비율 대신 그 이유를 화면에 준다',
    /game === 'balance'/.test(libTs) && /눈과 귀로 갈리지 않아 비율을 내지 않습니다/.test(libTs))
}

console.log('▶ [11] 한 줄 요약 16종 · 자리 설명 4축')
{
  const ones = [...bukbtiTs.matchAll(/oneLine:\s*'([^']+)'/g)].map((m) => m[1])
  const aliases = [...bukbtiTs.matchAll(/alias:\s*'([^']+)'/g)].map((m) => m[1])
  const texts = [...bukbtiTs.matchAll(/text:\s*'([^']+)'/g)].map((m) => m[1])
  check('한 줄 요약 16종 · 전부 유일', ones.length === 16 && new Set(ones).size === 16, `실측 ${ones.length}`)
  check('한 줄 요약이 별칭·문안과 겹치지 않는다',
    ones.every((o) => !aliases.includes(o) && !texts.includes(o)))
  const banned = ['이산', '사망', '상실', '죽음', '이별', '눈물', '실향', '전쟁', '헤어', '매우', '강한', '뚜렷']
  const hit = banned.filter((w) => ones.join('\n').includes(w))
  check('한 줄 요약에 금지 어휘·정도 부사(매우·강한·뚜렷)가 없다', hit.length === 0, hit.join(','))
  check('한 줄 요약에 점수·등급·백분율 화법이 없다', !/점수|등급|%|퍼센트/.test(ones.join('\n')))
  const measures = [...bukbtiTs.matchAll(/\n\s+measures:\s*'([^']+)'/g)].map((m) => m[1])
  const froms = [...bukbtiTs.matchAll(/\n\s+from:\s*'([^']+)'/g)].map((m) => m[1])
  check('네 축 전부 measures(이 자리가 재는 것) 보유', measures.length === 4 && new Set(measures).size === 4, `실측 ${measures.length}`)
  check('네 축 전부 from(어느 게임에서 어떻게 나왔는지) 보유', froms.length === 4 && new Set(froms).size === 4, `실측 ${froms.length}`)
}

console.log('▶ [12] 저장·서버 — 기기 안에만, 스키마 무변경')
{
  const lib = libTs
  check('localStorage 키를 올리지 않았다(bukbti_v1 유지 — 올리면 같은 유형이 한 번 더 INSERT 된다)',
    /const KEY = 'bukbti_v1'/.test(lib) && !/'bukbti_v2'/.test(lib))
  check('axes 는 선택적 필드 — 옛 저장분(비율 없음)과 그대로 호환된다', /axes\?:\s*BukbtiAxes/.test(lib))
  check('옛 저장분은 「이전에 하신 판」으로 정직하게 떨어진다',
    /'legacy'/.test(lib) && lib.includes('이전에 하신 판이라 비율이 남아 있지 않습니다'))
  check('저장분 검증 — 정수·0<=a<=d<=total<=15·src 세 리터럴',
    /Number\.isInteger/.test(lib) && /an > dn \|\| dn > tn \|\| tn > 15/.test(lib))
  check('★ 비율을 못 내는 경로가 그 축의 옛 비율을 지운다(거짓 비율 방지)', /delete .*axes\[game\]/.test(lib))
  check('lib — 여전히 항상 덮어쓰기(마지막 판 기준)', /s\.letters\[game\] = tag/.test(lib))
  check('서버로 가는 것은 유형 4글자뿐 — insert 는 type_code 하나', /insert\(\{ type_code: code \}\)/.test(lib))
  check('0015 무변경 — 비율·횟수 컬럼이 없다', !/ratio|axes|pct|percent|contrast/i.test(sql))
}

console.log('▶ [13] 화면 — 축 막대·자세히 보기·순위·게임 결과 한 줄')
{
  const res = read('frontend/src/pages/pick/BukbtiResult.tsx')
  const nudge = read('frontend/src/components/pick/BukbtiNudge.tsx')
  const tour = read('frontend/src/pages/pick/Tournament.tsx')
  const chooseBody = tour.slice(tour.indexOf('function choose('), tour.indexOf('function undo('))
  const undoBody = tour.slice(tour.indexOf('function undo('), tour.indexOf('/* 키보드'))
  check('Tournament — 선택 이력은 멱등 가드 뒤에서만 쌓인다(중복 스냅샷 회귀 방지)',
    /acted\.current = k[\s\S]*setPicks\(p => \[\.\.\.p/.test(chooseBody))
  check('Tournament — 되돌리기가 선택 이력도 함께 뺀다', /setPicks\(p => p\.slice\(0, -1\)\)/.test(undoBody))
  check('Tournament — 처음부터가 선택 이력을 비운다', /setPicks\(\[\]\)/.test(tour))
  check('Tournament — 결승 확정이 고르신 것 전부로 비율을 낸다', /updateBukbtiFromMatches\(g, picks, itemKey\(winner\)\)/.test(tour))
  check('결과 화면 — 네 자리 축 막대 구획', res.includes('data-bukbti-axes') && res.includes('data-bukbti-axis'))
  check('결과 화면 — 비율 옆에 횟수를 늘 병기한다(n 상시 병기 규약)',
    res.includes('bukbtiCountLine') && res.includes('번이 그런 대결이었습니다'))
  check('결과 화면 — 「같은 편끼리 맞붙은 대결은 세지 않았습니다」 설명',
    bukbtiTs.includes('같은 편끼리 맞붙은 대결은 세지 않았습니다') && res.includes('BUKBTI_RATIO_HOW'))
  check('결과 화면 — 비율을 취향의 세기로 읽지 않게 하는 문구', res.includes('BUKBTI_RATIO_LIMIT') && bukbtiTs.includes('취향의 세기나 확신을 재는 값이 아니고'))
  check('결과 화면 — 자리별 설명 「자세히 보기」(접힘 기본 · 48px · 키보드 기본 동작)',
    /<details/.test(res) && res.includes('네 자리가 각각 무엇인지 자세히 보기') && /<summary[\s\S]{0,200}\$\{TAP\}/.test(res))
  check('결과 화면 — 유형 코드 옆 한 줄 요약', res.includes('type.oneLine'))
  check('결과 화면 — 내 유형 순위 한 줄(사람 수가 아니라 완성 기록의 순위)',
    res.includes('번째</b>로 기록이 많습니다') && res.includes('사람 수가 아니라 완성 기록의 순위입니다'))
  check('결과 화면 — 「명」으로 세는 문장이 없다(없는 통계 금지)', !/[0-9}]\s*명/.test(res))
  check('공유 그림 — 네 축 비율 블록(사진 없음 규약 유지)',
    res.includes('네 자리 비율 — ') && /if \(!measure\) \{\s*\n\s*const mineIsA/.test(res))
  check('게임 결과 화면 — 그 축의 비율 한 줄', nudge.includes('data-bukbti-ratio') && nudge.includes('bukbtiAxisView'))
}

console.log('▶ [14] ★ 모바일 축 막대 — 375px 에서 네 축이 한 줄(좌우 양 끝)')
{
  /* 실측(CDP 9810, 개발서버 5178, 저장분 food 7/9 · scene 2/11 · word 3/6 동률 · balance 비율 없음)
       320·375·414·768·1280px 다섯 폭 × 글자크기 보통/아주 크게 두 벌에서 네 축 전부 한 줄,
       가로 초과 0px. 320px·20px 글자에서도 왼쪽 조각은 x=125 에서 끝나고 오른쪽 조각은
       x=237 에서 시작해 112px 이 남는다.
     이 검사는 그 결과를 **CSS 규칙으로** 못 박는다 — 글자가 짧아 우연히 붙어 있는 것과
     줄바꿈이 불가능한 것은 다르다. 배지 하나만 되살려도 다시 터진다(그게 원래 사고였다). */
  const res = read('frontend/src/pages/pick/BukbtiResult.tsx')
  const side = res.slice(res.indexOf('function AxisSide('), res.indexOf('function AxisRow('))
  const row = res.slice(res.indexOf('function AxisRow('), res.indexOf('/* ══════════ 공유 PNG'))
  check('AxisSide/AxisRow 두 함수를 찾았다(아래 단언의 전제)', side.length > 200 && row.length > 400, `side ${side.length} · row ${row.length}`)

  const labels = row.split('\n').find((l) => l.includes('data-axis-labels')) ?? ''
  const labelsCls = row.slice(Math.max(0, row.indexOf('data-axis-labels') - 260), row.indexOf('data-axis-labels'))
  check('라벨 줄 — flex-nowrap(줄바꿈 금지) + justify-between(좌우 양 끝)',
    /flex-nowrap/.test(labelsCls) && /justify-between/.test(labelsCls) && labels.includes('data-axis-labels'))
  check('양쪽 조각 — whitespace-nowrap + shrink-0 (조각 안에서도 안 쪼개지고 안 줄어든다)',
    /whitespace-nowrap/.test(side) && /shrink-0/.test(side))
  check('라벨 줄에 min-w-0 이 없다(0 까지 줄어들면 글자가 세로로 쌓인다 — 원래 사고의 원인)',
    !/min-w-0/.test(side) && !/min-w-0/.test(labelsCls))
  check('한쪽은 왼쪽 정렬 · 다른 쪽은 오른쪽 정렬(양 끝에 선다)',
    /text-right/.test(side) && /text-left/.test(side) && /end \? /.test(side))

  /* 「내 글자」 — 보이는 배지를 없앴다. 대신 형태 신호 셋. 색만으로 구분하지 않는다는 규약은 그대로 */
  const visibleBadge = [...row.matchAll(/내 글자/g)].length
  check('라벨 줄에 「내 글자」 배지 글자가 없다(폭을 먹어 줄을 터뜨리던 원인)', visibleBadge === 0, `AxisRow 안 ${visibleBadge}건`)
  check('「내 글자」는 읽어 주는 기계에만 남는다(sr-only)', /sr-only[^>]*>\s*[^<]*내 글자/.test(side))
  check('내 글자 3중 부호화 — ● 도형 · 굵기 · 밑줄(색만으로 구분하지 않는다)',
    side.includes('●') && /font-bold/.test(side) && /underline/.test(side) && /decoration-2/.test(side))

  /* 횟수 줄 — 각 글자 쪽 끝. 이 줄도 한 줄이어야 한다 */
  const counts = row.slice(row.indexOf('data-axis-counts') - 320, row.indexOf('</p>', row.indexOf('data-axis-counts')))
  check('횟수 줄 — 각 글자 쪽 끝에 붙고(n 상시 병기) 이 줄도 flex-nowrap 한 줄',
    /data-axis-counts/.test(row) && /flex-nowrap/.test(counts) && /justify-between/.test(counts) &&
    (counts.match(/whitespace-nowrap/g) ?? []).length >= 3)
  check('횟수는 반올림한 %에서 되계산하지 않는다 — 저장된 분자·분모를 그대로 쓴다',
    /\{view\.a\}번/.test(counts) && /\{view\.d - view\.a\}번/.test(counts) && /\{view\.d\}번/.test(counts))
  check('막대 안에 글자를 넣지 않는다(22% 칸에는 11px 도 안 들어간다)',
    /aria-hidden="true"\s*\n\s*className=\{`block h-full/.test(row))
  check('비율이 없는 축은 막대 대신 점선(없는 비율을 그리지 않는다)', /border-dashed/.test(row))
}

console.log('▶ [15] ★ 정직 문구의 사실성 — 표본 안내 · 공유 그림 · 조각 · 내부 용어')
{
  const res = read('frontend/src/pages/pick/BukbtiResult.tsx')
  const nudge = read('frontend/src/components/pick/BukbtiNudge.tsx')
  const files = { 'data/bukbti.ts': bukbtiTs, 'lib/bukbti.ts': libTs, 'BukbtiResult.tsx': res, 'BukbtiNudge.tsx': nudge }

  /* ① 표본 안내는 실측이어야 한다. 옛 문구 「여섯에서 여덟」은 실측 분포의 65%밖에 덮지 못했다
       (대진 규칙 그대로 120만 판: 네 번~열한 번이 98.4% · 중앙 여섯 · 최소 1 · 최대 15).
       네 파일 어디에도 옛 숫자가 남으면 안 된다 — 한 곳만 고치면 다음 사람이 옛 숫자를 되살린다 */
  const stale = Object.entries(files).filter(([, s]) => s.includes('여섯에서 여덟'))
  check('옛 표본 안내(「여섯에서 여덟」)가 네 파일 어디에도 없다', stale.length === 0, stale.map(([f]) => f).join(','))
  check('표본 안내가 실측 범위(네 번~열한 번)로 적혀 있다',
    /네 번에서 열한 번/.test(bukbtiTs) && bukbtiTs.includes('대결 수는 판마다 다릅니다'))
  check('lib 주석도 같은 실측 숫자를 가리킨다(둘이 어긋나면 옛 숫자가 되살아난다)',
    /네 번에서 열한 번/.test(libTs))

  /* ② 내부 용어 누출 — 「대비 매치」·「대비된 대결」은 우리끼리 쓰는 말이다.
       화면 문구(따옴표 안 한국어)에 나오면 안 된다. 주석·식별자는 그대로 둔다 */
  const leak = Object.entries(files).filter(([, s]) =>
    [...s.matchAll(/[`'"]([^`'"\n]*대비[^`'"\n]*)[`'"]/g)].some((m) => /대비된 대결|대비 매치 \d|「대비/.test(m[1])))
  check('화면 문구에 내부 용어(「대비된 대결」)가 새지 않는다', leak.length === 0, leak.map(([f]) => f).join(','))
  check('동률 사유도 다른 자리와 같은 말을 쓴다(「서로 다른 쪽이 맞붙은 대결 …」)',
    /note = `서로 다른 쪽이 맞붙은 대결 \$\{st\.d\}번을/.test(libTs))

  /* ③ 공유 그림 — 맥락 밖으로 나가는 유일한 산출물이다. 비율이 있는 가지에서도
       사유(note)를 떨어뜨리면 그림만 보는 사람에게 그 글자의 근거가 사라진다 */
  const paint = res.slice(res.indexOf('function paintBukbti('), res.indexOf('async function renderBukbtiPng('))
  const branches = (paint.match(/if \(v\.note\) line\(v\.note,/g) ?? []).length
  check('공유 그림 — 비율이 있는 가지·없는 가지 **둘 다** 사유(note)를 싣는다', branches === 2, `실측 ${branches}가지`)
  check('공유 그림 — 한계 고지(비율은 취향의 세기가 아님)를 함께 싣는다',
    paint.includes('BUKBTI_RATIO_LIMIT_SHORT') && bukbtiTs.includes('취향의 세기가 아닙니다'))
  check('공유 그림 — measure/paint 대칭(글자는 두 패스 모두, 사각형만 !measure 안)',
    !/if \(!measure\)[^\n]*\n\s*line\(/.test(paint) && /if \(!measure\) \{\s*\n\s*const mineIsA/.test(paint))

  /* ④ 게임 결과 조각 — 비율과 사유가 배타적이면 동률 판에서 「50%입니다」로 끝난다 */
  check('조각 — 비율과 사유가 배타적이지 않다(삼항으로 하나만 고르지 않는다)',
    !/const ratioLine = [^\n]*: view\.note/.test(nudge) && /ratioLine && noteLine|ratioLine \|\| noteLine/.test(nudge))
  check('조각 — 한계 고지 한 줄이 함께 간다', nudge.includes('BUKBTI_RATIO_LIMIT_SHORT'))
}

const failed = results.filter((r) => !r.pass).length
console.log(`\n${failed ? '✗' : '✓'} ${results.length - failed}/${results.length} 통과`)
process.exit(failed ? 1 : 0)
