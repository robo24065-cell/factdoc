// 판정 엔진 회귀 테스트 — runPipeline을 실제 엔진(vite SSR 로드)으로 돌려 기대 판정과 대조.
// 실행: node scripts/test-engine.mjs   (frontend/ 의 vite로 engine/index.ts를 Node에서 그대로 로드)
// 목적: "로직이 제대로 실행되는지"를 코드로 검증(엔진 수정 시 회귀 방지). 카테고리별 실제 멘트 + 기대 판정.
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
// vite는 frontend/node_modules에 있음 → frontend 기준으로 resolve해 동적 import.
const req = createRequire(new URL('../frontend/package.json', import.meta.url))
const { createServer } = await import(pathToFileURL(req.resolve('vite')).href)

// claim, expected verdict(사실 true·과장 partial·허위 false·보류 unverified), category
const CASES = [
  // 만성질환 약물오해(신규 룰 checkChronicMedMyth 타깃)
  ['고혈압 약 내성 생겨 평생 복용?', 'false', '약물오해'],
  ['혈압약은 한번 먹으면 평생 끊을 수 없는 중독성 약이다', 'false', '약물오해'],
  ['혈압약 내성 생기나요', 'false', '약물오해'],
  ['당뇨약 내성 생긴다', 'false', '약물오해'],
  ['인슐린은 한번 맞으면 평생 중독·의존된다', 'false', '약물오해'],
  ['갑상선약은 평생 노예가 되는 약이다', 'false', '약물오해'],
  ['콜레스테롤약은 평생 노예가 되는 약이다', 'false', '약물오해'],
  ['스타틴은 한번 먹으면 평생 못 끊는다', 'false', '약물오해'],
  ['혈압약 평생 먹어야 하나요?', 'partial', '약물오해(완화)'],
  ['당뇨약은 평생 먹어야 하나요', 'partial', '약물오해(완화)'],
  // 과잉주의 반례 — 룰 미발동(허위로 단정 금지). 가드 작동 시 보류면 합격(허위 아님이 핵심).
  ['혈압약은 한번 먹으면 평생 못 끊는다는데, 의사랑 상의해서 생활습관 관리로 용량을 조절하는 경우도 있다더라', 'unverified', '반례가드'],
  ['혈압약 부작용 있나요', 'unverified', '정당질문'],
  ['혈압약 언제 먹어야 하나요', 'unverified', '정당질문'],
  ['혈압약 종류가 뭐가 있나요', 'unverified', '정당질문'],
  // 대체치료(기존 replaces_treatment 경로 — 과장 이상)
  ['혈압약 끊어도 되나요', 'partial', '대체치료'],
  ['당뇨약 안 먹고 저탄고지 식단만 빡세게 하면 무조건 정상 혈당 만들 수 있대', 'partial', '대체치료'],
  ['양파즙으로 혈압약을 끊을 수 있다', 'partial', '대체치료'],
  // 완치사기
  ['당뇨는 여주즙으로 완치된다', 'false', '완치사기'],
  ['고혈압은 약초로 완치된다', 'false', '완치사기'],
  ['고혈압은 완치되지 않는다', 'true', '사실'],
  ['개 구충제로 말기 암이 완치된다', 'false', '완치사기'],
  // 건기식 질병효능(식약처 룰)
  ['홍삼이 당뇨를 예방한다', 'false', '건기식룰'],
  ['유산균이 당뇨를 치료한다', 'false', '건기식룰'],
  ['홍삼이 면역력에 도움이 된다', 'true', '건기식정상'],
  // 백신괴담
  ['독감 백신을 맞으면 오히려 독감에 걸린다', 'false', '백신괴담'],
  ['코로나 백신이 DNA를 변형시킨다', 'false', '백신괴담'],
  ['MMR 백신이 자폐를 유발한다', 'false', '백신괴담'],
  ['독감백신은 독감을 예방한다', 'true', '백신정상'],
  // 민간요법
  ['말벌주가 관절염에 좋나요', 'unverified', '민간요법'],
  // 통계인용(KNHANES)
  ['우리나라 성인 고혈압 유병률이 80%래', 'false', '통계과장'],
  ['50대 당뇨 유병률이 15%쯤 된다', 'true', '통계부합'],
  ['독감 치명률이 30%나 된다', 'false', '치명률공포'],
  // 정보질문/전염(보류 — info/전염 경로로 처리됨)
  ['고혈압이 뭔가요', 'unverified', '정보질문'],
  ['고혈압 증상이 뭐예요', 'unverified', '정보질문'],
  ['간염은 같이 밥 먹으면 옮나요', 'unverified', '전염질문'],
  ['신종 무슨바이러스가 무슨 효과 있나요', 'unverified', '보류적정'],
]

const root = fileURLToPath(new URL('../frontend', import.meta.url)) // cwd 무관
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const eng = await server.ssrLoadModule('/src/engine/index.ts')
  let pass = 0
  const fails = []
  for (const [claim, exp, cat] of CASES) {
    let got = 'ERR'
    try { got = eng.runPipeline(claim).verdict } catch (e) { got = 'ERR:' + e.message }
    if (got === exp) pass++
    else fails.push({ claim: claim.slice(0, 30), cat, exp, got })
  }
  console.log(`\n판정 엔진 회귀 테스트: ${pass}/${CASES.length} 통과 (${((pass / CASES.length) * 100).toFixed(0)}%)`)
  if (fails.length) {
    console.log('\n불일치:')
    for (const f of fails) console.log(`  [${f.cat}] "${f.claim}" 기대=${f.exp} 실제=${f.got}`)
  } else console.log('전부 통과 🎉')
  await server.close()
  process.exit(fails.length ? 1 : 0)
} catch (e) {
  console.error('엔진 로드 실패:', e.message)
  await server.close()
  process.exit(2)
}
