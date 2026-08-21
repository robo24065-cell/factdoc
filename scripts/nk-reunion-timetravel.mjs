#!/usr/bin/env node
// nk-reunion-timetravel.mjs — 이산가족정보통합시스템 「시간여행」 전량 수집
//   → 북한자료-api/reunion-timetravel.json
//
// 구조 (2026-08-21 실측):
//   · 허브 TimeTravel.do?mid=SM00000270 는 섹션 카드 4개만 있다. 실제 목록은 link=01~04 각 페이지.
//   · 목록은 첫 응답 HTML 에 전량 들어 있다(XHR/Fetch 0건). 페이징 파라미터 자체가 없다.
//   · 한 항목이 두 블록에 나뉘어 있다:
//       #slick_galleryView_nav  → <img class="nav" data-id="{iId}" data-lazy="…HandLttrImageView.do?file_id=F">
//       #slick_galleryView      → <h3 class="titCont">제목</h3>
//                                 <img class="view" data-lazy="…HandLttrRealdownload.do?file_id=F">
//                                 <div class="descCont">★큐레이터 해설문</div>
//     두 블록을 file_id 로 맞춘다.
//   · ★CDP 로 DOM 을 세면 안 된다 — slick 캐러셀이 슬라이드를 복제해 nav 가 부풀어 오른다. 정적 파싱이 정답.
//   · 사이트가 총건수를 표시하지 않는다(「총 N 건」 문구 없음) → total 은 "사이트 미표시" 로 남기고
//     우리가 센 값을 collected 로 적는다. 지어내지 않는다.
//
// 상세 JSON API: GET /reuni/home/museum/TimeTravel.do/{iId}  (쿠키·Referer 불필요, application/json)
//   iRegno · iCreator · iDonor · iClssprov · iClssfrm · iScope · iMngCycle(=해설문) · iFilenoList
//   --no-detail 로 끌 수 있다.
//
// ★ 기존 museum.json 과의 관계: 시간여행 항목은 전부 박물관 사료(iId 체계)다 → 새 '건수'가 아니다.
//   이 스크립트는 겹침을 직접 대조해 meta.overlapWithMuseum 에 실측값으로 남긴다.
//   신규 자산은 '항목'이 아니라 **해설문(descCont/iMngCycle)** 이다.
//
// 미디어는 URL 만 기록한다. 파일을 내려받지 않는다.
// 실행: node scripts/nk-reunion-timetravel.mjs [--force] [--delay=700] [--no-detail]

import fs from 'node:fs'
import path from 'node:path'
import {
  BASE, OUT_DIR, args, argOf, FORCE, DELAY_MS, NET,
  makeSession, decodeEntities, htmlToText, oneLine, abs, writeEnvelope, collectedIso, collectedKst,
} from './nk-reunion-common.mjs'

const MID = 'SM00000270'
const MID_IMAGE = 'SM00000262'
const HUB = `${BASE}/reuni/home/museum/TimeTravel.do?mid=${MID}`
const sectionUrl = (link) => `${BASE}/reuni/home/museum/TimeTravel.do?link=${link}&mid=${MID}`
const detailUrl = (iId) => `${BASE}/reuni/home/museum/TimeTravel.do/${iId}`
const NO_DETAIL = args.includes('--no-detail')
const SECTIONS = ['01', '02', '03', '04']
const PROBE_SECTIONS = ['05']   // 섹션이 4개뿐임을 매 실행 재확인한다(302 예상)

const S = makeSession('timetravel')
const failed = []
const note = []

// ── 블록 잘라내기 ────────────────────────────────────────────────────────────
function sliceById(html, id) {
  const marker = `id="${id}"`
  const i = html.indexOf(marker)
  if (i < 0) return null
  // 여는 <div ... id="..."> 의 끝
  const open = html.indexOf('>', i)
  // 같은 id 를 가진 형제 블록이 뒤에 오므로, 다음 최상위 컨테이너 전까지로 자른다.
  // 실측상 nav 블록 뒤에 곧바로 <div id="slick_galleryView"> 가 오고,
  // view 블록 뒤에는 </div> ... <article ...> 가 온다.
  const nextId = html.indexOf('id="slick_', open)
  const endArticle = html.indexOf('</article>', open)
  let end = html.length
  if (id === 'slick_galleryView_nav') end = nextId > 0 ? nextId : endArticle
  else end = endArticle > 0 ? endArticle : html.length
  return html.slice(open + 1, end)
}

