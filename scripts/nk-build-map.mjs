#!/usr/bin/env node
// nk-build-map.mjs — 북한 행정구역 SVG 지도 데이터 생성
//
// 출처: Natural Earth admin-1 (퍼블릭 도메인) — martynafford GeoJSON 변환본(50m) 우선,
//       실패 시 10m / nvkelso 원본 저장소 폴백.
// 산출: frontend/src/data/nk-map.json
//   - regionsModern[] : 현행 행정구역 { id, name(한글), nameEn, path, centroid }
//   - regionsOld[]    : 구행정구역 7개 병합 { id, name, members, paths[], centroid }
//   - crosswalk{}     : 구→현행 매핑표 + 근사 명시 note
//   - cities[]        : 주요 도시 13곳 { name, x, y }
// 투영: 단순 등장방형(lon/lat 선형) + 위도 보정 cos(38°), viewBox 0 0 ~800 x ~1000 이내.
//
// 사용: node scripts/nk-build-map.mjs [--built-at=YYYY-MM-DD] [--force]
//   --built-at : 산출 메타 builtAt에 기록할 날짜(미지정 시 실행 시점 날짜)
//   --force    : scripts/.cache/ 캐시를 무시하고 재다운로드

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CACHE_DIR = path.join(__dirname, '.cache')
const OUT_FILE = path.join(ROOT, 'frontend', 'src', 'data', 'nk-map.json')
const MAX_BYTES = 300 * 1024

const args = process.argv.slice(2)
const FORCE = args.includes('--force')
const builtAtArg = args.find(a => a.startsWith('--built-at='))
const BUILT_AT = builtAtArg ? builtAtArg.split('=')[1]
  : (process.env.BUILD_DATE || new Date().toISOString().slice(0, 10))

// ── 1. 지오메트리 소스 (우선순위 순) ─────────────────────────────────────────
const SOURCES = [
  {
    name: 'Natural Earth 1:50m Admin 1 – States, Provinces (martynafford GeoJSON)',
    url: 'https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/50m/cultural/ne_50m_admin_1_states_provinces.json',
    cache: 'ne_50m_admin_1.json',
  },
  {
    name: 'Natural Earth 1:10m Admin 1 – States, Provinces (martynafford GeoJSON)',
    url: 'https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/10m/cultural/ne_10m_admin_1_states_provinces.json',
    cache: 'ne_10m_admin_1.json',
  },
  {
    name: 'Natural Earth 1:50m Admin 1 – States, Provinces (nvkelso natural-earth-vector)',
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson',
    cache: 'ne_50m_admin_1_nvkelso.geojson',
  },
]

const isKP = f => {
  const p = f.properties || {}
  return p.iso_a2 === 'KP' || p.adm0_a3 === 'PRK' || p.sov_a3 === 'PRK' || p.admin === 'North Korea'
}

