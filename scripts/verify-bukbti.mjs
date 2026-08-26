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

   사용법: node scripts/verify-bukbti.mjs
   나가는 값: 전부 통과 0 · 실패 1
   ────────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
  check('상시 고지 — 「마지막 선택을 그대로 접었을 뿐」', bukbtiTs.includes('마지막 선택을 그대로 접었'))
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
    'frontend/src/data/bukbti.ts', 'frontend/src/lib/bukbti.ts',
    'frontend/src/components/pick/BukbtiBoard.tsx', 'frontend/src/components/pick/BukbtiNudge.tsx',
    'frontend/src/pages/pick/BukbtiResult.tsx', 'supabase/migrations/0015_bukbti.sql',
  ]
  const bad = files.filter((f) => (read(f).match(BANNED) ?? []).length > 0)
  check(`새 파일 ${files.length}종 이모지 0`, bad.length === 0, bad.join(','))
}

const failed = results.filter((r) => !r.pass).length
console.log(`\n${failed ? '✗' : '✓'} ${results.length - failed}/${results.length} 통과`)
process.exit(failed ? 1 : 0)
