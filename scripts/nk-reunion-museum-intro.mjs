#!/usr/bin/env node
// nk-reunion-museum-intro.mjs — 이산가족정보통합시스템 「디지털박물관 소개」 수집
//   → 북한자료-api/reunion-museum-intro.json
//
// ★ 이 페이지는 목록이 아니다 — 소개·허브 페이지다. 수집할 '사료 항목'이 0건이다.
//   그러니 건수를 만들어 내면 안 된다. 이 페이지의 값어치는 항목이 아니라 **지도**다:
//   상단 내비게이션에 없는 코너로 가는 유일한 입구가 여기에 있다
//   (가족이야기 FmlyStory.do · 카드이야기 CardStory.do · 기증자 명단 Donor.do).
//
// 수집 대상 (전부 첫 응답 HTML 안. XHR/Fetch 0건):
//   ① 컬렉션 배너 4개  CollectionView.do?col_id=2..5 — 제목 + 한 줄 설명
//   ② 소개 타일 4개    손편지 · 기록관 · ★가족이야기 · ★카드이야기
//   ③ 통합검색 폼      GET archive/search/SearchEngine.do?search=키워드
//   ④ 아이콘 3개       기증현황 · ★기증자 명단 · 연표
//   ⑤ 홍보영상         /res/theme/reunion_new/vod/vodReuni.mp4 + 자막 전문(textarea 안 텍스트)
//   ⑥ 사이트 전체 내비게이션 링크 — 이 페이지가 실어 나르는 코너 지도
//
// 세션: mid 없이 부르면 302 → 이 주소 자체가 JSESSIONID 발급처다.
// 영상은 지시대로 받지 않는다 — URL 과 자막 텍스트만 기록한다.
// 실행: node scripts/nk-reunion-museum-intro.mjs [--force] [--delay=700]

import {
  BASE, FORCE, DELAY_MS, NET,
  makeSession, decodeEntities, htmlToText, oneLine, abs, writeEnvelope, collectedIso, collectedKst,
} from './nk-reunion-common.mjs'

const MID = 'SM00000261'
const URL = `${BASE}/reuni/home/museum/view.do?gubn=A&mid=${MID}`
const S = makeSession('museum-intro')
const failed = []

const norm = (u) => decodeEntities(u).replace(/&amp;/g, '&')