async function loadGeoJSON() {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  const errors = []
  for (const src of SOURCES) {
    const cachePath = path.join(CACHE_DIR, src.cache)
    try {
      let geo, text
      if (!FORCE && fs.existsSync(cachePath) && fs.statSync(cachePath).size > 1024) {
        console.log(`[cache] ${src.cache} (${(fs.statSync(cachePath).size / 1e6).toFixed(1)}MB)`)
        geo = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
      } else {
        console.log(`[fetch] ${src.url}`)
        const res = await fetch(src.url, { signal: AbortSignal.timeout(180_000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        text = await res.text()
        geo = JSON.parse(text) // 검증 후 캐시
        console.log(`[fetch] 완료 ${(text.length / 1e6).toFixed(1)}MB, features=${geo.features?.length ?? 0}`)
      }
      if (!geo.features?.length) throw new Error('features 비어 있음')
      // NE 1:50m admin-1은 미국·캐나다·호주·브라질 등 일부 대형 국가만 수록한다.
      // 북한 피처가 없으면 이 소스는 버리고 다음(10m)으로 넘어간다.
      const kpCount = geo.features.filter(isKP).length
      if (kpCount === 0) throw new Error('북한(KP/PRK) 피처 0건 — 이 판본은 북한 미수록')
      if (text) fs.writeFileSync(cachePath, text)
      console.log(`[source] 채택: ${src.name} (북한 피처 ${kpCount}건)`)
      return { src, geo }
    } catch (e) {
      console.warn(`[fetch] 부적합/실패: ${src.url} — ${e.message}`)
      errors.push(`${src.url}: ${e.message}`)
    }
  }
  throw new Error('모든 지오메트리 소스 실패:\n' + errors.join('\n'))
}

// ── 2. 이름 정규화·한글 매핑 ────────────────────────────────────────────────
// NE 표기는 판본에 따라 P'yŏngan-namdo / South Pyongan 등으로 갈린다.
// 발음구별기호·아포스트로피·하이픈·공백 제거 후 소문자 키로 매칭한다.
const norm = s => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[ʼ'’\-\s.]/g, '')
  .toLowerCase()

const REGION_TABLE = [
  { id: 'pyongyang',  ko: '평양',     keys: ['pyongyang', 'pyongyangsi', 'pyeongyang'] },
  { id: 'pyongan-s',  ko: '평안남도', keys: ['pyongannamdo', 'southpyongan', 'pyeongannamdo'] },
  { id: 'pyongan-n',  ko: '평안북도', keys: ['pyonganbukto', 'northpyongan', 'pyeonganbukto'] },
  { id: 'chagang',    ko: '자강도',   keys: ['chagangdo', 'chagang', 'jagangdo'] },
  { id: 'hwanghae-s', ko: '황해남도', keys: ['hwanghaenamdo', 'southhwanghae'] },
  { id: 'hwanghae-n', ko: '황해북도', keys: ['hwanghaebukto', 'northhwanghae'] },
  { id: 'kangwon',    ko: '강원도',   keys: ['kangwondo', 'kangwon', 'gangwondo'] },
  { id: 'hamgyong-s', ko: '함경남도', keys: ['hamgyongnamdo', 'southhamgyong'] },
  { id: 'hamgyong-n', ko: '함경북도', keys: ['hamgyongbukto', 'northhamgyong'] },
  { id: 'ryanggang',  ko: '량강도',   keys: ['ryanggang', 'yanggang', 'ryanggangdo', 'yanggangdo'] },
  { id: 'rason',      ko: '라선',     keys: ['rason', 'rasonsi', 'najinsonbong', 'rajinsonbong', 'naseon'] },
  { id: 'nampo',      ko: '남포',     keys: ['nampo', 'namposi', 'nampho', 'namphosi'] },
  { id: 'kaesong',    ko: '개성',     keys: ['kaesong', 'kaesongsi', 'gaeseong'] },
]

function classifyRegion(props) {
  const cands = [props.name, props.name_en, props.gn_name, props.woe_name, props.name_local]
    .filter(Boolean)
  for (const c of cands) {
    const n = norm(c)
    const hit = REGION_TABLE.find(r => r.keys.includes(n))
    if (hit) return hit
  }
  // 부분일치 폴백
  for (const c of cands) {
    const n = norm(c)
    const hit = REGION_TABLE.find(r => r.keys.some(k => n.includes(k) || k.includes(n)))
    if (hit) return hit
  }
  return null
}

// ── 3. 투영 (등장방형 + cos(38°) 보정) ──────────────────────────────────────
const COS38 = Math.cos((38 * Math.PI) / 180)
const PAD = 12
const FIT_W = 800
const FIT_H = 1000

function makeProjector(bbox) {
  const [minLon, minLat, maxLon, maxLat] = bbox
  const wDeg = (maxLon - minLon) * COS38
  const hDeg = maxLat - minLat
  const k = Math.min((FIT_W - 2 * PAD) / wDeg, (FIT_H - 2 * PAD) / hDeg)
  const W = Math.ceil(wDeg * k + 2 * PAD)
  const H = Math.ceil(hDeg * k + 2 * PAD)
  const project = (lon, lat) => [
    PAD + (lon - minLon) * COS38 * k,
    PAD + (maxLat - lat) * k,
  ]
  return { project, W, H, k }
}

// ── 4. 지오메트리 도구 ──────────────────────────────────────────────────────
function ringsOf(geometry) {
  if (geometry.type === 'Polygon') return geometry.coordinates
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat()
  return []
}

// Douglas–Peucker (투영 px 단위 tolerance)
function simplifyDP(pts, tol) {
  if (tol <= 0 || pts.length < 5) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    if (b - a < 2) continue
    const [ax, ay] = pts[a], [bx, by] = pts[b]
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    let maxD = -1, maxI = -1
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]
      let d
      if (len2 === 0) d = Math.hypot(px - ax, py - ay)
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
      }
      if (d > maxD) { maxD = d; maxI = i }
    }
    if (maxD > tol) { keep[maxI] = 1; stack.push([a, maxI], [maxI, b]) }
  }
  return pts.filter((_, i) => keep[i])
}

