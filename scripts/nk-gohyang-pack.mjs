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

      ★ 예외 하나 — museum.json (5.4MB) 만 **행 선별**한다. 첫 로드 비용 때문이다.
        · 계산은 하지 않는다. 지역 태그가 붙은 행만 남기고 화면이 안 쓰는 필드를 뗀다.
        · 수치를 새로 만들지 않는다. venueOnly 플래그 하나만 붙이는데, 그것도
          원본 meta.kangwonVenueOnly.count 와 대조해 같은 수(280)가 나오는지 검산한다.
        · 무엇을 뺐는지는 meta.slim 에 그대로 적어 화면이 "전량이 아니다"라고 말할 수 있게 한다.
   ② **조인 전제를 빌드 타임에 검증한다.** 8개 파일은 서로 다른 스크립트가 만든다.
      화면이 기대하는 키 대응(mapRegionId·isanOrigin·출신지 라벨·byRegion·구도명)이 깨지면
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

/* ══════════ 구(舊)도명 ↔ 구행정구역 폴리곤 대응 ══════════
   museum.json 의 regionsHistoric 은 광복 당시 표기("황해도(구)")이고,
   지도(map.json)의 regionsOld 는 이산가족 공표 출신지 축이다. 둘은 같은 것이 아니다.

   ★ 함경도(구) 는 남·북 분도 이전 표기라 함남/함북 어느 쪽인지 확정할 수 없다.
     그래서 억지로 한쪽에 배정하지 않고 **두 구역 모두에 보이되 화면이 그 사실을 밝히도록**
     양쪽에 건다. 화면은 이 목록을 "구(舊)도명 표기 사료"라는 별도 묶음으로만 쓴다. */
const HISTORIC_TO_OLD = {
  '황해도(구)': ['hwanghae-old'],
  '미수복경기': ['gyeonggi-unrec'],
  '함경도(구)': ['hamgyong-s-old', 'hamgyong-n-old'],
}
const HISTORIC_NOTE =
  '구(舊)도명 표기는 남·북 분도 이전 명칭이라 현행 13지역 축으로 확정할 수 없다. ' +
  '특히 「함경도(구)」는 함경남도·함경북도 어느 쪽인지 원문만으로 판정할 수 없어 양쪽에 함께 걸었다 — ' +
  '지역 확정이 아니라 "이 표기로 적힌 사료가 있다"는 표시다.'

/* 강원도 태깅의 함정 — 근거 지명이 금강산/장전항/갈마뿐이면 '고향'이 아니라
   이산가족면회소가 있는 '상봉 장소'다(museum.meta.kangwonVenueOnly). 화면이 걸러 쓸 수 있게 플래그로 남긴다. */
const VENUE_CITIES = new Set(['금강산', '장전항', '갈마'])

/** museum.json 슬림 — 계산하지 않고 **행을 고르고 필드를 뗀다**. */
function slimMuseum(m) {
  const kept = m.records.filter((r) => (r.regions?.length ?? 0) > 0 || (r.regionsHistoric?.length ?? 0) > 0)
  const records = kept.map((r) => ({
    iId: r.iId,
    title: r.title,
    producedOn: r.producedOn ?? null,
    form: r.form ?? null,
    donor: r.donor ?? null,
    imageUrl: r.imageUrl ?? null,
    recordUrl: r.recordUrl ?? null,
    regions: r.regions ?? [],
    regionCities: r.regionCities ?? [],
    regionsHistoric: r.regionsHistoric ?? [],
    source: r.source,
    /* 강원도로 태깅됐지만 근거 지명이 상봉 장소뿐인 건 */
    venueOnly:
      (r.regions ?? []).includes('강원도') &&
      (r.regionCities ?? []).length > 0 &&
      (r.regionCities ?? []).every((c) => VENUE_CITIES.has(c)),
  }))
  const keptIds = new Set(records.map((r) => r.iId))
  const prune = (idx) =>
    Object.fromEntries(Object.entries(idx ?? {}).map(([k, ids]) => [k, ids.filter((id) => keptIds.has(id))]))

  return {
    builtAt: m.builtAt,
    sources: m.sources,
    license: m.license,
    endpoints: { image: m.endpoints?.image ?? null, record: m.endpoints?.record ?? null },
    archive: { totCnt: m.archive?.totCnt ?? null, note: m.archive?.note ?? null },
    records,
    byRegion: prune(m.byRegion),
    byRegionHistoric: prune(m.byRegionHistoric),
    meta: {
      historicToOld: HISTORIC_TO_OLD,
      historicNote: HISTORIC_NOTE,
      kangwonVenueOnly: m.meta?.kangwonVenueOnly ?? null,
      fieldCoverage: m.meta?.fieldCoverage ?? null,
      bySource: m.meta?.bySource ?? null,
      caveats: m.meta?.caveats ?? [],
      slim: {
        totalRecords: m.records.length,
        keptRecords: records.length,
        droppedRecords: m.records.length - records.length,
        keptRule: '제목·내용에서 북한 지역명 또는 구(舊)도명이 확인된 사료만 남겼다. 나머지는 지도 위에 놓을 자리가 없다.',
        droppedFields: ['content', 'colId', 'colIds', 'regNo', 'producer', 'origin', 'fileIds', 'archiveRecordUrl', 'inCollections'],
        droppedFieldsNote: '화면이 쓰지 않는 필드다. 전량·전필드는 북한자료-api/museum.json 에 그대로 있다.',
        addedFields: ['venueOnly'],
        addedFieldsNote: '원본 meta.kangwonVenueOnly 판정 규칙(근거 지명이 금강산·장전항·갈마뿐)을 행 단위로 재현한 플래그. 이 스크립트가 매 실행 원본 count 와 대조한다.',
      },
    },
  }
}