function main2(html) {
  const bodyStart = html.indexOf('<!-- BODY -->')
  const body = bodyStart >= 0 ? html.slice(bodyStart) : html
  const head = bodyStart >= 0 ? html.slice(0, bodyStart) : ''

  const items = []
  const seen = new Set()
  const push = (o) => {
    const key = o.section + '|' + o.url
    if (seen.has(key)) return
    seen.add(key)
    items.push(o)
  }

  // ① 컬렉션 배너 4개
  const banRe = /<a href="(\/reuni\/home\/museum\/archive\/collection\/CollectionView\.do\?col_id=(\d+))"[\s\S]*?<span class="txtTit">([\s\S]*?)<\/span>\s*<span class="txtDesc">([\s\S]*?)<\/span>/g
  let m
  while ((m = banRe.exec(body))) {
    push({
      section: 'collectionBanner',
      kind: '컬렉션',
      colId: +m[2],
      title: oneLine(m[3]),
      description: htmlToText(m[4]).replace(/\n/g, ' '),
      url: abs(norm(m[1])),
    })
  }

  // ② 소개 타일 4개
  const tileStart = body.indexOf('<ul class="tileCont">')
  if (tileStart >= 0) {
    const tileEnd = body.indexOf('</ul>', tileStart)
    const seg = body.slice(tileStart, tileEnd < 0 ? body.length : tileEnd)
    const tRe = /<a [^>]*href="(\/reuni\/[^"]+)"[\s\S]*?<p class="titCont">([\s\S]*?)<\/p>\s*<p class="descCont">([\s\S]*?)<\/p>/g
    while ((m = tRe.exec(seg))) {
      push({
        section: 'introTile',
        kind: '박물관 코너',
        title: oneLine(m[2]),
        description: htmlToText(m[3]).replace(/\n/g, ' '),
        url: abs(norm(m[1])),
      })
    }
  } else failed.push({ kind: 'introTile', reason: 'ul.tileCont 블록을 못 찾았다' })

  // ④ 아이콘 3개
  const iconStart = body.indexOf('<div class="iconArea">')
  if (iconStart >= 0) {
    const iconEnd = body.indexOf('</div>', body.indexOf('</a>', body.lastIndexOf('<a', body.indexOf('</div>', iconStart))))
    const seg = body.slice(iconStart, iconStart + 2500)
    const iRe = /<a href="(\/reuni\/[^"]+)">[\s\S]*?<span>([^<]*)<\/span>/g
    while ((m = iRe.exec(seg))) {
      push({ section: 'icon', kind: '박물관 코너', title: oneLine(m[2]), description: null, url: abs(norm(m[1])) })
    }
  } else failed.push({ kind: 'icon', reason: 'div.iconArea 블록을 못 찾았다' })

  // ③ 통합검색 폼
  const fm = body.match(/<form name="museumfrm"[^>]*action="([^"]+)"/)
  const searchForm = fm ? {
    method: 'GET',
    action: abs(norm(fm[1])),
    param: 'search',
    example: abs(norm(fm[1])) + '?search=' + encodeURIComponent('고향'),
  } : null
  if (!fm) failed.push({ kind: 'searchForm', reason: 'museumfrm 폼을 못 찾았다' })

  // ⑤ 홍보영상 + 자막 전문
  const vm = body.match(/<video[^>]*id="reuniVod"[^>]*src="([^"]+)"/)
  const cm = body.match(/<textarea[^>]*title="[^"]*홍보동영상 자막내용"[^>]*>([\s\S]*?)<\/textarea>/)
  const promoVideo = {
    url: vm ? abs(norm(vm[1])) : null,
    downloaded: false,
    downloadNote: '지시대로 영상은 내려받지 않았다 — URL 과 자막 텍스트만 기록한다.',
    captionText: cm ? htmlToText(cm[1]) : null,
  }
  if (!vm) failed.push({ kind: 'promoVideo', reason: 'video#reuniVod 를 못 찾았다' })
  if (!cm) failed.push({ kind: 'promoCaption', reason: '자막 textarea 를 못 찾았다' })

  // 페이지 자체의 서술 텍스트
  const introTitle = (body.match(/<p class="titCont">디지털박물관 소개<\/p>\s*<p class="descCont">([\s\S]*?)<\/p>/) || [])[1]
  const visualTxt = (body.match(/<p class="txtArea">([\s\S]*?)<\/p>/) || [])[1]

  // ⑥ 사이트 내비게이션 링크(이 페이지가 실어 나르는 코너 지도)
  const navLinks = []
  const nSeen = new Set()
  const nRe = /<li><a href="(\/reuni\/[^"]+)"[^>]*>([^<]*)<\/a><\/li>/g
  while ((m = nRe.exec(head))) {
    const url = abs(norm(m[1]))
    const title = decodeEntities(m[2]).trim()
    const key = title + '|' + url.split('?')[0]
    if (!title || nSeen.has(key)) continue
    nSeen.add(key)
    navLinks.push({ title, url })
  }

  // 내비게이션에 없는 코너 판정 — 경로(.do)로 비교한다(mid 파라미터가 달라서)
  const navPaths = new Set(navLinks.map(l => l.url.split('?')[0]))
  for (const it of items) {
    it.inMainNav = navPaths.has(it.url.split('?')[0])
    // ★ 구분: 컬렉션 배너(col_id=N)는 코너 자체(CollectionMain.do)가 내비에 있고 '깊은 링크'만 없는 경우다.
    //   진짜로 코너 자체가 내비에 없는 것(가족이야기·카드이야기·기증자 명단)과 섞으면 안 된다.
    it.linkKind = it.section === 'collectionBanner' ? '기존 코너(컬렉션)의 깊은 링크' : '코너 입구'
    it.cornerAbsentFromNav = !it.inMainNav && it.section !== 'collectionBanner'
  }

  return { items, searchForm, promoVideo, navLinks,
    pageText: {
      visualIntro: visualTxt ? htmlToText(visualTxt) : null,
      museumIntro: introTitle ? htmlToText(introTitle) : null,
    } }
}

