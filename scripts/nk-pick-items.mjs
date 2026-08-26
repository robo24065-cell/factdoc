#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   참여(/pick) 항목 데이터 생성 — 음식 16 · 풍경 16 · 북녘 말 16

   왜 스크립트인가
     풍경은 북한자료-api/htgallery.json(이산가족정보통합시스템 「나의 살던 고향은」 실측),
     말은 북한자료-api/wordCmp.json(통일부 남북한언어비교 21,985쌍)에서 뽑는다.
     소스가 갱신되면 이 스크립트를 다시 돌려 검증·재생성한다 — 화면 코드에
     수치를 하드코딩하지 않기 위한 장치다. 검증에 실패하면(항목이 소스에 없으면)
     산출물을 쓰지 않고 종료 코드 1 로 죽는다.

   출처 구분 원칙 (절대규칙 — 섞지 않는다)
     · 말      = 통일부 공공데이터 그 자체 (wordCmp.json 원문 그대로) → attribution.kind='mou'
     · 풍경    = 통일부 사이트 게재 사진이지만 **저작권자는 제공처**    → attribution.kind='site'
                 (이미지는 내려받지 않는다 — URL 만 기록, 제공처 화면 표시 의무)
     · 음식    = 지역 귀속이 향토음식 문헌의 문화적 통설, 통일부 자료 아님 → attribution.kind='folk'

   지역 축은 광복 당시 구행정구역 7종(map.json regionsOld) 하나뿐이다.
   말(문화어↔표준어)은 지역 방언이 아니므로 지역 축을 갖지 않는다(nonRegional).

   사용법: node scripts/nk-pick-items.mjs
   산출:   frontend/src/data/pick-items.json
   ────────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'))

const gallery = read('북한자료-api/htgallery.json')
const wordSrc = read('북한자료-api/wordCmp.json')
const map = read('frontend/public/gohyang/map.json')

/* 고향 이름 → id (map.json regionsOld 가 단일 진실 소스 — 새 대응을 만들지 않는다) */
const regionId = new Map(map.regionsOld.map((r) => [r.name, r.id]))
const regionIds = map.regionsOld.map((r) => r.id)

const fail = (msg) => { console.error('✗ ' + msg); process.exitCode = 1 }

/* ══════════ 음식 16종 — 전 항목 웹 문헌으로 귀속 확인(2026-08-25 조사) ══════════
   출처를 확인하지 못한 후보(온면·동지죽·연안식 순대)는 넣지 않았다.
   desc 는 감정 연출 없는 한 줄 사실 서술. basis 는 귀속 근거·한계. */
