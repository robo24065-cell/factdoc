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
· 숫자는 입력에 있는 숫자만 그대로 옮긴다. 더하기·비율·반올림으로 **새 숫자를 만들지 마라.**
· 입력에 없는 항목(null·0·빈 배열)은 언급하지 마라.
· 판정·전망·해석을 만들지 마라. 자료가 무엇을 말하는지만 문장으로 엮는다.

입력 JSON 필드의 뜻:
  region 지역 이름 · kind old=광복 당시 구행정구역, modern=현행 행정구역
  survivors {n,pct,asOf} 이 지역이 고향인 이산가족 생존 신청자 수와 비율
  aliveTotal {n,asOf} 전체 생존 신청자 · avgAge 생존 신청자 평균 나이
  defector {total,asOf} 이 지역이 재북 출신지인 북한이탈주민 누적 입국 인원
  events {total,latest[{date,title}]} 통일부 공식 기록(연표·보도·동향)에서 이 지역이 언급된 건수와 최근 사건
  museum {total,venue,historic} 남북이산가족 디지털박물관 공개 기록물 중 이 지역에 걸린 건수
    — venue 는 고향이 아니라 상봉 장소(금강산 면회소)로 잡힌 건수다. 고향의 근거로 말하지 마라.
  frozen [{name,since}] 종료된 활동(개성공단·금강산 관광 등) — 이후 자료가 존재하지 않는다
  clock {below10000,threshold} 생존 신청자가 1만 명을 밑돌 것으로 계산된 연도 구간(공식 통계가 아니라 추계다)

출력은 JSON 하나뿐이다. 설명·문장을 덧붙이지 마라.
{"lines":["문장1","문장2","문장3"],"next":{"label":"다음에 볼 것 한 줄","target":"weather|events|museum|clock|action"}}
· lines 는 2~4문장. 각 문장 90자 이내. 모든 수치 뒤에는 입력의 asOf 기준 시점을 밝힌다.
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

/* ══════════ ① 사실 묶음 — LLM 에 넘길 수 있는 전부 ══════════
   sel: { mode:'old', id } | { mode:'modern', key }  (화면의 Sel 과 같은 모양)
   pack: nk-gohyang-pack.mjs 가 만든 데이터 팩 묶음 { map, region, isan, proj, museum, … }
   여기 없는 사실은 LLM 도 모른다 — 그것이 원칙 ① 이다. */
export function buildGuideFacts(sel, pack) {
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

  /* 공식 기록 — 언급 건수와 최근 사건 3건 (제목은 40자에서 자른다: 프록시 길이 상한 보호) */
  const latest = infos
    .flatMap((r) => r.events.latest)
    .filter((e, i, arr) => arr.findIndex((x) => x.date === e.date && x.title === e.title) === i)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 3)
    .map((e) => ({ date: e.date, title: String(e.title).replace(/\s+/g, ' ').slice(0, 40) }))
  const events = {
    total: infos.reduce((s, r) => s + r.events.total + r.briefings + r.trends, 0),
    latest,
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
  const museum = { total: direct.size + historicSet.size, venue, historic: historicSet.size }

  /* 종료된 활동 — stale(모름)과 frozen(없음)의 구분은 이 서비스의 정체성이다 */
  const frozen = infos
    .filter((r) => r.frozen)
    .map((r) => ({
      name: r.frozen.topic === 'econ.kaesong' ? '개성공단'
        : r.frozen.topic === 'econ.kumgang' ? '금강산 관광' : r.frozen.topic,
      since: r.frozen.since,
    }))

  return {
    region: title,
    kind: sel.mode,
    survivors,
    aliveTotal: { n: pack.isan.latest.overview.cumulative.alive, asOf: pack.isan.latest.asOf },
    avgAge: Math.round((pack.isan.monthly.at(-1)?.avgAge ?? 0) * 10) / 10,
    defector,
    events,
    museum,
    frozen,
    clock: { below10000: pack.proj.milestoneRange.below10000, threshold: '1만 명' },
  }
}

/* ══════════ ② 검증 — 스키마 밖이면 전부 폐기 ══════════ */

/* 렌더링 이모지 금지(theme/gohyang.ts 제약 ①) — LLM 출력에도 똑같이 적용한다 */
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u

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
  }
  return { lines, next: { target, label } }
}

/* ══════════ ③ 규칙 문장 — LLM 없이도 항상 나오는 안내 ══════════
   원칙 ④: 네트워크가 죽어도 화면이 비지 않는다. 이 함수가 그 보장이다.
   문장은 짧은 높임말·감정 연출 없음 — 페르소나 규칙과 같은 톤을 규칙으로 재현한다. */
export function fallbackGuide(facts) {
  const f = facts ?? {}
  const R = f.region ?? '이 지역'
  const lines = [`${R} 자료를 안내해 드리겠습니다.`]

  if (f.survivors) {
    lines.push(`이곳이 고향인 이산가족 생존 신청자는 ${nf(f.survivors.n)}명입니다(${ym(f.survivors.asOf)} 기준).`)
  } else if (f.defector) {
    lines.push(`이곳이 재북 출신지인 북한이탈주민은 누적 ${nf(f.defector.total)}명입니다(${ym(f.defector.asOf)} 기준).`)
  }

  if ((f.museum?.total ?? 0) > 0) {
    lines.push(`이 고향에서 온 기록물 ${nf(f.museum.total)}건이 디지털박물관에 공개되어 있습니다.`)
  } else if ((f.events?.total ?? 0) > 0) {
    lines.push(`통일부 공식 기록에는 이 지역이 ${nf(f.events.total)}건 언급되어 있습니다.`)
  }

  if (f.frozen?.length) {
    const z = f.frozen[0]
    lines.push(`${z.name}${josa(z.name, '은', '는')} ${z.since.slice(0, 4)}년에 중단되어, 그 뒤의 자료는 존재하지 않습니다.`)
  }

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
