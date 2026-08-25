#!/usr/bin/env node
// nk-hometown-gallery.mjs — 「나의 살던 고향은」 수집 + 광복 당시 7종 고향축 대응
//   → 북한자료-api/htgallery.json
//
// nk-reunion-htgallery.mjs(원문 그대로 보존판)와의 관계:
//   · 수집·파싱 계층은 그 스크립트의 실측 규약을 그대로 따른다(같은 캐시 디렉터리 공유 —
//     재실행 시 네트워크 0회). 그 산출물(reunion-htgallery.json)은 건드리지 않는다.
//   · 이 스크립트가 더 하는 일은 하나다: 세부지역(areaRaw)·탭을 **광복 당시 7종 고향축**으로
//     대응시키는 층. 대응 근거는 저장소의 기존 대응표(frontend/public/gohyang/map.json 의
//     crosswalk)만 쓴다 — 새 대응을 발명하지 않는다.
//
// ★ 「총 258장」 표기에 관한 실측 (2026-08-25):
//   탭별 <img> 를 그냥 세면 52·58·34·76·38 = 258 이 나온다. 이는 한 사진이
//   #slick_galleryView_nav(썸네일)와 #slick_galleryView(원본) 두 블록에 한 번씩,
//   즉 **두 번** 그려지기 때문이다. fileId 로 접으면 고유 사진은 26·29·17·38·19 = 129장.
//   사이트 배지 「총 N 건」의 합은 141(등록건수)이고, 그중 이미지가 실제로 그려지는 것이 129장이다.
//   (배지에만 있고 <img> 가 없는 결번 12건은 tabs[].missingSeq 에 남긴다.)
//
// 매핑 원칙 (억지 매핑 금지):
//   · areaRaw 의 현행 도명 → map.json crosswalk 의 근사 대응으로만 옮긴다.
//     황해남도/황해북도→황해도(구) · 평안남도/평양/남포→평안남도(구) · 평안북도/자강도→평안북도(구)
//     함경남도/량강도(양강도)→함경남도(구) · 함경북도/라선(나선)→함경북도(구)
//     강원도→미수복강원 · 개성→미수복경기
//   · areaRaw 가 분도 이전 광역명뿐이면(「함경도」「평안도」) 남/북 어느 쪽인지 확정할 수 없다
//     → oldRegion:null (museum.json meta.historicNote 와 같은 판단).
//   · 현행 강원도 원산시는 광복 당시 함경남도 소속이라 crosswalk 근사(강원도→미수복강원)가
//     맞지 않는 실증 사례다 → oldRegion:null + 사유. (crosswalk.note 가 스스로 경고하는 지점)
//   · areaRaw 가 없으면 탭으로만 대응한다. 탭 황해도→황해도(구), 경기도→미수복경기,
//     강원도→미수복강원(근사·주의 동반). 탭 함경도·평안도는 남/북 확정 불가 → null.
//
// 실행: node scripts/nk-hometown-gallery.mjs [--force] [--delay=400] [--collected-at=YYYY-MM-DD]
// 재실행 가능·증분(HTML 디스크 캐시 공유). 키 불필요. 이미지는 내려받지 않는다.

import fs from 'node:fs'
import path from 'node:path'
import {
  BASE, ROOT, OUT_DIR, CACHE_ROOT, collectedAt, DELAY_MS, CONC, FORCE,
  fetchCached, siteBadgeTotal, sliceDivById, imgTags, abs, atchFileId,
  decodeEntities, squish, writeJson, netSummary,
} from './nk-reunion-story-lib.mjs'

const MID = 'SM00000283'
const HUB = `${BASE}/reuni/home/pds/htgallery/info.do?mid=${MID}`
const tabUrl = (n) => `${BASE}/reuni/home/pds/htgallery/list_sub_0${n}.do?mid=${MID}`
const CACHE = path.join(CACHE_ROOT, 'htgallery')   // nk-reunion-htgallery.mjs 와 같은 캐시를 쓴다
const OUT = path.join(OUT_DIR, 'htgallery.json')

// ── 광복 당시 7종 대응층 ──────────────────────────────────────────────────────
// 근거: frontend/public/gohyang/map.json crosswalk (구↔현행 근사 대응, 저장소 기존 자산).
// 아래 표는 그 crosswalk 를 "현행 표기 → 구축" 방향으로 뒤집은 것 + 표기 이형(양강도/나선시 등)뿐이다.
const MAPJSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'frontend/public/gohyang/map.json'), 'utf8'))
const CROSSWALK_NOTE = MAPJSON.crosswalk?.note || null

