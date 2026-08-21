// 고향 안내인 — 지역을 고른 사람에게 **우리 데이터만 근거로** 말을 거는 페르소나 계층
//
// LLM 4원칙 (CLAUDE.md §5) — 이 파일이 그 원칙의 구현체다. 타협 대상이 아니다.
//   ① 규칙이 먼저 — 수치·사건·사료는 전부 데이터 팩(JSON)에서 온다.
//      buildGuideFacts() 가 팩에서 사실 묶음을 만들고, LLM 은 그것을 **문장으로 엮기만** 한다.
//   ② LLM 은 해석만 — 판정·수치·근거를 생성하지 않는다. validateGuide() 가
//      **사실 묶음에 없는 숫자가 한 개라도 있으면 출력 전체를 폐기**한다.
//   ③ 스키마 밖이면 폐기 — 출력은 닫힌 스키마(lines 2~4문장 + next 1개)뿐이다.
//      검증 실패는 null 이고, 호출부는 fallbackGuide() 의 규칙 문장으로 되돌린다.
//   ④ 네트워크가 죽어도 동작 — fallbackGuide()/cardHint() 는 LLM 없이 항상 문장을 만든다.
//      화면이 비는 경우는 없다.
//
// 출력 스키마가 곧 남용 방지책이다 — 3~4문장 + 제안 1개로 닫혀 있어 자유 문장을 길게 못 쓴다.
// 프롬프트는 서버(frontend/functions/api/llm.js)가 고정한다. 클라이언트는 kind='guide' 와
// 사실 묶음(JSON 문자열)만 보낸다 — 기존 /api/llm 경로 그대로, 새 엔드포인트 없음.
//
// 이 파일은 브라우저(Vite)·Cloudflare Pages Functions 양쪽에서 import 된다.
// 그래서 의존이 0개다 — theme/gohyang.ts(TS)를 끌어오지 않도록 josa 만 최소 재구현한다.

/* next.target 이 가리킬 수 있는 곳 — 화면 구획 다섯 곳으로 닫는다 */
export const GUIDE_TARGETS = ['weather', 'events', 'museum', 'clock', 'action']