const FOODS = [
  { id: 'food-pyeongyang-naengmyeon', name: '평양냉면', region: '평안남도(구)',
    desc: '메밀 사리에 차게 식힌 고기 국물과 동치미 국물을 부어 낸 평양의 국수',
    basis: '향토음식 통설(평양)', source: 'https://encykorea.aks.ac.kr/Article/E0059956', sourceName: '한국민족문화대백과사전' },
  { id: 'food-eobok-jaengban', name: '어복쟁반', region: '평안남도(구)',
    desc: '놋쟁반에 소 편육과 버섯·달걀을 둘러 담고 육수를 부어 여럿이 함께 먹는 평양 음식',
    basis: '향토음식 통설(평양)', source: 'https://www.seouland.com/arti/culture/culture_general/3326.html', sourceName: '서울&(한겨레)' },
  { id: 'food-chalgangnaengi-tteok', name: '찰강냉이떡', region: '평안북도(구)',
    desc: '찰옥수수 가루로 쳐서 만드는 의주·벽동 지방의 떡',
    basis: '향토음식 통설(의주·벽동)', source: 'https://lampcook.com/food_story/northfood_story_view.php?idx_no=2-2', sourceName: '램프쿡 북한전통음식(평안북도)' },
  { id: 'food-ganggye-guksu', name: '강계 느릅쟁이국수', region: '평안북도(구)',
    desc: '느릅나무 즙 가루를 옥수수·메밀가루에 섞어 눌러 낸 강계·만포의 질긴 국수',
    basis: '강계·만포는 현행 자강도 — 자강도는 1949년 신설, 광복 당시에는 평안북도',
    source: 'https://lampcook.com/food_story/northfood_story_view.php?idx_no=2-4', sourceName: '램프쿡 북한전통음식(자강도)' },
  { id: 'food-hamhung-naengmyeon', name: '함흥냉면(농마국수)', region: '함경남도(구)',
    desc: '감자 녹말로 뽑아 발이 가늘고 질긴 함흥의 국수 — 본래 회를 얹은 회국수',
    basis: '향토음식 통설(함흥)', source: 'https://encykorea.aks.ac.kr/Article/E0062286', sourceName: '한국민족문화대백과사전' },
  { id: 'food-gajami-sikhae', name: '가자미식해', region: '함경남도(구)',
    desc: '가자미에 조밥·엿기름·무채·고춧가루를 섞어 삭힌 함남 해안(신포·홍원·단천)의 밥반찬',
    basis: '향토음식 통설(함남 해안)', source: 'https://encykorea.aks.ac.kr/Article/E0000318', sourceName: '한국민족문화대백과사전' },
  { id: 'food-myeongtae-sundae', name: '명태순대(동태순대)', region: '함경북도(구)',
    desc: '명태 속을 비우고 소를 채워 쪄 낸 함경도·강원 동해안 북부의 겨울 음식',
    basis: '통설은 「함경도 동해안」 — 명태 이름이 함북 명천 유래(임하필기)라 함북 축에 두되 한계를 남긴다',
    source: 'https://encykorea.aks.ac.kr/Article/E0016834', sourceName: '한국민족문화대백과사전' },
  { id: 'food-yeongchae-kimchi', name: '영채김치', region: '함경북도(구)',
    desc: '갓 계통 영채로 담가 누르스름하고 맵고 상쾌한 길주·명천의 김치',
    basis: '향토음식 통설(길주·명천)', source: 'http://lampcook.com/food_story/northfood_story_view.php?idx_no=2-5', sourceName: '램프쿡 북한전통음식(함경북도)' },
  { id: 'food-haeju-bibimbap', name: '해주비빔밥(해주교반)', region: '황해도(구)',
    desc: '돼지기름에 볶은 밥에 수양산 고사리와 옹진 김을 얹는 해주의 비빔밥',
    basis: '해동죽지에 해주 명물로 기록', source: 'https://encykorea.aks.ac.kr/Article/E0079943', sourceName: '한국민족문화대백과사전' },
  { id: 'food-kimchi-mari', name: '김치말이', region: '황해도(구)',
    desc: '차게 식힌 김칫국물에 밥이나 국수를 말아 먹는 황해도 주식',
    basis: '황해도 주식류 통설 — 평안도에도 같은 이름의 음식이 있다',
    source: 'https://www.lampcook.com/food/food_city10.php', sourceName: '램프쿡 북한전통음식(황해도)' },
  { id: 'food-nammae-juk', name: '남매죽', region: '황해도(구)',
    desc: '팥죽에 밀가루 반죽을 떼어 넣어 곡물과 팥을 함께 끓이는 황해도 죽',
    basis: '황해도 주식류 통설', source: 'https://www.lampcook.com/food/food_city10.php', sourceName: '램프쿡 북한전통음식(황해도)' },
  { id: 'food-joraengi-tteokguk', name: '조랭이떡국', region: '미수복경기',
    desc: '가래떡을 대나무칼로 눌러 누에고치 모양으로 빚어 끓이는 개성의 설 떡국',
    basis: '향토음식 통설(개성)', source: 'https://ncms.nculture.org/food/story/1756', sourceName: '지역N문화(한국문화원연합회)' },
  { id: 'food-gaeseong-pyeonsu', name: '개성편수', region: '미수복경기',
    desc: '소를 다지지 않고 채 쳐 넣어 네모지게 빚는 개성의 여름 만두',
    basis: '향토음식 통설(개성)', source: 'https://encykorea.aks.ac.kr/Article/E0059843', sourceName: '한국민족문화대백과사전' },
  { id: 'food-gaeseong-juak', name: '개성주악(우메기)', region: '미수복경기',
    desc: '찹쌀 반죽을 기름에 지져 꿀에 재우는 개성의 폐백·이바지 과줄',
    basis: '향토음식 통설(개성)', source: 'https://www.munhwa.com/article/11508070', sourceName: '문화일보' },
  { id: 'food-geumgang-jatjuk', name: '금강잣죽', region: '미수복강원',
    desc: '쌀에 잣을 섞어 쑤는 금강·고성 지방의 죽',
    basis: '향토음식 통설(금강·고성)', source: 'https://www.lampcook.com/food_story/northfood_story_view.php?idx_no=2-8', sourceName: '램프쿡 북한전통음식(강원도)' },
  { id: 'food-goseong-haesamtang', name: '고성 해삼탕', region: '미수복강원',
    desc: '금강산 앞바다 고성에서 나는 해삼으로 끓이는 지방 특산 국',
    basis: '고성군은 광복 당시 강원도 — 현재 남북으로 갈려 있다',
    source: 'https://www.lampcook.com/food_story/northfood_story_view.php?idx_no=2-8', sourceName: '램프쿡 북한전통음식(강원도)' },
]

