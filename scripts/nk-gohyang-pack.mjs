#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   고향ON 데이터 팩 — 지도 대시보드(/gohyang)가 fetch 할 JSON을
   frontend/public/gohyang/ 로 복사한다.

   ★ build-web-index.mjs 에 덧붙이지 않는다.
     저쪽은 **검색 인덱스 전용**이고 eval/wild 회귀가 그 산출물에 걸려 있다.
     지도 대시보드용 복사를 끼워 넣으면 검색 회귀와 지도 작업이 한 파일에서 얽힌다.
     여기서 실패해도 검색은 그대로 돌아가야 한다 → 스크립트를 분리한다.

   원칙
   ① **가공하지 않는다.** 원본 바이트를 그대로 복사한다.
      화면에서 쓸 값을 여기서 미리 계산하면, 데이터 에이전트가 검증한 수치와
      화면 수치가 서로 다른 계보를 갖게 된다. 조인·집계는 화면에서 한다.
   ② **조인 전제를 빌드 타임에 검증한다.** 4개 파일은 서로 다른 스크립트가 만든다.
      화면이 기대하는 키 대응(mapRegionId·isanOrigin·출신지 라벨)이 깨지면
      런타임에 조용히 undefined 가 되므로, 여기서 걸러 exit 1 로 죽는다.
   ③ **Cloudflare Pages 자산 상한 25 MiB/파일**을 매 실행 확인한다.
      (넘으면 배포가 거부되고 이전 버전이 조용히 서빙된다 — 실제로 겪은 사고)

   사용법
     node scripts/nk-gohyang-pack.mjs [--today=YYYY-MM-DD] [--check]
     TODAY=2026-08-15 node scripts/nk-gohyang-pack.mjs
       --check : 복사하지 않고 검증만 한다 (CI 용)

   재실행 가능 — 같은 입력이면 같은 출력(바이트 동일).
   ────────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

/* 오늘 날짜는 인자/환경변수 우선, 없으면 프로젝트 고정 기준일.
   new Date() 를 기본값으로 쓰지 않는다 — 산출물 메타가 실행 시각에 따라 흔들린다. */
const argv = process.argv.slice(2)
const arg = (k) => {
  const hit = argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : null
}
const TODAY = arg('today') || process.env.TODAY || '2026-08-15'
const CHECK_ONLY = argv.includes('--check')

if (!/^\d{4}-\d{2}-\d{2}$/.test(TODAY)) die(`--today 형식이 잘못됐다: ${TODAY}`)

/* 경로는 스크립트 위치 기준으로 잡는다 — 어느 cwd 에서 실행해도 같게 돌아야 한다.
   fileURLToPath 를 써야 한다: URL.pathname 은 한글 폴더명이 percent-encoding 된 채로 나오고
   Windows 에서는 앞에 '/C:' 가 붙는다(둘 다 fs 가 못 읽는다). */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(root, 'frontend', 'public', 'gohyang')

const MAX_BYTES = 25 * 1024 * 1024 // Cloudflare Pages 자산 상한 (25 MiB/파일)

function die(msg) {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}

/* ══════════ 입력 정의 ══════════
   asOfPath : 그 파일이 스스로 밝힌 '자료 기준일'을 뽑는 경로(화면 배지의 근거) */
const INPUTS = [
  {
    out: 'map.json',
    src: 'frontend/src/data/nk-map.json',
    require: ['builtAt', 'sources', 'projection', 'viewBox', 'regionsModern', 'regionsOld', 'crosswalk', 'cities'],
    role: '북한 광역 행정구역 SVG 지오메트리 + 구행정구역 crosswalk',
  },
  {
    out: 'region.json',
    src: '북한자료-api/nk-region.json',
    require: ['builtAt', 'sources', 'regions', 'cities', 'meta'],
    role: '지역별 연표·보도·동향·개황 건수, 탈북민 출신지, NOAA 최신 관측',
  },
  {
    out: 'isan.json',
    src: '북한자료-api/isan.json',
    require: ['builtAt', 'sources', 'boards', 'monthly', 'latest', 'exchange', 'chronology', 'validation'],
    role: '이산가족 등록 월별 98개월 + 최신 공표(신청현황·교류현황) + 연표',
  },
  {
    out: 'projection.json',
    src: '북한자료-api/isan-projection.json',
    require: ['builtAt', 'sources', 'headline', 'method', 'assumptions', 'byYear', 'milestoneRange'],
    role: '이산가족 생존자 소멸 추계(2026~2050) — 본 시제품의 계산 결과',
  },
  {
    out: 'descendant.json',
    src: '북한자료-api/isan-descendant.json',
    require: ['builtAt', 'sources', 'survey', 'descendants', 'recordPrograms', 'homeland', 'gaps', 'scale'],
    role: '후손 세대 — 제4차 실태조사의 후손 문항·기록사업 선호도·세대 간극 3종',
  },
]

