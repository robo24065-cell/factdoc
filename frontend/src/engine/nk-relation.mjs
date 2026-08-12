// 관계 답변 — "장성택 누구랑 다녔어" 에 답하는 계층
//
// 왜 별도 계층인가: 검색은 **문서**를 찾는다. 관계 질문은 문서가 아니라 **사람 목록**을 원한다.
//   현행 엔진에 "장성택 누구랑 다녔어"를 넣으면 인물 카드(직책·생몰)만 나온다.
//   문서 랭킹으로는 못 푸는 질문이라 축이 하나 더 필요하다.
//
// 근거는 추정이 아니다. 통일부가 동향 제목에 적어 놓은 관계문 10,917건을 그대로 센다.
//   `[정치][최룡해 동향] 김정은, 새해 즈음 금수산태양궁전 참배시 수행`
//   → 최룡해가 김정은을 수행했다. 이런 문장 10,917개의 집계다.
//
// **방향이 곧 서열이다.** 수행받기만 하는 사람이 위, 수행만 하는 사람이 아래다.
//   실측: 김정은 수행받음 2,380/수행함 71 · 최룡해 수행함 238/수행받음 5.
//   김정은의 '수행함 71'은 전부 김정일 생전 기록이다(날짜 확보분 14/14가 2011년) —
//   후계자에서 최고지도자로 넘어가는 순간이 데이터에 그대로 찍혀 있다.

/* 관계를 묻는 말투.
   ★ '누구'는 조사가 붙어야 관계다. "김여정 누구임"은 **정체**를 묻는 질문이지
     관계를 묻는 게 아니다 — 여기에 수행 명단을 들이밀면 묻지 않은 것에 답하는 셈이다.
     누구랑·누구와·누가는 관계, 맨몸 누구·누구야·누구임은 정체.
   '관계'·'사이'를 앵커 없이 두면 '남북관계'가 통째로 걸린다 — 종결형으로 못 박는다. */
const REL_ASK = /(누구(?:랑|와|하고|를|한테|에게|의|들)|누가|측근|함께|같이|동행|수행|주변|곁|옆|친한|가까운|만난|접견|라인|인맥|사람들|다녔|어울|동선|무슨\s*사이|관계(?:가|는|야|니|\?|$)|사이(?:야|니|가|는|\?|$))/

export function buildGraph(raw) {
  const g = { meta: raw?.meta || {}, byName: new Map(), n: 0 }
  if (!raw?.nodes?.length) return g
  const nm = id => String(id).split(':').slice(1).join(':')
  for (const nd of raw.nodes) {
    if (nd.type !== 'person') continue
    g.byName.set(nd.name, { ...nd, serves: [], served: [], met: [], with: [] })
    g.n++
  }
  for (const e of raw.edges || []) {
    const a = g.byName.get(nm(e.a)), b = g.byName.get(nm(e.b))
    if (!a || !b) continue
    const span = spanOf(e.when)
    if (e.type === 'escort') {                    // a 가 b 를 수행했다 (방향 있음)
      a.serves.push({ name: nm(e.b), w: e.w, span })
      b.served.push({ name: nm(e.a), w: e.w, span })
    } else if (e.type === 'meet') {
      a.met.push({ name: nm(e.b), w: e.w, span })
      b.met.push({ name: nm(e.a), w: e.w, span })
    } else {                                       // together·cooccur — 대칭
      a.with.push({ name: nm(e.b), w: e.w, span })
      b.with.push({ name: nm(e.a), w: e.w, span })
    }
  }
  for (const p of g.byName.values())
    for (const k of ['serves', 'served', 'met', 'with']) p[k].sort((x, y) => y.w - x.w)
  return g
}

function spanOf(when) {
  const d = (when || []).filter(x => /^\d{4}-/.test(x || '')).sort()
  return d.length ? { from: d[0], to: d.at(-1), n: d.length } : null
}

