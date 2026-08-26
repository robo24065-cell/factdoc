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

export interface StudioOutput {
  medium: StudioMedium
  ratio: StudioRatio
  moodId: string
  regionKo: string
  promptKo: string
  promptEn: string
  /** 자유 입력 원문(한글 그대로) — 다듬기 요청의 story 페이로드가 된다 */
  storyRaw: string[]
  sceneryOnly: boolean
  ownPhotos: { place: string; order: string[] } | null
  relics: Array<{ fileId: string; name: string; category: string; provider: string; sourceUrl: string }>
  scenes: string[] | null
  compositions: string[] | null
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
}
export const STUDIO_PROMPT: string

export function classifyRelic(fileId: string, placeName: string): string
export function lengthGuideOf(medium: string, ratio: string): { medium: string; ratio: string; length: string; scenes: string }
export function buildStudioOutput(input: StudioInput): StudioOutput
export function validateStudio(
  raw: unknown,
  payload: { ko: string; en: string; story: string[] },
): { ko: string; en: string } | null