/* ══════════ 입력 정의 ══════════
   asOfPath : 그 파일이 스스로 밝힌 '자료 기준일'을 뽑는 경로(화면 배지의 근거)
   slim     : 있으면 원본 바이트 대신 이 함수의 결과를 쓴다(원칙 ①의 예외) */
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
  {
    out: 'museum-sections.json',
    src: '북한자료-api/museum-sections.json',
    require: ['builtAt', 'source', 'totalRecords', 'collections', 'corners', 'meta'],
    role: '박물관 묶음·코너 목록 — 둘러보기 화면이 링크로 넘길 카드',
  },
  {
    out: 'museum.json',
    src: '북한자료-api/museum.json',
    require: ['builtAt', 'sources', 'license', 'endpoints', 'collections', 'archive', 'records', 'byRegion', 'byRegionHistoric', 'meta'],
    role: '남북이산가족 디지털박물관 공개 사료 — 지역 태그가 붙은 행만(원본 4,342건 중)',
    slim: slimMuseum,
  },
  {
    out: 'paths.json',
    src: '북한자료-api/descendant-paths.json',
    require: ['builtAt', 'sources', 'paths', 'summary', 'gaps', 'meta'],
    role: '후손이 오늘 실제로 신청할 수 있는 제도 12종 + 아직 열려 있지 않은 것 11종',
  },
  {
    out: 'opinion.json',
    src: '북한자료-api/unification-opinion.json',
    require: ['builtAt', 'sources', 'license', 'licenseFullText', 'series', 'headline', 'meta'],
    role: '통일의식조사 시계열 — ★ 통일부 자료가 아니다(서울대학교 통일평화연구원)',
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
  /* data : 화면이 실제로 받는 객체. slim 이 없으면 원본 그대로다(바이트 동일).
     outBuf : 디스크에 쓸 바이트. 슬림일 때만 원본과 달라진다. */
  const data = spec.slim ? spec.slim(json) : json
  const outBuf = spec.slim ? Buffer.from(JSON.stringify(data) + '\n', 'utf8') : buf
  return { ...spec, abs, buf, json, data, outBuf }
})

const byOut = Object.fromEntries(loaded.map((l) => [l.out, l.data]))
const raw = Object.fromEntries(loaded.map((l) => [l.out, l.json]))
const map = byOut['map.json']
const region = byOut['region.json']
const isan = byOut['isan.json']
const proj = byOut['projection.json']
const desc = byOut['descendant.json']
const museum = byOut['museum.json']       // 슬림본 — 화면이 받는 바로 그 객체
const museumRaw = raw['museum.json']      // 원본 — 슬림이 원본을 배신하지 않았는지 대조할 때만 쓴다
const paths = byOut['paths.json']
const opinion = byOut['opinion.json']

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

