// 한국 시도 GeoJSON(southkorea-maps, 2013 단순화) → SVG path 정적 베이크 → frontend/src/data/kr-geo.ts
// 감염병 현황판 choropleth(선거개표식 시도 지도)용. 좌표는 등거리원통 투영(위도보정) + viewBox 맞춤.
// 사용: node scripts/build-kr-geo.mjs  (scripts/_kr_prov.json 필요)
import fs from 'node:fs'

const geo = JSON.parse(fs.readFileSync('scripts/_kr_prov.json', 'utf8'))
// KOSTAT 코드 → KDCA 시도코드(우리 데이터셋)
const MAP = { '11': '01', '21': '02', '22': '03', '23': '04', '24': '05', '25': '06', '26': '07', '31': '08', '32': '09', '33': '10', '34': '11', '35': '12', '36': '13', '37': '14', '38': '15', '39': '16', '29': '17' }
const SHORT = { '01': '서울', '02': '부산', '03': '대구', '04': '인천', '05': '광주', '06': '대전', '07': '울산', '08': '경기', '09': '강원', '10': '충북', '11': '충남', '12': '전북', '13': '전남', '14': '경북', '15': '경남', '16': '제주', '17': '세종' }

// 투영: 위도보정 등거리. px=lng*k, py=-lat
const K = Math.cos((36.3 * Math.PI) / 180)
const pts = []
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
for (const f of geo.features) for (const poly of polysOf(f.geometry)) for (const ring of poly) for (const [lng, lat] of ring) pts.push([lng * K, -lat])
const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1])
const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys)
const PAD = 14; const TARGET_H = 740
const scale = (TARGET_H - PAD * 2) / (maxY - minY)
const W = Math.round((maxX - minX) * scale + PAD * 2); const H = TARGET_H
const PX = (lng, lat) => [(lng * K - minX) * scale + PAD, (-lat - minY) * scale + PAD]

function ringPath(ring) {
  let d = ''; let px = null, py = null
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = PX(ring[i][0], ring[i][1])
    const rx = Math.round(x * 10) / 10, ry = Math.round(y * 10) / 10
    if (px !== null && Math.abs(rx - px) < 0.6 && Math.abs(ry - py) < 0.6) continue // 인접 중복점 제거(단순화)
    d += (d === '' ? 'M' : 'L') + rx + ' ' + ry
    px = rx; py = ry
  }
  return d + 'Z'
}

const out = []
for (const f of geo.features) {
  const code = MAP[f.properties.code]; if (!code) continue
  const polys = polysOf(f.geometry)
  let d = ''
  let best = null, bestArea = -1, cx = 0, cy = 0
  for (const poly of polys) {
    for (const ring of poly) d += ringPath(ring)
    // 라벨 중심: 가장 큰 외곽 ring의 bbox 중심
    const ring = poly[0]
    const rxs = ring.map((p) => PX(p[0], p[1])[0]); const rys = ring.map((p) => PX(p[0], p[1])[1])
    const area = (Math.max(...rxs) - Math.min(...rxs)) * (Math.max(...rys) - Math.min(...rys))
    if (area > bestArea) { bestArea = area; best = ring; cx = (Math.max(...rxs) + Math.min(...rxs)) / 2; cy = (Math.max(...rys) + Math.min(...rys)) / 2 }
  }
  out.push({ code, name: SHORT[code], d, cx: Math.round(cx * 10) / 10, cy: Math.round(cy * 10) / 10 })
}
out.sort((a, b) => a.code.localeCompare(b.code))

const q = (s) => JSON.stringify(s)
const body = out.map((o) => `  { code: ${q(o.code)}, name: ${q(o.name)}, cx: ${o.cx}, cy: ${o.cy}, d: ${q(o.d)} },`).join('\n')
const header = `// 한국 시도 경계 SVG path — southkorea-maps(2013 단순화 GeoJSON) → build-kr-geo.mjs 베이크. ⚠ 수기편집 금지.\n` +
  `// 감염병 현황판 choropleth용. code=KDCA 시도코드. cx/cy=라벨 중심.\n` +
  `export interface KrGeoFeature { code: string; name: string; cx: number; cy: number; d: string }\n` +
  `export const KR_VIEWBOX = "0 0 ${W} ${H}"\n` +
  `export const KR_GEO: KrGeoFeature[] = [\n${body}\n]\n`
fs.writeFileSync('frontend/src/data/kr-geo.ts', header, 'utf8')
const size = (header.length / 1024).toFixed(0)
console.log(`완료 → frontend/src/data/kr-geo.ts (시도 ${out.length} · viewBox ${W}x${H} · ${size}KB)`)
