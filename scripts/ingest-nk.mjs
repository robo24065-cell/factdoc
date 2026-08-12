// 북한자료 → 정규화 레코드 적재 (스키마 0011/0012 대응)
// 사용: node scripts/ingest-nk.mjs
// 출력: frontend/src/data/nk-index.json { datasets, topics, records, measures, entities }

import fs from 'node:fs'
import path from 'node:path'
import { DATASETS, READY, TOPICS } from './nk-catalog.mjs'

const SRC = path.resolve(process.env.NK_DIR || 'C:/Users/PC/Downloads/2026년 통일부 공공데이터 활용 공모전/북한자료')
const API_SRC = path.resolve(process.env.NK_API_DIR || '북한자료-api')   // fetch-mou-api.mjs 산출물
const OUT = path.resolve(process.env.NK_OUT || 'frontend/src/data/nk-index.json')

// ── IO ──────────────────────────────────────────────────────
const fileCache = new Map()
function findFile(name) {
  if (fileCache.has(name)) return fileCache.get(name)
  const stack = [SRC]; let hit = null
  while (stack.length && !hit) {
    const d = stack.pop()
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) stack.push(p)
      else if (e.name === name) { hit = p; break }
    }
  }
  fileCache.set(name, hit); return hit
}
function readText(p) {
  const buf = fs.readFileSync(p)
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.slice(3).toString('utf8')
  const u = buf.toString('utf8')
  return u.includes('\uFFFD') ? new TextDecoder('euc-kr').decode(buf) : u
}
/** API 수집본을 읽는다. 없으면 null — '아직 안 받았다'와 '0건'은 다르다 */
function readApi(ds) {
  const p = path.join(API_SRC, ds.file)
  if (!fs.existsSync(p)) return null
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  return { items: j.items || [], meta: j._meta || {} }
}

function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else if (c !== '\r') cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim()))
}

const clean = s => (s ?? '').toString().replace(/\s+/g, ' ').trim()
const isNull = s => !s || /^(null|nan|-|\.|없음)$/i.test(clean(s))
const slug = s => clean(s).replace(/[^\w가-힣]+/g, '_').slice(0, 40)

function normDate(s) {
  const t = clean(s)
  if (/^\d{8}$/.test(t)) return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6)}`   // ★ API 의 wrt_ymd/first_reg_ymd
  let m = t.match(/(\d{4})[\/\-.년]\s*(\d{1,2})[\/\-.월]\s*(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = t.match(/^(\d{4})[\/\-.년]\s*(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-01`
  m = t.match(/^(\d{4})$/); if (m) return `${m[1]}-01-01`
  return null
}
const num = v => { const n = Number(clean(v).replace(/[,\s]/g, '')); return Number.isFinite(n) ? n : null }

// ── 엔티티 ──────────────────────────────────────────────────
const ENTITY_SEED = [
  ['김정은', 'person'], ['김여정', 'person'], ['김주애', 'person'], ['최선희', 'person'],
  ['김정일', 'person'], ['김일성', 'person'], ['리설주', 'person'], ['조용원', 'person'], ['박정천', 'person'],
  ['조선노동당', 'org'], ['조선중앙통신', 'org'], ['노동신문', 'org'], ['조선인민군', 'org'],
  ['통일전선부', 'org'], ['최고인민회의', 'org'], ['통일부', 'org'],
  ['평양', 'place'], ['개성', 'place'], ['금강산', 'place'], ['판문점', 'place'],
  ['원산', 'place'], ['신의주', 'place'], ['비무장지대', 'place'],
  ['개성공단', 'event'], ['이산가족', 'term'], ['북핵', 'term'], ['비핵화', 'term'],
  ['대북제재', 'term'], ['남북정상회담', 'event'], ['9·19 군사합의', 'event'],
  ['북한이탈주민', 'term'], ['탈북민', 'term'],
]
const entities = new Map()   // slug → {slug,name,type,attrs,aliases:Set}
function ent(name, type, attrs) {
  const s = slug(name)
  if (!entities.has(s)) entities.set(s, { slug: s, name, type, attrs: attrs || null, aliases: new Set() })
  else if (attrs) entities.get(s).attrs = { ...entities.get(s).attrs, ...attrs }
  return s
}
for (const [n, t] of ENTITY_SEED) ent(n, t)
// 남북 표기 대응 시드 (용어사전 API 복구 시 대량 적재될 자리)
const ALIAS_SEED = [
  ['오물풍선', '대남 쓰레기 풍선', 'nk_term'], ['북한이탈주민', '탈북민', 'sk_term'],
  ['9·19 군사합의', '9.19 군사합의', 'abbrev'], ['조선노동당', '노동당', 'abbrev'],
  ['비무장지대', 'DMZ', 'abbrev'],
]
for (const [canon, alias, kind] of ALIAS_SEED) {
  const s = ent(canon, 'term'); entities.get(s).aliases.add(JSON.stringify({ alias, kind }))
}
const ENTITY_NAMES = [...entities.values()].map(e => e.name)
const mentionsOf = txt => ENTITY_NAMES.filter(n => txt.includes(n))