const MODERN_TO_OLD = {
  // crosswalk.map 그대로
  '황해남도': '황해도(구)', '황해북도': '황해도(구)',
  '평안남도': '평안남도(구)', '평양': '평안남도(구)', '평양시': '평안남도(구)',
  '남포': '평안남도(구)', '남포시': '평안남도(구)',            // crosswalk missing: nampo→pyongan-s
  '평안북도': '평안북도(구)', '자강도': '평안북도(구)',
  '함경남도': '함경남도(구)', '량강도': '함경남도(구)', '양강도': '함경남도(구)',
  '함경북도': '함경북도(구)', '라선': '함경북도(구)', '라선시': '함경북도(구)', '나선': '함경북도(구)', '나선시': '함경북도(구)',
  '강원도': '미수복강원',
  '개성': '미수복경기', '개성시': '미수복경기',                 // crosswalk missing: kaesong→gyeonggi-unrec
}
// 도명 없이 시·명소명만 적힌 areaRaw — 데이터에 실제로 나온 것만, 현행 소속 도가 자명한 것만 둔다.
const CITY_TO_MODERN = {
  '함흥시': '함경남도',       // 현행 함경남도 도소재지
  '사리원시': '황해북도',     // 현행 황해북도 도소재지
  '사리원': '황해북도',       // 「사리원 성불사」처럼 「시」 없이 적힌 캡션용
  '금강산': '강원도',         // 현행 강원도(광복 당시에도 강원도 고성·회양)
}
// crosswalk 근사가 맞지 않는 실증 사례 — 확정하지 않는다.
const KNOWN_AMBIGUOUS = {
  '원산': '현행 강원도 원산시는 광복 당시 함경남도 소속. crosswalk 근사(현행 강원도→미수복강원)가 맞지 않는 사례라 확정하지 않음.',
}
// 분도 이전 광역명 — 남/북 확정 불가 (museum.json meta.historicNote 와 같은 판단)
const PRE_DIVISION = { '함경도': true, '평안도': true }

const TAB_TO_OLD = {
  '황해도': { old: '황해도(구)', sure: true, note: '광복 당시에도 황해도는 한 도 — 현행 남·북 어느 쪽이든 황해도(구)' },
  '경기도': { old: '미수복경기', sure: true, note: '이 코너의 경기도는 미수복 지역(개성 등)' },
  '강원도': { old: '미수복강원', sure: true, note: '근사 대응 — 현행 강원도에는 구 함경남도 편입지(원산 등)가 섞여 있어 세부지역이 그쪽이면 개별 판단' },
  '함경도': { old: null, sure: false, note: '함경남도(구)/함경북도(구) 어느 쪽인지 탭만으로 확정 불가' },
  '평안도': { old: null, sure: false, note: '평안남도(구)/평안북도(구) 어느 쪽인지 탭만으로 확정 불가' },
}

// 캡션·명소명 본문에 원문이 스스로 적어 둔 현행 도명(예: 「평안북도 박천군 청천강 승리다리 도로」).
// 대응표 밖 지식을 넣는 게 아니라 **원문이 말한 도명**을 읽는 것이므로 억지 매핑이 아니다.
const TEXT_TOKENS = [
  '평안북도', '평안남도', '함경남도', '함경북도', '황해남도', '황해북도',
  '자강도', '량강도', '양강도', '평양', '남포', '개성', '라선', '나선',
  '함흥시', '사리원', '금강산',
]
function fromText(text) {
  if (!text) return null
  for (const [city, why] of Object.entries(KNOWN_AMBIGUOUS)) {
    if (text.includes(city)) return { oldRegion: null, basis: 'text', note: why, token: city }
  }
  for (const tk of TEXT_TOKENS) {
    if (text.includes(tk)) {
      const modern = CITY_TO_MODERN[tk] || tk
      const old = MODERN_TO_OLD[modern] ?? MODERN_TO_OLD[tk]
      if (old) return { oldRegion: old, basis: 'text', note: null, token: tk }
    }
  }
  return null
}