/* ══════════ 풍경 16선 — htgallery.json 실측분에서 fileId 로 뽑는다 ══════════
   선정 기준: ① oldRegion 확정분만 ② 7종 축 균형(전 축 2장 + 계승 1·2순위 축 1장 추가)
   ③ 제공처 표기가 있는 것만(화면 표시 의무) ④ 인물이 주제인 사진 제외. */
const SCENERY_IDS = [
  'F000280740', 'F000280220', 'F000280345',   // 평안북도(구) — 계승 1순위라 3장
  'F000280733', 'F000280241',                 // 평안남도(구)
  'F000280741', 'F000280201',                 // 함경남도(구)
  'F000280192', 'F000280248',                 // 함경북도(구)
  'F000280285', 'F000280717', 'F000280218',   // 황해도(구) — 계승 2순위라 3장
  'F000280226', 'F000280207',                 // 미수복경기
  'F000280277', 'F000280204',                 // 미수복강원
]
/* 명소명 표기 — 원문 캡션의 한자 병기를 화면용으로 다듬은 것. 원문은 caption 에 남는다 */
const SCENERY_LABELS = {
  F000280740: '청천강 승리다리(박천군)',
  F000280220: '묘향산 불영대(향산군)',
  F000280345: '영변읍성 육승정',
  F000280733: '대동강에 비친 석양(평양)',
  F000280241: '대동문(평양)',
  F000280741: '함흥 성천교와 만세교',
  F000280201: '백두산(삼지연)',
  F000280192: '칠보산(명천군)',
  F000280248: '두만강 상류(무산군)',
  F000280285: '구월산 전경',
  F000280717: '몽금포 전경',
  F000280218: '수양산성(해주)',
  F000280226: '선죽교(개성)',
  F000280207: '박연폭포(개성)',
  F000280277: '금강산 삼일포',
  F000280204: '금강산 해금강(고성군)',
}

const sceneries = SCENERY_IDS.map((fid) => {
  const it = (gallery.items ?? []).find((x) => x.fileId === fid)
  if (!it) { fail(`풍경 ${fid} 이 htgallery.json 에 없다`); return null }
  if (!it.oldRegion) { fail(`풍경 ${fid} 의 고향 축이 미확정(oldRegion:null)이다 — 토너먼트에 넣을 수 없다`); return null }
  if (!it.provider) { fail(`풍경 ${fid} 에 제공처 표기가 없다 — 화면 표시 의무를 지킬 수 없다`); return null }
  if (!regionId.has(it.oldRegion)) { fail(`풍경 ${fid} 의 축 「${it.oldRegion}」 이 map.json regionsOld 에 없다`); return null }
  return {
    id: 'scene-' + fid,
    fileId: fid,
    name: SCENERY_LABELS[fid] ?? it.placeName,
    caption: it.caption,
    region: it.oldRegion,
    regionId: regionId.get(it.oldRegion),
    regionBasis: it.oldRegionBasis,
    provider: it.provider,
    thumbUrl: it.thumbUrl,
    viewUrl: it.viewUrl,
    sourceUrl: it.sourceUrl,
  }
}).filter(Boolean)

/* ══════════ 북녘 말 16쌍 — wordCmp.json 원문에 있는 것만 통과 ══════════
   문화어↔표준어 대응이지 지역 방언이 아니다 — 고향 축 매핑 금지(nonRegional). */
const WORD_PICKS = [
  ['도시락', '곽밥'], ['누룽지', '가마치'], ['노크', '손기척'], ['젤리', '단묵'],
  ['도넛', '가락지빵'], ['주스', '과일단물'], ['수제비', '뜨더국'], ['달걀', '닭알'],
  ['거위', '게사니'], ['원피스', '달린옷'], ['주차장', '차마당'], ['헬리콥터', '직승기'],
  ['볼펜', '원주필'], ['골키퍼', '문지기'], ['어묵', '물고기떡'], ['에스컬레이터', '계단승강기'],
]
const wordItems = wordSrc.items ?? wordSrc
const words = WORD_PICKS.map(([ko, nk]) => {
  const hit = wordItems.find((i) => String(i.koword).trim() === ko && String(i.nkword).trim() === nk)
  if (!hit) { fail(`말 「${ko}↔${nk}」 쌍이 wordCmp.json 에 없다`); return null }
  return { id: 'word-' + hit._pk, ko, nk, pk: hit._pk }
}).filter(Boolean)

