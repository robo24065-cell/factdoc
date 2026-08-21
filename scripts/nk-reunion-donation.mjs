#!/usr/bin/env node
// nk-reunion-donation.mjs — 디지털박물관 「기증현황」 + 「기증자 명단」 수집 → 북한자료-api/reunion-donation.json
//
// 코너: https://reunion.unikorea.go.kr/reuni/home/museum/archive/DonationInfo.do?mid=SM00000265
//       https://reunion.unikorea.go.kr/reuni/home/museum/archive/Donor.do?mid=SM00000265  (기증자 명단)
// 렌더: 둘 다 정적 HTML(ajax 없음). 요청 2회면 전량.
//
// ★★ as-of 함정 — 이 코너의 가장 중요한 발견.
//   기증현황 표 위의 「사료 보존 및 공개 현황 (YYYY년 M월 D일)」 문구는 서버가 준 기준일이 아니다.
//   페이지 스크립트가 `var date = new Date();` 로 **브라우저의 오늘 날짜**를 찍는다.
//   소스에는 원래 값이 주석으로 남아 있다: /* (2018년 12월 15일 현재) */
//   → 화면에 보이는 날짜는 항상 '오늘'이라 **표의 실제 기준일은 사이트가 알려주지 않는다.**
//   이 표를 인용할 때 화면 날짜를 기준일로 적으면 그 자체가 as-of 위반이다. asOfTrap 에 근거를 남긴다.
//
// 실행: node scripts/nk-reunion-donation.mjs [--force] [--delay=500]

import {
  BASE, MID, createCtx, parseArgs, stripTags,
  writeEnvelope, loadMuseumIds, LICENSE_NOTE, nowKSTStamp, stampCollected,
} from './nk-reunion-lib.mjs'

const ARC = `${BASE}/reuni/home/museum/archive`
const DONATION_URL = `${ARC}/DonationInfo.do?mid=${MID.donation}`
const DONOR_URL = `${ARC}/Donor.do?mid=${MID.donation}`

const args = parseArgs()
const ctx = createCtx({ corner: 'donation', delay: args.delay, force: args.force })

// 표: <th>형태</th><th>수집건수</th><th>공개건수</th> 아래 6행. 값에 단위가 붙는다(건/장/권).
function parseTable(html) {
  const i = html.indexOf('<th class="haedtitle">형태</th>')   // 사이트 오타 haedtitle 그대로
  if (i < 0) return []
  const seg = html.slice(i, html.indexOf('</table>', i))
  const rows = []
  const re = /<tr>\s*<th>([^<]+)<\/th>\s*<td>([^<]+)<\/td>\s*<td>([^<]+)<\/td>\s*<\/tr>/g
  let m
  while ((m = re.exec(seg))) {
    const label = stripTags(m[1])
    const c = stripTags(m[2]), o = stripTags(m[3])
    rows.push({
      form: label,
      collectedCountRaw: c,
      openCountRaw: o,
      collectedCount: +(c.replace(/[^0-9]/g, '')),
      openCount: +(o.replace(/[^0-9]/g, '')),
      unit: (c.match(/[가-힣]+$/) || [null])[0],
    })
  }
  return rows
}

// 기증자 명단은 블록 2개다: class="ordinary ordinary-name"(기관 단체) · "ordinary ordinary-name2"(개인 기증자).
// ★ 실측 주의 — 이름이 전부 링크인 것이 아니다.
//   일부만 <a href="javascript:jsDonorList('이름','02');"> 로 감싸져 있고(그 기증자의 사료 목록으로 감),
//   나머지는 <li> 안의 맨 텍스트다. jsDonorList 만 세면 명단을 통째로 놓친다.
//   그래서 <li> 단위로 훑고, 링크가 있으면 linked=true 로 표시한다.
function parseDonors(html) {
  const out = []
  const blocks = [...html.matchAll(/class="ordinary ordinary-name2?"/g)].map(m => m.index)
  for (let i = 0; i < blocks.length; i++) {
    const seg = html.slice(blocks[i], i + 1 < blocks.length ? blocks[i + 1] : blocks[i] + 400000)
    const end = seg.indexOf('</article>')
    const body = end > 0 ? seg.slice(0, end) : seg
    const g = body.match(/<strong>([\s\S]*?)<\/strong>/)
    const group = g ? stripTags(g[1]) : `블록${i + 1}`
    const donors = []
    for (const li of body.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
      const inner = li[1]
      const link = inner.match(/jsDonorList\('([^']*)','(\d+)'\)/)
      const name = stripTags(inner)
      if (!name) continue
      donors.push({
        name: link ? stripTags(link[1]) : name,
        divCode: link ? link[2] : null,
        linked: !!link,
      })
    }
    if (donors.length) out.push({ group, count: donors.length, donors })
  }
  return out
}