/* ══════════ 읽기 ══════════ */
const loaded = INPUTS.map((spec) => {
  const abs = path.join(root, spec.src)
  if (!fs.existsSync(abs)) die(`입력 파일이 없다: ${spec.src}\n  먼저 해당 수집 스크립트를 돌려라.`)
  const buf = fs.readFileSync(abs)
  let json
  try {
    json = JSON.parse(buf.toString('utf8'))
  } catch (e) {
    die(`JSON 파싱 실패: ${spec.src}\n  ${e.message}`)
  }
  const missing = spec.require.filter((k) => !(k in json))
  if (missing.length) die(`${spec.src} 에 필수 키가 없다: ${missing.join(', ')}`)
  return { ...spec, abs, buf, json }
})

const byOut = Object.fromEntries(loaded.map((l) => [l.out, l.json]))
const map = byOut['map.json']
const region = byOut['region.json']
const isan = byOut['isan.json']
const proj = byOut['projection.json']
const desc = byOut['descendant.json']

/* ══════════ 조인 무결성 검사 ══════════
   화면이 하는 조인을 그대로 여기서 먼저 해 본다.
   하나라도 깨지면 화면에는 '빈 패널'로 나타나므로 여기서 죽는 편이 낫다. */
const fails = []
const ok = (cond, label, detail) => {
  if (cond) console.log(`  ✓ ${label}`)
  else {
    console.log(`  ✗ ${label} — ${detail}`)
    fails.push(label)
  }
}

console.log(`\n▶ 고향ON 데이터 팩 (기준일 ${TODAY})`)
console.log('\n[1] 조인 무결성')

const modernIds = new Set(map.regionsModern.map((r) => r.id))
const oldIds = new Set(map.regionsOld.map((r) => r.id))
const crossKeys = new Set(Object.keys(map.crosswalk.map))
const regionKeys = Object.keys(region.regions)
const monthlyOriginKeys = new Set(Object.keys(isan.monthly[0]?.origin ?? {}))
const latestOriginLabels = new Set((isan.latest.survivors.byOrigin.entries ?? []).map((e) => e.label))