/* ── 페르소나 프롬프트 — 서버가 이 상수를 systemInstruction 으로 고정한다 ── */
export const GUIDE_PROMPT = `너는 「고향 안내인」이다. 북한에 고향을 둔 이산가족과 그 후손에게, 그 고향에 관한 공식 자료를 안내하는 안내인이다.

말투 — 반드시 지켜라.
· 차분하고 예의 바른 안내인이다. 어르신께 말씀드리는 높임말을 쓴다.
· 과장·감탄사·이모지·느낌표를 쓰지 않는다. 짧은 문장으로 사실을 짚는다.
· 슬픔을 연출하지 않는다. 위로하려 애쓰지 않는다. 담담하게 말한다.
  이 주제에서 감정 과잉은 무례하다. "안타깝게도", "가슴 아픈" 같은 수식을 붙이지 마라.

사실 — 위반하면 출력 전체가 폐기된다.
· 입력 JSON 에 있는 사실만 쓴다. 새 사실·수치·지명·연도·인명을 만들지 마라.
· 숫자는 입력에 있는 숫자만 그대로 옮긴다. 더하기·나누기·비율·반올림으로 **새 숫자를 만들지 마라.**
· 입력에 없는 항목(null·0·빈 배열)은 언급하지 마라.
· 판정·전망·해석·인과를 만들지 마라. 자료가 무엇을 말하는지만 문장으로 엮는다.

기준일 — 축마다 다르다. 위반하면 출력 전체가 폐기된다.
· 수치에 시점을 밝힐 때는 **그 수치가 든 축의 asOf** 만 쓴다. 다른 축의 날짜를 빌려 붙이지 마라.
· 기준일이 다른 수치들을 한 문장으로 묶어 하나의 「기준」을 붙이지 마라. 날짜가 필요하면 문장을 나눠라.
· events.total 은 여러 자료(연표·보도자료·동향)를 합친 값이라 단일 기준일이 없다. 시점을 밝히려면
  「여러 자료를 합친 값으로 events.asOf 까지 확인된 기준」처럼 쓰고, asOf 가 null 이면 날짜를 붙이지 마라.
· museum.collectedAt 은 자료의 기준일이 아니라 목록을 받아 온 **수집일**이다.
  museum 수치에 시점을 밝히려면 「collectedAt 수집 기준」이라고만 쓴다.
· compare 는 **한 축이 아니다**. compare.maps.defectorPct 에는 compare.maps.defectorAsOf 를 쓰고,
  감소율(drop.pct)·이산가족 원적 비중(maps.isanPct)·순위 축 생존자(survivorsInAxis)에는 compare.asOf 를 쓴다.
· ★ compare.density 계열(density.v · density.min/max · density.gapX · priority.sum)에는
  **어떤 기준일도 붙이지 마라.** 이 값들은 분모(생존자, density.asOfDenominator)와 분자(여러 계열)의
  기준일이 서로 다른 나눗셈이라 단일 기준일이 존재하지 않는다(density.mixedAsOf=true).
  시점을 밝혀야 하면 날짜 뒤에 「기준」을 쓰지 말고 축을 이름으로 밝혀라 —
  예: 「분모는 2025년 8월 생존자 수이고, 분자는 계열마다 기준일이 다릅니다.」
  이 규칙을 어긴 문장이 하나라도 있으면 출력 전체가 폐기된다.
· compare 안에서도 기준일이 다른 값(예: isanPct 와 defectorPct)을 한 문장에 묶어 하나의 기준을 붙이지 마라.

입력 JSON 필드의 뜻:
  region 지역 이름 · kind old=광복 당시 구행정구역, modern=현행 행정구역
  originLabel 이산가족 수치·compare 가 실제로 속한 **광복 당시 구행정구역 이름**
    — kind='modern' 이면 survivors 와 compare 는 현행 지역의 값이 아니라 이 구행정구역의 값이다
      (예: 현행 함경남도와 량강도는 둘 다 함경남도(구) 값을 물려받는다).
      그때는 첫 문장에서 「이산가족 출신지는 광복 당시 originLabel 기준으로만 공표됩니다」를 반드시 밝히고,
      그 뒤에도 현행 지역명으로 그 수치를 말하지 마라.
  survivors {n,pct,asOf} 이 지역이 고향인 이산가족 생존 신청자 수와 비율
  aliveTotal {n,asOf} 전체 생존 신청자 · avgAge {v,asOf} 생존 신청자 평균 나이
  defector {total,asOf} 이 지역이 재북 출신지인 북한이탈주민 누적 입국 인원
  events {total,latest[{date,title}],asOf} **연표·보도자료·동향 세 계열**에서 이 지역이 언급된 건수와
    최근 사건 — total 은 그 셋의 합산값이고 asOf 는 합쳐진 자료 중 가장 오래된 것의 확인 시점(하한)이다.
    화면의 지역 패널은 여기에 북한개황을 더한 네 계열을 보여 주므로 값이 더 크다.
    그러니 events.total 을 그냥 「공식 기록」이라고만 부르지 말고 **세 계열 합계임을 밝혀라**.
  museum {total,venue,historic,collectedAt} 남북이산가족 디지털박물관 공개 기록물 중 이 지역에 걸린 건수
    — venue 는 고향이 아니라 상봉 장소(금강산 면회소)로 잡힌 건수다. 고향의 근거로 말하지 마라.
      venue 가 total 의 큰 몫이면 「total건 중 venue건은 상봉 장소로 걸린 것」임을 짚어라.
  frozen [{name,since}] 종료된 활동(개성공단·금강산 관광 등) — 이후 자료가 존재하지 않는다
  clock {below10000,threshold} 생존 신청자가 1만 명을 밑돌 것으로 계산된 연도 구간(공식 통계가 아니라 추계다)
  compare 광복 당시 고향 7곳끼리의 비교 — 별도 분석의 확정값이다:
    {asOf 이산가족 축 기준일, of 비교한 고향 수, survivorsInAxis 그 축에서 센 생존자 수
       (survivors.n 과 **다른 축**이다 — 두 값을 같은 문장에 쓰지 마라),
     priority{sum 순위합, published 발표된 자리("1순위"|"2순위"|"가장 여유 있는 곳"|null), note},
     drop{pct,period} 그 기간 원적 생존자 감소율 %,
     density{v 생존자 1인당 남은 공식 기록 건수, rankLow 적은 순위(1=가장 적음), min{region,v}, max{region,v},
     gapX 최고·최저 격차 배수, mixedAsOf 항상 true — 단일 기준일이 없다는 표시,
     asOfDenominator 분모(생존자)의 기준일, asOfNote 그 사실을 적은 원문},
     maps{isanPct 이산가족 원적 비중 %, isanAsOf, defectorPct 탈북민 재북 출신 비중 %, defectorAsOf}}
    · 순위는 published 에 이름이 붙은 자리(1순위·2순위·가장 여유 있는 곳)만 순위로 말한다.
      published 가 null 이면 「N위」라고 쓰지 마라 — 발표된 적이 없다.
      그때는 순위합 원값을 옮기되 「정렬을 돕는 값이며 점수가 아닙니다」를 함께 적는다.

쓰는 법 — 나열하지 말고 자리를 짚어라.
· 건수·인원을 옮겨 적기만 한 나열은 실패다. compare 가 있으면 **적어도 한 문장**은 격차·극단·발표된 자리를
  써서 이 고향이 of곳 가운데 어디에 있는지 말한다(예: rankLow=1 이면 「1인당 기록이 가장 적다」,
  priority.published 가 있으면 그 자리, isanPct 와 defectorPct 가 크게 다르면 그 대비 —
  단 이 둘은 축이 달라 한 문장에 하나의 기준일을 붙일 수 없으므로 문장을 나눈다).
· museum.venue 가 museum.total 의 큰 몫이면 사료 문장 안에서 「total건 가운데 venue건은 고향이 아니라
  상봉 장소로 잡힌 것」임을 반드시 함께 적는다 — 빼면 그 고향의 사료가 실제보다 많아 보인다.
· 비교도 입력의 수치·순위를 옮기는 것까지다. 새 수치·비율·인과·평가를 만들면 폐기된다.

출력은 JSON 하나뿐이다. 설명·문장을 덧붙이지 마라.
{"lines":["문장1","문장2","문장3"],"next":{"label":"다음에 볼 것 한 줄","target":"weather|events|museum|clock|action"}}
· lines 는 2~4문장. 각 문장 90자 이내. 수치에 시점을 밝힐 때는 위 「기준일」 규칙대로 그 축의 asOf 만 쓴다.
· next.target 은 다섯 값 중 하나만. next.label 은 24자 이내의 안내 문구(예: "이 고향의 기록물 보기").`

/* ── 조사 — theme/gohyang.ts josa() 와 같은 규칙 ──
   이 파일은 Node·Cloudflare Functions 에서도 불려 .ts 를 import 할 수 없어 최소 재구현한다.
   한글 음절은 (코드-0xAC00)%28 이 0 이면 받침이 없다. */