/* ── 박물관 사료 (12~17) ──
   화면은 지역 패널에서 byRegion / byRegionHistoric 으로 사료를 끌어온다.
   여기가 끊기면 "사료 0건"이라는 **거짓 정직**이 화면에 뜬다 — 진짜 0건과 구분되지 않는다. */
{
  const regionKeySet = new Set(regionKeys)
  const bad = Object.keys(museum.byRegion).filter((k) => !regionKeySet.has(k))
  ok(bad.length === 0, `museum.byRegion ${Object.keys(museum.byRegion).length}축 → 지역 데이터 키`, `없는 지역: ${bad.join(', ')}`)
}
{
  const ids = new Set(museum.records.map((r) => r.iId))
  const dangling = [...Object.values(museum.byRegion), ...Object.values(museum.byRegionHistoric)]
    .flat()
    .filter((id) => !ids.has(id))
  ok(dangling.length === 0, `museum 색인 → records ${museum.records.length}행 참조`, `끊긴 iId ${dangling.length}건`)
}
{
  const oldIdSet = new Set(map.regionsOld.map((r) => r.id))
  const badVal = Object.values(museum.meta.historicToOld).flat().filter((id) => !oldIdSet.has(id))
  const badKey = Object.keys(museum.meta.historicToOld).filter((k) => !(k in museum.byRegionHistoric))
  ok(
    badVal.length === 0 && badKey.length === 0,
    `구(舊)도명 ${Object.keys(museum.meta.historicToOld).length}종 → 구행정구역 폴리곤`,
    `없는 폴리곤 ${badVal.join(', ')} / 없는 구도명 ${badKey.join(', ')}`,
  )
}
{
  /* 화면이 <img src> 로 박물관 원본을 **직접** 참조한다(우리가 저장·재배포하지 않는다).
     상대경로나 http 가 섞이면 배포본(https)에서 혼합콘텐츠로 조용히 차단된다. */
  const withImg = museum.records.filter((r) => r.imageUrl)
  const badImg = withImg.filter((r) => !/^https:\/\//.test(r.imageUrl))
  const badRec = museum.records.filter((r) => !r.recordUrl || !/^https:\/\//.test(r.recordUrl))
  ok(
    badImg.length === 0 && badRec.length === 0,
    `사료 URL 절대 https — 이미지 ${withImg.length}건 · 원문 ${museum.records.length}건`,
    `이미지 ${badImg.length}건 / 원문 ${badRec.length}건이 https 절대 URL 이 아니다`,
  )
}
{
  /* 슬림이 원본 판정을 재현하는가 — 우리가 수치를 새로 만든 게 아님을 매 실행 증명한다 */
  const mine = museum.records.filter((r) => r.venueOnly).length
  const theirs = museumRaw.meta?.kangwonVenueOnly?.count ?? null
  ok(mine === theirs, `강원도 상봉장소 태깅 ${mine}건 = 원본 meta.kangwonVenueOnly ${theirs}건`, `슬림 ${mine} vs 원본 ${theirs}`)
}
{
  const total = museumRaw.records.length
  const kept = museum.records.length
  const tagged = museumRaw.records.filter((r) => (r.regions?.length ?? 0) > 0 || (r.regionsHistoric?.length ?? 0) > 0).length
  ok(
    kept === tagged && museum.meta.slim.totalRecords === total,
    `슬림 선별 ${kept}행 = 원본 지역태깅 ${tagged}행 (전량 ${total}행)`,
    `슬림 ${kept} vs 태깅 ${tagged} / 전량 ${museum.meta.slim.totalRecords} vs ${total}`,
  )
}

/* ── 후손 경로 (18~19) ── */
{
  const act = paths.paths.filter((p) => p.actionable)
  ok(
    act.length === paths.summary.actionableCount && paths.gaps.length === paths.summary.gapCount,
    `후손 경로 actionable ${act.length}건 · 간극 ${paths.gaps.length}건 = summary`,
    `actionable ${act.length}/${paths.summary.actionableCount} · gaps ${paths.gaps.length}/${paths.summary.gapCount}`,
  )
}
{
  /* 화면이 카드마다 링크·문의처·자격을 찍는다. 하나라도 비면 "빈 칸이 있는 안내"가 된다. */
  const bad = paths.paths.filter((p) => !p.title || !p.what || !p.eligibility || !p.url || !p.contact)
  ok(bad.length === 0, `후손 경로 ${paths.paths.length}건 전부 제목·설명·자격·링크·문의처 보유`, `결측: ${bad.map((p) => p.id).join(', ')}`)
}

/* ── 통일의식조사 (20~21) ── ★ 이것만 통일부 자료가 아니다. 화면이 출처를 갈라 표시해야 한다. */
{
  const s = opinion.series.find((x) => x.titleKey === 'Uni01' && x.group?.menu === 1)
  const ext = s?.extended
  const lenOk = ext && ext.rows.every((r) => r.values.length === ext.years.length)
  const srcOk = ext && ext.years.every((y) => ext.sourceByYear?.[String(y)])
  ok(
    Boolean(lenOk && srcOk && ext.rows.length === 3),
    `통일 필요성 시계열 ${ext?.years.length ?? 0}개 연도 × ${ext?.rows.length ?? 0}행 + 연도별 출처 표기`,
    '연도/행 길이 불일치 또는 sourceByYear 결측',
  )
}
{
  ok(
    typeof opinion.license === 'string' && opinion.license.includes('통일평화연구원'),
    `통일의식조사 출처 표기 문구 보유 — "${String(opinion.license).slice(0, 30)}…"`,
    'license 문구가 없다 — 출처 표기 의무를 화면이 지킬 수 없다',
  )
}

if (fails.length) die(`조인 무결성 ${fails.length}건 실패 — 복사하지 않았다.\n  ${fails.join('\n  ')}`)

/* ══════════ 크기 확인 ══════════ */
console.log('\n[2] 파일 크기 (Cloudflare Pages 자산 상한 25 MiB/파일)')
let total = 0
for (const l of loaded) {
  const gz = zlib.gzipSync(l.outBuf).length
  total += l.outBuf.length
  const pct = ((l.outBuf.length / MAX_BYTES) * 100).toFixed(2)
  if (l.outBuf.length > MAX_BYTES) die(`${l.out} 이 상한을 넘는다: ${l.outBuf.length} > ${MAX_BYTES}`)
  const slimTag = l.slim ? `  ← 슬림 (원본 ${l.buf.length.toLocaleString('en-US')} B)` : ''
  console.log(
    `  ✓ ${l.out.padEnd(15)} ${String(l.outBuf.length).padStart(9)} B  (gzip ${String(gz).padStart(8)} B · 상한의 ${pct}%)${slimTag}`,
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
    {
      file: 'museum.json',
      role: INPUTS[5].role,
      builtAt: museum.builtAt,
      asOf: {
        수집일: museum.builtAt,
        공개사료최신생산일: paths.meta?.measured?.archiveNewestProducedOn ?? null,
      },
      upstream: (museum.sources ?? []).map((s) => ({ name: s.name, url: s.url ?? null, asOf: s.asOf ?? null })),
      slim: museum.meta.slim,
      caution:
        '개방형 라이선스 표기를 찾지 못했다(원본 license 필드 참조). 사료 원본은 기증자 저작물이므로 ' +
        '이미지 바이너리를 저장·재배포하지 않는다. 화면은 박물관 원본 URL 을 <img> 로 직접 참조하고 recordUrl 로 링크만 건다.',
    },
    {
      file: 'paths.json',
      role: INPUTS[6].role,
      builtAt: paths.builtAt,
      asOf: paths.builtAt,
      upstream: (paths.sources ?? []).map((s) => ({ name: s.name, url: s.url ?? null, asOf: s.asOf ?? null })),
      linkCheck: { checked: paths.meta?.checkedUrls ?? null, live: paths.meta?.liveUrls ?? null, confirmedDead: paths.meta?.confirmedDead ?? null },
      caution:
        "eligibility '후손 가능' 다수는 법령 정의(8촌 이내)에서 도출한 것이지 페이지가 \"후손도 됩니다\"라고 쓴 것이 아니다. " +
        '화면에 걸 때 「법적으로는 이미 대상」과 「안내에는 없음」을 함께 보여야 오해가 없다.',
    },
    {
      file: 'opinion.json',
      role: INPUTS[7].role,
      builtAt: opinion.builtAt,
      asOf: opinion.reports?.at(-1)?.fieldPeriod?.to ?? null,
      upstream: (opinion.sources ?? []).map((s) => ({ name: s.name, url: s.url ?? null, org: s.org ?? null, asOf: s.asOf ?? null })),
      license: opinion.license,
      licenseFullText: opinion.licenseFullText,
      caution:
        '★ 이 파일만 통일부 자료가 아니다(서울대학교 통일평화연구원). 화면은 반드시 출처가 다르다는 것을 배지·문장으로 구분 표시하고, ' +
        '소멸 곡선과 나란히 놓더라도 인과를 주장하지 말 것 — "같은 기간에 함께 내려갔다"까지만.',
    },
  ],
  files: loaded.map((l) => ({
    name: l.out,
    from: l.src.replace(/\\/g, '/'),
    bytes: l.outBuf.length,
    ...(l.slim ? { slim: true, sourceBytes: l.buf.length } : {}),
  })),
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
  fs.writeFileSync(dst, l.outBuf) // slim 이 없으면 원본 바이트 그대로
  console.log(`  → frontend/public/gohyang/${l.out}${l.slim ? ' (슬림)' : ''}`)
}
const mBuf = Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8')
fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), mBuf)
console.log(`  → frontend/public/gohyang/manifest.json  (${mBuf.length} B)`)

console.log(`\n✓ 완료 — ${loaded.length}개 파일, 총 ${(total + mBuf.length).toLocaleString('en-US')} B\n`)