const r1 = n => Math.round(n * 10) / 10

function ringSignedArea(pts) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

// 면적가중 centroid (구멍 링은 부호로 자동 상쇄)
function featureCentroid(projRings) {
  let A = 0, CX = 0, CY = 0
  for (const pts of projRings) {
    let a = 0, cx = 0, cy = 0
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]
      const cross = x1 * y2 - x2 * y1
      a += cross
      cx += (x1 + x2) * cross
      cy += (y1 + y2) * cross
    }
    a /= 2
    if (Math.abs(a) < 1e-9) continue
    A += a
    CX += cx / 6
    CY += cy / 6
  }
  if (Math.abs(A) < 1e-9) return null
  return { x: CX / A, y: CY / A, area: Math.abs(A) }
}

function buildPath(projRings, tol) {
  const parts = []
  let dropped = 0
  for (const pts of projRings) {
    let p = simplifyDP(pts, tol)
    // 반올림 후 연속 중복 제거
    const out = []
    for (const [x, y] of p) {
      const rx = r1(x), ry = r1(y)
      const last = out[out.length - 1]
      if (last && last[0] === rx && last[1] === ry) continue
      out.push([rx, ry])
    }
    if (out.length > 1) {
      const [fx, fy] = out[0], [lx, ly] = out[out.length - 1]
      if (fx === lx && fy === ly) out.pop()
    }
    if (out.length < 3 || Math.abs(ringSignedArea(out)) < 2) { dropped++; continue } // 2px² 미만 잔섬 제거
    parts.push('M' + out.map(p2 => `${p2[0]},${p2[1]}`).join('L') + 'Z')
  }
  return { d: parts.join(''), dropped }
}

// ── 5. 주요 도시 (WGS84 표준 좌표, 수동 수록) ───────────────────────────────
// in: 그 도시가 실제로 속한 현행 광역 id — 투영 검증(도시가 소속 폴리곤 안에 찍히는가)에 쓴다.
const CITIES = [
  { name: '평양',   lon: 125.7625, lat: 39.0392, in: 'pyongyang' },
  { name: '개성',   lon: 126.5544, lat: 37.9708, in: 'hwanghae-n' },
  { name: '원산',   lon: 127.4436, lat: 39.1528, in: 'kangwon' },
  { name: '함흥',   lon: 127.5364, lat: 39.9181, in: 'hamgyong-s' },
  { name: '청진',   lon: 129.7758, lat: 41.7956, in: 'hamgyong-n' },
  { name: '신의주', lon: 124.3983, lat: 40.1006, in: 'pyongan-n' },
  { name: '해주',   lon: 125.7147, lat: 38.0406, in: 'hwanghae-s' },
  { name: '남포',   lon: 125.4078, lat: 38.7378, in: 'pyongan-s' },
  { name: '혜산',   lon: 128.1775, lat: 41.4017, in: 'ryanggang' },
  { name: '강계',   lon: 126.5906, lat: 40.9697, in: 'chagang' },
  { name: '라선',   lon: 130.3006, lat: 42.3444, in: 'rason' },
  { name: '사리원', lon: 125.7589, lat: 38.5064, in: 'hwanghae-n' },
  { name: '금강산', lon: 128.1128, lat: 38.6550, in: 'kangwon' },
]

