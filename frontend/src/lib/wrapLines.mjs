/* 캔버스 줄바꿈 — 기억 카드 PNG 가 쓰는 규칙 한 벌.
 *
 * 왜 파일을 갈라 두는가
 *   이 규칙은 **화면에서 눈으로 확인하기 어려운 종류의 사고**를 낸다. 오류가 나지 않고,
 *   글자가 한 칸 밀리거나 단어 중간이 끊길 뿐이라 캡처를 봐도 넘어가기 쉽다.
 *   그래서 브라우저 없이 node 가 곧바로 재도록 순수 함수로 떼어 둔다
 *   (scripts/nk-verify-deck.mjs 가 가짜 measureText 로 이 파일을 직접 시험한다).
 *
 * 무엇을 지키는가 — 두 가지뿐이다. 브라우저의 줄바꿈 알고리즘을 재현하지 않는다.
 *   ① 라틴·숫자 연속열을 단어 중간에서 쪼개지 않는다.
 *      실측 사고: 'ABC 123' 이 'ABC 12' / '3' 으로 갈라졌다.
 *   ② 넘쳐서 새 줄로 넘어온 공백은 버린다.
 *      실측 사고: 둘째 줄이 공백으로 시작해 한 칸 들여쓴 것처럼 보였다.
 *   한글은 어느 글자에서 끊어도 되므로 한 글자씩 본다(미리보기 쪽은
 *   theme/gohyang.ts 의 PROSE = word-break:keep-all 이 어절을 지킨다).
 */

/** 라틴·숫자 연속열(붙은 문장부호 포함)은 한 덩어리, 나머지는 한 글자 */
const TOKENS = /[A-Za-z0-9]+(?:[.,:/%-][A-Za-z0-9]+)*|[\s\S]/g

/**
 * @param {{ measureText: (s: string) => { width: number } }} ctx  실제 캔버스 컨텍스트 또는 같은 모양의 자
 * @param {string} text   \n 으로 문단이 갈린다
 * @param {number} maxW   한 줄이 넘을 수 없는 폭(px)
 * @returns {string[]}    그릴 줄들. 어느 줄도 공백으로 시작하지 않는다.
 */
export function wrapLines(ctx, text, maxW) {
  const out = []
  for (const para of String(text ?? '').split('\n')) {
    const toks = para.match(TOKENS) ?? []
    let line = ''
    let pushed = 0
    const flush = () => { out.push(line.replace(/\s+$/, '')); pushed += 1 }
    for (const tok of toks) {
      /* 한 덩어리가 줄보다 길면 그때만 글자 단위로 쪼갠다 — 넘쳐 잘리는 것보다 낫다 */
      const parts = ctx.measureText(tok).width > maxW ? [...tok] : [tok]
      for (const t of parts) {
        const next = line + t
        if (ctx.measureText(next).width > maxW && line.trim()) {
          flush()
          line = /^\s+$/.test(t) ? '' : t
        } else {
          line = next
        }
      }
    }
    if (line.trim() || pushed === 0) flush()
  }
  return out
}
