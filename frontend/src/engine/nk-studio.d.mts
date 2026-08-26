// nk-studio.mjs 타입 선언 (엔진은 순수 JS — 브라우저·Cloudflare Pages Functions·node 검증이 공유)
// 값의 진실은 nk-studio.mjs 다. 여기는 화면(TSX)이 형태를 알게 하는 껍데기일 뿐이다.

export type StudioMedium = 'photo' | 'video'
export type StudioRatio = '16:9' | '9:16' | '1:1'
export type StudioRegionSel =
  | { kind: 'old'; id: string }
  | { kind: 'custom'; text: string }
  | { kind: 'unknown' }

export interface StudioStoryPick {
  group: string
  chipIds: string[]
  text: string
}

export interface StudioRelicIn {
  fileId: string
  name: string
  category: string
  provider: string
  sourceUrl: string
}

export interface StudioInput {
  medium: StudioMedium
  ratio: StudioRatio
  region: StudioRegionSel
  story: { sceneryOnly: boolean; picks: StudioStoryPick[] }
  mood: string
  relics: StudioRelicIn[]
}

/** 출처가 다른 블록 하나. head 를 반드시 함께 낸다 — 라벨을 뗀 복사본을 만들지 않는다. */
export interface StudioBlock {
  id: 'format' | 'account' | 'archive' | 'direction' | 'period' | 'negative' | 'repro'
  headKo: string
  headEn: string
  bodyKo: string
  bodyEn: string
}

export type StudioVariant = 'precise' | 'simple'

/** 산출 ③ 한 줄의 조각 하나 — 어디서 왔는지(src)를 화면에서도 배지로 밝힌다.
 *  'none' 은 이용자가 그 자리에 아무것도 적지 않았다는 뜻이다(없는 이야기를 지어내지 않는다). */
export type StudioLineSrc = 'account' | 'archive' | 'direction' | 'none'
export interface StudioLine {
  roleKo: string
  parts: Array<{ src: StudioLineSrc; text: string }>
  /** 배지를 뗀 평문 한 줄 — 복사·검증용 */
  text: string
}

export interface StudioOutput {
  medium: StudioMedium
  ratio: StudioRatio
  moodId: string
  regionKo: string
  promptKo: string
  promptEn: string
  /** 간단판 — 짧은 프롬프트만 받는 도구용. 같은 시드를 쓰되 값이 적어 결과가 더 흔들린다 */
  promptKoSimple: string
  promptEnSimple: string
  /** 재현 설정 블록을 뺀 정밀 영문 프롬프트에서 결정적으로 계산한 6자리 시드 */
  seed: number
  blocks: StudioBlock[]
  blocksSimple: StudioBlock[]
  /** 다듬기에 내보낼 조각 — 블록 2·3 뿐. 촬영값은 LLM 을 지나가지 않는다 */
  refineKo: string
  refineEn: string
  /** 사료 제목 원문 — 다듬기 출력이 이 글자를 지우면 폐기한다 */
  relicNames: string[]
  /** 「들려주신 이야기」 블록에 실제로 실린 원문(한글 그대로) — 다듬기 요청의 story 페이로드가 되고,
   *  validateStudio 가 이 각 문장의 글자 단위 보존을 검사한다. 프롬프트에 안 들어가는 입력은 담지 않는다. */
  storyRaw: string[]
  sceneryOnly: boolean
  ownPhotos: { place: string; order: string[] } | null
  relics: Array<{ fileId: string; name: string; category: string; provider: string; sourceUrl: string }>
  scenes: StudioLine[] | null
  compositions: StudioLine[] | null
  totalSec: number
  negative: {
    commonKo: readonly string[]
    commonEn: readonly string[]
    moodKo: readonly string[]
    moodEn: readonly string[]
    swap: ReadonlyArray<{ itemKo: string; ko: string; en: string }>
  }
  lengthLine: string
  sceneLine: string
}

