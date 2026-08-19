// 박물관 코너 목록 — 「빠짐없이, 그러나 헤매지 않게」
//
// 왜 필요한가: 디지털박물관은 컬렉션 외에도 손편지·가족이야기·카드이야기·시간여행·
//   연표·기증현황 코너를 따로 둔다. 우리 화면이 컬렉션만 보여주면 나머지가 통째로
//   사라진다(사용자 지시: "정보가 빠지는게 있으면 안되고").
//
// 무엇을 담고 무엇을 담지 않는가:
//   · 컬렉션 14종은 우리가 실제 수집했으므로 **건수와 표지 사진**까지 낸다.
//   · 나머지 코너는 목록이 JS 로 그려져 외부에서 셀 수 없다(실측: HTML 에 항목 0).
//     그래서 **건수를 지어내지 않고** 이름·설명·링크만 낸다. 모르는 것은 비운다.
//
//   node scripts/nk-museum-sections.mjs
//   → 북한자료-api/museum-sections.json

import fs from 'node:fs'
import path from 'node:path'

const API = path.resolve('북한자료-api')
const OUT = path.join(API, 'museum-sections.json')
const BUILT_AT = (process.argv.find(a => a.startsWith('--built-at=')) || '').split('=')[1]
  || new Date().toISOString().slice(0, 10)

const M = JSON.parse(fs.readFileSync(path.join(API, 'museum.json'), 'utf8'))
const B = 'https://reunion.unikorea.go.kr/reuni/home/museum'

/* 컬렉션 표지 — 그 컬렉션에 실제로 속한 사료 중 사진류를 먼저 고른다.
   사진이 아니라 지도·문서류가 표지가 되면 카드가 무슨 뜻인지 읽히지 않는다. */
const byCol = new Map()
for (const r of M.records) {
  for (const c of (r.colIds?.length ? r.colIds : [r.colId]).filter(Boolean)) {
    if (!byCol.has(c)) byCol.set(c, [])
    byCol.get(c).push(r)
  }
}
const fileIdOf = r => Number((String(r.imageUrl || '').match(/file_id=(\d+)/) || [])[1]) || null
const coverOf = (colId) => {
  const rs = (byCol.get(colId) || []).filter(r => r.imageUrl)
  const photo = rs.find(r => /사진/.test(r.form || ''))
  const pick = photo || rs[0]
  return pick ? { fileId: fileIdOf(pick), title: pick.title, recordUrl: pick.recordUrl } : null
}

/* 컬렉션 1번은 「컬렉션콘텐츠」로 전체를 한 번 더 담고 있는 상위 묶음이다.
   화면에 같은 것이 두 번 나오지 않게 뺀다(실측: 215건 전체가 여기에도 속함). */
const SKIP_COL = new Set([1])

const collections = M.collections
  .filter(c => !SKIP_COL.has(c.colId) && c.count > 0)
  .map(c => ({
    kind: 'collection',
    id: `col-${c.colId}`,
    title: c.title,
    count: c.count,
    cover: coverOf(c.colId),
    url: `${B}/archive/collection/CollectionView.do?col_id=${c.colId}&mid=SM00000263`,
  }))
  .sort((a, b) => b.count - a.count)

/* 코너 — 건수는 비운다. 외부에서 셀 수 없는 것을 세었다고 적으면 안 된다. */
const corners = [
  { id: 'letter', title: '손편지', what: '언젠가 받을 수 있으리라 기대하며 써 내려온 편지',
    url: `${B}/archive/letter/HandLttr.do?mid=SM00000262` },
  { id: 'family', title: '가족이야기', what: '만남의 기쁨과 그리움을 당사자가 직접 들려주는 이야기',
    url: `${B}/archive/family/FmlyStory.do?mid=SM00000266` },
  { id: 'card', title: '카드이야기', what: '이산가족에 대해 궁금했던 것을 카드뉴스로 정리한 코너',
    url: `${B}/archive/family/CardStory.do?mid=SM00000267` },
  { id: 'archive', title: '기록관', what: '기증된 기록물을 형태별로 모아 놓은 곳',
    url: `${B}/archive/FrmRecord.do?mid=SM00000264` },
  { id: 'time', title: '시간여행', what: '이산의 시간을 따라가며 보는 코너',
    url: `${B}/TimeTravel.do?mid=SM00000270` },
  { id: 'year', title: '연표', what: '이산가족 관련 주요 사건을 연도순으로',
    url: `${B}/Yearbook.do?mid=SM00000276` },
  { id: 'donate', title: '기증현황', what: '어떤 자료를 어떻게 맡길 수 있는지 안내',
    url: `${B}/archive/DonationInfo.do?mid=SM00000265` },
].map(c => ({ kind: 'corner', count: null, cover: null, ...c }))

const out = {
  builtAt: BUILT_AT,
  source: {
    name: '통일부 남북이산가족 디지털박물관',
    url: `${B}/view.do?gubn=A&mid=SM00000261`,
    note: '컬렉션 건수·표지는 museum.json 실측. 코너는 목록이 스크립트로 그려져 외부에서 셀 수 없어 건수를 비웠다.',
  },
  totalRecords: M.archive?.totCnt ?? M.records.length,
  collections,
  corners,
  meta: {
    skippedCollections: [...SKIP_COL],
    skipReason: '컬렉션콘텐츠(col_id=1)는 전체를 한 번 더 담는 상위 묶음이라 화면 중복을 피해 제외',
    coversResolved: collections.filter(c => c.cover?.fileId).length,
  },
}
fs.writeFileSync(OUT, JSON.stringify(out), 'utf8')

console.log('═'.repeat(60))
console.log(` 컬렉션 ${collections.length}종 (표지 ${out.meta.coversResolved}종) · 코너 ${corners.length}종`)
collections.forEach(c => console.log(`   ${String(c.count).padStart(4)}건  ${c.title}${c.cover?.fileId ? '' : '  ← 표지 없음'}`))
console.log(` 총 공개 사료 ${out.totalRecords.toLocaleString()}건`)
console.log(` → ${OUT}  (${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`)