// (1) mapRegionId → regionsModern.id
{
  const bad = regionKeys.filter((k) => {
    const id = region.regions[k].mapRegionId
    return id != null && !modernIds.has(id)
  })
  ok(bad.length === 0, `region.mapRegionId ${regionKeys.length}건 → 지도 폴리곤 참조`, `끊긴 참조: ${bad.join(', ')}`)
}
// (2) 지도 폴리곤 11개가 전부 어떤 지역에든 물려 있는가 (고아 폴리곤 = 클릭해도 패널이 안 뜬다)
{
  const used = new Set(regionKeys.map((k) => region.regions[k].mapRegionId).filter(Boolean))
  const orphan = [...modernIds].filter((id) => !used.has(id))
  ok(orphan.length === 0, `지도 폴리곤 ${modernIds.size}개 전부 지역 데이터 보유`, `고아 폴리곤: ${orphan.join(', ')}`)
}
// (3) isanOrigin.key → crosswalk / regionsOld
{
  const bad = regionKeys.filter((k) => {
    const io = region.regions[k].isanOrigin
    return io && !(crossKeys.has(io.key) && oldIds.has(io.key))
  })
  ok(bad.length === 0, `region.isanOrigin.key → 구행정구역(crosswalk·regionsOld)`, `끊긴 참조: ${bad.join(', ')}`)
}
// (4) 구행정구역 7개가 전부 어떤 지역에든 물려 있는가
{
  const used = new Set(regionKeys.map((k) => region.regions[k].isanOrigin?.key).filter(Boolean))
  const orphan = [...oldIds].filter((id) => !used.has(id))
  ok(orphan.length === 0, `구행정구역 ${oldIds.size}개 전부 현행 지역 대응 보유`, `고아 구역: ${orphan.join(', ')}`)
}
// (5) monthlyKey → isan.monthly[].origin 키
{
  const bad = regionKeys.filter((k) => {
    const io = region.regions[k].isanOrigin
    return io && !monthlyOriginKeys.has(io.monthlyKey)
  })
  ok(bad.length === 0, `isanOrigin.monthlyKey → isan.monthly[].origin (${monthlyOriginKeys.size}종)`, `없는 키: ${bad.join(', ')}`)
}
// (6) latestKey → isan.latest.survivors.byOrigin 라벨
{
  const bad = regionKeys.filter((k) => {
    const io = region.regions[k].isanOrigin
    return io && !latestOriginLabels.has(io.latestKey)
  })
  ok(bad.length === 0, `isanOrigin.latestKey → latest.survivors.byOrigin 라벨`, `없는 라벨: ${bad.join(', ')}`)
}
// (7) regionsOld.members / paths 정합 (내부경계 은닉 렌더의 전제)
{
  const bad = map.regionsOld.filter((r) => r.members.length !== r.paths.length || r.members.some((m) => !modernIds.has(m)))
  ok(bad.length === 0, 'regionsOld.members ↔ paths 정렬 + 실재 폴리곤', `불일치: ${bad.map((r) => r.id).join(', ')}`)
}
// (8) 추계 기준연도 = 최신 공표 생존자 (두 파일이 같은 수를 말하는가)
{
  const base = proj.byYear[0]
  ok(
    base?.expected === isan.latest.survivors.total && proj.headline.asOf === isan.latest.asOf,
    `추계 기준값 ${base?.expected} = 공표 생존자 ${isan.latest.survivors.total} (${proj.headline.asOf})`,
    `추계 ${base?.expected}/${proj.headline.asOf} vs 공표 ${isan.latest.survivors.total}/${isan.latest.asOf}`,
  )
}
// (9) 월별 시계열 정렬 (실측 곡선이 지그재그가 되지 않게)
{
  const ms = isan.monthly.map((m) => m.month)
  const sorted = ms.every((m, i) => i === 0 || m > ms[i - 1])
  ok(sorted && ms.length > 0, `isan.monthly ${ms.length}행 오름차순 정렬`, '정렬 깨짐')
}
// (10) 추계 연도 오름차순 + 두 시나리오 모두 존재
{
  const ys = proj.byYear.map((r) => r.year)
  const good =
    ys.every((y, i) => i === 0 || y > ys[i - 1]) &&
    proj.byYear.every((r) => Number.isFinite(r.expected) && Number.isFinite(r.expectedCalibrated))
  ok(good, `projection.byYear ${ys.length}행 (${ys[0]}~${ys.at(-1)}) 원값·교정 병기`, '연도 정렬 또는 시나리오 결측')
}
// (11) 날씨 관측일 — 화면이 stale 배지를 붙일 수 있게 실제 관측일이 있는가
{
  const wx = regionKeys.flatMap((k) => region.regions[k].weather ?? [])
  const dated = wx.filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(String(w.date)))
  ok(wx.length > 0 && dated.length === wx.length, `NOAA 관측 ${wx.length}건 전부 관측일 보유`, `관측일 없음 ${wx.length - dated.length}건`)
}

if (fails.length) die(`조인 무결성 ${fails.length}건 실패 — 복사하지 않았다.\n  ${fails.join('\n  ')}`)

/* ══════════ 크기 확인 ══════════ */
console.log('\n[2] 파일 크기 (Cloudflare Pages 자산 상한 25 MiB/파일)')
let total = 0
for (const l of loaded) {
  const gz = zlib.gzipSync(l.buf).length
  total += l.buf.length
  const pct = ((l.buf.length / MAX_BYTES) * 100).toFixed(2)
  if (l.buf.length > MAX_BYTES) die(`${l.out} 이 상한을 넘는다: ${l.buf.length} > ${MAX_BYTES}`)
  console.log(
    `  ✓ ${l.out.padEnd(15)} ${String(l.buf.length).padStart(9)} B  (gzip ${String(gz).padStart(8)} B · 상한의 ${pct}%)`,
  )
}
console.log(`  합계 ${total.toLocaleString('en-US')} B — 페이지 1회 로드 시 내려받는 총량`)