// ── 5a. path 기하 유틸 (검증용) ─────────────────────────────────────────────
const pathRings = d => d.split('Z').filter(Boolean)
  .map(s => s.replace(/^M/, '').split('L').map(p => p.split(',').map(Number)))

// even-odd 규칙 점 포함 판정
function pointInPath(d, px, py) {
  let inside = false
  for (const r of pathRings(d)) {
    for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[k]
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

// 점에서 path 경계까지의 최단거리(px)
function distToPath(d, px, py) {
  let m = Infinity
  for (const r of pathRings(d)) {
    for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
      const [ax, ay] = r[k], [bx, by] = r[i]
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy
      const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0
      m = Math.min(m, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)))
    }
  }
  return m
}

// ── 6. 구행정구역(1945 이전) 병합 정의 ──────────────────────────────────────
const OLD_DEFS = [
  { id: 'hwanghae-old',  name: '황해도(구)',   members: ['hwanghae-s', 'hwanghae-n'] },
  { id: 'pyongan-s-old', name: '평안남도(구)', members: ['pyongan-s', 'pyongyang', 'nampo'] },
  { id: 'pyongan-n-old', name: '평안북도(구)', members: ['pyongan-n', 'chagang'] },
  { id: 'hamgyong-s-old', name: '함경남도(구)', members: ['hamgyong-s', 'ryanggang'] },
  { id: 'hamgyong-n-old', name: '함경북도(구)', members: ['hamgyong-n', 'rason'] },
  { id: 'gyeonggi-unrec', name: '미수복경기',   members: ['kaesong'], fallbackCity: '개성' },
  { id: 'gangwon-unrec',  name: '미수복강원',   members: ['kangwon'] },
]