/* 질의에서 그래프에 있는 인물을 찾는다.
   긴 이름부터 본다 — '김정은'과 '김정'이 함께 있으면 긴 쪽이 옳다. */
export function personsIn(gx, q) {
  const s = String(q || '')
  const out = []
  for (const name of gx.byName.keys()) if (s.includes(name)) out.push(name)
  return out.sort((a, b) => b.length - a.length)
    .filter((n, i, arr) => !arr.slice(0, i).some(m => m.includes(n)))
}

/**
 * 관계 답변. 관계를 묻는 말투가 아니거나 아는 인물이 없으면 null 을 돌려준다
 * — 검색 결과를 밀어내지 않기 위해서다(이 계층은 **덧붙이는** 축이다).
 */
export function relationAnswer(gx, q, { limit = 8 } = {}) {
  if (!gx?.n) return null
  const s = String(q || '')
  if (!REL_ASK.test(s)) return null
  const names = personsIn(gx, s)
  if (!names.length) return null

  const subject = names[0]
  const p = gx.byName.get(subject)
  const total = p.serves.length + p.served.length + p.met.length + p.with.length
  if (!total) return null

  // 두 사람을 함께 물으면 그 둘 사이만 답한다 — "최룡해랑 장성택 무슨 사이"
  if (names.length >= 2) {
    const other = names[1]
    const q2 = gx.byName.get(other)
    const pair = {
      subjectServes: p.serves.find(x => x.name === other) || null,
      subjectServed: p.served.find(x => x.name === other) || null,
      met: p.met.find(x => x.name === other) || null,
      with: p.with.find(x => x.name === other) || null,
    }
    /* 직접 간선이 없어도 답이 있다 — **같은 사람을 수행했다**는 것이 곧 관계다.
       최룡해와 장성택은 서로 수행한 적이 없지만 둘 다 김정은을 수행했다.
       이걸 '접점 없음'으로 처리하면 있는 사실을 없다고 말하는 셈이다. */
    const shared = q2 ? p.serves
      .map(x => ({ name: x.name, a: x.w, b: (q2.serves.find(y => y.name === x.name) || {}).w || 0 }))
      .filter(x => x.b > 0)
      .sort((x, y) => (y.a + y.b) - (x.a + x.b))
      .slice(0, limit) : []
    if (pair.subjectServes || pair.subjectServed || pair.met || pair.with || shared.length)
      return { kind: 'pair', subject, other, ...pair, shared, source: SOURCE }
  }

  const sum = a => a.reduce((t, x) => t + x.w, 0)
  return {
    kind: 'person',
    subject,
    pos: p.pos || null,
    records: p.n,
    /* 이 사람이 수행한 대상 = 이 사람보다 위 */
    serves: p.serves.slice(0, limit),
    /* 이 사람을 수행한 사람 = 이 사람보다 아래 */
    served: p.served.slice(0, limit),
    met: p.met.slice(0, limit),
    with: p.with.slice(0, limit),
    servesTotal: sum(p.serves),
    servedTotal: sum(p.served),
    /* 위계 판정 — 근거가 얇으면 단정하지 않는다 */
    rank: rankOf(sum(p.serves), sum(p.served)),
    span: p.first && p.last ? { from: p.first, to: p.last } : null,
    source: SOURCE,
  }
}

function rankOf(serves, served) {
  const n = serves + served
  if (n < 5) return null                       // 5회 미만은 말하지 않는다
  if (served >= serves * 3) return 'top'       // 수행받기만 한다
  if (serves >= served * 3) return 'staff'     // 수행하기만 한다
  return 'mid'
}

const SOURCE = {
  name: '북한정보포털 동향',
  provider: '통일부',
  note: '동향 제목에 기재된 수행·동행·접견 기록을 집계한 것입니다. 공개 보도에 실린 활동만 반영되며, 비공개 관계는 포함되지 않습니다.',
}
