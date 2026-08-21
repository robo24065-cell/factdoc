#!/usr/bin/env node
// nk-reunion-collection.mjs — 디지털박물관 「컬렉션」 전량 수집 → 북한자료-api/reunion-collection.json
//
// 코너: https://reunion.unikorea.go.kr/reuni/home/museum/archive/collection/CollectionMain.do?mid=SM00000263
// 구조:
//   · 대분류 4개  POST CollectionTopMenu.do?mid=SM00000263&limit=10&page=1 — 제목 + 한 줄 설명
//   · 컬렉션 상세 GET CollectionView.do?col_id={c}&mid=SM00000263
//        ★ 정적 <title> 이 비어 있다. 본문 스크립트의 document.title = "… > 컬렉션 > 제목" 에서 뽑는다.
//        ★ 존재하지 않는 col_id 도 HTTP 200 을 준다 — document.title 의 제목 자리가 **빈 문자열**인 것으로 판정한다.
//        페이지 안에 설명문 <p> · 해쉬태그 <a href="CollectionView.do?col_id=N">#라벨</a> ·
//        커버 이미지 h3 background-image · 좌측 내비(clt_navi)의 **대분류-소분류 전체 계층**이 들어 있다.
//   · 소속 사료 POST CollectionViewList.do?mid=SM00000263  body: col_id={c}&pageIndex={p}
//        ★ 실측: 쿼리스트링 limit/page 는 무시된다. body 의 pageIndex 가 **누적**이다
//          (pageIndex=P 는 1..P 를 한꺼번에 준다. 1쪽=6건). '더 보기 +' 버튼은 끝이어도 계속 붙어 있어
//          끝 판정에 쓸 수 없다 → 링크 수가 더 늘지 않을 때까지 pageIndex 를 올린다.
//
// ★ 겹침: 소속 사료 215건은 museum.json 에 이미 다 있다. 새 사료는 0건.
//   이 수집이 새로 얻는 것은 **컬렉션 설명문 · 해쉬태그 · 대분류-소분류 부모자식 관계 · 커버 이미지**다.
//
// 실행: node scripts/nk-reunion-collection.mjs [--force] [--delay=500] [--max-col=20]

import {
  BASE, MID, createCtx, parseArgs, stripTags, decodeEntities,
  writeEnvelope, loadMuseumIds, overlapReport, LICENSE_NOTE, nowKSTStamp, stampCollected,
} from './nk-reunion-lib.mjs'

const COL_BASE = `${BASE}/reuni/home/museum/archive/collection`
const PAGE_URL = `${COL_BASE}/CollectionMain.do?mid=${MID.collection}`

const args = parseArgs()
const MAX_COL = +(args.val('max-col', '20'))
const ctx = createCtx({ corner: 'collection', delay: args.delay, force: args.force })

// document.title = "남북이산가족 디지털 박물관 > 컬렉션 > 가족"  → '가족'
function titleOf(html) {
  const m = html && html.match(/document\.title\s*=\s*"([^"]*)"/)
  if (!m) return null
  const parts = m[1].split('>').map(s => s.trim())
  const last = parts[parts.length - 1]
  return last && last !== '컬렉션' ? decodeEntities(last) : null
}

function parseCollectionPage(html) {
  // 본문 블록(clt_contents) 안에서만 뽑는다 — 페이지 전역에는 같은 태그가 널려 있다.
  const s = html.indexOf('clt_contents')
  const e = html.indexOf('clt_contents_list', s + 1)
  const body = s >= 0 ? html.slice(s, e > s ? e : s + 8000) : ''
  const cover = body.match(/<h3 style="background-image:\s*url\(([^)]+)\)"/)
  const desc = body.match(/<\/h3>[\s\S]*?<p>([\s\S]*?)<\/p>/)
  const hashBlock = body.match(/<div class="hash">([\s\S]*?)<\/div>/)
  const hashtags = hashBlock
    ? [...hashBlock[1].matchAll(/<a href="CollectionView\.do\?col_id=(\d+)">#([^<]+)<\/a>/g)]
      .map(m => ({ colId: +m[1], label: stripTags(m[2]) }))
    : []
  return {
    coverImage: cover ? BASE + cover[1].trim() : null,
    description: desc && stripTags(desc[1]) ? stripTags(desc[1]) : null,
    hashtags,
  }
}

// 좌측 내비(clt_navi)에는 어느 컬렉션 페이지에서도 전체 계층이 그려진다.
//   <li class="main col1"> = 대분류, 그 뒤에 오는 <li class=""> 들이 그 대분류의 소분류.
function parseNavi(html) {
  const s = html.indexOf('clt_navi')
  if (s < 0) return []
  const body = html.slice(s, html.indexOf('</ul>', s) + 5)
  const out = []
  let parent = null
  const re = /<li class="([^"]*)">[\s\S]*?<a href="CollectionView\.do\?col_id=(\d+)">([^<]*)<\/a>/g
  let m
  while ((m = re.exec(body))) {
    const isMain = /main/.test(m[1])
    const node = { colId: +m[2], title: stripTags(m[3]), isTopLevel: isMain, parentColId: isMain ? null : parent }
    if (isMain) parent = node.colId
    out.push(node)
  }
  return out
}

