// 북한자료 → 정규화 레코드 적재 (스키마 0011/0012 대응)
// 사용: node scripts/ingest-nk.mjs
// 출력: frontend/src/data/nk-index.json { datasets, topics, records, measures, entities }

import fs from 'node:fs'
import path from 'node:path'
import { DATASETS, READY, TOPICS } from './nk-catalog.mjs'

const SRC = path.resolve(process.env.NK_DIR || 'C:/Users/PC/Downloads/2026년 통일부 공공데이터 활용 공모전/북한자료')
const OUT = path.resolve('frontend/src/data/nk-index.json')

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
    asOf: ds.asOf, coverageEnd: ds.coverageEnd || ds.asOf, freshness: ds.freshness,
    frozenReason: ds.frozenReason || null,
    sourceUrl: ds.url || null, sourceName: ds.name,
    priority: ds.searchPriority || 50,
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
  const p = findFile(ds.file)
  if (!p) { report.push({ key, name: ds.name, n: 0, st: '파일없음' }); continue }
  const before = records.length
  try {
    if (ds.kind === 'xml') P.overviewXml(ds, key, readText(p))
    else P[ds.parser](ds, key, parseCSV(readText(p)))
    report.push({ key, name: ds.name, n: records.length - before, st: 'OK', f: ds.freshness })
  } catch (e) { report.push({ key, name: ds.name, n: 0, st: `오류 ${e.message.slice(0, 40)}` }) }
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
console.log(`API 대기 ${Object.keys(DATASETS).filter(k => DATASETS[k].status === 'pending').length}종 (복구 시 status만 변경)`)
console.log(`출력 ${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB`)
console.log(L)
