import { useEffect, useState } from 'react'

// 글자 크게 — 고령층·저시력 사용자 접근성. html 기준 폰트크기를 키워 rem 기반 텍스트 전체를 비례 확대.
const SIZES = [16, 18, 20]
const LABELS = ['보통', '크게', '아주 크게']
const KEY = 'factdoc_fontscale'

export default function FontScale() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const saved = Math.max(0, Math.min(SIZES.length - 1, parseInt(localStorage.getItem(KEY) || '0', 10) || 0))
    setI(saved)
    document.documentElement.style.fontSize = `${SIZES[saved]}px`
  }, [])
  const cycle = () => {
    const n = (i + 1) % SIZES.length
    setI(n)
    document.documentElement.style.fontSize = `${SIZES[n]}px`
    try { localStorage.setItem(KEY, String(n)) } catch { /* ignore */ }
  }
  /* ★ 고령자·저시력 사용자를 위한 스위치가 화면에서 가장 작으면 안 된다(실측 76×25px).
     theme/gohyang.ts 의 최소 타깃 규약(≥48px)을 이 단추부터 지킨다. */
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`글자 크기: ${LABELS[i]}. 누르면 더 크게`}
      title="글자 크기 조절"
      className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center gap-1 rounded-full border border-slate-200 px-3 py-2 text-slate-600 active:scale-95 dark:border-slate-700 dark:text-slate-300"
    >
      <span className="leading-none text-[11px]">가</span>
      <span className="leading-none text-[15px] font-bold">가</span>
      <span className="text-[10px] text-slate-400">{LABELS[i]}</span>
    </button>
  )
}