// ── 레코드 ──────────────────────────────────────────────────
const records = [], measures = []
let seq = 0
function push(dsKey, ds, r) {
  if (!r.title) return null
  const id = ++seq
  const text = `${r.title} ${r.body || ''}`
  records.push({
    id, datasetId: dsKey,
    factKey: r.factKey || null,
    kind: r.kind || 'doc',
    topic: r.topic || ds.topic,
    title: r.title,
    body: r.body || '',
    occurredOn: r.occurredOn || null,
    periodStart: r.periodStart || null, periodEnd: r.periodEnd || null,
    /* as-of 는 데이터셋 단위가 기본이지만, 레코드마다 기준일이 진짜로 다른 자료가 있다
       (북한개황 포털: 2023.7 / 2024.8 / 2025.5 작성분이 한 데이터셋에 섞여 있다).
       그걸 하나로 뭉개면 2023년 문서가 최신인 척하게 된다 — §3 as-of 모델의 정면 위반. */
    asOf: r.asOf || ds.asOf,
    coverageEnd: r.coverageEnd || ds.coverageEnd || ds.asOf,
    freshness: r.freshness || ds.freshness,
    frozenReason: ds.frozenReason || null,
    sourceUrl: r.sourceUrl || ds.url || null, sourceName: ds.name,
    priority: r.priority || ds.searchPriority || 50,
    ...(r.truncated ? { truncated: true } : {}),   // 원문이 잘린 레코드 — 근거로 인용할 때 경고해야 한다
    entities: r.entities || mentionsOf(text),
    isLatestInDataset: false,   // pointInTime 처리에서 채움
  })
  for (const m of r.measures || []) {
    measures.push({ recordId: id, metric: m.metric, metricSlug: slug(m.metric),
      value: m.value, unit: m.unit || null, dims: m.dims || null,
      periodStart: r.periodStart || r.occurredOn || null, asOf: ds.asOf })
  }
  return id
}