async function membership(colId) {
  const url = `${COL_BASE}/CollectionViewList.do?mid=${MID.collection}`
  const seen = new Map()   // iId -> {iId, title, thumbFileId}
  let prev = -1
  const pageSizes = []
  for (let p = 1; p <= 200; p++) {
    const html = await ctx.post(url, `col_id=${colId}&pageIndex=${p}`, `col${colId} list p${p}`)
    if (!html) break
    const re = /href="CollectionRecord\.do\?i_id=(\d+)&col_id=(\d+)&pageIndex=(\d+)"[\s\S]*?background-image:url\(([^)]*)\)[\s\S]*?<strong>([\s\S]*?)<\/strong>/g
    let m, n = 0
    while ((m = re.exec(html))) {
      n++
      const iId = +m[1]
      if (seen.has(iId)) continue
      const fid = m[4].match(/file_id=(\d+)/)
      seen.set(iId, {
        iId,
        title: stripTags(m[5]),
        thumbFileId: fid ? +fid[1] : null,
        thumbUrl: fid ? `${BASE}/reuni/home/museum/archive/letter/HandLttrImageView.do?mid=${MID.letter}&file_id=${fid[1]}` : null,
        recordUrl: `${COL_BASE}/CollectionRecord.do?i_id=${iId}&col_id=${colId}&pageIndex=1&mid=${MID.collection}`,
      })
    }
    pageSizes.push(n)
    if (n === prev) break     // 누적이라 더 안 늘면 끝
    prev = n
  }
  return { records: [...seen.values()], pagesFetched: pageSizes.length }
}