function parseSection(html, link) {
  // 섹션 제목: <div class="titCont" …><h3 …>어제</h3>
  let sectionTitle = null
  const tm = html.match(/<div class="titCont"[^>]*>\s*<h3[^>]*>([^<]*)<\/h3>/)
  if (tm) sectionTitle = decodeEntities(tm[1]).trim()

  const navBlock = sliceById(html, 'slick_galleryView_nav')
  const viewBlock = sliceById(html, 'slick_galleryView')
  if (!navBlock || !viewBlock) return { sectionTitle, items: [], error: 'slick 블록을 찾지 못했다' }

  // nav: data-id(iId) + file_id
  const navByFile = new Map()
  const navOrder = []
  const navRe = /<img\s+class="nav"[^>]*?data-id="(\d+)"[^>]*?data-lazy="([^"]+)"[^>]*?alt="([^"]*)"/g
  let m
  while ((m = navRe.exec(navBlock))) {
    const fid = (m[2].match(/file_id=(\d+)/) || [])[1]
    if (!fid) continue
    if (!navByFile.has(fid)) { navByFile.set(fid, { iId: +m[1], fileId: fid, alt: decodeEntities(m[3]).trim() }); navOrder.push(fid) }
  }

  // view: 제목 + file_id + 해설문
  const items = []
  const viewRe = /<div>\s*<h3 class="titCont">([\s\S]*?)<\/h3>\s*<img\s+class="view"[^>]*?data-lazy="([^"]+)"[^>]*?alt="([^"]*)"[^>]*>\s*<div class="descCont">([\s\S]*?)<\/div>/g
  const seenFile = new Set()
  while ((m = viewRe.exec(viewBlock))) {
    const fid = (m[2].match(/file_id=(\d+)/) || [])[1]
    if (!fid || seenFile.has(fid)) continue      // slick 복제 방어
    seenFile.add(fid)
    const nav = navByFile.get(fid) || null
    items.push({
      iId: nav ? nav.iId : null,
      fileId: fid,
      section: link,
      sectionTitle,
      title: oneLine(m[1]),
      alt: decodeEntities(m[3]).trim(),
      curatorNote: htmlToText(m[4]),          // ★ 신규 자산 — museum.json 의 content 와 다른 문장
      thumbUrl: `${BASE}/reuni/home/museum/archive/letter/HandLttrImageView.do?mid=${MID_IMAGE}&file_id=${fid}`,
      viewUrl: `${BASE}/reuni/home/museum/archive/letter/HandLttrRealdownload.do?file_id=${fid}`,
      pageUrl: sectionUrl(link),
      recordUrl: nav ? `${BASE}/reuni/home/museum/archive/RecordView.do?i_id=${nav.iId}&mid=SM00000264` : null,
    })
  }
  const navOnly = navOrder.filter(f => !seenFile.has(f))
  return { sectionTitle, items, navCount: navByFile.size, navOnly }
}

// ── 실행 ────────────────────────────────────────────────────────────────────
async function main() {
  /* ★ 수집 시각은 fetch 가 끝난 뒤에 정한다 — 캐시에서만 읽었으면 그 캐시가 쓰인 때가
       실제 수집 시각이다(nk-reunion-common.mjs observe/collectedIso). 실행 시각을 찍으면
       네트워크를 0회 치고도 수집일이 앞으로 밀린다(as-of 규약 위반). */
  console.log(`[시간여행] 수집 시작 — delay=${DELAY_MS}ms force=${FORCE}`)

  // 허브 한 번 (링크 목록 확인용, 항목은 없다)
  const hub = await S.fetchText(HUB, '허브')
  if (!hub) failed.push({ kind: 'hub', url: HUB, reason: 'HTTP 실패' })

  const sections = []
  const items = []
  for (const link of SECTIONS) {
    const url = sectionUrl(link)
    const r = await S.fetchText(url, `섹션 link=${link}`)
    if (!r) { failed.push({ kind: 'section', link, url, reason: 'HTTP 실패 — 이 섹션 전량 미수집' }); continue }
    const parsed = parseSection(r.text, link)
    if (parsed.error) { failed.push({ kind: 'section', link, url, reason: parsed.error }); continue }
    sections.push({
      link, title: parsed.sectionTitle, url,
      navCount: parsed.navCount, itemCount: parsed.items.length,
      navWithoutView: parsed.navOnly,
    })
    items.push(...parsed.items)
    console.log(`  link=${link} ${parsed.sectionTitle} — ${parsed.items.length}건 (nav ${parsed.navCount}) ${r.cached ? '[캐시]' : ''}`)
  }

  // 섹션 05 부재 재확인 (302 예상). 실패로 세지 않는다.
  const probes = []
  for (const link of PROBE_SECTIONS) {
    const r = await S.fetchText(sectionUrl(link), `섹션 부재 확인 link=${link}`, { useCache: false })
    probes.push({ link, present: !!r, note: r ? '★예상과 다르다 — 섹션이 늘었을 수 있다' : '200 아님(302 예상) — 섹션 없음' })
    if (!r) NET.consecFail = 0   // 의도된 실패
  }

  // ── 상세 JSON API ─────────────────────────────────────────────────────────
  let detailOk = 0
  if (!NO_DETAIL) {
    const ids = [...new Set(items.map(i => i.iId).filter(Boolean))]
    console.log(`[시간여행] 상세 JSON ${ids.length}건`)
    const byId = new Map()
    let n = 0
    for (const iId of ids) {
      n++
      if (n % 25 === 0) console.log(`  상세 ${n}/${ids.length}`)
      const r = await S.fetchText(detailUrl(iId), `상세 iId=${iId}`)
      if (!r) { failed.push({ kind: 'detail', iId, url: detailUrl(iId), reason: 'HTTP 실패' }); continue }
      try { byId.set(iId, JSON.parse(r.text)); detailOk++ }
      catch (e) { failed.push({ kind: 'detail', iId, url: detailUrl(iId), reason: 'JSON 파싱 실패: ' + e.message }) }
    }
    for (const it of items) {
      const d = byId.get(it.iId)
      if (!d) continue
      it.detail = {
        regNo: d.iRegno || null,
        producer: d.iCreator || null,
        donor: d.iDonor || null,
        origin: d.iClssprov || null,       // 출처정보 (예 '개인 > 실향민')
        form: d.iClssfrm || null,          // 형태정보
        typeCode: d.iType || null,
        scope: d.iScope || null,           // 내용(개조식) — museum.json 의 content 와 같은 계열
        curatorNoteApi: d.iMngCycle || null,
        fileIds: Array.isArray(d.iFilenoList) ? d.iFilenoList.slice() : [],
      }
      // 목록 해설문 == API 해설문 인지 실측 대조
      it.curatorNoteMatchesApi = d.iMngCycle != null
        ? htmlToText(d.iMngCycle).replace(/\s+/g, '') === it.curatorNote.replace(/\s+/g, '')
        : null
    }
  } else {
    note.push('--no-detail 로 상세 JSON API 를 건너뛰었다. detail 필드가 비어 있다.')
  }

  // ── museum.json 겹침 대조 (수치 이중계상 방지의 근거) ──────────────────────
  let overlap = { checked: false, reason: 'museum.json 없음' }
  const mp = path.join(OUT_DIR, 'museum.json')
  if (fs.existsSync(mp)) {
    const mus = JSON.parse(fs.readFileSync(mp, 'utf8'))
    const byIid = new Map((mus.records || []).map(r => [r.iId, r]))
    let inMuseum = 0, titleSame = 0, titleDiff = [], fileSame = 0, notInMuseum = []
    for (const it of items) {
      const r = it.iId != null ? byIid.get(it.iId) : null
      if (!r) { notInMuseum.push({ iId: it.iId, fileId: it.fileId, title: it.title }); continue }
      inMuseum++
      const a = (r.title || '').replace(/\s+/g, ''), b = it.title.replace(/\s+/g, '')
      if (a === b) titleSame++; else titleDiff.push({ iId: it.iId, museum: r.title, timeTravel: it.title })
      if ((r.fileIds || []).map(String).includes(String(it.fileId))) fileSame++
    }
    // 해설문이 museum.json 의 content 와 다른 문장인지
    let noteDiffersFromContent = 0, noteSameAsContent = 0
    for (const it of items) {
      const r = it.iId != null ? byIid.get(it.iId) : null
      if (!r) continue
      const c = (r.content || '').replace(/\s+/g, '')
      const d = it.curatorNote.replace(/\s+/g, '')
      if (!d) continue
      if (c === d) noteSameAsContent++; else noteDiffersFromContent++
    }
    overlap = {
      checked: true,
      museumRecords: (mus.records || []).length,
      timeTravelItems: items.length,
      iIdFoundInMuseum: inMuseum,
      iIdNotInMuseum: notInMuseum.length,
      iIdNotInMuseumSamples: notInMuseum.slice(0, 10),
      titleIdenticalIgnoringWhitespace: titleSame,
      titleMismatch: titleDiff.length,
      titleMismatchSamples: titleDiff.slice(0, 5),
      fileIdAlsoInMuseumRecord: fileSame,
      curatorNoteDiffersFromMuseumContent: noteDiffersFromContent,
      curatorNoteSameAsMuseumContent: noteSameAsContent,
      conclusion: notInMuseum.length === 0
        ? '시간여행 항목은 전부 museum.json 안에 있다 → 새 사료 0건. 기록 밀도 분자에 더하면 이중계상이다. 신규 자산은 해설문 텍스트뿐이다.'
        : `museum.json 에 없는 iId 가 ${notInMuseum.length}건 있다 — 통합 단계에서 개별 확인이 필요하다.`,
    }
  }

  const withNote = items.filter(i => i.curatorNote && i.curatorNote.length > 0).length
  const withIid = items.filter(i => i.iId != null).length

  const envelope = {
    source: '통일부 이산가족정보통합시스템 — 디지털박물관 「시간여행」',
    url: HUB,
    collectedAt: collectedIso(),
    collectedOnKst: collectedKst(),
    total: null,                     // ★ 사이트가 총건수를 표시하지 않는다 — 지어내지 않는다
    totalDisplayedBySite: false,
    collected: items.length,
    items,
    meta: {
      sections,
      sectionProbes: probes,
      coverage: {
        note: '사이트가 총건수를 표시하지 않아 「총건수 대비 비율」을 계산할 근거가 없다. 대신 섹션별 nav 블록 개수와 view 블록 개수를 함께 적어 누락 여부를 대조할 수 있게 했다.',
        navTotal: sections.reduce((a, s) => a + (s.navCount || 0), 0),
        viewTotal: items.length,
        navWithoutView: sections.flatMap(s => (s.navWithoutView || []).map(f => ({ link: s.link, fileId: f }))),
      },
      fieldCoverage: {
        withIId: withIid,
        withoutIId: items.length - withIid,
        withCuratorNote: withNote,
        withDetailJson: items.filter(i => i.detail).length,
        detailApiOk: detailOk,
        curatorNoteMatchesApi: items.filter(i => i.curatorNoteMatchesApi === true).length,
        curatorNoteDiffersFromApi: items.filter(i => i.curatorNoteMatchesApi === false).length,
      },
      region: {
        hasStructuredRegionField: false,
        note: '항목 전용 지역 필드가 없다. 지명은 제목·해설문(curatorNote)·detail.scope 자유 텍스트 안에만 있다. 원문을 그대로 보존했고 광복 당시 7개 고향 축 매핑은 여기서 하지 않았다 — 통합 단계로 넘긴다. 다만 항목이 전부 museum.json 안에 있으므로 이미 계산된 regions/regionCities 를 iId 로 그대로 붙일 수 있다.',
      },
      overlapWithMuseum: overlap,
      rights: {
        koglMark: false,
        note: '공공누리(KOGL) 표시를 찾지 못했다. 푸터 저작권 문구뿐이고 사료 원본은 기증자 저작물이다. 이미지는 URL 만 기록했고 파일을 내려받지 않았다.',
      },
      imageDelivery: {
        note: 'HandLttrImageView.do / HandLttrRealdownload.do 는 JPEG 바이트를 Content-Type: text/html + X-Content-Type-Options: nosniff 로 내려준다 → 교차출처 <img> 직접 표시가 막히는 계열이다. 화면에 쓰려면 프록시 또는 축소 파생본이 필요하다(「나의 살던 고향은」의 /reuni/atchfile/ 계열과 다르다).',
      },
      failed,
      network: { calls: NET.calls, fromCache: NET.fromCache, failures: NET.fail, bytes: NET.bytes, delayMs: DELAY_MS },
      note: [
        'as-of: 여기 적힌 수치는 전부 수집일 기준이다. 사료 자체의 생산일자는 이 API 가 주지 않는다(iYy 필드 없음) — museum.json 의 producedOn 을 계속 써야 한다.',
        '수집 방식: 정적 HTML 파싱. CDP 렌더 DOM 을 세면 slick 캐러셀 복제 때문에 부풀어 오른다.',
        ...note,
      ].join('\n'),
    },
  }

  const p = writeEnvelope('reunion-timetravel.json', envelope)
  console.log(`[시간여행] 완료 — ${items.length}건 · 해설문 ${withNote}건 · 실패 ${failed.length}건`)
  console.log(`  → ${p}`)
}

main().catch(e => { console.error('X ' + (e.message || e)); process.exit(1) })
