/* ────────────────────────────────────────────────────────────────
   북BTI 축 비율의 산식 — 화면과 검사 스크립트가 **같은 함수**를 쓴다

   왜 .mjs 인가 (wrapLines.mjs 와 같은 이유)
     이 산식이 이 놀이의 정직성 축이다. 「대비 매치만 센다」·「되돌린 선택은
     빠진다」·「정확히 반반이면 결승 선택으로」가 어긋나면 화면에 그럴듯한
     거짓 비율이 뜬다 — 눈으로는 못 잡는다. 그래서 규칙을 순수 함수 하나로
     떼어 두고 scripts/verify-bukbti.mjs 가 **이 파일을 그대로 불러** 단위
     검사를 돌린다. 검사가 규칙을 베껴 적으면 베낀 쪽만 맞고 화면은 틀린다.

   대비 매치란
     한 대결의 두 항목에 붙은 글자가 서로 다른 경우다. 같은 편끼리 붙으면
     (국 대 국) 무엇을 골라도 국이라 취향을 말해 주지 않으므로 분모에서 뺀다.
   ──────────────────────────────────────────────────────────────── */

/** 대비 매치만 세어 분자·분모를 낸다.
 *  matches — 되돌리기가 이미 반영된 실제 선택 이력 [{ win, lose }, …]
 *  tagOf   — 항목 key → 글자 (없으면 그 대결은 조용히 건너뛴다)
 *  aLetter — 그 축의 a 글자(분자가 세는 쪽)
 *  @returns {{ a: number, d: number }} a 분자 · d 대비 매치 수(분모)
 */
export function countContrast(matches, tagOf, aLetter) {
  let a = 0
  let d = 0
  for (const m of matches ?? []) {
    const tw = tagOf(m.win)
    const tl = tagOf(m.lose)
    if (!tw || !tl) continue
    if (tw === tl) continue
    d += 1
    if (tw === aLetter) a += 1
  }
  return { a, d }
}

/** 비율 → 글자·출처. 50%를 넘는 쪽이 글자다.
 *  정확히 반반이거나 대비 매치가 0회면 글자는 null 이고 화면이 결승 선택으로 폴백한다.
 *  @returns {{ letter: string|null, src: 'ratio'|'final'|'none' }}
 */
export function decideLetter(a, d, aLetter, bLetter) {
  if (d === 0) return { letter: null, src: 'none' }
  if (a * 2 > d) return { letter: aLetter, src: 'ratio' }
  if (a * 2 < d) return { letter: bLetter, src: 'ratio' }
  return { letter: null, src: 'final' }
}

/** 반올림 정수 두 개 — 합이 반드시 100 이 되게 한쪽을 100 빼기 다른쪽으로 낸다.
 *  @returns {{ pctA: number, pctB: number }}
 */
export function ratioPct(a, d) {
  const pctA = Math.round((a / d) * 100)
  return { pctA, pctB: 100 - pctA }
}