/* ══════════ 매니페스트 ══════════
   화면이 '이 데이터가 언제 것인지'를 말하려면 파일별 기준일이 필요하다.
   각 파일이 스스로 밝힌 값만 옮겨 적는다(추론하지 않는다). */
const manifest = {
  builtAt: TODAY,
  note: '고향ON(/gohyang) 지도 대시보드가 fetch 하는 데이터 팩. 원본 JSON을 가공 없이 그대로 복사한 것이며, 조인·집계는 화면에서 수행한다.',
  sources: [
    {
      file: 'map.json',
      role: INPUTS[0].role,
      builtAt: map.builtAt,
      upstream: (map.sources ?? []).map((s) => ({ name: s.name, url: s.url ?? null, license: s.license ?? null })),
    },
    {
      file: 'region.json',
      role: INPUTS[1].role,
      builtAt: region.builtAt,
      asOf: {
        기록: region.sources?.find((s) => s.coverageEnd)?.coverageEnd ?? null,
        탈북민출신지: region.regions?.['평양']?.defectorOrigin?.asOf ?? null,
        기상관측: region.meta?.weather?.latestObsDate ?? null,
      },
      upstream: (region.sources ?? []).map((s) => ({ name: s.name, url: s.url ?? s.urls?.[0] ?? s.file ?? null, asOf: s.asOf ?? null })),
    },
    {
      file: 'isan.json',
      role: INPUTS[2].role,
      builtAt: isan.builtAt,
      asOf: {
        월별CSV: isan.monthly.at(-1)?.month ?? null,
        신청현황HWP: isan.latest?.asOf ?? null,
        교류현황HWP: isan.exchange?.asOf ?? null,
        연표CSV: isan.chronology.at(-1)?.date ?? null,
      },
      upstream: (isan.sources ?? []).map((s) => ({ name: s.name, url: s.landing ?? null, org: s.org ?? null, asOf: s.asOf ?? null })),
    },
    {
      file: 'projection.json',
      role: INPUTS[3].role,
      builtAt: proj.builtAt,
      asOf: proj.headline?.asOf ?? null,
      upstream: (proj.sources ?? []).map((s) => ({ name: s.name, url: s.url ?? null, org: s.org ?? null, asOf: s.asOf ?? s.usedYear ?? null })),
      caution: '추계는 통일부 공표 통계가 아니라 본 시제품의 계산 결과다. 화면에서 반드시 그렇게 표시할 것.',
    },
    {
      file: 'descendant.json',
      role: INPUTS[4].role,
      builtAt: desc.builtAt,
      asOf: desc.survey?.publishedAt ?? null,
      upstream: (desc.sources ?? []).map((s) => ({ name: s.name, url: s.url ?? null, asOf: s.asOf ?? null })),
      caution: '요약자료가 이미지 PDF라 이 수치는 사람이 판독해 옮긴 값이다. 조사 회차가 바뀌면 손으로 갱신할 것.',
    },
  ],
  files: loaded.map((l) => ({ name: l.out, from: l.src.replace(/\\/g, '/'), bytes: l.buf.length })),
  limits: { perFileBytes: MAX_BYTES, note: 'Cloudflare Pages 자산 상한' },
}

/* ══════════ 쓰기 ══════════ */
if (CHECK_ONLY) {
  console.log('\n[3] --check 모드 — 복사하지 않고 종료한다.\n')
  process.exit(0)
}

fs.mkdirSync(OUT_DIR, { recursive: true })
console.log('\n[3] 복사')
for (const l of loaded) {
  const dst = path.join(OUT_DIR, l.out)
  fs.writeFileSync(dst, l.buf) // 원본 바이트 그대로
  console.log(`  → frontend/public/gohyang/${l.out}`)
}
const mBuf = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8')
fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), mBuf)
console.log(`  → frontend/public/gohyang/manifest.json  (${mBuf.length} B)`)

console.log(`\n✓ 완료 — 5개 파일, 총 ${(total + mBuf.length).toLocaleString('en-US')} B\n`)
