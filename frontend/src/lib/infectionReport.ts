// 감염병 발생 분석 리포트 — A4 인쇄용(브라우저 'PDF로 저장'). 의존성 0, 벡터 품질, 기기 일관 양식.
// 현황판(InfectiousMap)의 현재 선택(감염병·기간·지표·선택지역)으로 자체완결 HTML을 만들어 새 창에서 인쇄.
// 섹션마다 분석 코멘트 포함 — 업무·발표 즉시 사용 수준. 데이터는 화면 계산값 주입(per-request 외부호출 없음). 출처·면책 포함(§10).

export interface ReportBar { label: string; value: number; valueFmt: string }
export interface ReportTable { head: string[]; rows: string[][] }
export interface ReportSection {
  title: string
  comment: string                 // 섹션별 분석 코멘트(필수)
  scopeTag?: string               // '전국' / 지역명 등
  bars?: ReportBar[]
  table?: ReportTable
  note?: string
}
export interface InfectionReportData {
  diseaseLabel: string
  periodLabel: string
  metricLabel: string
  unit: string
  scope: string                   // 전국 / 선택 지역명
  isPartial: boolean
  mapSvg: string | null
  kpis: { label: string; value: string; sub: string; tone?: 'rose' | 'up' | 'down' | 'slate' }[]
  aiComment: string               // 종합 AI 코멘트
  sections: ReportSection[]
}

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function todayStr(): string {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}. ${p(d.getMonth() + 1)}. ${p(d.getDate())}`
}

function barsHtml(bars: ReportBar[]): string {
  const max = bars.reduce((m, b) => Math.max(m, b.value), 1)
  return `<table class="bars">${bars.map((b) => `<tr><td class="bl">${esc(b.label)}</td><td class="bb"><span class="bf" style="width:${Math.max(2, (b.value / max) * 100)}%"></span></td><td class="bv">${esc(b.valueFmt)}</td></tr>`).join('')}</table>`
}
function tableHtml(t: ReportTable): string {
  return `<table class="grid"><thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i === 0 ? 'nm' : 'num'}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}
function sectionHtml(s: ReportSection): string {
  const body = (s.bars ? barsHtml(s.bars) : '') + (s.table ? tableHtml(s.table) : '')
  return `<section class="sec">
    <h2><span class="acc"></span>${esc(s.title)}${s.scopeTag ? `<span class="tag">${esc(s.scopeTag)}</span>` : ''}</h2>
    <div class="cmt">${esc(s.comment)}</div>
    ${body}
    ${s.note ? `<p class="snote">${esc(s.note)}</p>` : ''}
  </section>`
}