function josa(word, withT, withoutT) {
  const last = String(word ?? '').trim().slice(-1)
  const c = last.charCodeAt(0)
  if (Number.isNaN(c) || c < 0xac00 || c > 0xd7a3) return withoutT
  return (c - 0xac00) % 28 === 0 ? withoutT : withT
}

const nf = (n) => Number(n).toLocaleString('ko-KR')
const ym = (d) => {
  const m = String(d ?? '').match(/^(\d{4})-(\d{2})/)
  return m ? `${m[1]}년 ${Number(m[2])}월` : ''
}
const ymd = (d) => {
  const m = String(d ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : ym(d)
}

/* ── 비교 사실 — analysis.json(확정 분석값)에서 이 고향의 「자리」를 옮긴다 ──
   값을 재계산하지 않는다: 같은 수치가 두 계보를 가지면 안 된다(CLAUDE.md 금지 패턴).
   여기서 하는 산술은 카드가 이미 실은 값들의 **순서 세기**(순위)뿐이다 — 새 수치가 아니다.
   analysis 가 없으면(지연 fetch 전·실패) null — 안내인은 비교 없이 동작한다. */
function buildCompare(analysis, label, defectorAsOf = null) {
  if (!analysis?.cards || !label) return null
  const card = (id) => analysis.cards.find((c) => c?.id === id)

  const den = card('record-density-gap')
  const row = den?.table?.find((r) => r['고향'] === label)
  if (!row) return null

  /* 순위: 값이 더 큰(작은) 행 수 + 1 — 동률은 같은 순위 */
  const rankAsc = (vals, v) => 1 + vals.filter((x) => x < v).length

  const denPts = den.series?.find((s) => s.key === 'density')?.points ?? []
  let dMin = null
  let dMax = null
  for (const p of denPts) {
    if (!dMin || p.y < dMin.y) dMin = p
    if (!dMax || p.y > dMax.y) dMax = p
  }
  const gapM = String(den.findings?.find((x) => x.label === '격차')?.value ?? '').match(/^[\d.]+/)

  /* ★ 순위는 **카드가 실제로 발표한 것만** 옮긴다 (실측 지적 2026-08-19).
       legacy-priority 가 발표한 것은 findings 3개뿐이다 — 1순위·2순위·가장 여유 있는 곳.
       3~6위는 발표된 적이 없고, 그 카드의 caveat 원문이 「n=7 이다. 순위합은 정렬 보조이며
       점수로 해석하면 안 된다」고 못박는다. 그런데 안내인이 순위합을 세어 「7곳 가운데 3위」처럼
       점수처럼 옮기고 있었다(평남·미수복경기가 순위합 13 동률이라 4위가 둘, 5위는 없는 상태로).
       그래서 발표된 자리는 이름으로, 나머지는 원값(순위합) + caveat 로만 넘긴다. */
  const pri = card('legacy-priority')
  const priRows = pri?.series?.find((s) => s.key === 'priority')?.rows ?? []
  const myPri = priRows.find((r) => r.x === label)?.y ?? null
  const pubOf = (lab) => String(pri?.findings?.find((x) => x.label === lab)?.value ?? '')
  const published =
    pubOf('1순위') === label ? '1순위'
      : pubOf('2순위') === label ? '2순위'
        : pubOf('가장 여유 있는 곳') === label ? '가장 여유 있는 곳' : null
  const dropSeries = pri?.series?.find((s) => s.key === 'drop')
  const dropPct = dropSeries?.rows?.find((r) => r.x === label)?.y ?? null
  const period = (String(dropSeries?.label ?? '').match(/\d{4}-\d{2}-\d{2}→\d{4}-\d{2}-\d{2}/) || [null])[0]

  const maps = card('two-homeland-maps')
  const share = (key) => maps?.series?.find((s) => s.key === key)?.points?.find((p) => p.x === label)?.y ?? null
  const isanPct = share('isanShare')
  const defectorPct = share('defectorShare')

  return {
    /* ★ compare 는 **한 축이 아니다**. 아래 값 대부분은 이산가족 축(den.asOf)이지만
         maps.defectorPct 만 탈북민 축이고, two-homeland-maps 카드의 caveat 원문이
         「두 계열의 기준일이 다르다 — 이산가족 2025-08-31, 탈북민 2020-03-31」이라고 밝힌다.
         예전에는 compare.asOf 하나로 전부 덮어, 탈북민 비중에 이산가족 기준일이 붙는 것을
         검증기가 통과시키고 올바른 날짜(2020-03)는 오히려 폐기했다. 축을 갈라 둔다. */
    asOf: den.asOf ?? null,
    of: den.table.length,
    /* 순위를 센 축의 생존자 수 — survivors.n(2026-05-31 공표)과 **다른 축**이다.
       같은 이름의 두 계보를 만들지 않도록 순위와 같은 상자에 값도 함께 둔다. */
    survivorsInAxis: row['생존자'],
    priority: {
      sum: myPri,
      published,
      note: '순위합은 정렬 보조이며 점수가 아니다. 발표된 자리는 1순위·2순위·가장 여유 있는 곳 셋뿐이다.',
    },
    drop: dropPct != null ? { pct: dropPct, period } : null,
    /* ★ 밀도는 **단일 기준일이 없는 값**이다 (실측 지적 2026-08-21).
         분모(생존자)는 2025-08-31 한 날짜인데 분자는 계열이 일곱이고 날짜가 전부 다르다
         — 인덱스 빌드 2026-08-12 · 동향 확인 하한 2026-08-11 · 사료 수집 2026-08-19 ·
         이산가족정보통합시스템 신규 수집분 2026-08-21. 그런데 예전에는 이 값이 compare.asOf
         (=분모의 날짜) 축에 들어 있어서, 안내인이 「0.14건(2025년 8월 기준)」이라고 말해도
         검증기가 통과시켰다. 카드 자신의 caveat 는 그 어긋남을 인정하는데 화면 문장만 지운 꼴이다.
         그래서 밀도 계열을 **자기 축**으로 떼어 내고 그 축에는 **허용 날짜를 하나도 두지 않는다**
         — 이 축의 수치가 든 문장에는 어떤 기준일 주장도 붙일 수 없다(guideAxes 참조).
         분모의 날짜는 asOfDenominator 로 따로 넘겨, 문장이 「분모는 … 생존자 수」라고
         축을 밝혀 쓸 수 있게 한다. */
    density: {
      v: row['밀도'],
      rankLow: rankAsc(den.table.map((r) => r['밀도']), row['밀도']),
      min: dMin ? { region: dMin.x, v: dMin.y } : null,
      max: dMax ? { region: dMax.x, v: dMax.y } : null,
      gapX: gapM ? Number(gapM[0]) : null,
      /* 분자에 단일 기준일이 없다는 사실 자체. 화면·프롬프트가 이 값을 보고 문장을 나눈다. */
      mixedAsOf: true,
      asOfDenominator: den.asOfAxes?.denominator?.asOf ?? den.asOf ?? null,
      asOfNote: den.asOfAxes?.note
        ?? '분모와 분자의 기준일이 다르다 — 하나의 기준일을 붙일 수 없다.',
    },
    maps: isanPct != null || defectorPct != null
      ? { isanPct, isanAsOf: den.asOf ?? null, defectorPct, defectorAsOf: defectorAsOf ?? null }
      : null,
  }
}

/* ══════════ ① 사실 묶음 — LLM 에 넘길 수 있는 전부 ══════════
   sel: { mode:'old', id } | { mode:'modern', key }  (화면의 Sel 과 같은 모양)
   pack: nk-gohyang-pack.mjs 가 만든 데이터 팩 묶음 { map, region, isan, proj, museum, … }
   extra (선택): 화면이 계산해 넣는 부가 사실
     eventsAsOf — 합산 계열(연표·보도자료·동향)의 확인 하한(coverageEndOf 의 min).
                  이 파일은 의존 0개라 nk-search 를 직접 부를 수 없어 호출부가 넣는다.
     analysis   — analysis.json (비교 확정값, 지연 fetch)
   여기 없는 사실은 LLM 도 모른다 — 그것이 원칙 ① 이다. */
export function buildGuideFacts(sel, pack, extra = null) {
  if (!sel || !pack) return null
  const region = pack.region
  const members = sel.mode === 'modern'
    ? (region.regions[sel.key] ? [sel.key] : [])
    : Object.keys(region.regions).filter((k) => region.regions[k].isanOrigin?.key === sel.id)
  if (!members.length) return null
  const infos = members.map((k) => region.regions[k])

  const title = sel.mode === 'old'
    ? (pack.map.regionsOld.find((o) => o.id === sel.id)?.name ?? sel.id)
    : sel.key
  const oldId = sel.mode === 'old' ? sel.id : (region.regions[sel.key]?.isanOrigin?.key ?? null)

  /* 이산가족 생존 신청자 — 공표 출신지 축 */
  const latestKey = infos.map((r) => r.isanOrigin?.latestKey).find(Boolean)
  const entry = latestKey
    ? pack.isan.latest.survivors.byOrigin.entries.find((e) => e.label === latestKey)
    : null
  const survivors = entry
    ? { n: entry.n, pct: entry.pct, asOf: pack.isan.latest.asOf }
    : null

  /* 탈북민 재북 출신지 — 누적 합 */
  const defParts = infos.filter((r) => r.defectorOrigin)
  const defector = defParts.length
    ? {
        total: defParts.reduce((s, r) => s + (r.defectorOrigin?.total ?? 0), 0),
        asOf: defParts[0].defectorOrigin.asOf,
      }
    : null

  /* 공식 기록 — 언급 건수와 최근 사건 3건 (제목은 40자에서 자른다: 프록시 길이 상한 보호)
     total 은 연표·보도자료·동향을 **합친 값**이라 단일 기준일이 없다.
     asOf 는 합쳐진 계열 중 가장 오래된 것의 확인 하한(coverageEndOf 의 min) — 호출부가 넣는다.
     없으면 null 이고, 프롬프트·검증기가 이 값에 날짜를 붙이는 것을 막는다. */
  const latest = infos
    .flatMap((r) => r.events.latest)
    .filter((e, i, arr) => arr.findIndex((x) => x.date === e.date && x.title === e.title) === i)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 3)
    .map((e) => ({ date: e.date, title: String(e.title).replace(/\s+/g, ' ').slice(0, 40) }))
  const events = {
    total: infos.reduce((s, r) => s + r.events.total + r.briefings + r.trends, 0),
    latest,
    asOf: extra?.eventsAsOf ?? null,
  }

  /* 박물관 사료 — 건수만 (본문·이미지는 LLM 에 주지 않는다. 필요한 것은 규모뿐이다) */
  const byId = new Map((pack.museum?.records ?? []).map((r) => [r.iId, r]))
  const direct = new Set()
  members.forEach((k) => (pack.museum?.byRegion?.[k] ?? []).forEach((i) => direct.add(i)))
  let venue = 0
  direct.forEach((i) => { if (byId.get(i)?.venueOnly) venue += 1 })
  const historicKeys = oldId
    ? Object.keys(pack.museum?.meta?.historicToOld ?? {}).filter((k) =>
        (pack.museum.meta.historicToOld[k] ?? []).includes(oldId))
    : []
  const historicSet = new Set()
  historicKeys.forEach((k) =>
    (pack.museum?.byRegionHistoric?.[k] ?? []).forEach((i) => { if (!direct.has(i)) historicSet.add(i) }))
  /* collectedAt = museum.json 을 만든 날(builtAt) — 자료의 기준일이 아니라 **수집일**이다.
     사료 원본에는 제작 시점이 따로 있고, 이 숫자가 말할 수 있는 것은 "그날 목록에 몇 건 있었나"뿐이다. */
  const museum = {
    total: direct.size + historicSet.size, venue, historic: historicSet.size,
    collectedAt: pack.museum?.builtAt ?? null,
  }

  /* 종료된 활동 — stale(모름)과 frozen(없음)의 구분은 이 서비스의 정체성이다 */
  const frozen = infos
    .filter((r) => r.frozen)
    .map((r) => ({
      name: r.frozen.topic === 'econ.kaesong' ? '개성공단'
        : r.frozen.topic === 'econ.kumgang' ? '금강산 관광' : r.frozen.topic,
      since: r.frozen.since,
    }))

  /* 비교 축은 광복 당시 고향 이름('황해도(구)' 등)으로 건다 — 현행 지역은 crosswalk 로 귀속 */
  const oldName = oldId ? (pack.map.regionsOld.find((o) => o.id === oldId)?.name ?? null) : null

  /* 탈북민 재북 출신지 계열의 기준일 — 지역이 그 계열에 없어도(라선) 축의 날짜는 하나다.
     compare.maps.defectorPct 는 이 축의 값이므로 이산가족 축의 날짜를 빌려 쓰면 안 된다. */
  const defectorAxisAsOf =
    defector?.asOf
    ?? Object.values(region.regions).map((r) => r.defectorOrigin?.asOf).find(Boolean)
    ?? null

  return {
    region: title,
    kind: sel.mode,
    /* ★ 현행 행정구역을 골라도 이산가족 수치·비교는 **광복 당시 구행정구역 축**의 값이다.
         (함경남도와 량강도가 글자 그대로 같은 문장을 내던 자리 — 둘 다 hamgyong-s-old 에 묶여 있다.)
         화면의 패널 머리는 '현행 행정구역'이라 적혀 있고, 어느 축의 값인지 밝히는 문장이 없었다.
         그래서 축 이름을 사실 묶음에 실어, 규칙 문장과 프롬프트가 반드시 함께 말하게 한다. */
    originLabel: oldName,
    survivors,
    aliveTotal: { n: pack.isan.latest.overview.cumulative.alive, asOf: pack.isan.latest.asOf },
    /* 평균 나이는 공표(latest)가 아니라 월별 CSV 의 값 — 기준일이 다르다. 축에 asOf 를 붙인다. */
    avgAge: {
      v: Math.round((pack.isan.monthly.at(-1)?.avgAge ?? 0) * 10) / 10,
      asOf: pack.isan.monthly.at(-1)?.month ?? null,
    },
    defector,
    events,
    museum,
    frozen,
    clock: { below10000: pack.proj.milestoneRange.below10000, threshold: '1만 명' },
    compare: buildCompare(extra?.analysis, oldName, defectorAxisAsOf),
  }
}

