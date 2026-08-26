/* ────────────────────────────────────────────────────────────────
   AI 스튜디오 — 화면이 쓰는 상수의 단일 통로

   값의 진실은 engine/nk-studio.mjs 다(브라우저·Pages Functions·node 검증 공유,
   의존 0). 여기서는 타입을 입혀 다시 내보내기만 한다 — 값을 두 벌로 적지 않는다.
   ──────────────────────────────────────────────────────────────── */

export {
  STUDIO_REGIONS,
  STUDIO_MEDIA,
  STUDIO_RATIOS,
  STUDIO_MOODS,
  STUDIO_STORY_GROUPS,
  RELIC_CATS,
  RELIC_CAT_LABEL,
  LENGTH_GUIDE,
  PLATFORM_GUIDE,
  STUDIO_NOTICES,
  STUDIO_SOURCE_LABELS,
  STUDIO_LINE_BADGES,
  STUDIO_REPRO_TOOLS,
  NEG_SWAP,
  studioPromptOf,
} from '../engine/nk-studio.mjs'

export type {
  StudioMedium,
  StudioRatio,
  StudioRegionSel,
  StudioStoryPick,
  StudioInput,
  StudioOutput,
  StudioBlock,
  StudioVariant,
  StudioLine,
  StudioLineSrc,
} from '../engine/nk-studio.mjs'

export { default as STUDIO_PHOTOS } from './studio-photos'
export type { StudioRelic, StudioRelicCat } from './studio-photos'