// 확정 탭이라도 캡션 본문이 다른 지역을 말하면(사이트 분류 오류 가능성) 확정하지 않는다.
// 예: 경기도 탭에 「사리원 성불사」(황해북도), 강원도 탭에 「원산 옛풍경」(광복 당시 함경남도).
function sureTab(t, tab, fullText, suffix) {
  const tx = fromText(fullText)
  if (tx && tx.oldRegion === null) return { oldRegion: null, basis: `conflict:tab ${tab} vs caption 「${tx.token}」`, note: tx.note }
  if (tx && tx.oldRegion && tx.oldRegion !== t.old) {
    return { oldRegion: null, basis: `conflict:tab ${tab}(${t.old}) vs caption 「${tx.token}」(${tx.oldRegion})`, note: '탭 분류와 캡션의 지명이 어긋난다 — 확정하지 않음' }
  }
  return { oldRegion: t.old, basis: `tab:${tab}${suffix}`, note: t.note }
}

function mapToOld(areaRaw, tab, fullText) {
  // 반환: { oldRegion, basis, note }
  if (areaRaw) {
    const a = squish(areaRaw)
    // 알려진 확정불가 지명이 들어 있으면 먼저 멈춘다 (예: "강원도 원산시")
    for (const [city, why] of Object.entries(KNOWN_AMBIGUOUS)) {
      if (a.includes(city)) return { oldRegion: null, basis: `areaRaw:${a}`, note: why }
    }
    const first = a.split(/\s+/)[0]
    if (PRE_DIVISION[first] || PRE_DIVISION[a]) {
      // 세부지역이 분도 이전 광역명뿐이어도, 캡션 본문이 도명을 스스로 말하면 그것을 쓴다.
      const t = fromText(fullText)
      if (t && t.oldRegion) return { oldRegion: t.oldRegion, basis: `caption:「${t.token}」`, note: null }
      return { oldRegion: null, basis: `areaRaw:${a}`, note: '분도 이전 광역명 — 남/북 확정 불가' }
    }
    if (MODERN_TO_OLD[first]) {
      return { oldRegion: MODERN_TO_OLD[first], basis: `areaRaw:${first}→crosswalk`, note: null }
    }
    if (CITY_TO_MODERN[first]) {
      const modern = CITY_TO_MODERN[first]
      return { oldRegion: MODERN_TO_OLD[modern], basis: `areaRaw:${first}→현행 ${modern}→crosswalk`, note: null }
    }
    // areaRaw 가 있는데 아는 표가 없다 — 억지로 맞추지 않는다. 탭 확정이 가능하면 탭으로.
    const t = TAB_TO_OLD[tab]
    if (t && t.sure) return sureTab(t, tab, fullText, ` (areaRaw 「${a}」 은 대응표 밖)`)
    return { oldRegion: null, basis: `areaRaw:${a}`, note: '대응표에 없는 표기 — 확정하지 않음' }
  }
  const t = TAB_TO_OLD[tab]
  if (t && t.sure) return sureTab(t, tab, fullText, '')
  // 탭이 함경도·평안도라 확정 불가 — 캡션 본문이 도명을 스스로 말하면 그것을 쓴다.
  const tx = fromText(fullText)
  if (tx) return { oldRegion: tx.oldRegion, basis: tx.oldRegion ? `caption:「${tx.token}」` : `caption:${tx.token}`, note: tx.note }
  if (t) return { oldRegion: t.old, basis: `tab:${tab}`, note: t.note }
  return { oldRegion: null, basis: 'none', note: '탭 이름을 읽지 못함' }
}

// ── alt 파싱 (nk-reunion-htgallery.mjs 실측 규약 그대로) ─────────────────────
function parseAlt(alt) {
  const a = squish(alt || '')
  const seqM = a.match(/(\d+)\s*번째\s*사진\s*$/)
  const seq = seqM ? +seqM[1] : null
  let rest = seqM ? a.slice(0, seqM.index).trim() : a
  const provM = rest.match(/\(\s*제공\s*[:：]\s*([^)]*)\)\s*$/)
  const provider = provM ? squish(provM[1]) : null
  if (provM) rest = rest.slice(0, provM.index).trim()
  return { seq, provider, altDesc: rest || null, altRaw: a || null }
}