/* ══════════ ② 검증 — 스키마 밖이면 전부 폐기 ══════════ */

/* 렌더링 이모지 금지(theme/gohyang.ts 제약 ①) — LLM 출력에도 똑같이 적용한다 */
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u

/* ── 숫자-기준일 결합 검사 ──
   "숫자가 입력에 있는가"만 보면, 수치가 **남의 축 기준일**을 빌려 써도 통과한다
   (실측 사고: 안내인이 세 문장 전부에 생존 신청자의 「2026년 5월 31일 기준」을 붙였다 —
    공식 기록 합계는 단일 기준일이 없고, 사료 건수의 날짜는 수집일이다).
   그래서 문장 단위로 「…기준/수집/현재」 날짜 주장을 뽑아, 같은 문장의 수치가 속한
   축의 asOf 와 대조한다. 그 문장의 어떤 축과도 맞지 않는 기준일 주장은 오귀속 → 전체 폐기. */

/* 축 = {이 축의 수치 토큰들, 이 축에 허용되는 기준일들}. 날짜 토큰은 길이 2 이상만 쓴다 —
   소수·순위의 한 자리 조각('0.121'의 '0', 순위 '2')은 축 판별에 못 쓸 만큼 흔하다. */
function guideAxes(facts) {
  const axes = []
  /* ★ 날짜가 하나도 없는 축도 **축으로 세운다** (실측 지적 2026-08-21).
       예전에는 `if (nums.size && ds.length)` 라 asOf 가 없는 축이 통째로 사라졌고,
       그 축의 수치가 든 문장은 축 판별에 실패해 globalDates(사실 묶음이 아는 날짜 전부)로
       느슨하게 검사됐다 — 남의 축 날짜를 빌려 써도 통과했다. 주석은 「축 자체가 빠진다 → 날짜 금지」
       라고 적혀 있었지만 코드는 그 반대였다.
       이제 dates: [] 인 축이 서고, `.some(...)` 이 빈 배열에서 false 라
       **그 축의 수치가 든 문장에는 어떤 기준일 주장도 붙일 수 없다.** 이것이 의도된 뜻이다:
       기준일을 모르는 값에는 기준일을 쓰지 않는다. */
  const push = (vals, dates) => {
    const nums = new Set()
    for (const v of vals) {
      if (v == null) continue
      for (const t of String(v).match(/\d+/g) ?? []) if (t.length >= 2) nums.add(t)
    }
    const ds = (dates ?? []).filter(Boolean)
    if (nums.size) axes.push({ nums, dates: ds })
  }
  const f = facts ?? {}
  if (f.survivors) push([f.survivors.n, f.survivors.pct], [f.survivors.asOf])
  if (f.aliveTotal) push([f.aliveTotal.n], [f.aliveTotal.asOf])
  if (f.avgAge) push([f.avgAge.v ?? f.avgAge], [f.avgAge.asOf])
  if (f.defector) push([f.defector.total], [f.defector.asOf])
  if (f.events) push([f.events.total], [f.events.asOf])          // asOf null 이면 축 자체가 빠진다 → 날짜 금지
  if (f.museum) push([f.museum.total, f.museum.venue, f.museum.historic], [f.museum.collectedAt])
  if (f.compare) {
    const c = f.compare
    /* ★ compare 를 **축별로** 쪼갠다 — 이산가족 축(den.asOf)과 탈북민 축(2020-03-31)은 다른 계열이다.
         한 축으로 묶으면 탈북민 비중에 이산가족 기준일이 붙는 문장이 통과하고
         올바른 날짜를 쓴 문장이 폐기된다(실측 사고). */
    push(
      [c.survivorsInAxis, c.drop?.pct, c.maps?.isanPct],
      [c.asOf],
    )
    push([c.maps?.defectorPct], [c.maps?.defectorAsOf])
    /* ★ 밀도 계열(과 그 순위로 만든 순위합)은 **기준일이 없는 축**이다 — dates 를 비운다.
         분모 2025-08-31 · 분자 7계열(2026-08-11~2026-08-21)의 나눗셈이라 어느 날짜를 붙여도
         거짓이 된다. 문장이 시점을 밝히려면 「분모는 … 생존자 수」처럼 축을 나눠 써야 한다. */
    push(
      [c.density?.v, c.density?.rankLow, c.density?.min?.v, c.density?.max?.v, c.density?.gapX,
       c.priority?.sum],
      [],
    )
  }
  return axes
}

