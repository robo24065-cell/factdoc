#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   AI 스튜디오 정적 검증 — 브라우저 없이 산출 규칙 자체를 잰다

   무엇을 재는가
     [1] 사료 분류 — htgallery 129장 전수: 전 항목 정확히 1갈래 · 합 129 ·
         생성물(studio-photos.ts)이 분류기(engine/nk-studio.mjs) 현행과 글자 단위 일치
     [2] 템플릿 결정성 — 고정 입력 = 고정 출력(두 번 돌려 JSON 일치), 이야기 경로·
         풍경 중심 경로 둘 다
     [3] 산출 내용 — 지역·비율·분위기 절이 프롬프트에 실리고, 자유 입력은 번역하지
         않고 원문 그대로 + 영문 꼬리 표기 · 장면 수가 비율 표와 맞는다
     [4] 다듬기 검증 — validateStudio 가 입력에 없는 숫자·스키마 밖 출력을 폐기한다
     [5] 플랫폼 안내 — 「2026년 8월 기준」 존재 · 가격/해상도/초 단위 스펙 단정 0
         (숫자 토큰이 2026·8 뿐이어야 한다)
     [6] 이모지 0 — 스튜디오 신규 파일 전부
     [7] /api/llm — kind 'studio' 등록 + JSON 파싱 게이트 + 프롬프트 닫힌 스키마 문구
     [8] 정밀 프롬프트 — 7블록 라벨이 순서대로 · 8구획 값이 전부 실림 · 정밀/간단 두 판 ·
         시드 결정성 · 사료 제목 원문 보존 · 어휘 금고 밖 낱말 0 · 사료 밖 고유명사 0 ·
         네거티브 30항목 순서 · 장면 초 합계 · 재현성 과잉 주장 금칙어 · 다듬기 페이로드에 촬영값 0

   사용법: node scripts/verify-studio.mjs
   나가는 값: 전부 통과 0 · 실패 1
   ────────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  classifyRelic, RELIC_CATS, buildStudioOutput, validateStudio,
  STUDIO_REGIONS, STUDIO_LINE_BADGES,
  PLATFORM_GUIDE, STUDIO_PROMPT, STUDIO_NOTICES, LENGTH_GUIDE,
  STUDIO_BLOCK_HEADS, STUDIO_BLOCK_ORDER, STUDIO_SOURCE_LABELS, STUDIO_SPEC_SECTIONS,
  RELIC_SCENE, RELIC_SCENE_GLUE_KO, RELIC_SCENE_GLUE_EN,
  NEG_COMMON_KO, NEG_COMMON_EN, NEG_SWAP, STUDIO_REPRO_TOOLS,
  renderStudioPrompt, studioSeed, applyStudioRefine,
} from '../frontend/src/engine/nk-studio.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const check = (name, pass, detail = '') => {
  results.push(Boolean(pass))
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`)
}

/* ══════════ [1] 사료 분류 ══════════ */
console.log('▶ 사료 분류 (htgallery → studio-photos.ts)')
{
  const reunion = JSON.parse(fs.readFileSync(path.join(root, 'frontend/public/gohyang/reunion.json'), 'utf8'))
  const src = reunion.htgallery.items
  const catIds = new Set(RELIC_CATS.map((c) => c.id))
  const live = src.map((it) => ({ fileId: it.fileId, cat: classifyRelic(it.fileId, it.placeName) }))
  check('원천 129장', src.length === 129, `${src.length}`)
  check('전 항목이 5갈래 중 정확히 1갈래', live.every((r) => catIds.has(r.cat)))

  const ts = fs.readFileSync(path.join(root, 'frontend/src/data/studio-photos.ts'), 'utf8')
  const gen = JSON.parse(ts.slice(ts.indexOf('const data = ') + 'const data = '.length, ts.indexOf('\n\nexport type')))
  check('생성물 총계 = 129 · 항목 수 일치', gen.total === 129 && gen.items.length === 129, `${gen.total}/${gen.items.length}`)
  const genBy = new Map(gen.items.map((r) => [r.fileId, r.category]))
  const drift = live.filter((r) => genBy.get(r.fileId) !== r.cat)
  check('생성물이 분류기 현행과 일치(재생성 필요 없음)', drift.length === 0, drift.map((d) => d.fileId).join(',').slice(0, 80))
  const sum = Object.values(gen.counts).reduce((a, b) => a + b, 0)
  check('갈래별 건수 합 = 129', sum === 129, JSON.stringify(gen.counts))
  check('전 항목에 원문 링크·제공처·썸네일 주소', gen.items.every((r) => r.sourceUrl && r.provider && r.thumbUrl))
}

/* ══════════ [2][3] 템플릿 결정성·내용 ══════════ */
console.log('▶ 템플릿 조립 (buildStudioOutput)')
{
  const A = {
    medium: 'video', ratio: '16:9',
    region: { kind: 'old', id: 'hwanghae-old' },
    story: {
      sceneryOnly: false,
      picks: [
        { group: 'place', chipIds: ['well', 'market'], text: '겨울이면 우물이 얼어 새벽에 물을 길으셨다고 합니다' },
        { group: 'saying', chipIds: [], text: '고향 국수만 하겠니' },
        { group: 'photo', chipIds: [], text: '마당에서 찍은 흑백 사진이 한 장 있습니다' },
      ],
    },
    mood: 'bw-color',
    relics: [{ fileId: 'F000280717', name: '몽금포 전경', category: 'coast', provider: '미디어한국학', sourceUrl: 'https://reunion.unikorea.go.kr/x' }],
  }
  const B = {
    medium: 'photo', ratio: '1:1',
    region: { kind: 'unknown' },
    story: { sceneryOnly: true, picks: [] },
    mood: 'docu',
    relics: [],
  }
  const a1 = buildStudioOutput(A), a2 = buildStudioOutput(A)
  const b1 = buildStudioOutput(B), b2 = buildStudioOutput(B)
  check('결정성 — 같은 입력 = 같은 출력 (이야기 경로)', JSON.stringify(a1) === JSON.stringify(a2))
  check('결정성 — 같은 입력 = 같은 출력 (풍경 중심 경로)', JSON.stringify(b1) === JSON.stringify(b2))

  /* 시대는 폭으로 말한다 — 「1940년대」 단정은 사용자가 말한 적 없는 시대 창작이라 걷어냈다 */
  check('한글 프롬프트에 지역·비율·분위기·시대 폭(분단 이전~1950년대 초)',
    a1.promptKo.includes('황해도(구)') && a1.promptKo.includes('16:9')
    && a1.promptKo.includes('흑백에서 천천히')
    && a1.promptKo.includes('분단 이전') && a1.promptKo.includes('1950년대 초') && !a1.promptKo.includes('1940년대'))
  check('영문 프롬프트도 시대 단정 없음(from before the division to the early 1950s)',
    a1.promptEn.includes('from before the division to the early 1950s') && !a1.promptEn.includes('1940s'))
  check('영문 프롬프트에 지역·분위기 영문 절',
    a1.promptEn.includes('Hwanghae Province') && a1.promptEn.includes('blooming into color'))
  check('자유 입력은 번역하지 않고 원문 그대로 + 영문 꼬리 표기',
    a1.promptKo.includes('새벽에 물을 길으셨다고')
    && a1.promptEn.includes('새벽에 물을 길으셨다고')
    && a1.promptEn.includes('family story in Korean'))
  check('자주 하던 말은 따옴표 인용 1회', (a1.promptKo.match(/「고향 국수만 하겠니」/g) ?? []).length === 1)
  check('사료 캡션·갈래가 프롬프트와 사료 목록에 실린다',
    a1.promptKo.includes('몽금포 전경') && a1.relics.length === 1 && a1.relics[0].sourceUrl.includes('reunion'))
  check('영상 16:9 = 4장면 · 권장 길이 표와 일치',
    a1.scenes?.length === 4 && a1.lengthLine === '30~60초' && a1.compositions === null)
  const c11 = buildStudioOutput({ ...A, ratio: '1:1' })
  check('영상 1:1 = 3장면', c11.scenes?.length === 3)
  check('사진 = 구도 1~3안 · 장면 없음', b1.scenes === null && (b1.compositions?.length ?? 0) >= 1 && b1.compositions.length <= 3)
  check('본인 소장 사진 순서 구획(사진 속 장소 응답 시)', a1.ownPhotos !== null && a1.ownPhotos.order.length >= 3 && b1.ownPhotos === null)
  check('모름 지역은 「북녘」으로만 말한다(없는 지명 0 · 겹말 0)',
    b1.promptKo.includes('북녘의 옛 고향') && b1.promptEn.includes('hometown in the northern part of Korea')
    && !b1.promptKo.includes('고향의 옛 고향') && !b1.promptEn.includes('hometown in a hometown'))
  check('풍경 중심 경로 — 이야기 문장 없이도 전 구획 산출',
    b1.sceneryOnly && b1.promptKo.length > 0 && b1.promptEn.length > 0 && b1.lengthLine.length > 0)
}

/* ══════════ [4] 다듬기 검증 ══════════ */
console.log('▶ 다듬기 검증 (validateStudio)')
{
  const payload = { ko: '화면 비율 16:9. 1940년대 생활상.', en: 'Aspect ratio 16:9. The 1940s.', story: ['고향 국수만 하겠니'] }
  check('입력 숫자만 쓴 출력은 통과(원문도 그대로 남아 있을 때)',
    validateStudio({ ko: '비율 16:9, 1940년대. 「고향 국수만 하겠니」', en: 'ratio 16:9, the 1940s. "고향 국수만 하겠니"' }, payload) !== null)
  check('입력에 없는 숫자(연도 창작)는 통째로 폐기',
    validateStudio({ ko: '1953년의 고향.', en: 'in 1953.' }, payload) === null)
  check('스키마 밖(en 누락)은 폐기', validateStudio({ ko: '문장' }, payload) === null)
  check('이모지 섞인 출력은 폐기', validateStudio({ ko: '고향 🏠', en: 'home' }, payload) === null)

  /* ★ 이용자 원문 보존 — 다듬기가 닿는 블록이 하필 「저희가 고치지 않았습니다」라고 라벨 붙은 그 블록이다.
     아래 3건은 전부 숫자 검사·사료 제목 검사를 통과하던 실측 날조다. */
  const sp = { ko: '겨울이면 우물이 얼어 새벽에 물을 길으셨다고 합니다\n자주 하시던 말씀: 「고향 국수만 하겠니」',
    en: 'x', story: ['겨울이면 우물이 얼어 새벽에 물을 길으셨다고 합니다', '고향 국수만 하겠니'] }
  check('이용자 원문이 그대로 살아 있으면 통과',
    validateStudio({ ko: '겨울이면 우물이 얼어 새벽에 물을 길으셨다고 합니다. 「고향 국수만 하겠니」',
      en: 'Family story: "겨울이면 우물이 얼어 새벽에 물을 길으셨다고 합니다" and "고향 국수만 하겠니"' }, sp) !== null)
  check('말씀을 개작하면 폐기(「하겠니」→「하랴」)',
    validateStudio({ ko: '겨울이면 우물이 얼어 새벽에 물을 길으셨다고 합니다. 「고향의 국수만 하랴」',
      en: '겨울이면 우물이 얼어 새벽에 물을 길으셨다고 합니다 / 고향의 국수만 하랴' }, sp) === null)
  check('없는 인물을 지어 넣으며 원문을 갈아치우면 폐기(「어머니의 시린 손」)',
    validateStudio({ ko: '겨울 새벽마다 꽁꽁 언 우물을 깨고 물을 길어 오시던 어머니의 시린 손. 「고향 국수만 하겠니」',
      en: 'the cold hands of a mother' }, sp) === null)
  check('영문에서 한글 원문이 통째로 사라지면 폐기',
    validateStudio({ ko: '겨울이면 우물이 얼어 새벽에 물을 길으셨다고 합니다. 「고향 국수만 하겠니」',
      en: 'A story about drawing water from a frozen well at dawn.' }, sp) === null)
  check('story 가 비면 원문 검사는 건너뛴다(기존 경로 보존)',
    validateStudio({ ko: '고향 이야기.', en: 'A hometown story.' }, { ko: 'a', en: 'b', story: [] }) !== null)
}

/* ══════════ [5] 플랫폼 안내 ══════════ */
console.log('▶ 플랫폼 안내 (지어낸 스펙 0)')
{
  const flat = JSON.stringify(PLATFORM_GUIDE)
  check('「2026년 8월 기준」 문구가 있다', PLATFORM_GUIDE.asOfLine.includes('2026년 8월 기준'))
  const nums = (flat.match(/\d+/g) ?? []).filter((n) => n !== '2026' && n !== '8')
  check('숫자 토큰이 기준 연월뿐(요금·해상도·초 상한 단정 0)', nums.length === 0, nums.join(','))
  check('가격·해상도 표기 패턴 0', !/[0-9]\s*(원|달러|\$)|\d{3,4}\s*p/.test(flat))
  check('권장 길이 표는 별도 구획에 존재(플랫폼 안내와 분리)', LENGTH_GUIDE.length === 4)
}

/* ══════════ [6] 이모지 0 ══════════ */
console.log('▶ 이모지 0 (스튜디오 신규 파일)')
{
  const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u
  const files = [
    'frontend/src/engine/nk-studio.mjs',
    'frontend/src/engine/nk-studio.d.mts',
    'frontend/src/data/studio.ts',
    'frontend/src/data/studio-photos.ts',
    'frontend/src/lib/studioPrompt.ts',
    'frontend/src/pages/studio/Studio.tsx',
    'scripts/nk-studio-photos.mjs',
  ]
  const dirty = files.filter((f) => {
    const body = fs.readFileSync(path.join(root, f), 'utf8')
    /* 검증 파일 자체의 폐기 테스트 문자열은 없다 — 화면·데이터 파일만 잰다 */
    return EMOJI.test(body)
  })
  check('신규 파일 전부 이모지 0', dirty.length === 0, dirty.join(','))
}

/* ══════════ [7] /api/llm — studio kind ══════════ */
console.log('▶ /api/llm (kind studio)')
{
  const llm = fs.readFileSync(path.join(root, 'frontend/functions/api/llm.js'), 'utf8')
  check('STUDIO_PROMPT import + PROMPTS 등록', llm.includes('nk-studio.mjs') && /studio:\s*STUDIO_PROMPT/.test(llm))
  check('JSON 파싱 게이트(자유 문장 중계기 차단)', /kind === 'guide' \|\| kind === 'studio'/.test(llm))
  check('길이 상한 등록', /studio:\s*2000/.test(llm))
  check('프롬프트가 닫힌 스키마 {ko,en} 를 못박는다', STUDIO_PROMPT.includes('{"ko":"...","en":"..."}') && STUDIO_PROMPT.includes('폐기'))
  check('고지 3종 전문 존재(개인정보·권리·상상 재현)',
    STUDIO_NOTICES.privacy.includes('저장되지 않습니다') && STUDIO_NOTICES.rights.includes('본인 가족이 소장한')
    && STUDIO_NOTICES.imagined.includes('상상의 재현'))
  check('개인정보 고지 2벌 — /api/llm 부재 환경용은 다듬기 단추를 언급하지 않는다',
    STUDIO_NOTICES.privacyNoLlm.includes('저장되지 않습니다') && STUDIO_NOTICES.privacyNoLlm.includes('전송되지 않습니다')
    && !STUDIO_NOTICES.privacyNoLlm.includes('AI로 다듬기'))
  check('상상 재현 고지 2벌 — 풍경 중심 경로용은 「들려주신 이야기」를 말하지 않는다',
    STUDIO_NOTICES.imaginedScenery.includes('상상의 재현') && !STUDIO_NOTICES.imaginedScenery.includes('들려주신'))
}

/* ══════════ [8] 정밀 프롬프트 — 블록·값·재현성 ══════════ */
console.log('▶ 정밀 프롬프트 (블록 라벨 · 8구획 · 재현 설정)')
{
  const base = {
    medium: 'video', ratio: '16:9',
    region: { kind: 'old', id: 'hwanghae-old' },
    story: {
      sceneryOnly: false,
      picks: [
        { group: 'place', chipIds: ['well'], text: '겨울이면 우물이 얼어 새벽에 물을 길으셨다고 합니다' },
        { group: 'saying', chipIds: [], text: '고향 국수만 하겠니' },
      ],
    },
    mood: 'docu',
    relics: [{ fileId: 'F000280717', name: '청진시 수성천', category: 'nature', provider: '미디어한국학', sourceUrl: 'https://x' }],
  }
  const V = buildStudioOutput(base)
  const P = buildStudioOutput({ ...base, medium: 'photo', ratio: '1:1', mood: 'family' })
  const NOREL = buildStudioOutput({ ...base, relics: [] })

  /* ── 블록 라벨 7종이 순서대로 ── */
  const inOrder = (text, heads) => {
    let at = -1
    for (const h of heads) {
      const i = text.indexOf(h)
      if (i <= at) return false
      at = i
    }
    return true
  }
  const orderIds = STUDIO_BLOCK_ORDER
  check('블록 순서 표 = 7종', orderIds.length === 7, orderIds.join(','))
  check('정밀 영문에 7블록 머리 문자열이 전부·순서대로',
    inOrder(V.promptEn, orderIds.map((id) => STUDIO_BLOCK_HEADS[id].en)))
  check('정밀 한글에 7블록 머리 문자열이 전부·순서대로',
    inOrder(V.promptKo, orderIds.map((id) => STUDIO_BLOCK_HEADS[id].ko)))
  check('출처 라벨 4종(이야기·사료·연출·시대 일반)이 데이터로 존재',
    STUDIO_SOURCE_LABELS.length === 4
    && ['account', 'archive', 'direction', 'period'].every((id) => STUDIO_SOURCE_LABELS.some((s) => s.id === id))
    && STUDIO_SOURCE_LABELS.every((s) => ['ink', 'blue', 'soft', 'stale'].includes(s.tone)))

  /* ── 8구획이 전부 값을 갖는다 ── */
  check('8구획 표 = 8종', STUDIO_SPEC_SECTIONS.length === 8, STUDIO_SPEC_SECTIONS.join(','))
  check('정밀 한글에 8구획이 전부 실린다(촬영·광원·질감·색·구도 + 화면·금지·재현)',
    ['화면 비율', '촬영:', '광원:', '매체 질감:', '색:', '구도:', '금지 —', '재현 설정'].every((k) => V.promptKo.includes(k)))
  check('정밀 영문에도 8구획이 전부 실린다',
    ['Aspect ratio', 'Camera:', 'Light:', 'Film texture:', 'Colour:', 'Composition:', 'NEGATIVE', 'REPRODUCIBILITY'].every((k) => V.promptEn.includes(k)))
  check('촬영값이 실제 수치를 못박는다(렌즈 mm · 조리개 f · 색온도 K · 카메라 높이 · 태양 고도)',
    /\d+mm/.test(V.promptEn) && /f\/\d/.test(V.promptEn) && /\d{4} K/.test(V.promptEn)
    && /camera height [\d.]+ m/.test(V.promptEn) && /sun elevation \d+ degrees/.test(V.promptEn))
  /* 분위기 6종 × 매체 2종 = 12벌 전부가 렌즈·조리개·카메라 높이를 자립적으로 갖는다.
     「위와 같은 광학」처럼 다른 줄을 참조하면 그 매체 프롬프트에서 값이 통째로 사라진다(실측으로 잡았다). */
  {
    const holes = []
    for (const m of ['docu', 'family', 'cinema', 'newsreel', 'bw-color', 'past-now']) {
      for (const md of ['photo', 'video']) {
        const o = buildStudioOutput({ ...base, medium: md, mood: m })
        const en = o.blocks.find((b) => b.id === 'direction').bodyEn
        if (!(/\d+mm/.test(en) && /f\/[\d.]+/.test(en) && /camera height [\d.]+ m/.test(en))) holes.push(`${m}/${md}`)
      }
    }
    check('분위기 6종 × 매체 2종 전부가 렌즈·조리개·카메라 높이를 자립적으로 갖는다', holes.length === 0, holes.join(','))
  }
  check('구도가 지평선·삼분할·여백을 퍼센트로 못박는다',
    /Horizon at \d+ percent/.test(V.promptEn) && /\d+ percent of the width/.test(V.promptEn)
    && /margin on the left and right/.test(V.promptEn))

  /* ── 결정성 — 두 번 조립 = 바이트 동일 (정밀·간단 각각) ── */
  const V2 = buildStudioOutput(base)
  check('결정성 — 정밀판 두 번 조립이 바이트 동일(한·영)',
    V.promptKo === V2.promptKo && V.promptEn === V2.promptEn)
  check('결정성 — 간단판 두 번 조립이 바이트 동일(한·영)',
    V.promptKoSimple === V2.promptKoSimple && V.promptEnSimple === V2.promptEnSimple)

  /* ── 시드 ── */
  check('시드가 6자리 정수', Number.isInteger(V.seed) && String(V.seed).length === 6, String(V.seed))
  check('시드가 같은 입력에서 같은 값', V.seed === V2.seed)
  const basis = renderStudioPrompt(V.blocks.filter((b) => b.id !== 'repro'), 'en')
  check('시드는 재현 설정 블록을 뺀 정밀 영문 프롬프트에서 계산된다', studioSeed(basis) === V.seed)
  check('입력이 달라지면 시드도 달라진다', buildStudioOutput({ ...base, mood: 'cinema' }).seed !== V.seed)
  check('정밀판과 간단판이 같은 시드를 쓴다',
    V.promptKoSimple.includes(String(V.seed)) && V.promptKo.includes(String(V.seed)))
  check('시드 표기가 「권장」이고 다른 수를 써도 된다고 말한다',
    V.promptKo.includes('다른 수를 쓰셔도 됩니다') && V.promptEn.includes('Any other integer is fine'))

  /* ── 간단판 ── */
  const heads = STUDIO_BLOCK_HEADS
  check('간단판에도 라벨 머리 문자열이 붙는다(라벨 뗀 복사본 0)',
    V.promptKoSimple.includes(heads.format.koShort) && V.promptKoSimple.includes(heads.account.koShort)
    && V.promptKoSimple.includes(heads.negative.koShort) && V.promptKoSimple.includes(heads.repro.koShort)
    && V.promptEnSimple.includes(heads.direction.enShort))
  check('간단판이 정밀판보다 확실히 짧다',
    V.promptKoSimple.length < V.promptKo.length / 2 && V.promptEnSimple.length < V.promptEn.length / 2)
  /* 길이 상한은 「이야기 블록을 뺀 고정부」로 잰다 — 이용자 자유 입력은 우리가 자르지 않는다(원문 유지 규약).
     라벨과 사료 제목은 필수라 고정부 안에 있고, 그만큼 설계 목표치(140자·70단어)보다 넉넉히 잡는다. */
  const fixed = V.blocksSimple.filter((b) => b.id !== 'account')
  const fixedKoLen = fixed.reduce((n, b) => n + b.headKo.length + 1 + b.bodyKo.length, 0)
  const fixedEnWords = fixed.reduce((n, b) => n + `${b.headEn} ${b.bodyEn}`.trim().split(/\s+/).length, 0)
  check('간단판 고정부가 상한 안(한글 220자 · 영문 70단어)', fixedKoLen <= 220 && fixedEnWords <= 70, `${fixedKoLen}자 / ${fixedEnWords}단어`)

  /* ── 사료 제목 원문 보존 · 어휘 금고 · 고유명사 ── */
  check('사료 제목이 영문 프롬프트 안에 한글 원문 그대로 남는다(번역·의역 0)',
    V.promptEn.includes('청진시 수성천') && !/Suseong|Chongjin|Tumen/i.test(V.promptEn))
  check('사료 제목을 relicNames 로 들고 나온다(다듬기 검증용)',
    V.relicNames.length === 1 && V.relicNames[0] === '청진시 수성천')

  const glueKo = [...RELIC_SCENE_GLUE_KO].sort((a, b) => b.length - a.length)
  const vaultDrift = []
  for (const [cat, sc] of Object.entries(RELIC_SCENE)) {
    let s = sc.ko
    for (const w of [...sc.vaultKo, ...glueKo].sort((a, b) => b.length - a.length)) s = s.split(w).join(' ')
    if (/[가-힣]/.test(s)) vaultDrift.push(`${cat}:${s.replace(/\s+/g, '')}`)
    let e = sc.en
    for (const w of [...sc.vaultEn, ...RELIC_SCENE_GLUE_EN].sort((a, b) => b.length - a.length)) e = e.split(w).join(' ')
    if (/[A-Za-z]/.test(e)) vaultDrift.push(`${cat}-en:${e.replace(/\s+/g, '')}`)
  }
  check('사료 묘사에 어휘 금고 밖 낱말 0 (5갈래 전부, 한·영)', vaultDrift.length === 0, vaultDrift.join(' | '))

  /* 사료 제목·지역 표기 밖의 고유명사가 프롬프트에 새로 태어나지 않는다 */
  const PROPER = ['평양', '개성', '금강산', '묘향산', '대동강', '압록강', '두만강', '함흥', '청진', '원산',
    '신의주', '해주', '남포', '백두산', '몽금포', '의주', '강계', '삼지연', '모란봉',
    'Pyongyang', 'Kaesong', 'Kumgang', 'Taedong', 'Tumen', 'Yalu', 'Chongjin', 'Wonsan',
    'Hamhung', 'Sinuiju', 'Haeju', 'Nampo', 'Paektu', 'Moranbong']
  const strayIn = (o) => {
    const allow = [...o.relicNames, o.regionKo, ...STUDIO_REGIONS.map((r) => r.en)]
    let ko = o.promptKo, en = o.promptEn
    for (const a of allow.sort((x, y) => y.length - x.length)) { ko = ko.split(a).join(''); en = en.split(a).join('') }
    return PROPER.filter((p) => ko.includes(p) || en.includes(p))
  }
  check('사료 제목·지역 표기 밖의 고유명사 0 (사료 있는 경우)', strayIn(V).length === 0, strayIn(V).join(','))
  check('사료 제목·지역 표기 밖의 고유명사 0 (사료 없는 경우)', strayIn(NOREL).length === 0, strayIn(NOREL).join(','))
  check('사료가 없으면 「고른 사료에서」 블록 자체가 없다(빈 라벨 0)',
    !NOREL.promptKo.includes(heads.archive.ko) && !NOREL.blocks.some((b) => b.id === 'archive'))
  check('풍경 중심 경로는 「들려주신 이야기」 블록 자체가 없다',
    !buildStudioOutput({ ...base, story: { sceneryOnly: true, picks: [] } }).blocks.some((b) => b.id === 'account'))

  /* ── 복식·건축은 시대 일반 표현 블록에만 ── */
  const dirBody = V.blocks.find((b) => b.id === 'direction').bodyKo
  const perBody = V.blocks.find((b) => b.id === 'period').bodyKo
  /* 「기와」는 낱말 첫머리로만 잰다 — 「산줄기와 안개」의 조사 결합을 지붕 기와로 오인한다(실측) */
  check('연출 설정 블록에 복식·건축 어휘 0 (그 자리에 두면 사실 주장이 된다)',
    !/옷차림|저고리|한복|초가|(?<![가-힣])기와|두루마기|버선/.test(dirBody),
    (dirBody.match(/옷차림|저고리|한복|초가|(?<![가-힣])기와|두루마기|버선/) ?? []).join(''))
  check('시대 일반 표현 블록이 복식·살림살이를 맡고, 「일반적 표현」임을 스스로 밝힌다',
    perBody.includes('옷차림') && perBody.includes('일반적 표현') && perBody.includes('특정 마을의 실제 모습이 아니라'))
  check('연출 설정 라벨이 프롬프트 안에서도 사실이 아님을 밝힌다',
    STUDIO_BLOCK_HEADS.direction.ko.includes('그 고향의 사실이 아닙니다')
    && STUDIO_BLOCK_HEADS.period.ko.includes('이 고향에 대한 주장이 아닙니다'))

  /* ── past-now 의 「현재」는 시대 일반 표현 블록에 ── */
  const PN = buildStudioOutput({ ...base, mood: 'past-now' })
  const pnPer = PN.blocks.find((b) => b.id === 'period')
  const pnDir = PN.blocks.find((b) => b.id === 'direction')
  check('past-now 영상의 「오늘 풍경」 고지가 시대 일반 표현 블록에 있다(연출 설정이 아니다)',
    pnPer.bodyKo.includes('일반적인 오늘의 시골 풍경 표현') && !pnDir.bodyKo.includes('일반적인 오늘의 시골 풍경 표현')
    && pnPer.bodyEn.includes('generic contemporary rural scene'))
  check('past-now 사진은 과거 상태 한 벌만 담고 「오늘」을 주장하지 않는다',
    (() => { const p = buildStudioOutput({ ...base, medium: 'photo', mood: 'past-now' })
      return p.promptKo.includes('과거의 결 한 상태만') && !p.promptKo.includes('일반적인 오늘의 시골 풍경 표현') })())

  /* ── heritage 예외 ── */
  const HER = buildStudioOutput({ ...base, relics: [{ fileId: 'F000280715', name: '장수산 현암', category: 'heritage', provider: 'x', sourceUrl: 'https://x' }] })
  check('heritage 사료면 지평선 규칙 대신 건물 상단선 33퍼센트',
    HER.promptKo.includes('건물 윗선을 상단 삼분할선') && !HER.promptKo.includes('지평선은 화면 위에서 58퍼센트'))
  check('heritage 아닌 사료는 지평선 규칙을 쓴다', V.promptKo.includes('지평선은 화면 위에서 58퍼센트'))

  /* ── 사료 여러 장 ── */
  const MULTI = buildStudioOutput({
    ...base,
    relics: [
      { fileId: 'a', name: '몽금포 전경', category: 'coast', provider: 'x', sourceUrl: 'https://x' },
      { fileId: 'b', name: '장수산 현암', category: 'heritage', provider: 'x', sourceUrl: 'https://x' },
    ],
  })
  check('사료가 둘 이상이면 한 화면에 섞지 말라는 줄이 프롬프트에 붙는다',
    MULTI.promptKo.includes('한 화면에 섞지 말고 장면을 나누십시오')
    && MULTI.promptEn.includes('Do not merge two archival references into one frame'))
  check('사료 둘은 장면에 하나씩 배당된다(합성 금지)',
    MULTI.scenes[0].text.includes('몽금포 전경') && MULTI.scenes[1].text.includes('장수산 현암'))

  /* ── 네거티브 ── */
  check('공통 네거티브 30항목 · 한영 개수 일치',
    NEG_COMMON_KO.length === 30 && NEG_COMMON_EN.length === 30)
  check('공통 네거티브가 순서 그대로 프롬프트에 실린다(한·영)',
    V.blocks.find((b) => b.id === 'negative').bodyKo.startsWith(NEG_COMMON_KO.join(', '))
    && V.blocks.find((b) => b.id === 'negative').bodyEn.startsWith(NEG_COMMON_EN.join(', ')))
  check('분위기별 추가 금지가 공통 뒤에 붙는다',
    V.negative.moodKo.length > 0 && V.promptKo.includes(V.negative.moodKo[0]))
  check('현대 물건·글자·왜곡된 손·과장 표정이 전부 금지에 있다',
    ['현대 자동차', '글자', '워터마크', '왜곡된 손', '과장된 울음과 비명'].every((k) => NEG_COMMON_KO.includes(k)))
  /* 치환문은 「무엇을 하지 마라」가 아니라 「무엇이 있다」로 적혀야 한다 —
     명령형 금지어가 섞이면 그 자체가 부정 지시로 읽혀 치환의 뜻이 사라진다.
     (「간판도 표지도 없는 맨 나무 벽」처럼 상태를 그리는 서술형 부정은 허용한다) */
  check('네거티브 칸이 없는 도구용 긍정 치환표 6종 · 명령형 금지어 0',
    NEG_SWAP.length === 6 && NEG_SWAP.every((s) => s.ko && s.en
      && !/금지|쓰지 마|넣지 마|하지 마|말고/.test(s.ko) && !/\bdo not\b|\bavoid\b|\bwithout any\b/i.test(s.en)))
  check('네거티브 폴백 고지가 「본문에 붙이지 말라」고 못박는다',
    STUDIO_NOTICES.negFallback.includes('본문에 붙이지 마십시오') && STUDIO_NOTICES.negFallback.includes('긍정 치환문'))

  /* ── 재현 설정 · 과잉 주장 금칙어 ── */
  check('재현 설정 표 5계열 · 시드 칸 없는 도구를 정직하게 표기',
    STUDIO_REPRO_TOOLS.length === 5 && STUDIO_REPRO_TOOLS.some((t) => t.note.includes('시드를 지정할 수 없어')))
  check('재현성 고지에 과잉 주장 금칙어(동일·똑같·보장) 0',
    !/동일|똑같|보장/.test(STUDIO_NOTICES.reproNote), STUDIO_NOTICES.reproNote.slice(0, 30))
  check('재현성 고지가 「거의 같아진다 · 모델이 다르면 결만 비슷 · 완전히 같게는 못 한다」를 다 말한다',
    STUDIO_NOTICES.reproNote.includes('거의 같은 그림')
    && STUDIO_NOTICES.reproNote.includes('모델이 다르면 결만 비슷')
    && STUDIO_NOTICES.reproNote.includes('완전히 같은 그림을 만들 수는 없습니다'))
  check('재현성 고지 전문이 프롬프트 재현 설정 블록에도 그대로 실린다',
    V.blocks.find((b) => b.id === 'repro').bodyKo.includes(STUDIO_NOTICES.reproNote))
  check('신규 고지 4키 전문 존재',
    STUDIO_NOTICES.directionNote.includes('그 고향에 실제로 그랬다는 뜻이 아닙니다')
    && STUDIO_NOTICES.periodGeneric.includes('시대 일반 표현')
    && STUDIO_NOTICES.reproNote.length > 0 && STUDIO_NOTICES.negFallback.length > 0)

  /* ── 영상 장면 정밀화 ── */
  const secOf = (s) => Number((s.text.match(/(\d+)초\.$/) ?? [0, 0])[1])
  const sum169 = V.scenes.reduce((n, s) => n + secOf(s), 0)
  const V916 = buildStudioOutput({ ...base, ratio: '9:16' })
  const V11 = buildStudioOutput({ ...base, ratio: '1:1' })
  const sum916 = V916.scenes.reduce((n, s) => n + secOf(s), 0)
  const sum11 = V11.scenes.reduce((n, s) => n + secOf(s), 0)
  check('16:9 = 4장면 46초 (권장 30~60초 안)', V.scenes.length === 4 && sum169 === 46 && V.totalSec === 46, `${sum169}`)
  check('9:16 = 4장면 28초 · 장면당 5~8초', V916.scenes.length === 4 && sum916 === 28
    && V916.scenes.every((s) => secOf(s) >= 5 && secOf(s) <= 8), `${sum916}`)
  check('1:1 = 3장면 24초', V11.scenes.length === 3 && sum11 === 24, `${sum11}`)
  check('장면마다 샷·렌즈·조리개·움직임이 붙는다',
    V.scenes.every((s) => /\d+mm f\/[\d.]+/.test(s.text))
    && V.scenes.some((s) => s.text.includes('팬')) && V.scenes.some((s) => s.text.includes('푸시인')))
  check('영상 프롬프트의 장면 줄은 촬영값만 담는다(이야기 문장이 새지 않는다)',
    dirBody.includes('S1.') && !dirBody.includes('고향 국수만 하겠니'))
  check('자주 하던 말은 프롬프트 전체에서 이야기 블록 1회뿐',
    (V.promptKo.match(/「고향 국수만 하겠니」/g) ?? []).length === 1)
  check('bw-color·past-now 는 S4 처리가 다르다',
    buildStudioOutput({ ...base, mood: 'bw-color' }).promptKo.includes('S4 시작 1초 뒤부터')
    && PN.promptKo.includes('매치컷 1회') && V.promptKo.includes('마지막 1초 페이드 아웃'))
  check('사진은 구도 3안에 각각 촬영 사양이 붙는다',
    P.compositions.length === 3 && P.compositions.every((c) => /\d+mm f\/[\d.]+/.test(c.text)) && P.scenes === null)

  /* ── 다듬기 페이로드 — 촬영값이 LLM 을 지나가지 않는다 ── */
  check('다듬기 페이로드에 촬영값(mm·K·f값·시드) 0',
    !/\d+mm|\d{4}\s?K|f\/\d|퍼센트/.test(V.refineKo + V.refineEn) && !`${V.refineKo}${V.refineEn}`.includes(String(V.seed)))
  check('다듬기 페이로드는 「들려주신 이야기」 블록 원문 그대로',
    V.refineKo === V.blocks.find((b) => b.id === 'account').bodyKo)
  const spliced = applyStudioRefine(V, { ko: '다듬은 이야기 문장.', en: 'A polished account sentence.' })
  check('다듬은 문장은 이야기 블록 자리에만 들어가고 촬영값은 그대로다',
    spliced.ko.includes('다듬은 이야기 문장.') && spliced.ko.includes('촬영: 와이드 설정샷, 35mm, f/8, 카메라 높이 1.6미터')
    && spliced.ko.includes(String(V.seed)) && !spliced.ko.includes('겨울이면 우물이'))
  check('account 블록이 없으면 다듬기는 원본을 그대로 돌려준다',
    (() => { const s = buildStudioOutput({ ...base, story: { sceneryOnly: true, picks: [] } })
      const r = applyStudioRefine(s, { ko: 'x', en: 'y' })
      return r.ko === s.promptKo && r.en === s.promptEn })())

  /* ── validateStudio 확장 ── */
  const payload = { ko: '「청진시 수성천」 이야기.', en: 'The story of 청진시 수성천.', story: [], relicNames: ['청진시 수성천'] }
  check('사료 제목이 살아 있으면 통과',
    validateStudio({ ko: '「청진시 수성천」 이야기입니다.', en: 'A story of 청진시 수성천.' }, payload) !== null)
  check('사료 제목을 영어로 의역한 출력은 폐기(실측 날조 차단)',
    validateStudio({ ko: '수성천 이야기.', en: 'Suseong Stream in Chongjin, upper Tumen River border area.' }, payload) === null)
  check('사료 제목이 한쪽 언어에서만 사라져도 폐기',
    validateStudio({ ko: '「청진시 수성천」 이야기.', en: 'A story of the stream.' }, payload) === null)
  check('relicNames 가 없으면 제목 검사는 건너뛴다(기존 경로 보존)',
    validateStudio({ ko: '고향 이야기.', en: 'A hometown story.' }, { ko: 'a', en: 'b', story: [] }) !== null)

  /* ── 이모지 0 (신규 문구 전부) ── */
  const EMOJI2 = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u
  const newText = JSON.stringify([STUDIO_NOTICES, STUDIO_SOURCE_LABELS, STUDIO_BLOCK_HEADS, RELIC_SCENE,
    NEG_COMMON_KO, NEG_COMMON_EN, NEG_SWAP, STUDIO_REPRO_TOOLS, V.promptKo, V.promptEn, V.promptKoSimple, V.promptEnSimple])
  check('신규 문구·산출 프롬프트 전부 이모지 0', !EMOJI2.test(newText))
  check('다듬기 프롬프트가 사료 제목 번역 금지를 못박는다',
    STUDIO_PROMPT.includes('사료 제목은 한글 원문 그대로') && STUDIO_PROMPT.includes('번역·풀이하지 마라'))
  check('다듬기 프롬프트가 이용자 원문 보존·영어 갈아치우기 금지를 못박는다',
    STUDIO_PROMPT.includes('한 글자도 바꾸지 말고 그대로 두어라')
    && STUDIO_PROMPT.includes('원문을 영어로 갈아치우지 마라')
    && !STUDIO_PROMPT.includes('영어 옮김을 en에 녹이기'))
}

/* ══════════ [9] 날조 방지 — 지어낸 지명·규모·장면·이야기가 산출에 새지 않는다 ══════════
   여기 9구획은 전부 실측으로 잡힌 날조를 하나씩 붙들고 있다. 검사를 지우려면 그 날조가
   왜 더는 가능하지 않은지 먼저 코드로 보여라. */
console.log('▶ 날조 방지 (지명·규모·갈래 배치·없는 이야기)')
{
  const base = {
    medium: 'video', ratio: '16:9',
    region: { kind: 'old', id: 'hwanghae-old' },
    story: { sceneryOnly: false, picks: [{ group: 'place', chipIds: ['well'], text: '겨울이면 우물이 얼어 새벽에 물을 길으셨다고 합니다' }] },
    mood: 'docu',
    relics: [],
  }

  /* ── (a) 지역 영문 표기 — 한글 라벨에 없는 고유명사를 심지 않는다 ── */
  const REGION_PROPER = ['Kaesong', 'Kumgang', 'Pyongyang', 'Wonsan', 'Chongjin', 'Hamhung', 'Sinuiju',
    'Haeju', 'Nampo', 'Paektu', 'Moranbong', 'Taedong', 'Tumen', 'Yalu', 'Panmunjom']
  const regionStray = STUDIO_REGIONS.filter((r) => REGION_PROPER.some((p) => r.en.includes(p)))
  check('STUDIO_REGIONS.en 에 한글 라벨에 없는 고유명사 0',
    regionStray.length === 0, regionStray.map((r) => `${r.ko}=${r.en}`).join(' | '))
  check('미수복 2종은 도 이름 폭 그대로(특정 지명으로 좁히지 않는다)',
    STUDIO_REGIONS.find((r) => r.id === 'gyeonggi-unrec').en === 'the unrecovered northern part of Gyeonggi Province'
    && STUDIO_REGIONS.find((r) => r.id === 'gangwon-unrec').en === 'the unrecovered northern part of Gangwon Province')
  {
    const U = buildStudioOutput({ ...base, region: { kind: 'old', id: 'gangwon-unrec' } })
    check('미수복강원 프롬프트에 금강산·개성이 실리지 않는다(정밀·간단 양판)',
      !/Kumgang|Kaesong|금강산|개성/.test(U.promptEn + U.promptKo + U.promptEnSimple + U.promptKoSimple))
  }

  /* ── (b) 직접 입력 고향 — 규모를 단정하지 않는다 ── */
  {
    /* 규모 낱말은 「화면」 블록(지역 이름이 실리는 유일한 자리)에서만 잰다 —
       시대 일반 표현의 'not a depiction of any specific village' 는 규모 단정이 아니라 그 반대다. */
    const SCALE = /\b(town|city|village|county|hamlet|district|borough)\b/i
    const C = buildStudioOutput({ ...base, region: { kind: 'custom', text: '평안북도 의주군' } })
    const C2 = buildStudioOutput({ ...base, region: { kind: 'custom', text: '개성 만월대 옆 우리집' } })
    const fmtEnOf = (o) => o.blocks.find((b) => b.id === 'format').bodyEn
    const fmtEnSimpleOf = (o) => o.blocksSimple.find((b) => b.id === 'format').bodyEn
    check('직접 입력 지역 영문 꼬리에 규모 낱말(town·city·village·county) 0',
      !SCALE.test(fmtEnOf(C)) && !SCALE.test(fmtEnOf(C2)) && !SCALE.test(fmtEnSimpleOf(C)),
      (fmtEnOf(C).match(SCALE) ?? []).join(''))
    check('직접 입력 원문은 한글 그대로 실리고 중립 꼬리만 붙는다',
      C.promptEn.includes('평안북도 의주군 (place name as written by the family, in Korean; northern Korea)')
      && C.promptKo.includes('평안북도 의주군'))
  }

  /* ── (c) 갈래 배치는 「고른 사료에서」가 아니라 「연출 설정」이다 ── */
  {
    const R1 = buildStudioOutput({ ...base, relics: [{ fileId: 'a', name: '칠보산 동굴', category: 'nature', provider: 'x', sourceUrl: 'https://x' }] })
    const arc = R1.blocks.find((b) => b.id === 'archive')
    const dir = R1.blocks.find((b) => b.id === 'direction')
    check('「고른 사료에서」 블록은 제목·갈래만 — 갈래 배치 문장 0',
      !arc.bodyKo.includes('전경은') && !arc.bodyEn.includes('Foreground')
      && arc.bodyKo.includes('칠보산 동굴'), arc.bodyKo)
    check('갈래 배치는 연출 설정 블록에 있고 「흔히 보이는 배치」임을 문장 안에서 밝힌다',
      dir.bodyKo.includes('이 갈래의 사진에서 흔히 보이는 배치입니다')
      && dir.bodyKo.includes('고르신 사료에 그것이 있다는 뜻이 아닙니다')
      && dir.bodyEn.includes('Layout typical of photographs in this category'))
    const MIX = buildStudioOutput({
      ...base,
      relics: [
        { fileId: 'a', name: '관산리 고인돌', category: 'heritage', provider: 'x', sourceUrl: 'https://x' },
        { fileId: 'b', name: '연백평야 전경', category: 'nature', provider: 'x', sourceUrl: 'https://x' },
      ],
    })
    check('갈래가 섞인 다중 사료면 갈래 배치를 아예 내지 않는다(relics[0] 갈래를 나머지에 씌우지 않는다)',
      !MIX.promptKo.includes('돌계단') && !MIX.promptKo.includes('흔히 보이는 배치')
      && MIX.promptKo.includes('관산리 고인돌') && MIX.promptKo.includes('연백평야 전경'))
    const SAME = buildStudioOutput({
      ...base,
      relics: [
        { fileId: 'a', name: '관산리 고인돌', category: 'heritage', provider: 'x', sourceUrl: 'https://x' },
        { fileId: 'b', name: '귀진사 전경', category: 'heritage', provider: 'x', sourceUrl: 'https://x' },
      ],
    })
    check('갈래가 같은 다중 사료면 갈래 배치를 낸다', SAME.promptKo.includes('흔히 보이는 배치'))
  }

  /* ── (d) 산출 ③ — 출처 배지 · 지역과 사료를 한 문장에 묶지 않는다 · 없는 이야기 0 ── */
  {
    const SRCS = ['account', 'archive', 'direction', 'none']
    const P = buildStudioOutput({
      ...base, medium: 'photo', ratio: '1:1',
      region: { kind: 'custom', text: '평안남도 강동군 원탄면' },
      relics: [{ fileId: 'a', name: '칠보산 동굴', category: 'nature', provider: 'x', sourceUrl: 'https://x' }],
    })
    const allLines = [...(P.compositions ?? []), ...(buildStudioOutput(base).scenes ?? [])]
    check('산출 ③ 모든 조각에 출처 src 가 붙는다(4종 중 하나)',
      allLines.length > 0 && allLines.every((l) => l.parts.length > 0 && l.parts.every((p) => SRCS.includes(p.src))))
    check('산출 ③ 배지 표가 프롬프트 라벨과 같은 낱말을 쓴다',
      STUDIO_LINE_BADGES.account.badge === '● 들려주신 이야기'
      && STUDIO_LINE_BADGES.archive.badge === '● 고른 사료에서'
      && STUDIO_LINE_BADGES.direction.badge === '● 연출 설정'
      && STUDIO_LINE_BADGES.none.badge === '● 비어 있음')
    check('산출 ③ 이 지역과 사료를 한 문장에 묶지 않는다(「…의 지형이 보이는」 0 · 「사료의 지형처럼」 0)',
      P.compositions.every((c) => !c.text.includes('평안남도 강동군 원탄면') && !c.text.includes('사료의 지형')),
      P.compositions[0].text)
    check('사료는 「참고 사료」로만 병기되고 갈래가 함께 적힌다',
      P.compositions[0].parts.some((p) => p.src === 'archive' && p.text.includes('참고 사료: 「칠보산 동굴」(자연)')))
  }
  {
    const SCEN = buildStudioOutput({ ...base, story: { sceneryOnly: true, picks: [] } })
    const flat = SCEN.scenes.map((s) => s.text).join(' ')
    check('이야기 0 경로에서 없는 이야기를 지어내지 않는다(「저녁상에 둘러앉은 식구」 0 · 「가족의 요소」 0)',
      !flat.includes('저녁상에 둘러앉은 식구') && !flat.includes('가족의 요소') && !flat.includes('마을의 골목과 집'), flat.slice(0, 90))
    check('이야기 0 경로는 그 자리를 「따로 적지 않으셨습니다」로 비운다(뭉뚱그린 단정 0)',
      SCEN.scenes.some((s) => s.parts.some((p) => p.src === 'none' && p.text.includes('이 자리에 넣을 이야기를 따로 적지 않으셨습니다'))))
    check('자유 입력만 적으신 경로도 산출 ③ 에 그 원문이 「들려주신 이야기」로 실린다',
      (() => {
        const F = buildStudioOutput({ ...base, story: { sceneryOnly: false, picks: [{ group: 'place', chipIds: [], text: '겨울이면 우물이 얼어 새벽에 물을 길으셨다고 합니다' }] } })
        return F.scenes.some((s) => s.parts.some((p) => p.src === 'account' && p.text.includes('겨울이면 우물이 얼어 새벽에 물을 길으셨다고 합니다')))
      })())
    check('풍경 중심 경로의 산출 ③ 에 「들려주신 이야기」 조각 0',
      SCEN.scenes.every((s) => s.parts.every((p) => p.src !== 'account')))
  }

  /* ── (e) 다듬기 전송분 — 이야기 블록 본문에 실린 원문만 나간다 ── */
  {
    const W = buildStudioOutput({
      ...base,
      story: {
        sceneryOnly: false,
        picks: [
          { group: 'family', chipIds: ['three-gen'], text: '오남매의 맏이셨다고 들었습니다' },
          { group: 'photo', chipIds: [], text: '마당에서 찍은 흑백 사진이 한 장 있습니다' },
        ],
      },
    })
    const acc = W.blocks.find((b) => b.id === 'account').bodyKo
    check('다듬기 전송분(storyRaw)에 프롬프트 밖 입력(사진 속 장소)이 실리지 않는다',
      !W.storyRaw.includes('마당에서 찍은 흑백 사진이 한 장 있습니다')
      && W.storyRaw.includes('오남매의 맏이셨다고 들었습니다'), W.storyRaw.join(' | '))
    check('storyRaw 의 각 원문이 「들려주신 이야기」 블록 본문에 실제로 들어 있다',
      W.storyRaw.every((t) => acc.includes(t)))
    check('storyRaw 보존 검사가 다듬기 경로에서 실제로 걸린다(원문 개작 → 폐기)',
      validateStudio({ ko: '오남매 중 맏이로 자라셨습니다.', en: 'the eldest of five' },
        { ko: acc, en: W.refineEn, story: W.storyRaw, relicNames: W.relicNames }) === null)
  }

  /* ── (f) 화면 문구 — 과잉 주장·권리 고지·사료 목록 표제 ── */
  {
    const tsx = fs.readFileSync(path.join(root, 'frontend/src/pages/studio/Studio.tsx'), 'utf8')
    const variants = tsx.slice(tsx.indexOf('const VARIANTS'), tsx.indexOf('function CopyButton'))
    check('판 고르는 자리의 문구에 과잉 주장 금칙어(동일·똑같·보장·잘 나옵니다) 0',
      !/동일|똑같|보장|같은 그림이 잘 나옵니다/.test(variants), variants.replace(/\s+/g, ' ').slice(0, 120))
    check('정밀판 문구가 「같은 모델·같은 시드」 조건을 함께 말한다',
      /정밀[^']*같은 모델에 같은 시드/.test(variants))
    check('권리 고지가 결과 화면 산출 ② 와 전체 복사문에 함께 실린다',
      (tsx.match(/STUDIO_NOTICES\.rights/g) ?? []).length >= 3, `${(tsx.match(/STUDIO_NOTICES\.rights/g) ?? []).length}곳`)
    check('걸러지지 않은 사료 목록을 「그 고향의 사료」라고 부르지 않는다',
      tsx.includes('relicFiltered') && tsx.includes('전 지역 사료 사진 — 고향과 일치하지 않을 수 있습니다')
      && tsx.includes('그 고향의 사료가 아닐 수 있으니'))
    /* 129장 중 35장은 원자료에 지역 표기가 없다 — 제목으로 추정해 채우지 않고 「지역 미표기」라고 적는다 */
    check('사료 카드에 지역이 항상 표기된다(빈 값은 「지역 미표기」로, 추정 0)',
      /const area = it\.areaRaw\.trim\(\) \|\| '지역 미표기'/.test(tsx) && /\{area\} · \{RELIC_CAT_LABEL/.test(tsx)
      && /aria-label=\{`\$\{it\.name\} — \$\{area\}/.test(tsx))
  }
}

const fail = results.filter((r) => !r).length
console.log(fail ? `✗ ${fail}건 실패 / ${results.length}` : `✓ 전부 통과 (${results.length}/${results.length})`)
process.exit(fail ? 1 : 0)