function parseTab(html, tabNo) {
  const badge = siteBadgeTotal(html)
  const tabNames = []
  const tabRe = /<a[^>]*class="[^"]*titCont[^"]*"[^>]*href="list_sub_0(\d)\.do[^"]*"[^>]*>([^<]*)<\/a>/gi
  let tm
  while ((tm = tabRe.exec(html))) tabNames[+tm[1]] = squish(decodeEntities(tm[2]))

  const navBlock = sliceDivById(html, 'slick_galleryView_nav')
  const viewBlock = sliceDivById(html, 'slick_galleryView')
  const navImgs = imgTags(navBlock).filter(a => atchFileId(a.src))
  const viewImgs = imgTags(viewBlock).filter(a => atchFileId(a.src))

  const caps = []
  const capRe = /<span\s+data-title="([^"]*)"\s*>([\s\S]*?)<\/span>/gi
  let cm
  while ((cm = capRe.exec(viewBlock))) {
    caps.push({ dataTitle: squish(decodeEntities(cm[1])), caption: squish(decodeEntities(cm[2].replace(/<[^>]*>/g, ' '))) })
  }

  const mismatch = []
  if (navImgs.length !== viewImgs.length) mismatch.push(`nav ${navImgs.length} != view ${viewImgs.length}`)
  if (caps.length !== viewImgs.length) mismatch.push(`caption ${caps.length} != view ${viewImgs.length}`)

  const byId = new Map()
  const push = (fileId, patch) => {
    if (!byId.has(fileId)) byId.set(fileId, { fileId })
    Object.assign(byId.get(fileId), patch)
  }
  navImgs.forEach((a) => push(atchFileId(a.src), { thumbUrl: abs(a.src), ...parseAlt(a.alt) }))
  viewImgs.forEach((a, i) => {
    const id = atchFileId(a.src)
    const c = caps[i] || {}
    const parsed = parseAlt(a.alt)
    const cur = byId.get(id) || {}
    push(id, {
      viewUrl: abs(a.src),
      seq: cur.seq ?? parsed.seq,
      provider: cur.provider ?? parsed.provider,
      altDesc: cur.altDesc ?? parsed.altDesc,
      altRaw: cur.altRaw ?? parsed.altRaw,
      dataTitle: c.dataTitle ?? null,
      caption: c.caption ?? null,
    })
  })

  const tabName = tabNames[tabNo] || null
  const items = [...byId.values()].map((it) => {
    let placeName = null, areaRaw = null
    if (it.dataTitle && it.dataTitle.includes(' - ')) {
      const k = it.dataTitle.lastIndexOf(' - ')
      placeName = squish(it.dataTitle.slice(0, k)) || null
      areaRaw = squish(it.dataTitle.slice(k + 3)) || null
    } else if (it.dataTitle) {
      placeName = it.dataTitle
    }
    // parsed:false 판정 — alt/캡션 구조가 규약(「명소명 - 세부지역 (제공 : 제공처) n번째 사진」)에서
    // 벗어난 건. 버리지 않고 원문(altRaw/dataTitle/caption)을 그대로 두고 표시만 한다.
    const parsed = Boolean(it.seq != null && it.altDesc && it.dataTitle)
    const fullText = [placeName, it.altDesc, it.caption].filter(Boolean).join(' | ')
    const m = mapToOld(areaRaw, tabName, fullText)
    return {
      fileId: it.fileId,
      tab: tabName,
      tabNo,
      seq: it.seq ?? null,
      parsed,
      placeName,
      areaRaw,
      oldRegion: m.oldRegion,          // 광복 당시 7종 축 — 확정 불가면 null
      oldRegionBasis: m.basis,
      oldRegionNote: m.note,
      dataTitle: it.dataTitle ?? null,
      caption: it.caption ?? null,
      altDesc: it.altDesc ?? null,
      altRaw: it.altRaw ?? null,
      provider: it.provider ?? null,   // 저작권자 — 화면에 반드시 표시
      thumbUrl: it.thumbUrl ?? null,
      viewUrl: it.viewUrl ?? null,
      sourceUrl: tabUrl(tabNo),
      hasThumb: !!it.thumbUrl,
      hasView: !!it.viewUrl,
    }
  }).sort((a, b) => (a.seq ?? 9999) - (b.seq ?? 9999) || a.fileId.localeCompare(b.fileId))

  const seqs = items.map(i => i.seq).filter(n => Number.isInteger(n))
  const maxSeq = seqs.length ? Math.max(...seqs) : 0
  const seen = new Set(seqs)
  const missingSeq = []
  for (let s = 1; s <= Math.max(maxSeq, badge || 0); s++) if (!seen.has(s)) missingSeq.push(s)

  return {
    tabNo, tab: tabName, url: tabUrl(tabNo),
    siteBadgeTotal: badge, renderedPhotos: items.length,
    imgTagCount: navImgs.length + viewImgs.length,   // 사용자가 센 「N장」과 일치하는 값(2배 계수)
    missingSeq, mismatch, items,
  }
}