function reportHtml(d: InfectionReportData): string {
  const kpiTone: Record<string, string> = { rose: '#dc2626', up: '#dc2626', down: '#2563eb', slate: '#0f172a' }
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>FactDoc 감염병 발생 분석 리포트 — ${esc(d.diseaseLabel)} (${esc(d.periodLabel)}·${esc(d.scope)})</title>
<style>
  @page { size: A4 portrait; margin: 13mm 13mm 15mm; }
  * { box-sizing: border-box; }
  html,body { margin:0; padding:0; }
  body { font-family:'Pretendard','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif; color:#1e293b; font-size:10.5px; line-height:1.55; -webkit-print-color-adjust:exact; print-color-adjust:exact; background:#fff; }
  .page { max-width:184mm; margin:0 auto; }
  .cover { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #1d4ed8; padding-bottom:9px; }
  .brand { font-size:12px; font-weight:800; color:#1d4ed8; letter-spacing:-.3px; }
  .title { font-size:20px; font-weight:800; margin:4px 0 2px; letter-spacing:-.5px; }
  .subtitle { font-size:11px; color:#64748b; }
  .cover-r { text-align:right; font-size:9.5px; color:#64748b; }
  .badge { display:inline-block; margin-top:5px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:999px; padding:2px 9px; font-weight:700; font-size:9px; }
  .meta { display:flex; flex-wrap:wrap; margin:11px 0 2px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; }
  .meta div { flex:1 1 20%; padding:6px 10px; border-right:1px solid #eef2f7; }
  .meta div:last-child { border-right:0; }
  .meta .k { font-size:8.5px; color:#94a3b8; font-weight:700; }
  .meta .v { font-size:11.5px; font-weight:700; color:#0f172a; margin-top:1px; }
  .kpis { display:flex; gap:7px; margin:11px 0; }
  .kpi { flex:1; border:1px solid #e2e8f0; border-radius:9px; padding:9px 11px; }
  .kpi .k { font-size:9px; color:#94a3b8; font-weight:700; }
  .kpi .v { font-size:18px; font-weight:800; margin-top:2px; }
  .kpi .u { font-size:9px; color:#94a3b8; margin-top:1px; }
  .ai { border:1px solid #bfdbfe; background:#f5f9ff; border-radius:9px; padding:10px 12px; font-size:10.5px; line-height:1.7; color:#1e3a5f; margin-bottom:4px; }
  .ai b { color:#1d4ed8; }
  .sec { margin-top:12px; break-inside:avoid; }
  h2 { font-size:12px; font-weight:800; margin:0 0 5px; display:flex; align-items:center; gap:6px; color:#0f172a; }
  .acc { display:inline-block; width:4px; height:13px; background:#1d4ed8; border-radius:2px; }
  .tag { margin-left:auto; background:#f1f5f9; color:#475569; border-radius:999px; padding:1px 8px; font-size:9px; font-weight:700; }
  .cmt { background:#f8fafc; border-left:3px solid #cbd5e1; border-radius:0 6px 6px 0; padding:6px 10px; font-size:10px; line-height:1.65; color:#334155; margin-bottom:6px; }
  .mapwrap { border:1px solid #e2e8f0; border-radius:9px; padding:7px; text-align:center; }
  .mapwrap svg { max-width:100%; height:auto; max-height:108mm; }
  table { width:100%; border-collapse:collapse; }
  table.bars td { padding:2px 0; vertical-align:middle; }
  .bl { width:30%; font-size:9.5px; color:#475569; padding-right:6px !important; }
  .bb { width:54%; }
  .bf { display:inline-block; height:9px; border-radius:4px; background:linear-gradient(to right,#fbbf24,#f97316,#dc2626); vertical-align:middle; }
  .bv { width:16%; text-align:right; font-size:9.5px; font-weight:800; font-variant-numeric:tabular-nums; }
  table.grid th { font-size:8.5px; color:#94a3b8; text-align:center; padding:3px 5px; border-bottom:1px solid #e2e8f0; font-weight:700; }
  table.grid td { font-size:10px; padding:3px 5px; border-bottom:1px solid #f1f5f9; text-align:center; font-variant-numeric:tabular-nums; }
  table.grid td.nm { text-align:left; font-weight:700; }
  .snote { font-size:8.5px; color:#94a3b8; margin:4px 0 0; }
  .foot { margin-top:14px; padding-top:7px; border-top:1px solid #e2e8f0; font-size:8px; color:#94a3b8; line-height:1.6; }
  .print-hint { position:fixed; top:10px; right:10px; background:#1d4ed8; color:#fff; border:0; border-radius:8px; padding:8px 14px; font-size:12px; font-weight:700; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,.2); }
  @media print { .print-hint { display:none; } }
</style></head>
<body>
  <button class="print-hint" onclick="window.print()">🖨 PDF로 저장 / 인쇄</button>
  <div class="page">
    <div class="cover">
      <div>
        <div class="brand">FactDoc</div>
        <div class="title">감염병 발생 분석 리포트</div>
        <div class="subtitle">${esc(d.diseaseLabel)} · ${esc(d.periodLabel)} · ${esc(d.scope)} · ${esc(d.metricLabel)} 기준</div>
      </div>
      <div class="cover-r">생성일 ${todayStr()}<br><span class="badge">출처 · 질병관리청 감염병포털</span></div>
    </div>

    <div class="meta">
      <div><div class="k">분석 대상</div><div class="v">${esc(d.diseaseLabel)}</div></div>
      <div><div class="k">분석 범위</div><div class="v">${esc(d.scope)}</div></div>
      <div><div class="k">기준 기간</div><div class="v">${esc(d.periodLabel)}${d.isPartial ? ' (잠정)' : ''}</div></div>
      <div><div class="k">지표</div><div class="v">${esc(d.metricLabel)}</div></div>
      <div><div class="k">데이터</div><div class="v">전수신고 발생현황</div></div>
    </div>

    <div class="kpis">
      ${d.kpis.map((k) => `<div class="kpi"><div class="k">${esc(k.label)}</div><div class="v" style="color:${kpiTone[k.tone || 'slate']}">${esc(k.value)}</div><div class="u">${esc(k.sub)}</div></div>`).join('')}
    </div>

    <section class="sec"><h2><span class="acc"></span>AI 분석 코멘트</h2><div class="ai"><b>데이터를 살펴보면</b> — ${esc(d.aiComment)}</div></section>

    ${d.mapSvg ? `<section class="sec"><h2><span class="acc"></span>시·도 ${esc(d.metricLabel === '발생 수' ? '발생 분포' : '발생률 분포')} 지도<span class="tag">전국</span></h2><div class="mapwrap">${d.mapSvg}</div></section>` : ''}

    ${d.sections.map(sectionHtml).join('')}

    <div class="foot">
      본 리포트는 질병관리청 감염병포털 전수신고 발생현황 데이터를 시각화·요약한 참고 자료입니다(공공누리 제4유형 · 출처표시·요약, 원문 재배포 아님).
      발생률은 인구 10만 명당이며, 진행 중 연도·최근 주차는 신고지연에 따른 잠정치일 수 있습니다. 인구밀도·확산 분석은 통계 추정·행정구역 면적 근사 기반의 상관 참고이며 인과를 단정하지 않습니다.
      본 자료는 의료 진단·처방을 대체하지 않습니다. · FactDoc — 국가 공식데이터 기반 건강정보 팩트체커 · 생성 ${todayStr()}
    </div>
  </div>
</body></html>`
}

export function openInfectionReport(d: InfectionReportData): boolean {
  const html = reportHtml(d)
  const w = window.open('', '_blank', 'width=920,height=1200')
  if (!w) return false
  w.document.open(); w.document.write(html); w.document.close()
  w.onload = () => { try { w.focus(); setTimeout(() => w.print(), 400) } catch { /* 사용자가 상단 버튼으로 인쇄 */ } }
  return true
}