// ── 파서 ────────────────────────────────────────────────────
const P = {
  timeline(ds, key, rows) {
    for (const [d, content] of rows.slice(1)) {
      const date = normDate(d); if (!date || isNull(content)) continue
      const c = clean(content)
      push(key, ds, { kind: 'event', title: c.slice(0, 90), body: c, occurredOn: date,
        topic: 'ik.timeline' })
    }
  },

  people(ds, key, rows) {
    const H = rows[0].map(clean), i = n => H.indexOf(n)
    const [iN, iP, iS, iB, iD, iDD] = ['성명', '소속/직책', '성별', '출생', '사망여부', '사망일자'].map(i)
    for (const r of rows.slice(1)) {
      const name = clean(r[iN]); if (!name) continue
      const dead = clean(r[iD]) === '사망'
      const pos = clean(r[iP]), deadAt = isNull(r[iDD]) ? null : clean(r[iDD])
      ent(name, 'person', { position: pos || null, dead, deadAt })
      push(key, ds, {
        kind: 'entity', topic: 'who.person', factKey: `person.${slug(name)}`,
        title: name,
        body: [pos && `직책: ${pos}`, !isNull(r[iS]) && `성별: ${clean(r[iS])}`,
          !isNull(r[iB]) && `출생: ${clean(r[iB])}`,
          dead ? `사망: ${deadAt || '일자 미상'}` : '사망 기록 없음'].filter(Boolean).join(' · '),
        entities: [name, ...mentionsOf(pos)],
      })
    }
  },

  kju(ds, key, rows) {
    const H = rows[0].map(clean), i = n => H.indexOf(n)
    const [iD, iT, iC, iW] = ['보도일', '보도내용', '상세내용', '수행자'].map(i)
    for (const r of rows.slice(1)) {
      const date = normDate(r[iD]); if (!date) continue
      const esc = isNull(r[iW]) ? '' : ` / 수행: ${clean(r[iW])}`
      push(key, ds, { kind: 'event', topic: 'who.person', occurredOn: date,
        title: clean(r[iT]), body: clean(r[iC]) + esc, entities: ['김정은', ...mentionsOf(clean(r[iW]))] })
    }
  },

  talks(ds, key, rows) {
    const H = rows[0].map(clean), i = n => H.indexOf(n)
    const [iY, iF, iN, iM, iP, iS, iE] =
      ['연도', '회담분야', '회담명', '개최회담', '개최지역', '회담시작일자', '회담종료일자'].map(i)
    for (const r of rows.slice(1)) {
      const name = clean(r[iM]) || clean(r[iN]); if (!name) continue
      const st = normDate(r[iS])
      push(key, ds, { kind: 'event', topic: 'ik.talks', occurredOn: st,
        periodStart: st, periodEnd: normDate(r[iE]),
        title: name,
        body: [clean(r[iY]) && `${clean(r[iY])}년`, clean(r[iF]) && `분야: ${clean(r[iF])}`,
          clean(r[iP]) && `장소: ${clean(r[iP])}`].filter(Boolean).join(' · ') })
    }
  },

  overviewXml(ds, key, text) {
    const re = /<row>[\s\S]*?<category><!\[CDATA\[(.*?)\]\]><\/category>[\s\S]*?<cn><!\[CDATA\[([\s\S]*?)\]\]><\/cn>/g
    let m
    while ((m = re.exec(text))) {
      const cat = clean(m[1])
      const body = clean(m[2].replace(/&lt;[^&]*?&gt;/g, ' ').replace(/<[^>]+>/g, ' '))
      if (!body) continue
      // '북한개황>정치>정치 체제' → nk.politics 로 매핑
      const seg = cat.split('>').map(s => s.trim())
      const map = { 정치: 'nk.politics', 경제: 'nk.economy', 사회: 'nk.society',
        군사: 'nk.military', 대외관계: 'nk.foreign', 외교: 'nk.foreign', 문화: 'nk.culture' }
      push(key, ds, { kind: 'doc', topic: map[seg[1]] || 'nk',
        title: seg.slice(-1)[0] + (seg.length > 2 ? ` (${seg[1]})` : ''),
        body: body.slice(0, 3000) })
    }
  },

  // 통계 — 두 가지 레이아웃 자동 판별
  //  (A) 세로형: 행=기간, 열=지표      예) 2015 | 입주기업수 | 생산액
  //  (B) 피벗형: 행=월/구분, 열=연도   예) 01 | 2013년 | 2014년 | 2015년
  stat(ds, key, rows) {
    const H = rows[0].map(clean)
    // '2015년(명)' 과 '2015년_일평균(명)' 은 다른 지표다 — 접미사를 살린다
    const yearCols = H.map((h, i) => {
      const m = stripUnit(h).match(/^(\d{4})\s*년?\s*(?:[_\-·]\s*(.+))?$/)
      return { i, y: m?.[1], sub: (m?.[2] || '').trim() || null }
    }).filter(x => x.i > 0 && x.y)
    const isPivot = yearCols.length >= 2

    if (isPivot) {
      const base = stripUnit(ds.name)
      for (const r of rows.slice(1)) {
        const label = clean(r[0]); if (!label) continue
        const mm = (label.match(/^(\d{1,2})/) || [])[1]        // '01' → 월
        // 같은 (연,월)의 여러 지표를 한 레코드로 묶는다
        const byPeriod = new Map()
        for (const { i, y, sub } of yearCols) {
          const v = num(r[i]); if (v === null) continue
          const date = mm ? `${y}-${mm.padStart(2, '0')}-01` : `${y}-01-01`
          const metric = sub ? `${base} ${sub}` : base
          if (!byPeriod.has(date)) byPeriod.set(date, [])
          byPeriod.get(date).push({ metric, value: v, unit: unitOf(H[i]) })
        }
        for (const [date, ms] of byPeriod) {
          const y = date.slice(0, 4)
          push(key, ds, {
            kind: 'stat', topic: ds.topic,
            factKey: `${key}.${date.slice(0, 7)}`,
            title: `${ds.name} — ${y}년${mm ? ` ${Number(mm)}월` : ''}`,
            body: ms.map(m => `${m.metric} ${m.value.toLocaleString()}${m.unit ? ' ' + m.unit : ''}`).join(' · '),
            occurredOn: date, periodStart: date, measures: ms,
          })
        }
      }
      return
    }

    // (C) 차원형: 행=차원값(연령대/지역/학력…), 열=성별(남/여/합계)
    const GENDER = { '남': '남', '남자': '남', '여': '여', '여자': '여',
      '계': '전체', '합계': '전체', '소계': '전체', '전체': '전체' }
    const genderCols = H.map((h, i) => ({ i, g: GENDER[stripUnit(h)] })).filter(x => x.i > 0 && x.g)
    const dimName = (ds.name.match(/(연령대|출신지역|학력|직업|지역|성별|유형|품목|국가)\s*별/) || [])[1]

    if (genderCols.length >= 2 && dimName) {
      const unit = unitOf(H[genderCols[0].i]) || '명'
      const subject = ds.name.replace(/\s*[^\s]*별\s*/, ' ').replace(/\s+/g, ' ').trim()
      for (const r of rows.slice(1)) {
        const dimVal = clean(r[0]); if (!dimVal) continue
        const ms = []
        for (const { i, g } of genderCols) {
          const v = num(r[i]); if (v === null) continue
          ms.push({ metric: subject, value: v, unit, dims: { [dimName]: dimVal, 성별: g } })
        }
        if (!ms.length) continue
        const tot = ms.find(m => m.dims.성별 === '전체')
        push(key, ds, {
          kind: 'stat', topic: ds.topic, factKey: `${key}.${slug(dimVal)}`,
          title: `${ds.name} — ${dimVal}`,
          body: ms.map(m => `${m.dims.성별} ${m.value.toLocaleString()}${unit}`).join(' · ')
            + (tot ? '' : ''),
          measures: ms,
        })
      }
      return
    }

    for (const r of rows.slice(1)) {
      const label = clean(r[0]); if (!label) continue
      const date = normDate(label)
      const ms = []
      H.forEach((h, i) => { if (!i || !h) return
        const v = num(r[i]); if (v !== null) ms.push({ metric: stripUnit(h), value: v, unit: unitOf(h) }) })
      if (!ms.length) continue
      push(key, ds, {
        kind: 'stat', topic: ds.topic,
        factKey: `${key}.${slug(label)}`,
        title: `${ds.name} — ${label}`,
        body: ms.map(m => `${m.metric} ${m.value.toLocaleString()}${m.unit ? ' ' + m.unit : ''}`).join(', '),
        occurredOn: date, periodStart: date, measures: ms,
      })
    }
  },

  // ══ API 파서 ═══════════════════════════════════════════════
  //
  // as-of 출처 (데이터셋마다 다르다 — 이게 이 서비스의 핵심이라 명시한다)
  //   briefing        asOf = 수집 시도일(_meta.asOf) / coverageEnd = max(wrt_ymd)  ← 피드가 끊긴 날
  //   trendDaily      asOf = 수집 시도일            / coverageEnd = max(first_reg_ymd)
  //   trendWeekly     asOf = 수집 시도일            / coverageEnd = 최신호가 '다루는 기간의 끝'(게시일 아님)
  //   trendMonthly    asOf = 수집 시도일            / coverageEnd = 최신호 해당 월의 말일(게시일 아님)
  //   nkinfoTrend     asOf = 수집 시도일            / coverageEnd = trendDaily 와 id 공간 교차검증으로 유도
  //   nkinfoOverview  asOf = ★레코드별★ 본문 말미 '(2024.8월 작성)' 마커 / 없으면 filenm 발간연도
  //   accord/lexicon  미수집 — 카탈로그의 pendingReason 이 화면에 나간다

  /** 보도자료·보도설명자료. 반박성 100건이 판정 시드다 */
  briefing(ds, key, items) {
    for (const r of items) {
      const cntId = r._pk
      const date = normDate(r.wrt_ymd)
      if (!cntId || !date) continue
      // 구분 코드가 없다. 제목·첨부파일명의 작명 관례가 유일한 판별 수단이고,
      // filenm 까지 봐야 100건이 잡힌다(sj 만 보면 86건). '보도참고자료'는 반박이 아니므로 제외.
      const reb = REBUTTAL.test(r.sj || '') || REBUTTAL.test(r.filenm || '')
      const cn = clean(r.cn)
      push(key, ds, {
        kind: 'briefing',
        topic: reb ? 'gov.briefing' : 'gov.policy',
        priority: reb ? 100 : 55,
        factKey: `mou.press.${cntId}`,
        title: clean(r.sj),                     // ★ 2,709/2,709 건이 선행 공백을 갖고 있다
        body: blocks(cn) || '',
        truncated: cn.length >= 3000,           // cn 은 3,000자에서 문장 중간에 잘린다
        occurredOn: date, periodStart: date,
        // r.url 은 사이트 개편으로 전 건 404 다. cntId 로 새 주소를 조립한다(200 확인)
        sourceUrl: `https://www.unikorea.go.kr/web/unikorea/bbs/bbs_0000000000000004/${cntId}`,
      })
    }
  },

  /** 일일 북한동향 — 게시일과 사건일이 다르다 */
  trendDaily(ds, key, items) {
    for (const r of items) {
      const reg = normDate(r.first_reg_ymd)
      if (!r._pk || !reg) continue
      const cn = clean(r.cn)
      push(key, ds, {
        kind: 'briefing', topic: nkTopic(`${r.sj} ${cn}`),
        factKey: `trend.dail.${r._pk}`,
        title: clean(r.sj),
        body: blocks(dedupHead(cn, r.sj)),      // cn 이 '□ {제목}(매체)' 로 제목을 되풀이한다
        occurredOn: eventDate(cn, reg) || reg,  // 본문 머리의 (8.10. 노동) 이 실제 사건일
        periodStart: null,
        sourceUrl: r.url || ds.url,
      })
    }
  },

  /** 주간·월간 동향 — 본문이 없다. 제목과 '다루는 기간'만 있다 */
  trendPeriodical(ds, key, items) {
    for (const r of items) {
      if (!r._pk) continue
      const [st, en] = periodOf(r)
      push(key, ds, {
        kind: 'doc', topic: 'nk',
        factKey: `trend.${ds.params.cl.toLowerCase()}.${r._pk}`,
        title: clean(r.sj),
        body: '',                               // ★ 없다. hwpx/hwp/pdf 첨부가 실체다
        occurredOn: en || normDate(r.first_reg_ymd),
        periodStart: st, periodEnd: en,
        sourceUrl: r.url || ds.url,
      })
    }
  },

  /** 북한정보포털 동향 — ★ 통일부의 판정이 아니라 북한 매체 주장의 채록이다 */
  nkinfoTrend(ds, key, items) {
    // 6.3만건 전량은 웹 인덱스에 실을 수 없다. 최신(=id 큰) 순으로 상한을 건다.
    // 원본 전량은 북한자료-api/nkinfoTrend.json 에 그대로 남는다.
    const rows = [...items].sort((a, b) => Number(b._pk) - Number(a._pk))
      .slice(0, ds.ingestLimit || items.length)
    for (const r of rows) {
      if (!r._pk) continue
      push(key, ds, {
        kind: 'event', topic: THEMA[r.thema] || 'nk',
        factKey: `nkinfo.trend.${r._pk}`,
        title: clean(r.sj).replace(/^\[[^\]]+\]\s*/, ''),   // 레거시 '[정치]' 접두어 제거
        // 라벨을 본문에 박아 넣는다. 이걸 빼면 '정부가 그렇게 판정했다'는 정반대 신호가 된다.
        body: `[북한 매체 보도 내용 — 통일부 채록] ${blocks(clean(r.cn))}`,
        occurredOn: null,                        // ★ 응답에 날짜 필드가 아예 없다. 추정으로 채우지 않는다
        sourceUrl: r.url || ds.url,
      })
    }
  },

  /** 북한개황(포털) — as-of 가 레코드마다 다르다 */
  nkinfoOverview(ds, key, items) {
    for (const r of items) {
      if (!r._pk) continue
      const cn = clean(r.cn)
      const asOf = writtenAt(cn) || pubYear(r.filenm)
      push(key, ds, {
        kind: 'doc', topic: THEMA[r.thema] || 'nk',
        factKey: `nkinfo.pge.${r._pk}`,
        title: clean(r.sj),
        body: blocks(cn),
        truncated: cn.length >= 10000,           // 7건이 문장 중간에서 잘려 있다
        asOf, coverageEnd: asOf,                 // ★ 레코드별. 데이터셋 하나로 뭉개면 거짓말이 된다
        freshness: 'stale',
        sourceUrl: r.url || ds.url,
      })
    }
  },
}