/* 사실 묶음이 아는 기준일 전부 — 축 판별이 안 되는 문장의 날짜 주장은 이 안에서만 허용한다.
   (축은 수치 토큰이 있어야 서지만, 한 자리 건수처럼 토큰이 못 서는 축의 날짜도 여기엔 있어야 한다) */
function guideDates(facts) {
  const f = facts ?? {}
  return [
    f.survivors?.asOf, f.aliveTotal?.asOf, f.avgAge?.asOf, f.defector?.asOf,
    f.events?.asOf, f.museum?.collectedAt, f.compare?.asOf, f.compare?.maps?.defectorAsOf,
    ...(Array.isArray(f.frozen) ? f.frozen.map((z) => z?.since) : []),
  ].filter(Boolean)
}

/* 「2026년 5월(31일)? … 기준/수집/현재」 「2026-05-31 기준」 → {y,m,d} 로 뽑고 문장에서 지운다 */
const CLAIM_FULL = /(\d{4})\s*(?:년|[-./])\s*(\d{1,2})(?:\s*(?:월|[-./])\s*(\d{1,2})\s*일?)?[^0-9]{0,8}?(?:기준|수집|현재)/g
const CLAIM_YEAR = /(\d{4})\s*년[^0-9]{0,8}?(?:기준|수집|현재)/g
function extractClaims(s) {
  const claims = []
  let rest = String(s)
  rest = rest.replace(CLAIM_FULL, (_, y, m, d) => { claims.push({ y: +y, m: +m, d: d ? +d : null }); return ' ' })
  rest = rest.replace(CLAIM_YEAR, (_, y) => { claims.push({ y: +y, m: null, d: null }); return ' ' })
  return { claims, rest }
}

