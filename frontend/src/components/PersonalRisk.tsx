// 개인화 위험도 — 나이·성별·기저질환 → 공식 유병률 맥락 + 또래 감염병 + '내 조건에서 위험한 가짜정보'.
// 마이페이지(사용자)에 통합. KNHANES 유병률·EID 또래·루머KB 결합. PII 미전송(로컬)·진단 아님.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { prevalenceFor, rumorsFor } from '../engine'
import { eidPeerTop } from '../lib/eidStats'

const CONDITIONS: { key: string; label: string }[] = [
  { key: '제2형당뇨', label: '당뇨' }, { key: '고혈압', label: '고혈압' }, { key: '비만', label: '비만' }, { key: '이상지질혈증', label: '이상지질혈증' },
]
function dangerOf(rumor: string): { level: '높음' | '중간' | '낮음'; tone: string } {
  if (/완치|끊|중단|대체|단식|안 ?맞|필요\s*없|평생/.test(rumor)) return { level: '높음', tone: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' }
  if (/즙|민간|특효|보조제|효능|좋다/.test(rumor)) return { level: '중간', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' }
  return { level: '낮음', tone: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' }
}

export default function PersonalRisk({ age, sex }: { age: number; sex: 'M' | 'F' | '' }) {
  const [conds, setConds] = useState<string[]>([])
  const sx: 'male' | 'female' | '' = sex === 'M' ? 'male' : sex === 'F' ? 'female' : ''
  const ageBand = age >= 20 ? `${Math.min(70, Math.floor(age / 10) * 10)}대` : ''
  const toggle = (k: string) => setConds((c) => (c.includes(k) ? c.filter((x) => x !== k) : [...c, k]))
  const peer = ageBand && sx ? eidPeerTop(ageBand, sx, 3) : null

  if (!(age > 0) || !sx) {
    return (
      <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 text-sm dark:border-blue-950 dark:bg-blue-950/20">
        <p className="font-medium text-blue-900 dark:text-blue-200">🛡 내 조건 맞춤 위험·가짜정보</p>
        <p className="mt-1 text-[13px] text-blue-800/80 dark:text-blue-200/80">위에서 <b>만 나이·성별</b>을 입력하면, 또래 감염병과 ‘내 조건에서 특히 위험한 가짜정보’를 보여드려요.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 dark:border-blue-950 dark:bg-blue-950/20">
      <p className="font-medium text-blue-900 dark:text-blue-200">🛡 내 조건 맞춤 위험·가짜정보</p>
      <p className="mt-0.5 text-[12px] text-blue-800/70 dark:text-blue-200/70">기저질환을 고르면 공식 유병률·또래 감염병과 함께 ‘내가 특히 조심할 가짜정보’를 알려드려요.</p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {CONDITIONS.map((c) => (
          <button key={c.key} type="button" onClick={() => toggle(c.key)} className={`rounded-full border px-2.5 py-1 text-xs ${conds.includes(c.key) ? 'border-blue-400 bg-blue-100 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}>{c.label}</button>
        ))}
      </div>

      {(conds.length > 0 || peer) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {/* 유병률 */}
          {conds.length > 0 && (
            <div className="rounded-xl bg-white p-3 dark:bg-slate-900">
              <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">📊 내 또래 공식 유병률 (KNHANES)</p>
              <div className="mt-1.5 space-y-2">
                {conds.map((k) => { const p = prevalenceFor(k, age); if (!p) return null; const mid = (p.range[0] + p.range[1]) / 2; return (
                  <div key={k}><div className="flex justify-between text-[12px]"><span className="text-slate-600 dark:text-slate-300">{p.label}{p.scope === '연령대' && ageBand ? ` · ${ageBand}` : ''}</span><span className="font-semibold text-slate-800 dark:text-slate-100">{p.range[0]}~{p.range[1]}%</span></div><div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${Math.min(100, mid * 1.6)}%` }} /></div></div>
                ) })}
              </div>
            </div>
          )}
          {/* 또래 감염병 */}
          {peer && peer.rows.length > 0 && (
            <div className="rounded-xl bg-white p-3 dark:bg-slate-900">
              <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">🦠 내 또래 유행 감염병 ({peer.band} {sx === 'male' ? '남성' : '여성'})</p>
              <ol className="mt-1.5 space-y-1 text-[13px]">
                {peer.rows.map((d, i) => (<li key={d.name} className="flex items-center gap-2"><span className="text-slate-400">{i + 1}.</span><span className="flex-1 truncate text-slate-700 dark:text-slate-200">{d.name}</span>{d.surging && <span className="rounded bg-rose-500 px-1 text-[9px] font-bold text-white">급증</span>}<span className="text-xs text-slate-400">{d.count.toLocaleString()}건</span></li>))}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* 내 조건 위험 가짜정보 */}
      {conds.length > 0 && (
        <div className="mt-3 space-y-2">
          {conds.map((k) => { const rumors = rumorsFor(k) ?? []; const label = CONDITIONS.find((c) => c.key === k)?.label ?? k; if (!rumors.length) return null; return (
            <div key={k} className="rounded-xl border border-rose-100 bg-rose-50/40 p-3 dark:border-rose-950 dark:bg-rose-950/20">
              <p className="text-[13px] font-semibold text-rose-800 dark:text-rose-200">🚨 {label} 있다면 특히 조심할 가짜정보</p>
              <ul className="mt-1.5 space-y-1.5">
                {rumors.slice(0, 3).map((rm, i) => { const d = dangerOf(rm); return (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-rose-900/90 dark:text-rose-100/90"><span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${d.tone}`}>위험 {d.level}</span><span className="flex-1">“{rm}”</span><Link to={`/?q=${encodeURIComponent(rm)}`} className="shrink-0 text-xs text-blue-600">검증 →</Link></li>
                ) })}
              </ul>
            </div>
          ) })}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-blue-900/50 dark:text-blue-200/50">
        ※ 유병률=질병청 KNHANES, 또래 감염병=감염병포털. 참고용·개인 진단 아님. 약·치료 임의 중단 금지, 증상 의심 시 전문가·질병관리청(1339). 입력값 서버 미전송.
      </p>
    </div>
  )
}