// 소스 판본에 별도 admin-1 폴리곤이 없는 단위 → 어느 폴리곤에 흡수돼 있는지 명시.
// (누락을 조용히 삼키지 않고 산출물에 기록하기 위한 표)
const ABSORBED_IN = {
  nampo: { into: 'pyongan-s', note: '남포특별시는 이 판본에 별도 폴리곤이 없어 평안남도 폴리곤에 포함돼 있다' },
  kaesong: { into: 'hwanghae-n', note: '개성특별시는 이 판본에 별도 폴리곤이 없어 황해북도 폴리곤에 포함돼 있다' },
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  const { src, geo } = await loadGeoJSON()

  const feats = geo.features.filter(isKP)
  if (!feats.length) throw new Error('북한(KP/PRK) admin-1 피처가 0건 — 소스 스키마 확인 필요')
  console.log(`\n[filter] 북한 admin-1 ${feats.length}건:`)
  for (const f of feats) {
    const p = f.properties
    console.log(`  - name="${p.name}" name_en="${p.name_en || ''}" name_ko="${p.name_ko || ''}"`)
  }

  // bbox
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity
  for (const f of feats) for (const ring of ringsOf(f.geometry)) for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  const bbox = [minLon, minLat, maxLon, maxLat].map(v => Math.round(v * 1e4) / 1e4)
  const { project, W, H } = makeProjector(bbox)
  console.log(`\n[proj] bbox=[${bbox.join(', ')}] → viewBox 0 0 ${W} ${H}`)

  // 피처 → 투영 링 + 분류
  const classified = []
  const unmatched = []
  for (const f of feats) {
    const cls = classifyRegion(f.properties)
    const projRings = ringsOf(f.geometry).map(ring => ring.map(([lon, lat]) => project(lon, lat)))
    if (!cls) { unmatched.push(f.properties.name || f.properties.name_en || '?'); continue }
    classified.push({ cls, props: f.properties, projRings })
  }
  if (unmatched.length) console.warn(`[warn] 한글 매핑 실패(제외): ${unmatched.join(', ')}`)

  // 같은 id 피처 병합(판본에 따라 분할돼 있을 수 있음)
  const byId = new Map()
  for (const c of classified) {
    if (!byId.has(c.cls.id)) byId.set(c.cls.id, { cls: c.cls, props: c.props, projRings: [] })
    byId.get(c.cls.id).projRings.push(...c.projRings)
  }

  // 파일 크기 300KB 이하가 될 때까지 tolerance 상향
  let tol = 0.4
  let result = null
  for (let attempt = 0; attempt < 6; attempt++) {
    const regionsModern = []
    let totalDropped = 0
    for (const { cls, props, projRings } of byId.values()) {
      const { d, dropped } = buildPath(projRings, tol)
      totalDropped += dropped
      const c = featureCentroid(projRings)
      if (!d || !c) { console.warn(`[warn] ${cls.id}: path/centroid 생성 실패`); continue }
      regionsModern.push({
        id: cls.id,
        name: props.name_ko || cls.ko, // name_ko 필드가 있으면 우선
        nameEn: props.name_en || props.name || '',
        path: d,
        centroid: [r1(c.x), r1(c.y)],
        _area: c.area,
      })
    }
    regionsModern.sort((a, b) => b._area - a._area)

    // 구행정구역 병합
    const modernById = new Map(regionsModern.map(r => [r.id, r]))
    const kaesongCity = CITIES.find(c => c.name === '개성')
    const regionsOld = []
    for (const def of OLD_DEFS) {
      const present = def.members.filter(m => modernById.has(m))
      const absent = def.members.filter(m => !modernById.has(m))
      const entry = { id: def.id, name: def.name, members: present }
      // 정의상 포함돼야 하나 소스에 별도 폴리곤이 없는 구성원을 기록한다.
      if (absent.length) {
        entry.missing = absent.map(m => ({
          id: m,
          absorbedIn: ABSORBED_IN[m]?.into ?? null,
          note: ABSORBED_IN[m]?.note ?? '이 판본에 별도 폴리곤 없음',
        }))
        for (const m of entry.missing) console.warn(`[warn] ${def.name}: 구성원 '${m.id}' 누락 — ${m.note}`)
      }
      if (present.length) {
        entry.paths = present.map(m => modernById.get(m).path)
        let A = 0, X = 0, Y = 0
        for (const m of present) {
          const r = modernById.get(m)
          A += r._area; X += r.centroid[0] * r._area; Y += r.centroid[1] * r._area
        }
        entry.centroid = [r1(X / A), r1(Y / A)]
      } else if (def.fallbackCity === '개성') {
        // NE에 개성 별도 지오메트리가 없는 판본 → 개성 도시 위치 원형 마커로 대체
        const [x, y] = project(kaesongCity.lon, kaesongCity.lat)
        entry.paths = []
        entry.marker = { cx: r1(x), cy: r1(y), r: 14 }
        entry.centroid = [r1(x), r1(y)]
        entry.note = '개성 별도 지오메트리 없음(현행 황해북도에 포함) — 개성 도시 위치 원형 마커로 대체'
        console.warn(`[warn] ${def.name}: ${entry.note}`)
      } else {
        console.warn(`[warn] ${def.name}: 구성원 없음(${def.members.join(',')})`)
        continue
      }
      regionsOld.push(entry)
    }

    const cities = CITIES.map(c => {
      const [x, y] = project(c.lon, c.lat)
      return { name: c.name, x: r1(x), y: r1(y), regionId: c.in }
    })

    const kaesongSeparate = modernById.has('kaesong')
    const out = {
      builtAt: BUILT_AT,
      sources: [
        {
          name: src.name,
          url: src.url,
          license: 'Public Domain (Natural Earth)',
          retrieved: BUILT_AT,
        },
        {
          name: '주요 도시 좌표',
          note: 'WGS84 표준 지리좌표 수동 수록(위키백과 등 공개 좌표), 동일 투영 적용',
        },
      ],
      projection: {
        type: 'equirectangular',
        latCorrection: 'cos(38°)',
        bboxLonLat: bbox,
        simplifyTolerancePx: tol,
        note: '링을 그대로 이어붙인 path이므로 fill-rule="evenodd"로 렌더링할 것',
      },
      viewBox: `0 0 ${W} ${H}`,
      regionsModern: regionsModern.map(({ _area, ...r }) => r),
      regionsOld,
      crosswalk: {
        // modern[]에는 regionsModern에 실재하는 id만 넣는다(끊긴 참조 금지).
        // 정의상 포함되나 폴리곤이 없는 단위는 missing[]으로 분리해 명시한다.
        map: Object.fromEntries(OLD_DEFS.map(d => {
          const e = { name: d.name, modern: d.members.filter(m => modernById.has(m)) }
          const absent = d.members.filter(m => !modernById.has(m))
          if (absent.length) {
            e.missing = absent.map(m => ({
              id: m,
              absorbedIn: ABSORBED_IN[m]?.into ?? null,
              note: ABSORBED_IN[m]?.note ?? '이 판본에 별도 폴리곤 없음',
            }))
          }
          return [d.id, e]
        })),
        note: '1945년 이전 구행정구역과 현행 북한 행정구역의 근사 매핑임. 실제 경계는 일치하지 않으며'
          + '(예: 구 평안북도 일부 군이 현 량강도에, 구 함경남도 일부가 현 강원도에 편입 등) 시각화 용도로만 사용할 것. '
          + (kaesongSeparate
            ? '개성은 별도 지오메트리를 미수복경기에 배정했다.'
            : '개성 일대는 이 지오메트리 판본에서 현행 황해북도 폴리곤에 포함돼 있어 미수복경기는 개성 위치 원형 마커로 표현한다.')
          + ' 남포는 별도 폴리곤이 없어 평안남도 폴리곤에 포함돼 있으므로 평안남도(구)의 members에 별도 항목으로 나타나지 않는다.'
          + ' crosswalk.map[*].modern은 regionsModern에 실재하는 id만 담으며, 폴리곤이 없는 단위는 missing[]에 분리 기록한다.',
      },
      cities,
    }

    const json = JSON.stringify(out, null, 1)
    if (json.length <= MAX_BYTES || tol >= 3) {
      result = { out, json, totalDropped, regionsModern, cities, modernById }
      break
    }
    console.log(`[size] ${(json.length / 1024).toFixed(0)}KB > 300KB → tolerance ${tol} → ${tol + 0.5}`)
    tol += 0.5
  }

  const { out, json, totalDropped, regionsModern, cities } = result
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })
  fs.writeFileSync(OUT_FILE, json)
  console.log(`\n[write] ${OUT_FILE}`)
  console.log(`[write] ${(json.length / 1024).toFixed(1)}KB (한도 300KB), tolerance=${tol}px, 잔섬 제거 ${totalDropped}개 링`)
  console.log(`[write] regionsModern=${out.regionsModern.length} regionsOld=${out.regionsOld.length} cities=${out.cities.length}`)

  // ── sanity check ──
  console.log('\n[sanity] viewBox 기준 상대 위치 검증')
  const checks = []
  // 위도 범위가 37.7°~43.0°이므로 평양(39.04°N)은 y/H≈0.74, 신의주(40.1°N)는 y/H≈0.55가
  // '지리적으로 올바른' 값이다. 문턱은 실제 지리를 기준으로 잡는다.
  const py = regionsModern.find(r => r.id === 'pyongyang')
  if (py) {
    const [x, y] = py.centroid
    checks.push(['평양 centroid 서쪽·남중부 (x/W<0.45, 0.55<y/H<0.85)',
      x / W < 0.45 && y / H > 0.55 && y / H < 0.85, `(${x}, ${y}) → x/W=${(x / W).toFixed(2)} y/H=${(y / H).toFixed(2)}`])
  } else checks.push(['평양 centroid 존재', false, 'pyongyang 피처 없음'])
  const cityAt = n => cities.find(c => c.name === n)
  const sinuiju = cityAt('신의주'), rason = cityAt('라선'), haeju = cityAt('해주')
  if (sinuiju) checks.push(['신의주 서단·중위도 (x/W<0.15, 0.40<y/H<0.65)',
    sinuiju.x / W < 0.15 && sinuiju.y / H > 0.40 && sinuiju.y / H < 0.65, `(${sinuiju.x}, ${sinuiju.y})`])
  if (rason) checks.push(['라선 북동 (x/W>0.70, y/H<0.30)',
    rason.x / W > 0.70 && rason.y / H < 0.30, `(${rason.x}, ${rason.y})`])
  if (haeju) checks.push(['해주 남서 (x/W<0.40, y/H>0.70)',
    haeju.x / W < 0.40 && haeju.y / H > 0.70, `(${haeju.x}, ${haeju.y})`])
  checks.push(['도시 13곳 전부 viewBox 안',
    cities.every(c => c.x >= 0 && c.x <= W && c.y >= 0 && c.y <= H), `viewBox 0 0 ${W} ${H}`])

  // 참조 무결성 — crosswalk/regionsOld가 없는 지역 id를 가리키면 프론트에서 undefined가 된다.
  const modernIds = new Set(out.regionsModern.map(r => r.id))
  const dangling = []
  for (const [k, v] of Object.entries(out.crosswalk.map))
    for (const m of v.modern) if (!modernIds.has(m)) dangling.push(`crosswalk.${k}→${m}`)
  for (const o of out.regionsOld)
    for (const m of o.members) if (!modernIds.has(m)) dangling.push(`regionsOld.${o.id}→${m}`)
  checks.push(['crosswalk·regionsOld 참조 무결성(끊긴 id 0)',
    dangling.length === 0, dangling.length ? dangling.join(', ') : '끊긴 참조 없음'])

  // 각 구행정구역의 paths[]가 members[]와 1:1로 대응하는지
  const pathsAligned = out.regionsOld.every(o =>
    (o.paths || []).length === o.members.length
    && o.members.every((m, i) => out.regionsModern.find(r => r.id === m)?.path === o.paths[i]))
  checks.push(['regionsOld.paths[] ↔ members[] 정렬', pathsAligned,
    `구행정구역 ${out.regionsOld.length}건`])

  // 좌표 전량이 viewBox 안이고 소수 1자리인지
  let ptCount = 0, outOfBox = 0, notR1 = 0
  for (const r of out.regionsModern)
    for (const mm of r.path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)) {
      const x = +mm[1], y = +mm[2]; ptCount++
      if (!(x >= 0 && x <= W && y >= 0 && y <= H)) outOfBox++
      if (Math.round(x * 10) !== x * 10 || Math.round(y * 10) !== y * 10) notR1++
    }
  checks.push([`path 좌표 ${ptCount}점 전부 viewBox 안·소수1자리`,
    outOfBox === 0 && notR1 === 0, `이탈 ${outOfBox} / 자릿수위반 ${notR1}`])

  // ★ 투영 정확도의 실질 검증 — 각 도시가 '실제로 속한' 광역 폴리곤 안에 찍히는가.
  //   투영식·스케일·경위도 순서가 틀어지면 여기서 즉시 무너진다.
  //   국경/도계에 바로 붙은 도시(혜산=압록강변)는 단순화 tolerance만큼 밖으로 밀릴 수 있어
  //   'tolerance + 반올림오차(0.05px)' 이내면 통과로 본다.
  const slack = tol + 0.05
  const misplaced = []
  for (const c of cities) {
    const r = out.regionsModern.find(x => x.id === c.regionId)
    if (!r) { misplaced.push(`${c.name}→${c.regionId}(지역없음)`); continue }
    if (pointInPath(r.path, c.x, c.y)) continue
    const d = distToPath(r.path, c.x, c.y)
    if (d <= slack) {
      console.log(`  [note] ${c.name}: ${r.name} 경계 밖 ${d.toFixed(2)}px — 단순화 허용오차(${slack}px) 이내로 통과`)
      continue
    }
    misplaced.push(`${c.name}→${r.name} ${d.toFixed(1)}px 이탈`)
  }
  checks.push([`도시 ${cities.length}곳이 소속 광역 폴리곤 내부(허용 ${slack}px)`,
    misplaced.length === 0, misplaced.length ? misplaced.join(', ') : '전부 소속 일치'])

  let fail = 0
  for (const [label, ok, detail] of checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}  ${detail}`)
    if (!ok) fail++
  }
  console.log(fail === 0 ? '\n[sanity] 전부 통과' : `\n[sanity] ${fail}건 실패`)
  if (fail > 0) process.exitCode = 1
}

main().catch(e => {
  console.error('\n[error]', e.message)
  process.exit(1)
})