// ── API 보조 ────────────────────────────────────────────────
// '보도참고자료'는 반박이 아니라 단순 보충설명이다(73건). 넣으면 판정 시드가 오염된다.
const REBUTTAL = /보도(설명|해명|반박)자료/
const THEMA = { 1: 'nk.politics', 2: 'nk.economy', 3: 'nk.culture', 4: 'nk.society', 5: 'nk.military' }

/** cn 에 문단 구분이 없다 — □ o ▵ ※ 가 개행 없이 붙어 흐른다. 화면에서 벽돌이 되는 걸 막는다 */
const blocks = t => clean(t).replace(/\s*([□○◦▵△※]|\bo\s(?=[가-힣“"]))/g, '\n$1').trim()

/** cn 이 '□ {제목}(매체)' 로 시작해 제목 단어가 BM25 에서 4배 먹는 걸 막는다 */
const dedupHead = (cn, sj) => {
  const t = clean(sj)
  return t && cn.startsWith(`□ ${t}`) ? cn.slice(2 + t.length + 1).trim() : cn
}

/** 본문 머리의 (8.10. 노동) → 실제 사건일. 연도는 게시일에서 취하되 연말연시 경계를 보정한다 */
function eventDate(cn, reg) {
  const m = String(cn).match(/^[^(]{0,80}\((\d{1,2})\.(\d{1,2})\.?\s*[^)]*\)/)
  if (!m) return null
  const [mo, dd] = [+m[1], +m[2]]
  if (mo < 1 || mo > 12 || dd < 1 || dd > 31) return null
  let y = +reg.slice(0, 4)
  if (mo === 12 && +reg.slice(5, 7) === 1) y -= 1        // 1월 게시 + 12월 사건
  const d = `${y}-${String(mo).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  return d <= reg ? d : null                              // 게시일보다 미래면 파싱 실패로 본다
}

/** 주간·월간호가 '다루는 기간'. filenm 이 8자리 고정폭이라 제목보다 견고하다 */
function periodOf(r) {
  const f = String(r.filenm || ''), s = clean(r.sj)
  const w = f.match(/(\d{8})-(\d{8})/)
  if (w) return [normDate(w[1]), normDate(w[2])]
  const t = s.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})\.?\s*[-~]\s*(\d{4})\.(\d{1,2})\.(\d{1,2})/)
  if (t) return [`${t[1]}-${p2(t[2])}-${p2(t[3])}`, `${t[4]}-${p2(t[5])}-${p2(t[6])}`]
  const mo = s.match(/(\d{4})년\s*(\d{1,2})월/) || f.match(/(\d{4})년\s*(\d{1,2})월/)
  if (mo) {
    const [y, m] = [+mo[1], +mo[2]]
    return [`${y}-${p2(m)}-01`, `${y}-${p2(m)}-${String(new Date(y, m, 0).getDate())}`]
  }
  return [null, null]
}
const p2 = n => String(n).padStart(2, '0')
const writtenAt = cn => {
  const m = String(cn).match(/\((\d{4})\.\s*(\d{1,2})\s*월\s*작성\)/)
  return m ? `${m[1]}-${p2(m[2])}-${String(new Date(+m[1], +m[2], 0).getDate())}` : null
}
const pubYear = f => { const m = String(f || '').match(/(20\d{2})/); return m ? `${m[1]}-12-31` : null }

/** 동향 본문에서 하위 주제를 가른다 — API 가 주는 thema 가 없는 trend 용 */
function nkTopic(t) {
  if (/미사일|발사|포격|훈련|군사|핵실험|무력|국방|병력/.test(t)) return 'nk.military'
  if (/경제|무역|생산|공장|농업|시장|수출|건설/.test(t)) return 'nk.economy'
  if (/외교|방문|회담|중국|러시아|미국|일본|대사/.test(t)) return 'nk.foreign'
  if (/당|위원회|최고인민회의|총비서|정치|간부/.test(t)) return 'nk.politics'
  return 'nk'
}
// '생산액(10000달러)' → metric '생산액' / unit '만달러'
const stripUnit = h => clean(String(h).replace(/\([^)]*\)/g, ''))
const UNIT_FIX = { '10000달러': '만달러', '1000달러': '천달러', '천달러': '천달러', '만명': '만명' }
const unitOf = h => {
  const u = (String(h).match(/\(([^)]+)\)/) || [, ''])[1]?.trim()
  return u ? (UNIT_FIX[u] || u) : null
}

// ── 실행 ────────────────────────────────────────────────────
const report = []
for (const [key, ds] of Object.entries(READY)) {
  const before = records.length
  try {
    if (ds.kind === 'api') {
      const api = readApi(ds)
      if (!api) { report.push({ key, name: ds.name, n: 0, st: '미수집 — fetch-mou-api.mjs 먼저' }); continue }
      /* ★ 카탈로그 값이 기준선이고, 수집본이 더 최신일 때만 앞으로 민다. 뒤로는 절대 안 민다.
         수집이 실패했는데 조용히 coverageEnd 가 과거로 밀리면 "이후는 확인 안 됨" 이 거짓이 된다. */
      if (ds.autoCoverage && api.meta.coverageEnd && api.meta.coverageEnd > (ds.coverageEnd || '')) {
        console.log(`  ↑ ${key} coverageEnd ${ds.coverageEnd} → ${api.meta.coverageEnd} (수집본이 더 최신)`)
        ds.coverageEnd = api.meta.coverageEnd
      }
      if (api.meta.asOf) ds.asOf = api.meta.asOf
      P[ds.parser](ds, key, api.items)
    } else if (ds.kind === 'xml') {
      const p = findFile(ds.file)
      if (!p) { report.push({ key, name: ds.name, n: 0, st: '파일없음' }); continue }
      P.overviewXml(ds, key, readText(p))
    } else {
      const p = findFile(ds.file)
      if (!p) { report.push({ key, name: ds.name, n: 0, st: '파일없음' }); continue }
      P[ds.parser](ds, key, parseCSV(readText(p)))
    }
    report.push({ key, name: ds.name, n: records.length - before, st: 'OK', f: ds.freshness })
  } catch (e) { report.push({ key, name: ds.name, n: 0, st: `오류 ${e.message.slice(0, 60)}` }) }
}

// pointInTime — 데이터셋별 최종 시점 레코드 표시 (검색 랭킹에서 우선)
for (const [key, ds] of Object.entries(READY)) {
  if (!ds.pointInTime) continue
  const rs = records.filter(r => r.datasetId === key && r.occurredOn)
  if (!rs.length) continue
  const maxD = rs.reduce((a, b) => (a.occurredOn > b.occurredOn ? a : b)).occurredOn
  rs.filter(r => r.occurredOn === maxD).forEach(r => { r.isLatestInDataset = true })
}

const out = {
  builtAt: new Date().toISOString().slice(0, 10),
  topics: TOPICS,
  datasets: Object.fromEntries(Object.entries(DATASETS).map(([k, d]) => [k, {
    ...d, aliases: undefined,
  }])),
  records, measures,
  entities: [...entities.values()].map(e => ({ ...e, aliases: [...e.aliases].map(a => JSON.parse(a)) })),
}
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify(out), 'utf8')

// ── 리포트 ──────────────────────────────────────────────────
const L = '═'.repeat(70)
console.log(L)
for (const r of report) {
  const f = r.f === 'frozen' ? '🔒' : r.f === 'live' ? '🟢' : '🟡'
  console.log(`${(r.st === 'OK' ? f : '❌')} ${r.name.slice(0, 30).padEnd(32)}${String(r.n).padStart(7)}건  ${r.st === 'OK' ? '' : r.st}`)
}
console.log(L)
console.log(`레코드 ${records.length.toLocaleString()} · 수치 ${measures.length.toLocaleString()} · 엔티티 ${entities.size}`)
console.log(`날짜보유 ${records.filter(r => r.occurredOn).length.toLocaleString()} · 최종시점표시 ${records.filter(r => r.isLatestInDataset).length}`)
for (const [k, d] of Object.entries(DATASETS))
  if (d.status === 'pending') console.log(`⏸ ${d.name} — ${d.pendingReason || '대기'}`)
console.log(`반박자료 ${records.filter(r => r.topic === 'gov.briefing').length}건 · 절단표시 ${records.filter(r => r.truncated).length}건`)
console.log(`출력 ${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB`)
console.log(L)