/* 주장한 날짜가 그 축의 asOf 와 맞는가 — 월·일을 생략한 주장은 접두 일치로 본다 */
function claimHits(claim, asOf) {
  const p = String(asOf ?? '').match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/)
  if (!p) return false
  if (claim.y !== +p[1]) return false
  if (claim.m != null && claim.m !== +p[2]) return false
  if (claim.d != null && claim.d !== +(p[3] ?? -1)) return false
  return true
}

export function validateGuide(raw, facts) {
  const arr = raw?.lines
  if (!Array.isArray(arr) || arr.length < 2 || arr.length > 4) return null
  const lines = []
  for (const l of arr) {
    const s = String(l ?? '').replace(/\s+/g, ' ').trim()
    if (!s || s.length > 120) return null
    if (EMOJI.test(s)) return null
    lines.push(s)
  }
  const target = String(raw?.next?.target ?? '')
  if (!GUIDE_TARGETS.includes(target)) return null
  const label = String(raw?.next?.label ?? '').replace(/\s+/g, ' ').trim()
  if (!label || label.length > 40 || EMOJI.test(label)) return null

  /* ★ 원칙 ② 의 강제 — 사실 묶음에 없는 숫자가 한 개라도 있으면 통째로 폐기.
     허용 집합 = 사실 JSON 의 모든 숫자 토큰(+ 앞자리 0 제거 변형: '05'→'5').
     문장 쪽은 자릿수 쉼표만 지우고 대조한다('6,321'→'6321'). */
  if (facts) {
    const allowed = new Set()
    for (const m of JSON.stringify(facts).match(/\d+/g) ?? []) {
      allowed.add(m)
      const z = m.replace(/^0+/, '')
      if (z) allowed.add(z)
    }
    for (const s of [...lines, label]) {
      const flat = s.replace(/(\d),(?=\d)/g, '$1')
      for (const m of flat.match(/\d+/g) ?? []) if (!allowed.has(m)) return null
    }

    /* ★ 결합 검사 — 날짜 주장은 같은 문장의 수치가 속한 **모든** 축의 asOf 여야 한다.
       예전에는 판별된 축들의 날짜를 하나로 합쳐(pool = flatMap) 그중 **하나**와만 맞으면
       통과시켰다. 그래서 GUIDE_PROMPT 가 못박은 「기준일이 다른 수치들을 한 문장으로 묶어
       하나의 「기준」을 붙이지 마라」를 전혀 막지 못했다 — 실측 통과 사례:
         · '생존 신청자는 6,321명이고 기록물은 334건입니다(2026년 5월 31일 기준).'  (사료는 수집일 축)
         · '기록물 334건과 공식 기록 456건이 남아 있습니다(2026년 8월 19일 수집 기준).' (합산은 하한 축)
         · '생존 신청자는 2,919명, 북한이탈주민은 2,857명입니다(2026년 5월 31일 기준).' (탈북민은 2020-03)
         · '전체 생존 신청자는 33,272명이고 평균 나이는 83세입니다(2026년 5월 31일 기준).' (평균은 2025-08)
       그래서 교집합으로 바꾼다: 판별된 축이 둘 이상이고 그 축들의 asOf 가 서로 다르면
       어떤 날짜 주장도 통과할 수 없다 — 문장을 나누는 수밖에 없다(프롬프트가 시키는 그대로다). */
    const axes = guideAxes(facts)
    const globalDates = guideDates(facts)
    for (const s of lines) {
      const { claims, rest } = extractClaims(s)
      if (!claims.length) continue
      const flat = rest.replace(/(\d),(?=\d)/g, '$1')
      const toks = (flat.match(/\d+/g) ?? []).filter((t) => t.length >= 2)
      const present = axes.filter((a) => toks.some((t) => a.nums.has(t)))
      for (const c of claims) {
        const ok = present.length
          ? present.every((a) => a.dates.some((d) => claimHits(c, d)))
          : globalDates.some((d) => claimHits(c, d))
        if (!ok) return null
      }
    }
  }
  return { lines, next: { target, label } }
}