const main = async () => {
  ctx.log('시작', nowKSTStamp())

  const dHtml = await ctx.get(DONATION_URL, 'DonationInfo')
  if (!dHtml) throw new Error('기증현황 페이지를 받지 못했다 — 중단.')
  const rows = parseTable(dHtml)
  const asOfTrapEvidence = (dHtml.match(/var today\s*=\s*"[^"]*"[\s\S]{0,200}?\/\*([^*]*)\*\//) || [])[0] || null

  const nHtml = await ctx.get(DONOR_URL, 'Donor')
  const groups = nHtml ? parseDonors(nHtml) : []
  if (!nHtml) ctx.note('Donor', '기증자 명단 페이지를 받지 못했다')

  // 안내 문구(수집 대상/기간/문의) — 후손 안내 화면(/action)에 그대로 쓸 수 있는 1차 정보다.
  const guide = {}
  for (const m of dHtml.matchAll(/<strong>([^<]*?)<b>([^<]*)<\/b><\/strong>/g)) {
    guide[stripTags(m[1])] = stripTags(m[2])
  }
  const targets = (() => {
    const i = dHtml.indexOf('수집 대상 자료')
    if (i < 0) return []
    const seg = dHtml.slice(i, i + 900)
    return [...seg.matchAll(/<li>([^<]+)<\/li>/g)].map(x => stripTags(x[1]))
  })()

  const sumCollected = rows.reduce((s, r) => s + r.collectedCount, 0)
  const sumOpen = rows.reduce((s, r) => s + r.openCount, 0)

  const museum = loadMuseumIds()
  const orgs = groups.find(g => /기관/.test(g.group))
  const inds = groups.find(g => /개인/.test(g.group))
  const rosterNames = new Set(groups.flatMap(g => g.donors.map(d => d.name)))
  let donorCross = { checked: false }
  if (museum) {
    const fromRecords = new Set()
    for (const r of museum.byId.values()) if (r.donor) fromRecords.add(String(r.donor).trim())
    const inBoth = [...fromRecords].filter(n => rosterNames.has(n))
    donorCross = {
      checked: true,
      rosterNames: rosterNames.size,
      museumRecordDonorNames: fromRecords.size,
      matchedByExactName: inBoth.length,
      onlyInMuseumRecords: fromRecords.size - inBoth.length,
      onlyInRoster: rosterNames.size - inBoth.length,
      note:
        '이름 문자열 완전일치 기준이다. 동명이인·표기차(괄호·공백·직함)를 구분하지 못하므로 ' +
        '동일인 판정 근거로 쓰면 안 된다. 규모 감각용 수치다.',
      interpretation:
        'onlyInRoster = 명단에는 있는데 공개 사료(museum.json 4,342건)의 기증자 칸에는 한 번도 안 나오는 이름이다. ' +
        '기증은 했으나 그 사료가 아직 공개되지 않았다는 뜻으로 읽힌다 — 수집 15,399 대비 공개 4,342 라는 ' +
        '위 sums 와 같은 방향의 관측이다. 다만 이는 해석이지 사이트가 명시한 사실이 아니다.',
    }
  }

  /* ★ 수집일 확정 — 캐시에서만 읽었으면 그 캐시가 쓰인 때가 실제 수집 시각이다.
       실행 시각을 찍으면 네트워크를 0회 치고도 수집일이 앞으로 밀린다(as-of 규약 위반). */
  const stamped = stampCollected(ctx, args)
  ctx.log(`수집일 ${stamped.date} (${stamped.forced ? '--collected-at 지정' : stamped.observed ? '캐시·요청 실측 최댓값' : '실측 불가 — 폴백'})`)
  const envelope = {
    source: '통일부 남북이산가족 디지털박물관 — 기증현황 · 기증자 명단',
    corner: '기증현황',
    url: DONATION_URL,
    collectedAt: args.collectedAt,
    collectedAtStamp: args.collectedAtStamp,
    total: rows.length,
    totalEvidence:
      '이 코너는 목록형이 아니라 통계표다. total 은 표의 형태 행 수(6)이며 사이트에 「총 N건」 문구는 없다. ' +
      '건수 자체는 items[].collectedCount / openCount 와 meta.sums 에 있다.',
    items: rows,
    donorRoster: groups,
    donationGuide: { ...guide, 수집대상자료: targets, url: DONATION_URL },
    meta: {
      sums: { 수집합계: sumCollected, 공개합계: sumOpen },
      openRatePct: sumCollected ? +(sumOpen / sumCollected * 100).toFixed(1) : null,
      crossCheckWithArchive: {
        museumJsonRecords: museum ? museum.total : null,
        openSumEqualsArchiveTotal: museum ? sumOpen === museum.total : null,
        note:
          '공개합계와 기록관 총건수(4,342)가 같은지 대조한다. 같다면 「공개=기록관에 뜨는 것」이라는 ' +
          '해석이 성립하고, 수집 대비 공개율이 곧 우리가 볼 수 있는 자료의 비율이 된다.',
      },
      asOfTrap: {
        severity: 'high',
        finding:
          '★ 표 위의 「사료 보존 및 공개 현황 (YYYY년 M월 D일)」은 서버가 준 기준일이 아니다. ' +
          '페이지 스크립트가 var date = new Date() 로 브라우저의 오늘 날짜를 찍는다 — 언제 열어도 오늘로 보인다.',
        sourceEvidence: asOfTrapEvidence,
        commentedOutOriginal: '/* (2018년 12월 15일 현재)*/ — 소스에 주석으로 남아 있는 옛 표기',
        consequence:
          '이 표의 실제 기준일은 사이트가 알려주지 않는다. 화면에 뜬 날짜를 기준일로 인용하면 as-of 위반이다. ' +
          '우리 화면에서는 「기준일 미상 · 수집일 ' + args.collectedAt + '」로만 적어야 한다.',
        weKnow: '우리가 아는 것은 수집일뿐이다. 자료의 기준일은 모른다 — 모른다고 적는다.',
      },
      donorCounts: {
        기관단체: orgs ? orgs.count : null,
        개인기증자: inds ? inds.count : null,
        합계: groups.reduce((s, g) => s + g.count, 0),
      },
      donorGroupsFound: groups.map(g => ({ group: g.group, count: g.count })),
      donorCrossCheckWithMuseumJson: donorCross,
      regionOrgsInRoster: [...rosterNames].filter(n => /도민회|군민회|시민회|철수작전/.test(n)),
      hasRegionField: false,
      regionNote:
        '기증현황 표에는 지역 축이 전혀 없다. 다만 기증자 명단의 기관 이름에 향우 조직(도민회·군민회)이 있어 ' +
        '지역과 이어질 실마리가 된다 — 매핑은 여기서 하지 않고 원문 이름 그대로 넘긴다.',
      endpoints: { donationInfo: DONATION_URL, donorRoster: DONOR_URL, donorRecords: `${ARC}/DnrRecord.do (POST, i_donor=<이름>&auth_div=<01|02>)` },
      notCollected: {
        donorRecords: 'DnrRecord.do(기증자별 사료 목록)는 받지 않았다. 기증자↔사료 연결은 museum.json 의 donor 필드로 이미 가지고 있어 중복이다.',
      },
      license: LICENSE_NOTE,
      failed: ctx.failed,
      network: ctx.net,
      note: 'as-of: 수집일 ' + args.collectedAt + '. 표의 기준일은 위 asOfTrap 대로 확인 불가 — 두 날짜를 섞지 말 것.',
    },
  }
  ctx.finish()
  const out = writeEnvelope('reunion-donation.json', envelope)
  ctx.log(`저장 ${out} — 형태 ${rows.length}행 · 기증자 ${envelope.meta.donorCounts.합계}명, 실패 ${ctx.failed.length}건`)
}

main().catch(e => { ctx.finish(); console.error('✗', e.message); process.exit(1) })
