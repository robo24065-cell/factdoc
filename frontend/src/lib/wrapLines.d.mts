/** 캔버스 줄바꿈 규칙 — 기억 카드 PNG 와 그 회귀 검사가 같은 함수를 쓴다 */
export function wrapLines(
  ctx: { measureText: (s: string) => { width: number } },
  text: string,
  maxW: number,
): string[]
