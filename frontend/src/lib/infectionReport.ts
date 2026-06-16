// 감염병 발생 분석 리포트 — A4 인쇄용(브라우저 'PDF로 저장'). 의존성 0, 벡터 품질, 기기 일관 양식.
// 현황판(InfectiousMap)의 현재 선택(감염병·기간·지표)으로 자체완결 HTML을 만들어 새 창에서 인쇄.
// 데이터는 이미 화면에 계산된 값을 그대로 받음(per-request 외부호출 없음). 출처 표기·면책 포함(§10).

export interface InfectionReportData {
  diseaseLabel: string
  periodLabel: string
  metricLabel: string          // '발생 수' | '인구 10만 명당 발생률'
  unit: string                 // '건' | '명/10만'
  nationTotal: string          // 포맷된 전국 합계
  topName: string
  topValue: string             // 포맷 + 단위
  yoyLabel: string             // '전년 대비' | '전주 대비'
  yoyBadge: string             // '▲12%' 등
  yoyIsUp: boolean | null      // null=기준연도
  insight: string              // 한눈에 인사이트(=AI 코멘트 본문)
  ranking: { name: string; value: number; valueFmt: string }[]
  trend: { year: string; value: string }[]
  growth: { grp: string; name: string; growthPct: number; prior: number; recent: number }[]
  growthWeek: number | null
  mapSvg: string | null
  isPartial: boolean
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}. ${p(d.getMonth() + 1)}. ${p(d.getDate())}`
}

// AI 코멘트(페르소나) — 화면 인사이트 + 데이터 기반 권고 한 줄. 사실 근거만, 단정·과장 없음.
function aiComment(d: InfectionReportData): string {
  const lines = [d.insight]
  if (d.growth.length > 0) {
    const top = d.growth.slice(0, 2).map((g) => g.name).join('·')
    lines.push(`최근 4주 기준으로는 ${top} 등의 발생이 직전 4주보다 빠르게 늘고 있어, 개인 위생수칙(손씻기·기침예절·예방접종 권장 대상 확인) 준수가 도움이 됩니다.`)
  }
  if (d.yoyIsUp === true) lines.push(`${d.yoyLabel.replace(' 대비', '')}보다 발생이 증가한 추세이므로, 유행 시기·고위험군 노출에 유의할 필요가 있습니다.`)
  else if (d.yoyIsUp === false) lines.push(`${d.yoyLabel.replace(' 대비', '')}보다는 발생이 줄었으나, 계절성·신고지연을 감안한 지속 관찰이 권장됩니다.`)
  lines.push('본 수치는 전수신고 기준의 잠정치를 포함할 수 있으며, 진단·의료적 판단을 대체하지 않습니다.')
  return lines.join(' ')
}

function reportHtml(d: InfectionReportData): string {
  const maxRank = d.ranking[0]?.value || 1
  const rankRows = d.ranking.slice(0, 10).map((r, i) => `
    <tr>
      <td class="rk">${i + 1}</td>
      <td class="nm">${esc(r.name)}</td>
      <td class="bar"><span class="barfill" style="width:${Math.max(3, (r.value / maxRank) * 100)}%"></span></td>
      <td class="val">${esc(r.valueFmt)}</td>
    </tr>`).join('')

  const trendCells = d.trend.map((t) => `<th>${esc(t.year)}</th>`).join('') + '</tr><tr>' +
    d.trend.map((t) => `<td>${esc(t.value)}</td>`).join('')

  const growthBlock = d.growth.length > 0 ? `
    <section class="sec">
      <h2><span class="acc"></span>급증 주의 신호 <small>(최근 4주 vs 직전 4주${d.growthWeek ? ` · ${d.growthWeek}주차` : ''})</small></h2>
      <table class="grid">
        <thead><tr><th style="width:10%">급</th><th style="width:46%">감염병</th><th style="width:22%">증감</th><th style="width:22%">직전→최근</th></tr></thead>
        <tbody>
          ${d.growth.slice(0, 6).map((g) => `<tr>
            <td><span class="grp">${esc(g.grp)}</span></td>
            <td class="nm">${esc(g.name)}</td>
            <td class="up">▲ ${g.growthPct >= 999 ? '신규' : g.growthPct + '%'}</td>
            <td class="muted">${g.prior} → ${g.recent}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </section>` : ''

  const yoyColor = d.yoyIsUp === true ? '#dc2626' : d.yoyIsUp === false ? '#2563eb' : '#475569'

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>FactDoc 감염병 발생 분석 리포트 — ${esc(d.diseaseLabel)} (${esc(d.periodLabel)})</title>
<style>
  @page { size: A4 portrait; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  html,body { margin:0; padding:0; }
  body { font-family: 'Pretendard','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif; color:#1e293b; font-size:11px; line-height:1.55; -webkit-print-color-adjust:exact; print-color-adjust:exact; background:#fff; }
  .page { max-width: 182mm; margin: 0 auto; }
  .cover { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #1d4ed8; padding-bottom:10px; }
  .brand { font-size:13px; font-weight:800; letter-spacing:-.3px; color:#1d4ed8; }
  .title { font-size:21px; font-weight:800; margin:5px 0 2px; letter-spacing:-.5px; }
  .subtitle { font-size:11px; color:#64748b; }
  .cover-r { text-align:right; font-size:10px; color:#64748b; }
  .badge { display:inline-block; margin-top:6px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:999px; padding:2px 9px; font-weight:700; font-size:9.5px; }
  .meta { display:flex; flex-wrap:wrap; gap:0; margin:12px 0 4px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; }
  .meta div { flex:1 1 25%; padding:7px 10px; border-right:1px solid #eef2f7; }
  .meta div:last-child { border-right:0; }
  .meta .k { font-size:9px; color:#94a3b8; font-weight:700; }
  .meta .v { font-size:12px; font-weight:700; color:#0f172a; margin-top:2px; }
  .kpis { display:flex; gap:8px; margin:12px 0; }
  .kpi { flex:1; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; }
  .kpi .k { font-size:9.5px; color:#94a3b8; font-weight:700; }
  .kpi .v { font-size:19px; font-weight:800; margin-top:3px; }
  .kpi .u { font-size:9.5px; color:#94a3b8; margin-top:1px; }
  .sec { margin-top:14px; break-inside:avoid; }
  h2 { font-size:12.5px; font-weight:800; margin:0 0 7px; display:flex; align-items:center; gap:7px; color:#0f172a; }
  h2 small { font-weight:600; color:#94a3b8; font-size:9.5px; }
  .acc { display:inline-block; width:4px; height:14px; background:#1d4ed8; border-radius:2px; }
  .ai { border:1px solid #bfdbfe; background:#f5f9ff; border-radius:10px; padding:11px 13px; font-size:11px; line-height:1.7; color:#1e3a5f; }
  .ai b { color:#1d4ed8; }
  .mapwrap { border:1px solid #e2e8f0; border-radius:10px; padding:8px; text-align:center; }
  .mapwrap svg { max-width:100%; height:auto; max-height:118mm; }
  .legend { font-size:9px; color:#94a3b8; margin-top:3px; }
  table { width:100%; border-collapse:collapse; }
  table.grid th { font-size:9px; color:#94a3b8; text-align:left; padding:4px 6px; border-bottom:1px solid #e2e8f0; }
  table.grid td { font-size:10.5px; padding:4px 6px; border-bottom:1px solid #f1f5f9; }
  .rk { width:7%; color:#94a3b8; font-weight:700; }
  .nm { font-weight:700; }
  td.bar { width:56%; }
  .barfill { display:inline-block; height:9px; border-radius:4px; background:linear-gradient(to right,#fbbf24,#f97316,#dc2626); vertical-align:middle; }
  td.val { text-align:right; font-weight:800; width:18%; font-variant-numeric:tabular-nums; }
  .grp { display:inline-block; background:#f1f5f9; border-radius:3px; padding:1px 5px; font-size:9px; font-weight:700; color:#475569; }
  .up { color:#dc2626; font-weight:800; }
  .muted { color:#94a3b8; }
  .trend th { font-size:9.5px; color:#64748b; padding:5px 4px; border-bottom:1px solid #e2e8f0; text-align:center; font-weight:700; }
  .trend td { font-size:11px; padding:6px 4px; text-align:center; font-weight:700; font-variant-numeric:tabular-nums; }
  .foot { margin-top:16px; padding-top:8px; border-top:1px solid #e2e8f0; font-size:8.5px; color:#94a3b8; line-height:1.6; }
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
        <div class="subtitle">${esc(d.diseaseLabel)} · ${esc(d.periodLabel)} · ${esc(d.metricLabel)} 기준</div>
      </div>
      <div class="cover-r">
        생성일 ${todayStr()}<br>
        <span class="badge">출처 · 질병관리청 감염병포털</span>
      </div>
    </div>

    <div class="meta">
      <div><div class="k">분석 대상</div><div class="v">${esc(d.diseaseLabel)}</div></div>
      <div><div class="k">기준 기간</div><div class="v">${esc(d.periodLabel)}${d.isPartial ? ' (잠정)' : ''}</div></div>
      <div><div class="k">지표</div><div class="v">${esc(d.metricLabel)}</div></div>
      <div><div class="k">데이터</div><div class="v">전수신고 발생현황</div></div>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="k">전국 ${esc(d.metricLabel === '발생 수' ? '발생수' : '발생률')}</div><div class="v">${esc(d.nationTotal)}</div><div class="u">${esc(d.unit)}</div></div>
      <div class="kpi"><div class="k">최다 발생지</div><div class="v" style="color:#dc2626">${esc(d.topName)}</div><div class="u">${esc(d.topValue)}</div></div>
      <div class="kpi"><div class="k">${esc(d.yoyLabel)}</div><div class="v" style="color:${yoyColor}">${esc(d.yoyBadge)}</div><div class="u">${d.yoyIsUp === null ? '기준' : '증감'}</div></div>
    </div>

    <section class="sec">
      <h2><span class="acc"></span>AI 분석 코멘트</h2>
      <div class="ai"><b>데이터를 살펴보면</b> — ${esc(aiComment(d))}</div>
    </section>

    ${d.mapSvg ? `<section class="sec">
      <h2><span class="acc"></span>시·도 ${esc(d.metricLabel === '발생 수' ? '발생 분포' : '발생률 분포')}</h2>
      <div class="mapwrap">${d.mapSvg}<div class="legend">색이 진할수록 ${esc(d.metricLabel === '발생 수' ? '발생이 많음' : '발생률이 높음')} · 단위 ${esc(d.unit)}</div></div>
    </section>` : ''}

    <section class="sec">
      <h2><span class="acc"></span>시·도 ${esc(d.metricLabel === '발생 수' ? '발생' : '발생률')} 순위 <small>상위 ${Math.min(10, d.ranking.length)}개 시·도</small></h2>
      <table class="grid"><tbody>${rankRows || '<tr><td class="muted" style="padding:10px">발생 데이터가 없습니다.</td></tr>'}</tbody></table>
    </section>

    ${d.trend.length > 1 ? `<section class="sec">
      <h2><span class="acc"></span>연도별 추이 <small>전국 · ${esc(d.unit)}</small></h2>
      <table class="trend"><tbody><tr>${trendCells}</tr></tbody></table>
    </section>` : ''}

    ${growthBlock}

    <div class="foot">
      본 리포트는 질병관리청 감염병포털 전수신고 발생현황 데이터를 시각화·요약한 참고 자료입니다(공공누리 제4유형 · 출처표시·요약, 원문 재배포 아님).
      발생률은 인구 10만 명당이며, 진행 중 연도·최근 주차는 신고지연에 따른 잠정치일 수 있습니다.
      본 자료는 의료 진단·처방을 대체하지 않으며, 증상이 의심되면 의료기관·질병관리청 안내를 따르세요. · FactDoc — 국가 공식데이터 기반 건강정보 팩트체커
    </div>
  </div>
</body></html>`
}

// 새 창을 열어 리포트를 렌더 + 인쇄(브라우저 PDF 저장). 팝업 차단 시 false.
export function openInfectionReport(d: InfectionReportData): boolean {
  const html = reportHtml(d)
  const w = window.open('', '_blank', 'width=900,height=1200')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  // 폰트·SVG 레이아웃 후 인쇄 대화상자(사용자 버튼으로도 가능)
  w.onload = () => { try { w.focus(); setTimeout(() => w.print(), 350) } catch { /* 사용자가 상단 버튼으로 인쇄 */ } }
  return true
}