/* ══════════ 검증 — 실패하면 산출물을 쓰지 않는다 ══════════ */
if (FOODS.length !== 16) fail(`음식이 16이 아니라 ${FOODS.length}`)
if (sceneries.length !== 16) fail(`풍경이 16이 아니라 ${sceneries.length}`)
if (words.length !== 16) fail(`말이 16이 아니라 ${words.length}`)
for (const f of FOODS) {
  if (!regionId.has(f.region)) fail(`음식 ${f.name} 의 축 「${f.region}」 이 map.json regionsOld 에 없다`)
  if (!f.source) fail(`음식 ${f.name} 에 출처가 없다 — 출처를 못 대는 항목은 버린다`)
}
/* 7종 축이 음식·풍경 모두에서 최소 2번씩 나오는지 — 지역 균형 규약 */
for (const list of [FOODS, sceneries]) {
  const cnt = new Map(regionIds.map((i) => [i, 0]))
  for (const it of list) cnt.set(regionId.get(it.region), (cnt.get(regionId.get(it.region)) ?? 0) + 1)
  for (const [id, n] of cnt) if (n < 2) fail(`축 ${id} 의 항목이 ${n}개 — 최소 2개`)
}
if (process.exitCode) process.exit(process.exitCode)

const out = {
  builtAt: new Date().toISOString().slice(0, 10),
  generator: 'scripts/nk-pick-items.mjs',
  note: '참여(/pick) 월드컵 항목. 말은 통일부 공공데이터 원문, 풍경은 통일부 게재·제공처 저작(이미지 비보관), 음식 지역 귀속은 문화적 통설이며 통일부 공표 자료가 아니다 — 화면에서 이 셋을 섞지 않는다.',
  regionsOld: map.regionsOld.map((r) => ({ id: r.id, name: r.name })),
  crosswalkNote: gallery.meta?.crosswalkNote ?? null,
  foods: FOODS.map((f) => ({
    ...f,
    regionId: regionId.get(f.region),
    attribution: { kind: 'folk', label: '문화적 통설 · 통일부 자료 아님' },
  })),
  sceneries: sceneries.map((s) => ({
    ...s,
    attribution: {
      kind: 'site',
      label: `제공: ${s.provider}`,
      note: '통일부 이산가족정보통합시스템 「나의 살던 고향은」 게재 · 저작권은 제공처에 있음 · 이미지 비보관(원본 직결)',
    },
  })),
  words: {
    nonRegional: true,
    note: '문화어-표준어 대응(통일부 「남북한 언어비교」 21,985쌍) — 지역 방언이 아니므로 고향 축을 붙이지 않는다.',
    source: 'https://www.data.go.kr/data/15151340/openapi.do',
    total: wordItems.length,
    attribution: { kind: 'mou', label: '통일부 공공데이터 「남북한 언어비교」' },
    pairs: words,
  },
  gallerySource: { url: gallery.url ?? null, collectedAt: gallery.collectedAt ?? null },
}

/* .ts 로 굽는 이유: tsconfig 가 resolveJsonModule 없이 운용되고 있어(기존 코드 무접촉 원칙)
   JSON import 대신 생성된 TS 모듈로 내보낸다. 손으로 고치지 말 것 — 이 스크립트가 재생성한다. */
const dest = path.join(root, 'frontend/src/data/pick-items.ts')
const banner = [
  '/* 자동 생성 파일 — 손으로 고치지 마라. scripts/nk-pick-items.mjs 가 재생성한다.',
  '   음식 16(문화적 통설·통일부 자료 아님) · 풍경 16(통일부 게재·저작권은 제공처·이미지 비보관)',
  '   · 북녘 말 16(통일부 「남북한 언어비교」 원문). 지역 축은 map.json regionsOld 7종. */',
  '',
].join('\n')
fs.writeFileSync(dest, banner + 'const data = ' + JSON.stringify(out, null, 1) + '\n\nexport default data\n', 'utf8')
console.log(`✓ ${path.relative(root, dest)} — 음식 ${FOODS.length} · 풍경 ${sceneries.length} · 말 ${words.length}`)