async function main() {
  /* ★ 수집 시각은 fetch 가 끝난 뒤에 정한다 — 캐시에서만 읽었으면 그 캐시가 쓰인 때가
       실제 수집 시각이다(nk-reunion-common.mjs observe/collectedIso). 실행 시각을 찍으면
       네트워크를 0회 치고도 수집일이 앞으로 밀린다(as-of 규약 위반). */
  console.log(`[박물관 소개] 수집 시작 — delay=${DELAY_MS}ms force=${FORCE}`)
  const r = await S.fetchText(URL, '박물관 소개')
  if (!r) throw new Error('박물관 소개 페이지를 못 받았다 — 중단')

  const parsed = main2(r.text)
  const hidden = parsed.items.filter(i => i.cornerAbsentFromNav)
  const deepLinksOnly = parsed.items.filter(i => !i.inMainNav && !i.cornerAbsentFromNav)

  const envelope = {
    source: '통일부 이산가족정보통합시스템 — 디지털박물관 소개(허브)',
    url: URL,
    collectedAt: collectedIso(),
    collectedOnKst: collectedKst(),
    total: null,                       // ★ 목록이 아니다 — 총건수 문구 자체가 없다
    totalDisplayedBySite: false,
    collected: parsed.items.length,    // '사료 건수'가 아니라 '이 페이지가 여는 입구 수'
    items: parsed.items,
    meta: {
      pageKind: '허브(소개) 페이지 — 수집할 사료 항목이 0건이다',
      countingWarning: '★ collected 는 이 페이지가 여는 입구(링크) 수이지 사료 건수가 아니다. 기록 밀도 분자에 절대 더하지 마라.',
      entryPointsBySection: {
        collectionBanner: parsed.items.filter(i => i.section === 'collectionBanner').length,
        introTile: parsed.items.filter(i => i.section === 'introTile').length,
        icon: parsed.items.filter(i => i.section === 'icon').length,
      },
      hiddenCorners: {
        count: hidden.length,
        items: hidden.map(i => ({ title: i.title, url: i.url })),
        note: '상단 내비게이션 링크 경로 집합과 대조해 실측했다. 여기에 잡힌 것이 「이 페이지가 유일한 입구」인 코너다 — 브리핑의 12개 코너 목록에 빠져 있던 것들이다.',
        deepLinksOnly: deepLinksOnly.map(i => ({ title: i.title, url: i.url })),
        deepLinksOnlyNote: '컬렉션 배너 4개는 코너 자체(CollectionMain.do)가 내비에 있고 깊은 링크만 내비에 없다 — 「없는 코너」로 세지 않는다.',
      },
      searchForm: parsed.searchForm,
      promoVideo: parsed.promoVideo,
      pageText: parsed.pageText,
      siteNavigation: {
        count: parsed.navLinks.length,
        links: parsed.navLinks,
        note: '이 페이지 머리글이 실어 나르는 사이트 전체 코너 지도. 12개 코너 브리핑에 없던 항목(영문 History/Stories 등)도 여기에 그대로 남긴다.',
      },
      region: {
        hasStructuredRegionField: false,
        note: '지역 정보 없음. 이 페이지에는 지명이 나오지 않는다.',
      },
      overlapWithMuseum: {
        checked: true,
        overlappingRecords: 0,
        method: '이 페이지는 사료 레코드를 담지 않는다. museum.json 과 겹칠 항목 자체가 없다.',
        countsAsNewRecords: false,
      },
      rights: {
        koglMark: false,
        note: '공공누리(KOGL) 표시 없음. 홍보영상은 내려받지 않았다.',
      },
      failed,
      network: { calls: NET.calls, fromCache: NET.fromCache, failures: NET.fail, bytes: NET.bytes, delayMs: DELAY_MS },
      note: [
        `as-of: 수집일 ${collectedKst()}(KST). 페이지에 갱신일 표시가 없어 자료의 기준일은 알 수 없다.`,
        '세션: 이 주소가 JSESSIONID 발급처다. museum 계열의 다른 주소는 세션 없이 부르면 302 가 난다.',
      ].join('\n'),
    },
  }

  const p = writeEnvelope('reunion-museum-intro.json', envelope)
  console.log(`[박물관 소개] 완료 — 입구 ${parsed.items.length}개(내비 미노출 ${hidden.length}개) · 내비 링크 ${parsed.navLinks.length}개 · 실패 ${failed.length}건`)
  console.log(`  → ${p}`)
}

main().catch(e => { console.error('X ' + (e.message || e)); process.exit(1) })
