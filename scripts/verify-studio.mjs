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

   사용법: node scripts/verify-studio.mjs
   나가는 값: 전부 통과 0 · 실패 1
   ────────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  classifyRelic, RELIC_CATS, buildStudioOutput, validateStudio,
  PLATFORM_GUIDE, STUDIO_PROMPT, STUDIO_NOTICES, LENGTH_GUIDE,
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
  check('입력 숫자만 쓴 출력은 통과',
    validateStudio({ ko: '비율 16:9, 1940년대.', en: 'ratio 16:9, the 1940s.' }, payload) !== null)
  check('입력에 없는 숫자(연도 창작)는 통째로 폐기',
    validateStudio({ ko: '1953년의 고향.', en: 'in 1953.' }, payload) === null)
  check('스키마 밖(en 누락)은 폐기', validateStudio({ ko: '문장' }, payload) === null)
  check('이모지 섞인 출력은 폐기', validateStudio({ ko: '고향 🏠', en: 'home' }, payload) === null)
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

const fail = results.filter((r) => !r).length
console.log(fail ? `✗ ${fail}건 실패 / ${results.length}` : `✓ 전부 통과 (${results.length}/${results.length})`)
process.exit(fail ? 1 : 0)