/* ══════════ ③ 규칙 문장 — LLM 없이도 항상 나오는 안내 ══════════
   원칙 ④: 네트워크가 죽어도 화면이 비지 않는다. 이 함수가 그 보장이다.
   문장은 짧은 높임말·감정 연출 없음 — 페르소나 규칙과 같은 톤을 규칙으로 재현한다. */
export function fallbackGuide(facts) {
  const f = facts ?? {}
  const R = f.region ?? '이 지역'
  const lines = []

  /* ★ 현행 행정구역을 고른 사람에게는 **어느 축의 값인지부터** 말한다.
       이산가족 출신지는 광복 당시 구행정구역으로만 공표되므로, 함경남도를 골라도 량강도를 골라도
       같은 함경남도(구) 값이 온다. 그 사실을 밝히지 않으면 현행 지역의 값으로 둔갑한다. */
  if (f.kind === 'modern' && f.originLabel) {
    lines.push(`이산가족 출신지는 광복 당시 ${f.originLabel} 기준으로만 공표됩니다. 아래 수치는 그 기준의 값입니다.`)
  }

  const originOf = f.kind === 'modern' && f.originLabel ? `${f.originLabel} 출신` : '이곳이 고향인'
  if (f.survivors) {
    lines.push(`${originOf} 이산가족 생존 신청자는 ${nf(f.survivors.n)}명입니다(${ym(f.survivors.asOf)} 기준).`)
  } else if (f.defector) {
    lines.push(`이곳이 재북 출신지인 북한이탈주민은 누적 ${nf(f.defector.total)}명입니다(${ym(f.defector.asOf)} 기준).`)
  }

  /* 비교 한 문장 — analysis 가 **발표한 것만** 옮긴다.
     발표된 자리는 1순위·2순위·가장 여유 있는 곳 셋뿐이고, 나머지 지역은 순위합 원값 + caveat 로 간다
     (그 카드의 caveat: 「n=7 이다. 순위합은 정렬 보조이며 점수로 해석하면 안 된다」). */
  const c = f.compare
  /* ★ 밀도·순위합에는 **단일 기준일을 붙이지 않는다** (실측 지적 2026-08-21).
       예전 문장은 「…가장 적습니다(2025년 8월 기준)」였다. 그 0.14 의 분자에는 2026-08-21 수집분
       128건과 2026-08-11 확인 하한의 동향 426건이 들어 있어, 분모의 날짜 하나로 덮은 것이
       바로 이 프로젝트의 as-of 규약이 막으려던 형태였다.
       그래서 수치 문장에는 날짜 주장을 두지 않고, 뒤에 **축을 밝히는 꼬리**를 붙인다.
       꼬리는 「기준/수집/현재」를 쓰지 않으므로 날짜 주장으로 잡히지 않는다 — 그것이 옳다.
       이 문장은 어느 한 날짜를 주장하지 않고 두 축이 다르다는 사실을 말할 뿐이기 때문이다. */
  const mixTail = c?.density?.asOfDenominator
    ? ` 분모는 ${ym(c.density.asOfDenominator)} 생존자 수이고, 분자는 계열마다 기준일이 다릅니다.`
    : ' 분모와 분자의 기준일이 서로 다릅니다.'
  if (c?.density?.rankLow === 1) {
    lines.push(`생존자 한 분당 남은 공식 기록은 ${c.density.v}건으로, 광복 당시 고향 ${c.of}곳 가운데 가장 적습니다.${mixTail}`)
  } else if (c?.priority?.published === '1순위' || c?.priority?.published === '2순위') {
    lines.push(`기록을 우선 남겨야 할 곳으로, 광복 당시 고향 ${c.of}곳 가운데 ${c.priority.published}로 발표된 곳입니다.${mixTail}`)
  } else if (c?.priority?.published === '가장 여유 있는 곳') {
    lines.push(`광복 당시 고향 ${c.of}곳 가운데 기록이 가장 여유 있는 곳으로 발표되었습니다.${mixTail}`)
  } else if (c?.priority?.sum != null) {
    lines.push(`기록 우선순위의 순위합은 ${c.priority.sum}입니다 — 광복 당시 고향 ${c.of}곳 가운데 순서를 돕는 값이며 점수가 아닙니다.${mixTail}`)
  }

  /* 사료·기록 건수 — 사료의 날짜는 자료의 기준일이 아니라 수집일이고,
     공식 기록 합계는 여러 자료를 합친 값이라 단일 기준일이 없다(asOf 는 확인 하한). */
  if ((f.museum?.total ?? 0) > 0) {
    /* ★ venue(상봉 장소로 걸린 건수)가 큰 몫이면 같은 문장에서 밝힌다 (실측 지적 2026-08-19).
         미수복강원은 397건 중 280건(70.5%)이 고향이 아니라 금강산 면회소로 잡힌 것이고,
         analysis.json 은 그래서 그 행의 사료를 117건으로 갈라 두었다. 화면에 실제로 뜨는 계층은
         이 규칙 문장인데(LLM 은 검증 실패·네트워크 장애 시 폐기된다) 여기에 venue 분기가 없었다. */
    const venueBig = (f.museum.venue ?? 0) > 0 && f.museum.venue / f.museum.total >= 0.3
    const venueTail = venueBig
      ? ` 이 가운데 ${nf(f.museum.venue)}건은 고향이 아니라 상봉 장소로 잡힌 것입니다.`
      : ''
    lines.push(f.museum.collectedAt
      ? `이 고향에 걸린 기록물 ${nf(f.museum.total)}건이 디지털박물관에 공개되어 있습니다(${ymd(f.museum.collectedAt)} 수집 기준).${venueTail}`
      : `이 고향에 걸린 기록물 ${nf(f.museum.total)}건이 디지털박물관에 공개되어 있습니다.${venueTail}`)
  } else if ((f.events?.total ?? 0) > 0) {
    /* ★ 「공식 기록」이라는 이름이 화면 안에서 두 값을 갖지 않게 계열을 명시한다.
         지역 패널의 「공식 기록」은 북한개황까지 넣은 네 계열 합계(하한 2025-05)이고,
         여기 events.total 은 연표·보도자료·동향 세 계열 합계(하한 2025-10)다.
         같은 이름의 값이 852/827 두 벌로 보이던 자리 — 세는 범위를 문장이 직접 밝힌다. */
    lines.push(f.events.asOf
      ? `연표·보도자료·동향 세 계열을 합치면 이 지역이 ${nf(f.events.total)}건 언급되어 있습니다(${ym(f.events.asOf)}까지 확인).`
      : `연표·보도자료·동향 세 계열을 합치면 이 지역이 ${nf(f.events.total)}건 언급되어 있습니다.`)
  }

  if (f.frozen?.length) {
    const z = f.frozen[0]
    lines.push(`${z.name}${josa(z.name, '은', '는')} ${z.since.slice(0, 4)}년에 중단되어, 그 뒤의 자료는 존재하지 않습니다.`)
  }

  /* 인사말은 자리가 남을 때만 앞에 붙인다 — 내용 문장(비교 포함)이 밀려나지 않게 */
  if (lines.length < 4) lines.unshift(`${R} 자료를 안내해 드리겠습니다.`)

  /* 다음에 볼 것 — 내용이 많은 구획부터 권한다. 만들어 내는 값 없음. */
  const next = (f.museum?.total ?? 0) >= 6
    ? { target: 'museum', label: '이 고향의 기록물 보기' }
    : (f.events?.total ?? 0) > 0
      ? { target: 'events', label: '이 지역의 공식 기록 보기' }
      : { target: 'weather', label: '오늘 그곳 날씨 보기' }
  return { lines: lines.slice(0, 4), next }
}

