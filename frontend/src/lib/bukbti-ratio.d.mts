/** 북BTI 축 비율의 산식 — 화면(lib/bukbti.ts)과 scripts/verify-bukbti.mjs 가 같은 함수를 쓴다 */

/** 대비 매치(두 항목의 글자가 서로 다른 대결)만 세어 분자·분모를 낸다 */
export function countContrast(
  matches: ReadonlyArray<{ win: string; lose: string }>,
  tagOf: (key: string) => string | undefined,
  aLetter: string,
): { a: number; d: number }

/** 50%를 넘는 쪽이 글자. 정확히 반반(final)·대비 0회(none)면 letter 는 null 이다 */
export function decideLetter(
  a: number,
  d: number,
  aLetter: string,
  bLetter: string,
): { letter: string | null; src: 'ratio' | 'final' | 'none' }

/** 반올림 정수 두 개 — 합은 반드시 100 */
export function ratioPct(a: number, d: number): { pctA: number; pctB: number }