async function main() {
  console.log(`[hometown-gallery] 수집 시작 — delay=${DELAY_MS}ms conc=${CONC}${FORCE ? ' (force)' : ''}`)
  const tabs = []
  const failed = []
  for (const n of [1, 2, 3, 4, 5]) {
    const r = await fetchCached(tabUrl(n), { cacheDir: CACHE, key: `list_sub_0${n}`, label: `htgallery tab ${n}` })
    if (!r.ok) { failed.push({ what: `탭 ${n}`, url: tabUrl(n), reason: `요청 실패 ${r.error || r.code}` }); continue }
    const t = parseTab(r.body, n)
    tabs.push(t)
    console.log(`  탭 ${n} ${t.tab || '?'} — 배지 ${t.siteBadgeTotal ?? '?'} / 고유사진 ${t.renderedPhotos} / img태그 ${t.imgTagCount}${t.mismatch.length ? '  (' + t.mismatch.join('; ') + ')' : ''}`)
    if (t.mismatch.length) failed.push({ what: `탭 ${n} 블록 개수 불일치`, url: tabUrl(n), reason: t.mismatch.join('; ') })
  }

  const items = tabs.flatMap(t => t.items)
  const badgeSum = tabs.reduce((s, t) => s + (t.siteBadgeTotal || 0), 0)
  const imgTagSum = tabs.reduce((s, t) => s + (t.imgTagCount || 0), 0)

  const byOld = {}
  for (const i of items) byOld[i.oldRegion ?? '(확정불가 null)'] = (byOld[i.oldRegion ?? '(확정불가 null)'] || 0) + 1
  const byProvider = {}
  for (const i of items) byProvider[i.provider ?? '(표기없음)'] = (byProvider[i.provider ?? '(표기없음)'] || 0) + 1
  const byBasis = {}
  for (const i of items) { const k = i.oldRegionBasis.split(':')[0]; byBasis[k] = (byBasis[k] || 0) + 1 }

  const mapped = items.filter(i => i.oldRegion).length
  const unmapped = items.length - mapped

  const out = {
    source: '통일부 이산가족정보통합시스템 — 스토리 > 나의 살던 고향은',
    url: HUB,
    collectedAt: collectedAt(),
    counts: {
      siteBadgeSum: badgeSum,        // 사이트 배지 「총 N 건」 합 = 등록건수
      uniquePhotos: items.length,    // 고유 fileId — 실제 쓸 수 있는 사진 수
      imgTagSum,                     // 썸네일+원본 두 블록 합산 계수 — 「258장」은 이 값이다
      mappedToOldRegion: mapped,
      unmappedOldRegion: unmapped,
    },
    items,
    meta: {
      failed,
      note: [
        '「총 258장」은 탭별 <img> 태그 총수(썸네일 블록+원본 블록, 한 사진이 2회 등장)다.',
        '고유 사진은 fileId 로 접어 129장, 사이트 배지(등록건수) 합은 141건이다. 배지에만 있고 <img> 가 없는 결번은 tabs[].missingSeq 에 남겼다.',
        'oldRegion 은 광복 당시 7종 고향축 근사 대응이다. 근거는 frontend/public/gohyang/map.json crosswalk 뿐이며 새 대응을 만들지 않았다.',
        '확정할 수 없는 것(분도 이전 「함경도」「평안도」 단독 표기, 현행-광복당시 소속이 갈리는 원산 등)은 oldRegion:null 로 남겼다 — 억지 매핑 금지.',
        '이미지는 URL 만 기록했다. 파일은 내려받지 않았다(제공처 저작권 — 공공누리 표시 없음). provider 표기와 원문 링크를 화면에 반드시 동반할 것.',
        'as-of: collectedAt 은 수집일이다. 사진의 촬영 시점은 사이트가 제공하지 않는다.',
      ].join('\n'),
      crosswalkNote: CROSSWALK_NOTE,
      tabs: tabs.map(({ items: _drop, ...t }) => t),
      byOldRegion: byOld,
      byProvider,
      byMappingBasis: byBasis,
      network: netSummary(),
    },
  }

  writeJson(OUT, out)
  console.log(`[hometown-gallery] 완료 — 고유 ${items.length}장 · 7종축 확정 ${mapped} / 미확정 ${unmapped}`)
  console.log('  byOldRegion:', JSON.stringify(byOld))
}

main().catch(e => { console.error(e); process.exit(1) })