/* ══════════ ④ 카드 한 줄 — 한걸음씩 모드의 길잡이 ══════════
   전부 규칙 문장이다(LLM 무관). 카드가 무엇이고 어떻게 읽어야 하는지 한 문장씩. */
export function cardHint(id, facts) {
  const f = facts ?? {}
  switch (id) {
    case 'count':
      return `이 숫자는 통일부가 ${ym(f.aliveTotal?.asOf) || '매달'} 기준으로 공표한 값입니다. 아래 단추를 누르면 다음 장으로 넘어갑니다.`
    case 'region':
      return f.region
        ? `${f.region}${josa(f.region, '을', '를')} 고르셨습니다. 다음 장부터 그곳의 이야기가 나옵니다.`
        : '집안에서 들어 온 고향 이름을 하나 눌러 주세요. 나중에 언제든 바꾸실 수 있습니다.'
    case 'weather':
      return '날씨만은 저장해 두지 않고, 화면을 열 때마다 새로 받아 옵니다.'
    case 'events':
      return '통일부가 공식으로 남긴 기록 가운데 가장 최근 것부터 보여 드립니다.'
    case 'museum':
      return '실향민과 가족이 기증한 실제 기록물입니다. 원문은 박물관 화면에서 보실 수 있습니다.'
    case 'clock':
      return '미래 구간은 통일부 발표가 아니라 이 화면의 계산입니다. 범위로만 읽어 주시기 바랍니다.'
    case 'action':
      return '후손 이름으로 오늘 신청할 수 있는 창구만 골라 두었습니다.'
    case 'sources':
      return '모든 수치에는 기준일이 붙어 있습니다. 기준일이 다른 값은 한 문장에 섞지 않는 것이 안전합니다.'
    default:
      return ''
  }
}