export const STUDIO_REGIONS: ReadonlyArray<{ id: string; ko: string; en: string }>
export const STUDIO_MEDIA: ReadonlyArray<{ id: StudioMedium; label: string; sub: string }>
export const STUDIO_RATIOS: ReadonlyArray<{ id: StudioRatio; label: string; sub: string }>
export const STUDIO_MOODS: ReadonlyArray<{ id: string; label: string; ko: string; en: string }>
export const STUDIO_STORY_GROUPS: ReadonlyArray<{
  id: string
  title: string
  question: string
  placeholder: string
  note?: string
  chips: ReadonlyArray<{ id: string; label: string; sceneKo: string | null; sceneEn: string | null }>
}>
export const RELIC_CATS: ReadonlyArray<{ id: string; label: string; en: string }>
export const RELIC_CAT_LABEL: Record<string, string>
export const RELIC_CAT_EN: Record<string, string>
export const LENGTH_GUIDE: ReadonlyArray<{ medium: string; ratio: string; length: string; scenes: string }>
export const PLATFORM_GUIDE: {
  asOfLine: string
  video: ReadonlyArray<{ name: string; desc: string; official: string | null }>
  photo: ReadonlyArray<{ name: string; desc: string; official: string | null }>
  common: ReadonlyArray<string>
}
export const STUDIO_NOTICES: {
  privacy: string
  privacyNoLlm: string
  rights: string
  imagined: string
  imaginedScenery: string
  sourceSplit: string
  relicUse: string
  memoryOnly: string
  directionNote: string
  periodGeneric: string
  reproNote: string
  negFallback: string
}
export const STUDIO_PROMPT: string

/** 출처 라벨 4종 — tone 은 theme/gohyang.ts 의 TEXT 토큰 키다(새 색을 만들지 않는다) */
export const STUDIO_SOURCE_LABELS: ReadonlyArray<{
  id: 'account' | 'archive' | 'direction' | 'period'
  badge: string
  tone: 'ink' | 'blue' | 'soft' | 'stale'
  note: string
}>
/** 산출 ③ 줄 조각의 배지 — STUDIO_SOURCE_LABELS 와 같은 낱말을 쓴다(새 라벨을 만들지 않는다) */
export const STUDIO_LINE_BADGES: Record<StudioLineSrc, { badge: string; tone: 'ink' | 'blue' | 'soft' | 'stale' }>
export const STUDIO_BLOCK_HEADS: Record<string, { ko: string; en: string; koShort: string; enShort: string }>
export const STUDIO_BLOCK_ORDER: readonly string[]
export const STUDIO_SPEC_SECTIONS: readonly string[]
export const MOOD_SHOT: Record<string, Record<string, string | string[]>>
export const COMPOSITION_BY_RATIO: Record<string, { horizonKo: string; horizonEn: string; restKo: string; restEn: string }>
export const RELIC_SCENE: Record<string, { ko: string; en: string; vaultKo: string[]; vaultEn: string[] }>
export const RELIC_SCENE_GLUE_KO: readonly string[]
export const RELIC_SCENE_GLUE_EN: readonly string[]
export const NEG_COMMON_KO: readonly string[]
export const NEG_COMMON_EN: readonly string[]
export const NEG_SIMPLE_KO: readonly string[]
export const NEG_SIMPLE_EN: readonly string[]
export const NEG_SWAP: ReadonlyArray<{ itemKo: string; ko: string; en: string }>
export const STUDIO_REPRO_TOOLS: ReadonlyArray<{ name: string; guidance: string; steps: string; note: string }>

export function classifyRelic(fileId: string, placeName: string): string
export function lengthGuideOf(medium: string, ratio: string): { medium: string; ratio: string; length: string; scenes: string }
export function studioSeed(basis: string): number
export function renderStudioPrompt(blocks: ReadonlyArray<StudioBlock>, lang: 'ko' | 'en'): string
export function studioPromptOf(out: StudioOutput, variant: StudioVariant, lang: 'ko' | 'en'): string
export function applyStudioRefine(out: StudioOutput, refined: { ko: string; en: string } | null): { ko: string; en: string }
export function buildStudioOutput(input: StudioInput): StudioOutput
export function validateStudio(
  raw: unknown,
  payload: { ko: string; en: string; story: string[]; relicNames?: string[] },
): { ko: string; en: string } | null