const main = async () => {
  ctx.log('시작', nowKSTStamp())

  // ① 대분류 4개 + 한 줄 설명
  const top = await ctx.post(`${COL_BASE}/CollectionTopMenu.do?mid=${MID.collection}&limit=10&page=1`, '', 'topmenu')
  const topMenu = top
    ? [...top.matchAll(/<a class="out-red" href="CollectionView\.do\?col_id=(\d+)">[\s\S]*?<strong>([\s\S]*?)<\/strong>[\s\S]*?<p>([\s\S]*?)<\/p>/g)]
      .map(m => ({ colId: +m[1], title: stripTags(m[2]), summary: stripTags(m[3]) }))
    : []
  ctx.log(`대분류 ${topMenu.length}개`)

  // ② col_id 스캔
  const items = []
  const missing = []
  let navi = []
  for (let c = 1; c <= MAX_COL; c++) {
    const html = await ctx.get(`${COL_BASE}/CollectionView.do?col_id=${c}&mid=${MID.collection}`, `col${c} view`)
    if (!html) { missing.push({ colId: c, reason: '요청 실패' }); continue }
    const title = titleOf(html)
    if (!title) { missing.push({ colId: c, reason: 'document.title 의 컬렉션명이 비어 있다 — 존재하지 않는 col_id' }); continue }
    if (!navi.length) navi = parseNavi(html)
    const parsed = parseCollectionPage(html)
    const mem = await membership(c)
    items.push({
      colId: c, title, ...parsed,
      recordCount: mem.records.length,
      records: mem.records,
      pagesFetched: mem.pagesFetched,
      pageUrl: `${COL_BASE}/CollectionView.do?col_id=${c}&mid=${MID.collection}`,
    })
    ctx.log(`  col${c} ${title} — 사료 ${mem.records.length}건`)
  }

  // ③ 계층 붙이기(내비 기준)
  const naviById = new Map(navi.map(n => [n.colId, n]))
  for (const it of items) {
    const n = naviById.get(it.colId)
    it.isTopLevel = n ? n.isTopLevel : null
    it.parentColId = n ? n.parentColId : null
    it.children = navi.filter(x => x.parentColId === it.colId).map(x => x.colId)
    it.inNavi = !!n
    const t = topMenu.find(x => x.colId === it.colId)
    it.summary = t ? t.summary : null
  }

  const allIds = items.flatMap(i => i.records.map(r => r.iId))
  const museum = loadMuseumIds()
  const overlap = overlapReport(allIds, museum)

  // 총건수: 사이트가 컬렉션 코너 전체의 '총 N건'을 표시하지 않는다 — 지어내지 않는다.
  const uniqueRecords = new Set(allIds).size

  /* ★ 컨테이너 판정 — col_id 1 「컬렉션콘텐츠」는 컬렉션이 아니라 **상위 컨테이너**다.
       근거 3가지가 모두 같은 방향을 가리킨다(실측):
         ① 내비게이션 트리에 없다(inNavi=false) — 나머지 13개는 전부 있다.
         ② 계층이 없다(isTopLevel=null · parentColId=null · children 0) — 대분류 4개는 top,
            소분류 9개는 parent 를 갖는다.
         ③ 소속 사료가 다른 13개의 합집합 전량이다(고유 사료 수와 같다).
       그래서 total 을 「실제 컬렉션 수」로 두고 컨테이너는 따로 센다. 14 를 그대로 인용하면
       컨테이너를 컬렉션 하나로 세게 된다(기획서가 실제로 그렇게 적고 있었다). */
  const isContainer = (it) =>
    !it.inNavi && it.isTopLevel == null && it.parentColId == null && (it.children?.length ?? 0) === 0
    && new Set(it.records.map(r => r.iId)).size === uniqueRecords
  const containers = items.filter(isContainer)
  const collections = items.filter(it => !isContainer(it))

  /* ★ 수집일 확정 — 캐시에서만 읽었으면 그 캐시가 쓰인 때가 실제 수집 시각이다.
       실행 시각을 찍으면 네트워크를 0회 치고도 수집일이 앞으로 밀린다(as-of 규약 위반). */
  const stamped = stampCollected(ctx, args)
  ctx.log(`수집일 ${stamped.date} (${stamped.forced ? '--collected-at 지정' : stamped.observed ? '캐시·요청 실측 최댓값' : '실측 불가 — 폴백'})`)
  const envelope = {
    source: '통일부 남북이산가족 디지털박물관 — 컬렉션',
    corner: '컬렉션',
    url: PAGE_URL,
    collectedAt: args.collectedAt,
    collectedAtStamp: args.collectedAtStamp,
    /* total = **실제 컬렉션 수**(컨테이너 제외). 스캔으로 실재가 확인된 col_id 는 scannedFound 다. */
    total: collections.length,
    containers: containers.length,
    scannedFound: items.length,
    totalEvidence:
      '★ 사이트가 컬렉션 코너의 총건수를 표시하지 않는다(총N건 문구 없음). ' +
      `여기의 total 은 col_id 1..${MAX_COL} 을 전수 스캔해 실재가 확인된 ${items.length}개 가운데 ` +
      `상위 컨테이너 ${containers.length}개(${containers.map(c => `col_id ${c.colId} 「${c.title}」`).join(', ') || '없음'})를 뺀 ` +
      `실제 컬렉션 ${collections.length}개다 — 사이트 표시값이 아니라 실측 스캔값이다. ` +
      `인용할 때는 「컬렉션 ${collections.length}개(+상위 컨테이너 ${containers.length}개)」로 갈라 적을 것.`,
    items,
    meta: {
      containerJudgement: {
        rule: '내비 트리에 없고(inNavi=false) 계층이 없으며(isTopLevel=null·parent=null·children 0) 소속 사료가 전체 고유 사료와 같은 col_id 는 컬렉션이 아니라 상위 컨테이너로 본다.',
        containers: containers.map(c => ({
          colId: c.colId, title: c.title, recordCount: c.recordCount,
          why: `내비 트리에 없고 계층이 없으며 소속 사료 ${c.recordCount}건이 전체 고유 사료 ${uniqueRecords}건과 같다`,
        })),
        collections: collections.length,
        topLevel: collections.filter(c => c.isTopLevel).length,
        sub: collections.filter(c => c.isTopLevel === false).length,
        note: `total 은 ${collections.length}이고 스캔으로 발견된 col_id 는 ${items.length}개다. 두 값을 섞어 「컬렉션 ${items.length}개」라고 쓰면 컨테이너를 컬렉션으로 세게 된다.`,
      },
      scannedColIdRange: `1..${MAX_COL}`,
      collectionsFound: items.length,
      colIdsFound: items.map(i => i.colId),
      colIdsMissing: missing,
      topMenu,
      hierarchy: navi,
      uniqueRecords,
      membershipTotal: allIds.length,
      recordsInMultipleCollections: allIds.length - uniqueRecords,
      withDescription: items.filter(i => i.description).length,
      withHashtags: items.filter(i => i.hashtags.length).length,
      withCover: items.filter(i => i.coverImage).length,
      distinctCoverImages: [...new Set(items.map(i => i.coverImage).filter(Boolean))],
      coverImageNote:
        '★ 실측 정정 — 커버 이미지는 컬렉션마다 다르지 않다. 14개 전부가 같은 파일 ' +
        'collection_stuff_03.jpg 를 쓴다(col_id 1~15 전수 확인). ' +
        '탐사 메모의 collection_stuff_0N.jpg 라는 표기는 여러 장이 있다는 뜻으로 읽히지만 실제로는 한 장뿐이다 — ' +
        '컬렉션별 대표 이미지로 화면에 쓸 수 없다. 대표 이미지가 필요하면 소속 사료의 썸네일을 써야 한다.',
      hasRegionField: false,
      regionNote:
        '전용 지역 필드가 없다. 컬렉션 이름 중 「고향그림」·「면지」가 고향과 맞닿아 있으나 도명이 아니다. ' +
        '고향 축 매핑은 여기서 하지 않고 통합 단계로 넘긴다.',
      overlapWithMuseumJson: overlap,
      valueAddNote:
        '★ 새 사료 0건이다(215건 전량 museum.json 안에 있다). 이 수집이 새로 얻는 것은 ' +
        '① 컬렉션별 설명문 ② 해쉬태그(소분류로 가는 링크) ③ 대분류-소분류 부모자식 관계 ④ 커버 이미지 URL 이다. ' +
        '기록 밀도 분자를 건드리지 않는다.',
      endpoints: {
        topMenu: { method: 'POST', url: `${COL_BASE}/CollectionTopMenu.do?mid=${MID.collection}&limit=10&page=1` },
        collectionView: `${COL_BASE}/CollectionView.do?col_id={col_id}&mid=${MID.collection}`,
        collectionList: {
          method: 'POST', url: `${COL_BASE}/CollectionViewList.do?mid=${MID.collection}`,
          body: 'col_id={col_id}&pageIndex={p}', pageSize: 6, cumulative: true,
          endDetection: "'더 보기 +' 버튼은 끝에서도 남아 있어 못 쓴다 — 링크 수가 더 늘지 않을 때 끝으로 본다.",
        },
        record: `${COL_BASE}/CollectionRecord.do?i_id={i_id}&col_id={col_id}&pageIndex=1&mid=${MID.collection}`,
      },
      media: '커버·썸네일 URL 만 기록한다. 바이너리는 내려받지 않는다.',
      license: LICENSE_NOTE,
      failed: ctx.failed,
      network: ctx.net,
      note: 'as-of: 수집일은 collectedAt. 컬렉션 자체에는 기준일 표기가 없다 — 사이트가 주지 않는 날짜를 만들어 넣지 않았다.',
    },
  }
  ctx.finish()
  const out = writeEnvelope('reunion-collection.json', envelope)
  ctx.log(`저장 ${out} — 컬렉션 ${collections.length}개(+상위 컨테이너 ${containers.length}개) · 고유 사료 ${uniqueRecords}건, 실패 ${ctx.failed.length}건`)
}

main().catch(e => { ctx.finish(); console.error('✗', e.message); process.exit(1) })
