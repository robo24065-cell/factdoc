// 공용 패널 카드 — 대시보드/전략분석 등에서 재사용(제목·설명·실데이터/데모 배지).
import type { ReactNode } from 'react'

export default function Panel({ title, desc, badge, span, children }: { title: ReactNode; desc?: string; badge?: '실데이터' | '데모' | '로드맵'; span?: string; children: ReactNode }) {
  const tag = badge === '실데이터'
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
    : badge === '로드맵'
      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 ${span ?? ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-medium text-slate-900 dark:text-white">{title}</h2>
          {desc && <p className="mt-0.5 text-xs text-slate-500">{desc}</p>}
        </div>
        {badge && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${tag}`}>{badge}</span>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}
