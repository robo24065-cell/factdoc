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
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`글자 크기: ${LABELS[i]}. 누르면 더 크게`}
      title="글자 크기 조절"
      className="flex shrink-0 items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-slate-600 active:scale-95 dark:border-slate-700 dark:text-slate-300"
    >
      <span className="leading-none text-[11px]">가</span>
      <span className="leading-none text-[15px] font-bold">가</span>
      <span className="text-[10px] text-slate-400">{LABELS[i]}</span>
    </button>
  )
}
