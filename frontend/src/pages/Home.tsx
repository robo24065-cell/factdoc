import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { adviceAnswer, analyzeProduct, checkStatClaim, classifyIntent, dishCaution, drugAnswer, explainLocal, findAllInText, findInText, foodAnswer, foodAnswerAll, foodsFor, guidanceFor, ingredientsInText, isBeneficialClaim, isCureClaim, isHarmfulClaim, isNonFood, judge, officialFunction, parseClaim, runPipeline, sharesDomain, suggest, symptomsFor, targetMatchNote, type DrugResult, type FoodResult, type IngredientInfo, type Judgement, type ProductAnalysis, type Verdict } from '../engine'
import { variantsOf } from '../engine/ontology'
import { mergeTriples } from '../engine/fromRaw'
import { geminiTriples } from '../lib/parseRemote'
import { fetchGroundedAnswer, fetchTopMisinfo, logQuery, type GroundedPassage, type TopClaim } from '../lib/db'
import { outbreakList } from './dashboardData'
import { getCachedVerdict, getSemanticCachedVerdict, cacheVerdict } from '../lib/cache'
import { embedText } from '../lib/embed'
import { type EvidenceChunk } from '../lib/search'
import { preventionHint } from '../lib/prevention'
import { fetchDiseaseSections, explainDiseaseInfo, type InfoAnswer } from '../lib/info'
import { eidPeerTop, eidLatestOutbreak } from '../lib/eidStats'
import { feedbackUp, feedbackDown } from '../lib/feedback'
import { explainVerdict } from '../lib/explain'
import WhyTrace from '../components/WhyTrace'
import Highlight from '../components/Highlight'

const VUI: Record<Verdict, { label: string; sub: string; text: string; bg: string; accent: string }> = {
  true: { label: '사실이에요', sub: '국가 공식 근거와 일치해요', text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-950/30', accent: 'bg-emerald-500' },
  partial: { label: '일부만 맞아요', sub: '과장되었거나 조건이 빠졌어요', text: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-950/30', accent: 'bg-amber-500' },
  false: { label: '사실이 아니에요', sub: '국가 공식 근거와 달라요', text: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-50 dark:bg-rose-950/30', accent: 'bg-rose-500' },
  unverified: { label: '확인이 어려워요', sub: '공식 데이터에 근거가 없어요', text: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800/60', accent: 'bg-slate-400' },
}

const EXAMPLES = ['당뇨는 △△즙으로 완치된대요', '설탕 많이 먹으면 당뇨 걸리나요', '뎅기열이 뭔가요?', 'E형 간염이 뭔가요?']

// 여러 주장 검증 — 인라인 결과 배지(주장 옆 [검증결과])
const VBADGE: Record<Verdict, { label: string; cls: string }> = {
  true: { label: '사실', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  partial: { label: '근거 제한적', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  false: { label: '거짓', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' },
  unverified: { label: '공식근거 없음', cls: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
}
// 긴 글/여러 주장 → 주장 후보 문장 분리(문장부호·줄바꿈·불릿). 짧은 조각 제외.
function splitClaims(text: string): string[] {
  // 문장부호·줄바꿈·불릿으로 분리. "통곡물: 현미…도움" 같은 라벨형은 콜론 뒤 본문도 분리.
  return text.split(/(?<=[.!?。…])\s+|[\n;·•]+/).flatMap((s) => s.split(/(?<=다\.)\s*/))
    .map((s) => s.replace(/^[\s\-*▶•·]+/, '').replace(/^\d+[.)]\s*/, '').trim()).filter((s) => s.length >= 6)
}
// 실제 '주장'만(표제어·라벨 제외): 엔티티 + (효익/위험/관계 신호 또는 수치)
const CLAIM_SIGNAL = /좋|도움|효과|낮추|낮아|줄이|줄여|늘리|피하|풍부|예방|관리|배출|확장|이완|억제|쌓이|올리|상승|감소|위험|탁월|권장|제한|보충|공급|선택|드세요|마세요|됩니다|줍니다|좋습니다|좋은|풀어|풍미/
// 술어(서술형 종결)가 있어야 '주장' — 표제어/라벨('…관리법.', '…음식')은 제외
const hasPredicate = (s: string) => /(다|요|음|함|됨|죠|네|까)[.!?)\]]*$/.test(s) || /니다|세요|어요|아요|\d/.test(s)
const claimLike = (s: string) => s.length >= 10 && !!(findInText(s, 'disease') || findInText(s, 'subject')) && (CLAIM_SIGNAL.test(s) || /\d/.test(s)) && hasPredicate(s)

// 멀티 주장 1건 — 주장 옆 [검증결과] + 클릭 시 판단근거·설명 펼침(단일 카드와 같은 양식)
type MultiClaim = { text: string; j: Judgement; exp: string }
function MultiItem({ m }: { m: MultiClaim }) {
  const b = VBADGE[m.j.verdict]
  const dz = m.j.triples[0]?.objectDisease
  return (
    <details className="group rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-3 [&::-webkit-details-marker]:hidden">
        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${b.cls}`}>{b.label}</span>
        <span className="flex-1 text-sm leading-snug text-slate-800 dark:text-slate-100">{m.text}</span>
        <span className="shrink-0 text-slate-400 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-slate-100 p-3 dark:border-slate-800">
        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{m.exp}</p>
        {dz && dz !== '(미상)' && <p className="mt-1.5 text-[11px] text-slate-400">관련 질환: {dz}</p>}
        {m.j.warning && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">⚠ {m.j.warning}</div>}
        <div className="mt-2"><WhyTrace j={m.j} /></div>
        {m.j.citations.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs">
            {m.j.citations.map((c, i) => (
              <li key={i}><a href={c.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">{c.portal} — {c.title}</a></li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}

// 스니펫 정리: 선행 "[섹션]" 라벨 제거 + 문장경계로 자연스럽게 절단
function cleanSnippet(text: string, max = 180): string {
  let s = text.replace(/^\s*\[[^\]]+\]\s*/, '').trim()
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const lastEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('다.'), cut.lastIndexOf('요.'))
  s = lastEnd > max * 0.5 ? cut.slice(0, lastEnd + 1) : cut.trimEnd() + '…'
  return s
}

// 합성 카드용 통합 식품/약/성분 타입
type SubCard =
  | { kind: 'drug'; data: DrugResult }
  | { kind: 'food'; data: FoodResult }
  | { kind: 'ingredient'; name: string; info: IngredientInfo }
  | { kind: 'product'; data: ProductAnalysis; note: string | null }

const FOOD_LV: Record<string, { t: string; c: string }> = {
  mfds: { t: '식약처 인정', c: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  research: { t: '연구됨', c: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' },
  folk: { t: '민간', c: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  caution: { t: '주의', c: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' },
  none: { t: '효과 미확인', c: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
}

function subLabel(s: SubCard): string {
  return s.kind === 'ingredient' ? s.name : s.data.name
}

// 후속 질문 추천 — 인식된 질병 기반 탐색 유도(어시스턴트 느낌). 기능성 카테고리는 제외.
const FUNCTION_CATS = new Set(['면역기능', '항산화', '장건강', '눈건강', '관절건강', '인지기능', '체지방', '피로', '혈당조절', '심혈관질환', '뼈건강', '간건강', '피부건강', '전립선건강', '갱년기'])
function relatedQuestions(canonical: string, display: string): string[] {
  if (FUNCTION_CATS.has(canonical)) return []
  return [`${display} 증상이 뭐예요?`, `${display}에 좋은 음식은?`, `${display} 예방법 알려줘`]
}

// 한국어 조사 — 받침 유무로 이/가·은/는·을/를 선택
function josa(word: string, pair: '이가' | '은는' | '을를'): string {
  const ch = word.charCodeAt(word.length - 1)
  const hasFinal = ch >= 0xac00 && ch <= 0xd7a3 ? (ch - 0xac00) % 28 !== 0 : /[a-z0-9]/i.test(word.slice(-1))
  return word + (hasFinal ? pair[0] : pair[1])
}

// 합성 코멘트(질병 없이 2개 이상일 때) — Gemini 불필요 결정론
function synthComment(disease: string | null, subs: SubCard[]): string {
  const list = subs.map(subLabel).join(' · ')
  if (disease) return `‘${disease}’와 관련해 ${list}을(를) 살펴봤어요. 아래에서 각각의 성분·효과를 확인하세요. 식품·성분이 질병을 ‘치료’한다고 단정하진 않아요.`
  return `${list}을(를) 살펴봤어요. 아래에서 각각 확인하세요.`
}

// ── AI 종합 판단 카드(질병 + 약/음식) — "먹어도 되는지" 판단+근거+연결고리(Why-Trace). 결정론 ──
export type TJTone = 'good' | 'caution' | 'consult' | 'neutral' | 'overstated'
export interface TJChip { subject: string; link: string; object: string }
export interface TJStep { icon: string; tag: string; label: string; outcome?: string }
export interface TopJudgment { tone: TJTone; label: string; comment: string; basis: string; chips: TJChip[]; steps: TJStep[]; mfds: { raw: string; func: string; total: number } | null }

const TJ_UI: Record<TJTone, { sub: string; text: string; bg: string; accent: string }> = {
  good: { sub: '공식 정보로 종합한 참고 판단', text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-950/30', accent: 'bg-emerald-500' },
  caution: { sub: '섭취·복용에 주의가 필요해요', text: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-950/30', accent: 'bg-amber-500' },
  consult: { sub: '전문가 확인을 권하는 사안이에요', text: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-50 dark:bg-blue-950/30', accent: 'bg-blue-500' },
  neutral: { sub: '공식 근거가 제한적이에요', text: 'text-slate-700 dark:text-slate-300', bg: 'bg-slate-100 dark:bg-slate-800/60', accent: 'bg-slate-400' },
  overstated: { sub: '공식 인정 범위를 벗어난 주장이에요', text: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-50 dark:bg-rose-950/30', accent: 'bg-rose-500' },
}
const TJ_LABEL: Record<TJTone, string> = { good: '도움이 될 수 있어요', caution: '주의가 필요해요', consult: '전문가 상담을 권해요', neutral: '효과 근거는 제한적이에요', overstated: '공식 효과로 보기 어려워요' }

// 약 효능 문구가 가리키는 증상 — 질병의 '증상 완화'에 쓰는 약인지 판단
const SYMPTOM_KW = ['발열', '열', '해열', '통증', '진통', '두통', '몸살', '근육통', '신경통', '감기', '콧물', '코막힘', '기침', '가래', '인후', '소화', '속쓰림', '설사', '변비', '메스꺼움', '구역', '가려움', '염증', '부기', '콜레스테롤', '혈압', '혈당', '피로']

function buildTopJudgment(disease: string, subs: SubCard[], claim: string): TopJudgment {
  const parts: string[] = []
  const chips: TJChip[] = []
  const steps: TJStep[] = []
  const mfds = officialFunction(claim)
  let good = false, caution = false, consult = false, overstated = false
  for (const s of subs) {
    if (s.kind === 'drug') {
      const nm = s.data.itemName.split('(')[0]
      const hitAll = SYMPTOM_KW.filter((k) => (s.data.efcy || '').includes(k))
      const hit = hitAll.filter((k) => !hitAll.some((o) => o !== k && o.includes(k))).slice(0, 3) // 부분중복 제거(발열⊃열)
      const relevant = hit.length > 0
      chips.push({ subject: nm, link: '허가 효능', object: relevant ? hit.join('·') : disease })
      if (relevant) {
        good = true
        parts.push(`${josa(nm, '은는')} ${hit.join('·')} 등 증상 완화에 쓰는 약이에요(식약처 허가 효능). 다만 ${disease} 자체를 치료하는 약은 아니에요.`)
        steps.push({ icon: '⚖️', tag: '룰', label: `${nm} 식약처 허가 효능`, outcome: `${hit.join('·')} 등 증상에 사용` })
        steps.push({ icon: '📏', tag: '경계', label: '질병 치료 여부', outcome: `${disease} 자체 치료가 아니라 증상 완화용` })
      } else {
        consult = true
        parts.push(`${josa(nm, '이가')} ${disease}에 맞는 약인지는 분명치 않아, 복용 전 약사·의사와 상담하세요.`)
        steps.push({ icon: '📏', tag: '경계', label: `${nm} ↔ ${disease} 적응증`, outcome: '명확치 않음 → 전문가 상담' })
      }
      if (s.data.interact) { parts.push('함께 먹으면 안 되는 약·음식이 있으니 상호작용을 꼭 확인하세요.'); steps.push({ icon: '⚠️', tag: '주의', label: '약물·음식 상호작용', outcome: '함께 먹으면 안 되는 것 있음' }) }
    } else if (s.kind === 'food') {
      const f = s.data
      const best = f.matched ? f.effects[0] : null
      chips.push({ subject: f.name, link: best ? '효과' : '효과(근거?)', object: disease })
      // 악화·위험 방향 감지 — research/folk에도 '악화 연관'(흰쌀밥→여드름, 라면→부종 등)이 많아 텍스트로 방향 판별
      const adverseFood = best && best.level !== 'mfds' && /악화|악영향|저류|붓|방해|떨어뜨|저하|부담|유발|위험|나빠|가중|억제|흡수를 (줄|떨어)|체중\s?증가|비만|살이|줄일 수|주의가 (필요|권)/.test(best.effect)
      if (best?.level === 'caution' || adverseFood) { caution = true; parts.push(`${josa(f.name, '은는')} ${josa(disease, '이가')} 있다면 섭취에 주의가 필요할 수 있어요. ${best.effect}`); steps.push({ icon: '🔍', tag: '근거', label: `${f.name} 근거 수준`, outcome: '⚠ 섭취 주의' }) }
      else if (best && (best.level === 'mfds' || best.level === 'research')) { good = true; parts.push(`${f.name}의 ${josa(f.components[0] ?? '성분', '이가')} ${disease} 관련해 도움이 될 수 있다고 알려져 있어요(치료 보장은 아님). ${best.effect}`); steps.push({ icon: '🔍', tag: '근거', label: `${f.name} 근거 수준`, outcome: best.level === 'mfds' ? '식약처 인정 기능성' : '연구됨(공식 효능 인정은 아님)' }) }
      else if (best?.level === 'folk') { parts.push(`${josa(f.name, '은는')} 민간에서 ${disease}에 쓰이지만 공식 효능은 인정되지 않았어요.`); steps.push({ icon: '🔍', tag: '근거', label: `${f.name} 근거 수준`, outcome: '민간 사용(공식 효능 아님)' }) }
      else { parts.push(`${josa(f.name, '이가')} ${disease}에 직접 효과가 있다는 공식 근거는 충분치 않아요. 균형 잡힌 식사의 일부로 참고하세요.`); steps.push({ icon: '🔍', tag: '근거', label: `${f.name} ↔ ${disease} 근거`, outcome: '공식 근거 충분치 않음' }) }
    } else if (s.kind === 'ingredient') {
      // ★성분의 인정 기능성이 '그 질병'과 같은 영역일 때만 도움. 무관하면(프로폴리스↔암) 식약처 부당광고로 디벙크.
      const relevant = sharesDomain(s.info.efficacy, disease)
      if (relevant) {
        if (s.info.mfds) good = true
        chips.push({ subject: s.name, link: s.info.mfds ? '식약처 인정' : '효능', object: disease })
        parts.push(`${josa(s.name, '은는')} ${s.info.efficacy}`)
        steps.push({ icon: '🔍', tag: '근거', label: `${s.name} 기능성`, outcome: s.info.mfds ? '식약처 인정 기능성' : '일반 효능 정보' })
      } else {
        overstated = true
        chips.push({ subject: s.name, link: '인정 기능성 ≠', object: disease })
        parts.push(`${josa(s.name, '은는')} ${s.info.efficacy} 다만 ${disease}에 효과가 있다는 공식 근거는 아니에요. 건강기능식품은 질병을 직접 치료·예방한다고 표방할 수 없어요(식약처).`)
        steps.push({ icon: '⚖️', tag: '룰', label: `${s.name} 인정 기능성 ↔ ${disease}`, outcome: '무관 — 질병 효과 표방 불가' })
      }
      if (s.info.caution) { caution = true; parts.push(`${s.name}은(는) ${s.info.caution}.`) }
    } else {
      chips.push({ subject: s.data.name, link: '성분', object: disease })
      parts.push(`${s.data.name}의 성분 효능은 아래 카드를 참고하세요. 제품 자체가 ${disease}를 치료하는 건 아니에요.`)
      steps.push({ icon: '🔍', tag: '근거', label: `${s.data.name} 성분`, outcome: '성분별 효능(아래 카드)' })
    }
  }
  // 건기식 원료가 질병을 예방·치료한다는 뉘앙스면 식약처 룰을 명시(이미 overstated로 설명했으면 중복 생략)
  if (mfds && !overstated && !sharesDomain(mfds.func, disease)) {
    overstated = true
    parts.push(`참고로 ${josa(mfds.raw, '은는')} 건강기능식품 원료로, 인정 기능성은 ‘${mfds.func.slice(0, 40)}…’ 수준이에요. ${disease}에 효과가 있다는 근거는 아니며, 건강기능식품은 질병을 직접 치료·예방한다고 표방할 수 없어요(식약처).`)
    steps.push({ icon: '⚖️', tag: '룰', label: `${mfds.raw} 인정 기능성 ↔ ${disease}`, outcome: '무관 — 질병 효과 표방 불가' })
  }
  const tone: TJTone = overstated ? 'overstated' : caution ? 'caution' : good ? 'good' : consult ? 'consult' : 'neutral'
  steps.push({ icon: '✅', tag: '판단', label: '종합 판단', outcome: TJ_LABEL[tone] })
  const comment = parts.join(' ') + ' 증상이 심하거나 지속되면 의료기관에서 진료받으세요.'
  const basis = `${subs.map((s) => (s.kind === 'drug' ? s.data.itemName.split('(')[0] : subLabel(s))).join('·')} · ${disease} 공식 정보를 종합했어요.`
  return { tone, label: TJ_LABEL[tone], comment, basis, chips, steps, mfds }
}

// 식품/약/성분 카드 1개 — collapsed면 아코디언(접힘), 아니면 펼친 카드
function SubstanceCard({ sub, collapsed }: { sub: SubCard; collapsed: boolean }) {
  const meta = ((): { accent: string; bg: string; titleColor: string; title: string; subtitle: string; badge: string; body: ReactNode } => {
    if (sub.kind === 'drug') {
      const d = sub.data
      return {
        accent: 'bg-cyan-500', bg: 'bg-cyan-50 dark:bg-cyan-950/30', titleColor: 'text-cyan-700 dark:text-cyan-300',
        title: `💊 ${d.itemName}`, subtitle: d.entp || '식약처 허가 의약품', badge: '식약처 공식',
        body: (
          <>
            {d.efcy && (<><p className="text-xs font-medium text-cyan-700 dark:text-cyan-300">이 약의 효능</p><p className="mt-0.5 text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">{d.efcy}</p></>)}
            {d.interact && (<div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"><span className="font-medium">⚠ 같이 먹으면 안 되는 것(상호작용):</span> {d.interact.length > 200 ? `${d.interact.slice(0, 200)}…` : d.interact}</div>)}
            {(d.use || d.caution || d.side) && (
              <details className="group mt-3 rounded-xl border border-slate-200 dark:border-slate-800">
                <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-medium text-slate-700 dark:text-slate-200 [&::-webkit-details-marker]:hidden">용법·주의사항·부작용 보기<span className="text-slate-400 transition group-open:rotate-180">▾</span></summary>
                <div className="space-y-2 border-t border-slate-100 p-3 text-sm dark:border-slate-800">
                  {d.use && <p className="text-slate-600 dark:text-slate-300"><b className="text-slate-700 dark:text-slate-200">용법:</b> {d.use}</p>}
                  {d.caution && <p className="text-slate-600 dark:text-slate-300"><b className="text-slate-700 dark:text-slate-200">주의사항:</b> {d.caution.length > 300 ? `${d.caution.slice(0, 300)}…` : d.caution}</p>}
                  {d.side && <p className="text-slate-600 dark:text-slate-300"><b className="text-slate-700 dark:text-slate-200">이상반응:</b> {d.side.length > 200 ? `${d.side.slice(0, 200)}…` : d.side}</p>}
                </div>
              </details>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">출처: 식품의약품안전처 의약품개요정보(e약은요). 같은 성분이라도 제품·함량이 다를 수 있어요. 정확한 복용은 약사·의사와 상담하세요. 의료 진단이 아닙니다.</p>
          </>
        ),
      }
    }
    if (sub.kind === 'food') {
      const f = sub.data
      return {
        accent: 'bg-teal-500', bg: 'bg-teal-50 dark:bg-teal-950/30', titleColor: 'text-teal-700 dark:text-teal-300',
        title: f.name, subtitle: f.disease ? `${f.disease}와(과)의 관계` : '성분·효과 분석', badge: '음식·성분',
        body: (
          <>
            {f.components.length > 0 && (<p className="text-sm text-slate-600 dark:text-slate-300"><span className="font-medium">주요 성분:</span> {f.components.join(' · ')}</p>)}
            <ul className="mt-2 space-y-2">
              {f.effects.map((e, i) => (
                <li key={i} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">{e.condition}<span className={`rounded px-1 text-[10px] ${FOOD_LV[e.level]?.c ?? FOOD_LV.none.c}`}>{FOOD_LV[e.level]?.t ?? '미확인'}</span></p>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{e.effect}</p>
                </li>
              ))}
            </ul>
            {!f.matched && f.disease && (<p className="mt-2 text-sm text-slate-500">‘{f.disease}’에 대한 직접적인 효과 정보는 충분치 않아요. 위는 일반적으로 알려진 효과예요.</p>)}
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">음식·성분의 일반적 효과 정보예요(치료를 보장하지 않음). 표준 치료를 대체하지 말고, 정확한 건 전문가와 상담하세요.</p>
          </>
        ),
      }
    }
    if (sub.kind === 'ingredient') {
      return {
        accent: 'bg-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30', titleColor: 'text-violet-700 dark:text-violet-300',
        title: sub.name, subtitle: '성분 정보', badge: '성분',
        body: (
          <>
            <p className="flex items-center gap-1.5 text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">{sub.info.efficacy}{sub.info.mfds && <span className="rounded bg-emerald-100 px-1 text-[10px] text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">식약처 인정기능성</span>}</p>
            {sub.info.caution && <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">⚠ {sub.info.caution}</p>}
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">성분의 일반적 효능 정보예요. 특정 제품의 효과를 보장하지 않아요. 출처: 식품의약품안전처 인정기능성 등.</p>
          </>
        ),
      }
    }
    // product
    const a = sub.data
    return {
      accent: 'bg-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30', titleColor: 'text-violet-700 dark:text-violet-300',
      title: a.name, subtitle: `${a.maker ? a.maker + ' · ' : ''}${a.category ?? ''}`, badge: '성분 분석',
      body: (
        <>
          <p className="text-sm text-slate-500">주요 성분과 일반적으로 알려진 효능이에요.</p>
          <ul className="mt-2 space-y-2">
            {a.ingredients.map((ing, i) => (
              <li key={i} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
                <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-100">{ing.name}{ing.info.mfds && <span className="rounded bg-emerald-100 px-1 text-[10px] text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">식약처 인정기능성</span>}</p>
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{ing.info.efficacy}</p>
                {ing.info.caution && <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">⚠ {ing.info.caution}</p>}
              </li>
            ))}
          </ul>
          {sub.note && <p className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-950/30 dark:text-blue-200">{sub.note}</p>}
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">특정 제품의 효과를 보장하는 정보가 아니라 ‘성분’의 일반적 효능 정보예요. 정확한 효능·복용은 제품 표시사항과 전문가 상담을 따르세요.</p>
        </>
      ),
    }
  })()

  if (collapsed) {
    return (
      <details className="group mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <summary className={`flex cursor-pointer list-none items-center gap-3 p-4 ${meta.bg} [&::-webkit-details-marker]:hidden`}>
          <div className={`h-9 w-1.5 rounded-full ${meta.accent}`} />
          <div className="min-w-0">
            <p className={`truncate text-base font-semibold ${meta.titleColor}`}>{meta.title}</p>
            <p className="truncate text-xs text-slate-500">{meta.subtitle}</p>
          </div>
          <span className="ml-auto shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800">{meta.badge}</span>
          <span className="shrink-0 text-slate-400 transition group-open:rotate-180">▾</span>
        </summary>
        <div className="border-t border-slate-100 p-4 dark:border-slate-800">{meta.body}</div>
      </details>
    )
  }
  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className={`flex items-center gap-3 p-4 ${meta.bg}`}>
        <div className={`h-11 w-1.5 rounded-full ${meta.accent}`} />
        <div className="min-w-0"><p className={`text-lg font-semibold ${meta.titleColor}`}>{meta.title}</p><p className="text-xs text-slate-500">{meta.subtitle}</p></div>
        <span className="ml-auto shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800">{meta.badge}</span>
      </div>
      <div className="p-4">{meta.body}</div>
    </div>
  )
}

export default function Home() {
  const [params] = useSearchParams()
  const [input, setInput] = useState('')
  const [result, setResult] = useState<Judgement | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [explaining, setExplaining] = useState(false)
  const [hitKind, setHitKind] = useState<'exact' | 'semantic' | null>(null)
  const [evidence, setEvidence] = useState<EvidenceChunk[]>([])
  const [grounded, setGrounded] = useState<GroundedPassage[]>([])
  const [info, setInfo] = useState<InfoAnswer | null>(null)
  const [substances, setSubstances] = useState<SubCard[]>([])
  const [topComment, setTopComment] = useState<string | null>(null)
  const [topJudgment, setTopJudgment] = useState<TopJudgment | null>(null)
  const [related, setRelated] = useState<string[]>([])
  const [fb, setFb] = useState<'up' | 'down' | null>(null)
  const [multi, setMulti] = useState<MultiClaim[] | null>(null)
  const [focused, setFocused] = useState(false)
  // 내 또래 감염병 — 마이페이지 프로필(연령·성별)로 1회 산출(제미나이가 못 내는 개인화 답)
  const [peer] = useState(() => {
    try { const p = JSON.parse(localStorage.getItem('factdoc_profile') || '{}'); return p.age ? eidPeerTop(p.age, p.sex || '') : null } catch { return null }
  })
  const suggestions = focused && input.trim().length >= 1 ? suggest(input, 6) : []
  const [listening, setListening] = useState(false)
  // 음성 입력(Web Speech API) — 고령층·TV 시청 중 "들은 대로 말하면 검증". 무료·키 불필요.
  const SR = typeof window !== 'undefined' ? (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition : undefined
  function startVoice() {
    if (!SR || listening) return
    try {
      const rec = new (SR as new () => { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void })()
      rec.lang = 'ko-KR'; rec.interimResults = false
      rec.onresult = (e) => { const txt = e.results[0]?.[0]?.transcript ?? ''; if (txt) { setInput(txt); setFocused(false); check(txt) } }
      rec.onend = () => setListening(false)
      rec.onerror = () => setListening(false)
      setListening(true); rec.start()
    } catch { setListening(false) }
  }
  const [infoSummarizing, setInfoSummarizing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [topMisinfo, setTopMisinfo] = useState<TopClaim[] | null>(null)
  const [recent, setRecent] = useState<string[]>([])
  // 지금 유행 감염병 — EID 최신주차(2026 현재)에서 직접 산출(옛 Supabase 2024 테이블 대체)
  const outbreak = eidLatestOutbreak().rows
  useEffect(() => {
    fetchTopMisinfo().then(setTopMisinfo).catch(() => {})
    try { setRecent(JSON.parse(localStorage.getItem('factdoc_recent') || '[]')) } catch { /* ignore */ }
  }, [])
  function pushRecent(q: string) {
    setRecent((prev) => { const next = [q, ...prev.filter((x) => x !== q)].slice(0, 8); try { localStorage.setItem('factdoc_recent', JSON.stringify(next)) } catch { /* ignore */ } return next })
  }

  async function check(text: string) {
    const claim = text.trim()
    if (!claim) return
    pushRecent(claim)
    setLoading(true); setExplanation(null); setExplaining(false); setEvidence([]); setHitKind(null)
    setInfo(null); setInfoSummarizing(false); setResult(null); setGrounded([]); setSubstances([]); setTopComment(null); setTopJudgment(null); setRelated([]); setFb(null); setMulti(null)

    // 0·) 여러 주장이 섞인 긴 글(챗봇 답변·블로그 복붙) → 주장별로 나눠 각각 판정(인라인 [검증결과] + 펼침)
    {
      const parts = splitClaims(claim)
      const claimParts = parts.filter(claimLike)
      if (claim.length >= 60 && parts.length >= 2 && claimParts.length >= 2) {
        const docDz = findInText(claim, 'disease')?.canonical || '' // 글 전체의 주제 질환(문장에 질환명 없을 때 폴백)
        const rank = { mfds: 3, research: 2, folk: 1, caution: 0, none: -1 } as Record<string, number>
        const verifyOne = (s: string): MultiClaim => {
          let j = runPipeline(s)
          let exp = explainLocal(j)
          if (j.verdict === 'unverified') {
            const dz = j.triples[0]?.objectDisease || findInText(s, 'disease')?.canonical || docDz
            // (a) 해로운 음식 경고가 맞는지 — 고염·고지방 등 dishCaution 매칭이면 '경고가 맞음'=사실
            if ((isHarmfulClaim(s) || /피하|줄이|폭탄|주의|멀리|제한/.test(s)) && dz) {
              const dc = dishCaution(s, dz)
              if (dc) { j = { ...j, verdict: 'true', confidence: 0.55 }; exp = `맞는 주의예요. ${dc.msg}` }
            }
            // (b) 음식이 질환에 도움 주장 — 음식 KB에서 '그 질환(docDz)' 도메인 효과가 있을 때만 보강(도움=사실, 민간/과장=근거 제한)
            if (j.verdict === 'unverified' && dz && (isBeneficialClaim(s) || /좋|도움|풍부|낮추|배출|확장|공급|보충/.test(s))) {
              const food = foodAnswer(s) // 문장에 질환명 없어도 음식은 잡힘(matched 무관)
              if (food && food.effects.length) {
                const rel = food.effects.filter((e) => e.condition.includes(dz) || sharesDomain(e.condition, dz))
                const eff = rel.slice().sort((a, b) => rank[b.level] - rank[a.level])[0]
                if (eff && eff.level !== 'none') {
                  const over = /탁월|특효|완치|즉시|무조건|최고|100%|단번|확실/.test(s)
                  const v: Verdict = (eff.level === 'caution' || eff.level === 'folk' || over) ? 'partial' : 'true'
                  j = { ...j, verdict: v, confidence: eff.level === 'mfds' ? 0.7 : 0.5 }
                  exp = `${food.name} — ${eff.effect}${over ? ' 다만 ‘탁월·특효’ 같은 표현은 과장일 수 있어요(식품은 보조적).' : ' 식품은 보조적이며 약·표준치료를 대체하지 않아요.'}`
                }
              }
            }
          }
          return { text: s, j, exp }
        }
        const items: MultiClaim[] = claimParts.slice(0, 24).map(verifyOne)
        setMulti(items); setLoading(false)
        void logQuery(claim, 'unverified', 'multi')
        return
      }
    }
    // 후속 질문 추천 — 질병 인식 시(어떤 경로로 답하든 표시)
    { const dzR = findInText(claim, 'disease'); if (dzR) setRelated(relatedQuestions(dzR.canonical, dzR.variants[0] || dzR.canonical).filter((q) => q !== claim)) }

    // 0a) 통계/유병률 주장이면 KNHANES 정합성 판정(정보분류·캐시보다 우선) — 결정론. 합성카드보다 먼저.
    const stat = checkStatClaim(claim)
    if (stat) {
      const local = explainLocal(stat)
      setResult(stat); setHitKind(null); setLoading(false); setExplanation(local)
      void logQuery(claim, stat.verdict)
      void cacheVerdict(claim, stat, local)
      return
    }

    // 0b) 합성 카드 — 식품/약/성분/제품이 인식되면 (질환 위 + 식품·약 아래 아코디언).
    //     완치/특효 단정 주장은 제외(룰엔진 허위 경로로). 효과·정보 조회만 여기서 처리.
    if (!isCureClaim(claim)) {
      const subs: SubCard[] = []
      const drugA = drugAnswer(claim)
      if (drugA) subs.push({ kind: 'drug', data: drugA })
      const prodA = analyzeProduct(claim)
      if (prodA && prodA.kind === 'product') subs.push({ kind: 'product', data: prodA, note: targetMatchNote(prodA, claim) })
      for (const f of foodAnswerAll(claim)) subs.push({ kind: 'food', data: f })
      // 단독 성분(비타민C 등) — 이미 음식/제품/약으로 잡힌 것과 겹치지 않을 때만
      const norm = (x: string) => x.toLowerCase().replace(/\s+/g, '')
      const covered = subs.map((s) => norm(subLabel(s)))
      for (const ing of ingredientsInText(claim)) {
        const n = norm(ing.name)
        if (!covered.some((c) => c.includes(n) || n.includes(c))) { subs.push({ kind: 'ingredient', name: ing.name, info: ing.info }); covered.push(n) }
      }
      if (subs.length > 0) {
        setSubstances(subs)
        const dz = findInText(claim, 'disease')
        if (dz) {
          // 합성 카드에선 질병 카드는 '순수 질병 관리 안내'만(음식별 평가는 위의 AI 판단이 담당 — 중복·사족 제거)
          const g = guidanceFor(dz.canonical)
          const sections = await fetchDiseaseSections(dz.canonical)
          setInfo({ disease: dz.canonical, summary: g?.text ?? '', sections, hasOfficial: sections.length > 0, citation: g?.citation, isGuidance: !!g })
          // 질병 + 약/음식 → 최상단 AI 종합 판단('먹어도 되는지' + 근거)
          setTopJudgment(buildTopJudgment(dz.canonical, subs, claim))
        } else if (subs.length >= 2) {
          setTopComment(synthComment(null, subs))
        }
        setLoading(false)
        void logQuery(claim, 'unverified', subs[0].kind)
        return
      }
    }

    // 0c) 음식 스마트 응답 — KB 미수록 음식(짬뽕·짜장면 등)도 이름의 영양속성으로, "○○에 좋은 음식은" 추천.
    if (!isCureClaim(claim)) {
      const dzF = findInText(claim, 'disease')
      if (dzF) {
        // 약물 오사용 — 바이러스 질환에 항생제: 음식 분기로 새기 전에 직답(질병청 항생제 오남용 주의)
        if (/항생제|항생물질/.test(claim) && /감기|독감|인플루엔자|코로나|바이러스|몸살/.test(claim + dzF.canonical)) {
          const sections = await fetchDiseaseSections(dzF.canonical)
          setInfo({ disease: dzF.canonical, summary: `감기·독감 같은 바이러스 질환에는 항생제가 듣지 않아요. 항생제는 세균 감염에만 효과가 있고, 필요 없이 쓰면 내성균을 키우고 부작용 위험만 커집니다(질병관리청은 항생제 오남용 주의를 당부합니다). 증상이 심하거나 오래가면 의료기관에서 진료받으세요.`, sections, hasOfficial: sections.length > 0, citation: undefined, isGuidance: true })
          setLoading(false); void logQuery(claim, 'unverified', 'info'); return
        }
        if (/좋은\s*음식|추천\s*음식|뭐\s*먹|먹으면\s*좋|도움.*음식|음식.*추천|뭐를?\s*먹/.test(claim)) {
          const foods = foodsFor(dzF.canonical)
          if (foods.length) {
            const sections = await fetchDiseaseSections(dzF.canonical)
            setInfo({ disease: dzF.canonical, summary: `${dzF.canonical} 관리에 도움이 된다고 알려지거나 연구된 음식: ${foods.map((f) => f.name).join(', ')}. (식품별 근거 수준은 다르고 공식 효능 인정은 일부에 한해요. 균형 잡힌 식사의 일부로 참고하세요.)`, sections, hasOfficial: sections.length > 0, citation: undefined, isGuidance: true })
            setLoading(false); void logQuery(claim, 'unverified', 'info'); return
          }
        }
        if (/먹어도|먹으면|드셔도|드시면|섭취|괜찮|좋아|효과|되나|될까|돼\?|먹는|드세요/.test(claim)) {
          const dc = dishCaution(claim, dzF.canonical)
          if (dc) {
            const sections = await fetchDiseaseSections(dzF.canonical)
            setInfo({ disease: dzF.canonical, summary: dc.msg, sections, hasOfficial: sections.length > 0, citation: undefined, isGuidance: true })
            setLoading(false); void logQuery(claim, 'unverified', 'info'); return
          }
          // 위험 속성이 없는(중립) 음식 — 명시적 섭취 표현 + 비음식(약·물 등) 아닐 때만(위험 오답 방지)
          if (!isNonFood(claim) && /먹|드시|드셔|드세요|섭취|식단|식이/.test(claim)) {
            const g = guidanceFor(dzF.canonical)
            const core = g?.text ? g.text.split(/(?<=[.。])\s/)[0].slice(0, 90) : ''
            const sections = await fetchDiseaseSections(dzF.canonical)
            setInfo({ disease: dzF.canonical, summary: `해당 음식에서 ${dzF.canonical} 관리에 특별히 주의할 성분은 확인되지 않았어요. 균형 잡힌 식사의 일부로 적당량 드시면 괜찮습니다.${core ? ` 다만 핵심은 — ${core}` : ''} (음식 이름으로 추정한 일반 정보예요. 개인차가 있고 진단·치료를 대체하지 않아요.)`, sections, hasOfficial: sections.length > 0, citation: g?.citation, isGuidance: true })
            setLoading(false); void logQuery(claim, 'unverified', 'info'); return
          }
        }
      }
    }

    // 0b) 의도 분류 — "X가 뭔가요/증상/예방" 정보질문이면 공식정보로 바로 응답(판정 아님)
    //     ★단, 완치·약대체 주장(약 끊고 등)은 정보질문으로 흘리지 않고 판정(허위+경고)으로 보냄(안전).
    const intent = classifyIntent(claim)
    //     주체(식품/약 제외한 백신·운동 등)+관계가 있으면 '주장'이므로 정보질문이 아니라 판정 대상 → verify로.
    //     (완치·약대체·위해·효과 주장 모두 포함). 순수 정의/증상/조언 질문만 info 카드.
    const isRelationalClaim = !!findInText(claim, 'subject') && (isCureClaim(claim) || isHarmfulClaim(claim) || isBeneficialClaim(claim))
    if (intent.intent === 'info' && intent.disease && !isRelationalClaim) {
      // 복합 질문 — 두 질환이 함께 언급되면 한쪽만 답하지 않고 양쪽 관리를 병합(예: "당뇨랑 고혈압 같이 있으면")
      const multi = findAllInText(claim, 'disease', 2)
      if (multi.length >= 2) {
        const cut = (s: string) => { const f = s.split(/(?<=[.。])\s/)[0]; return f.length > 90 ? f.slice(0, 90) + '…' : f }
        const lines = multi.slice(0, 2).map((d) => { const g = guidanceFor(d.canonical); return g ? `${d.canonical} — ${cut(g.text)}` : '' }).filter(Boolean)
        if (lines.length >= 2) {
          const names = multi.slice(0, 2).map((d) => d.canonical).join(' · ')
          setInfo({ disease: names, summary: `${names} — 두 질환이 함께 있을 때는 어느 한쪽만이 아니라 양쪽을 같이 관리하는 게 중요해요. ${lines.join(' / ')} 공통적으로 체중 관리·규칙적인 운동·금연·절주·싱겁고 균형 잡힌 식사가 핵심입니다. 두 질환이 함께 있으면 위험이 더해질 수 있으니 정기 검진과 의료진 상담을 권합니다.`, sections: [], hasOfficial: false, citation: undefined, isGuidance: true })
          setLoading(false); void logQuery(claim, 'unverified', 'info'); return
        }
      }
      const disease = intent.disease
      const sections = await fetchDiseaseSections(disease)
      // ★측면 질문(합병증/증상/원인…)은 코퍼스 본문으로 답. 일반 관리 안내는 조언/관리 질문에만.
      const aspectKw = (claim.match(/합병증|증상|원인|진단|검사|치료|예방|관리|종류|단계|경과|예후|위험요인|전조/) || [])[0]
      let summary = '', isGuid = false
      let cite: { portal: string; title: string; url?: string } | undefined
      // 코퍼스(질병청 공식 본문)가 있으면 우선 — 측면질문은 해당 섹션, 아니면 개요. 없을 때만 일반 관리 안내.
      if (sections.length) {
        const best = (aspectKw && sections.find((s) => (s.section + s.text).includes(aspectKw))) || sections[0]
        summary = best.text; cite = { portal: best.portal || '질병관리청 국가건강정보포털', title: `${disease} ${best.section || '공식 정보'}`, url: best.url ?? undefined }
      }
      if (!summary) { const adv = adviceAnswer(claim); if (adv) { summary = adv.text; isGuid = true; cite = adv.citation } }
      setInfo({ disease, summary, sections, hasOfficial: sections.length > 0, citation: cite, isGuidance: isGuid })
      setLoading(false)
      void logQuery(claim, 'unverified', 'info')
      if (!summary) { // 코퍼스·안내 없으면 Gemini 요약
        setInfoSummarizing(true)
        const s = await explainDiseaseInfo(disease, sections)
        setInfo((prev) => (prev && prev.disease === disease ? { ...prev, summary: s } : prev))
        setInfoSummarizing(false)
      }
      return
    }

    // 1) 정확 일치 캐시(무료·즉시)
    const cached = await getCachedVerdict(claim)
    if (cached) {
      setResult(cached.judgement); setHitKind('exact')
      setExplanation(cached.explanation ?? explainLocal(cached.judgement)); setLoading(false)
      return // 캐시 히트(중복 질문)는 로그/집계/AI호출 안 함
    }

    // 2) 임베딩 1회 → 의미 캐시(유사 질문) + 하이브리드 근거검색에 재사용
    const vec = await embedText(claim)
    if (vec) {
      const sem = await getSemanticCachedVerdict(claim, vec)
      if (sem) {
        setResult(sem.judgement); setHitKind('semantic')
        setExplanation(sem.explanation ?? explainLocal(sem.judgement)); setLoading(false)
        return
      }
    }

    // 3) 미스 → 규칙 + Gemini 파싱 결합 → 룰·그래프 판정
    const triples = mergeTriples(parseClaim(claim), await geminiTriples(claim))
    let j = judge(triples, claim)
    let local = explainLocal(j)
    setResult(j); setHitKind(null); setLoading(false); setExplanation(local)
    void logQuery(claim, j.verdict)

    // 3.5) 코퍼스 그라운딩 — 질병 인식 시 그 질병의 공식 본문에서만 관련 자료를 가져와 표시(무관 자료 방지).
    //      보류면 치료맥락 본문으로 판정 보강(손코딩 트리플 없어도 실제 KDCA 본문으로 답).
    const dz = findInText(claim, 'disease')
    const subjE = findInText(claim, 'subject')
    if (dz) {
      const g = await fetchGroundedAnswer(variantsOf(dz.canonical), subjE ? variantsOf(subjE.canonical) : [])
      if (g.length) {
        setGrounded(g)
        if (j.verdict === 'unverified') {
          const beneficial = /(효과|좋|낫|도움|바르|치료|관리|개선|쓰)/.test(claim) && !/(안\s|못\s|효과 ?없|소용없|거짓|아니)/.test(claim)
          const sN = subjE ? subjE.canonical.toLowerCase().replace(/\s+/g, '') : ''
          const treHit = g.find((x) => x.treatment && (!sN || x.text.toLowerCase().replace(/\s+/g, '').includes(sN)))
          if (treHit && subjE && beneficial) {
            j = { ...j, verdict: 'true', confidence: 0.72, citations: [{ portal: treHit.portal, title: `${dz.canonical} — 질병청 공식 정보`, url: treHit.url ?? undefined }] }
            local = `질병관리청 공식 자료에 따르면 ${subjE.canonical}은(는) ${dz.canonical}의 치료·관리에 쓰여요. 아래 공식 자료를 확인하세요.`
            setResult(j); setExplanation(local)
          } else {
            local = `이 주장만으로 단정하긴 어렵지만, ${dz.canonical} 관련 질병관리청 공식 자료에 참고할 내용이 있어요. 아래를 확인해보세요.`
            setExplanation(local)
          }
        }
      }
    }

    // 5) AI 설명문(되면 교체, 다운/쿼터소진이면 로컬 유지) → 캐시 저장
    setExplaining(true)
    const exp = await explainVerdict(claim, j)
    if (exp) setExplanation(exp)
    setExplaining(false)
    void cacheVerdict(claim, j, exp || local, vec)
  }

  useEffect(() => {
    const q = params.get('q')
    if (q) { setInput(q); void check(q) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  function share() {
    if (!result) return
    const src = result.citations[0]?.portal
    const text = `[FactDoc 팩트체크]\n"${result.claimText}"\n→ ${VUI[result.verdict].label}\n\n${explanation ?? '국가 공식데이터로 확인했어요.'}${src ? `\n📌 출처: ${src}` : ''}\n\n※ 의료 진단이 아니며 참고용입니다.`
    const flash = () => { setCopied(true); setTimeout(() => setCopied(false), 1800) }
    if (typeof navigator !== 'undefined' && navigator.share) navigator.share({ text }).then(flash).catch(() => {})
    else navigator.clipboard?.writeText(text).then(flash).catch(() => {})
  }

  // 답변 품질 피드백 — 불만족이면 사용자가 본 답변 전체(모든 카드·근거 펼쳐) 스냅샷 → AI/규칙 검토 → 부실응답 큐.
  function collectSnapshot(): string {
    const main = typeof document !== 'undefined' ? document.querySelector('main') : null
    if (!main) return ''
    main.querySelectorAll('details').forEach((d) => { (d as HTMLDetailsElement).open = true })
    return (main as HTMLElement).innerText.replace(/[ \t]+/g, ' ').slice(0, 6000)
  }
  async function onFeedback(rating: 'up' | 'down') {
    if (fb) return
    setFb(rating)
    const claim = result?.claimText || info?.disease || input.trim()
    const verdict = result?.verdict || (info ? 'info' : topJudgment ? 'judgment' : 'unverified')
    if (rating === 'up') feedbackUp(claim, verdict)
    else { const snap = `[질문] ${claim}\n` + collectSnapshot(); void feedbackDown(claim, verdict, snap) }
  }

  const vui = result ? VUI[result.verdict] : null
  // 건기식 원료가 주장에 있으면 식약처 인정 기능성을 반증 근거로 표시(§13.2·§13.11 자동반증 룰)
  const mfds = result ? officialFunction(result.claimText) : null
  const steps = result ? result.trace.filter((s) => s.outcome && s.kind !== 'normalize') : []
  // 근거 하이라이트(Span Grounding)용 — 주장의 질병·주체 표면형
  const highlightTerms = result
    ? [...new Set(result.triples.flatMap((t) => [...variantsOf(t.objectDisease), ...variantsOf(t.subject)]).filter((x) => x && x !== '(미상)'))]
    : []

  return (
    <div>
      <h1 className="mt-2 text-[22px] font-semibold leading-snug text-slate-900 dark:text-white">건강 정보,<br />진짜일까요?</h1>
      <p className="mt-1.5 text-sm text-slate-500">TV·유튜브·단톡방에서 본 건강 주장을 검증하거나, 궁금한 질병·증상 정보를 물어보세요. 국가 공식 데이터로 답해드려요.</p>

      <div className="relative mt-5 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setFocused(false); check(input) } }}
          rows={2}
          placeholder="예: 설탕 많이 먹으면 당뇨 걸리나요?"
          className="w-full resize-none rounded-xl bg-transparent p-2 text-base text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
        />
        {/* 검색 자동완성 — 질병·음식·성분 추천(네이버·구글식) */}
        {suggestions.length > 0 && (
          <div className="absolute inset-x-2 top-[58px] z-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
            {suggestions.map((s) => (
              <button key={s.text} type="button"
                onMouseDown={(e) => { e.preventDefault(); setInput(s.text); setFocused(false); check(s.text) }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/50">
                <span className="text-slate-300">🔍</span>
                <span className="flex-1">{s.text}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400 dark:bg-slate-700">{s.kind === 'disease' ? '질병·증상' : '음식·성분'}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-1 flex gap-2">
          {Boolean(SR) && (
            <button type="button" onClick={startVoice} aria-label="음성으로 물어보기" title="음성으로 물어보기"
              className={`flex shrink-0 items-center justify-center rounded-xl border px-4 transition active:scale-95 ${listening ? 'animate-pulse border-rose-300 bg-rose-50 text-rose-600 dark:border-rose-800 dark:bg-rose-950/40' : 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-300'}`}>
              <span className="text-xl">🎙️</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => { setFocused(false); check(input) }}
            disabled={!input.trim() || loading}
            className="flex-1 rounded-xl bg-blue-600 py-3.5 text-base font-semibold text-white transition active:scale-[0.99] disabled:opacity-40"
          >
            {loading ? '확인 중…' : '확인하기'}
          </button>
        </div>
        {listening && <p className="mt-1.5 text-center text-xs text-rose-500">🔴 듣고 있어요… 말씀하세요</p>}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" onClick={() => { setInput(ex); check(ex) }}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            {ex}
          </button>
        ))}
      </div>

      {/* 디스커버리 — 초기 화면 빈 공간에 신뢰 신호 + 유행/가짜정보 발견 퍼널 */}
      {!loading && !result && !info && !topJudgment && !topComment && !multi && substances.length === 0 && (() => {
        const out = (outbreak.length ? outbreak.map((o) => ({ name: o.name, trend: o.trend })) : outbreakList.map((o) => ({ name: o.name, trend: o.trend.includes('급증') || o.trend.includes('증가') ? 'up' : 'flat' }))).slice(0, 4)
        const fakes = (topMisinfo && topMisinfo.length ? topMisinfo.map((t) => ({ label: t.claim, q: t.claim })) : [
          { label: '당뇨가 특정 즙으로 완치된다', q: '당뇨는 △△즙으로 완치된대요' },
          { label: '건강기능식품이 병을 치료한다', q: '이 영양제가 당뇨를 치료한대요' },
          { label: '약 끊고 자연요법만 하면 된다', q: '당뇨에 좋다고 약 끊고 걷기만 하면 된대요' },
        ]).slice(0, 3)
        const decade = peer ? peer.band.split('~')[0] + '대' : ''
        return (
          <div className="mt-5 space-y-5">
            {/* ★내 또래 감염병 — 제미나이/검색엔진이 구조적으로 못 내는 '당신 또래에서 지금 이게 많다' (질병청 연령별 실데이터) */}
            {peer && peer.rows.length > 0 ? (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/60 dark:bg-blue-950/20">
                <h2 className="text-sm font-semibold text-blue-900 dark:text-blue-100">🧑‍🤝‍🧑 {decade} 또래에게 많은 감염병</h2>
                <p className="mt-0.5 text-[11px] leading-relaxed text-blue-700/70 dark:text-blue-300/70">질병관리청 연령별 신고 통계 기준 · 검색·챗봇엔 없는 ‘내 또래’ 실데이터</p>
                <div className="mt-2.5 space-y-1.5">
                  {peer.rows.map((r, i) => (
                    <Link key={r.name} to={`/disease/${encodeURIComponent(r.name)}`}
                      className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 dark:bg-slate-900">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-200">{i + 1}</span>
                      <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">{r.name}</span>
                      {r.surging && <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:bg-rose-950/50 dark:text-rose-300">지금 ▲{r.growthPct}%</span>}
                      <span className="text-slate-300">›</span>
                    </Link>
                  ))}
                </div>
                <p className="mt-2 text-center text-[11px] text-blue-700/60 dark:text-blue-300/50">탭하면 관련 가짜정보 검증 + 질병청 공식 증상·예방을 볼 수 있어요</p>
              </div>
            ) : (
              <Link to="/me" className="block rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-3.5 text-center dark:border-blue-900/60 dark:bg-blue-950/10">
                <p className="text-[13px] text-blue-800 dark:text-blue-200">🧑‍🤝‍🧑 마이페이지에서 <b>연령대</b>를 설정하면 ‘내 또래에게 많은 감염병’을 보여드려요</p>
                <p className="mt-0.5 text-[11px] text-blue-600/70 dark:text-blue-300/60">검색·챗봇엔 없는, 질병청 연령별 실데이터 기반</p>
              </Link>
            )}
            {recent.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">🕘 최근 검색</p>
                <div className="flex flex-wrap gap-2">
                  {recent.slice(0, 6).map((q) => (
                    <button key={q} type="button" onClick={() => { setInput(q); check(q) }}
                      className="max-w-[16rem] truncate rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{q}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/30">
              <p className="text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">💡 <b className="text-slate-700 dark:text-slate-200">국가 공식데이터</b>(질병관리청·식약처)의 룰로 판정해요. AI가 진실을 임의로 판단하지 않고, 근거 출처를 함께 보여드려요.</p>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">🦠 지금 유행·주의 감염병</h2>
                <Link to="/trending" className="text-xs text-blue-500 dark:text-blue-400">전체 보기 →</Link>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {out.map((o) => (
                  <Link key={o.name} to={`/disease/${encodeURIComponent(o.name)}`}
                    className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    {o.name}
                    {o.trend === 'up' && <span className="text-[11px] font-medium text-rose-500">▲</span>}
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">⚠️ 이런 가짜정보 조심하세요</h2>
              <div className="mt-2 space-y-2">
                {fakes.map((f, i) => (
                  <button key={f.q} type="button" onClick={() => { setInput(f.q); check(f.q) }}
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left dark:border-slate-800 dark:bg-slate-900">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500 dark:bg-slate-800">{i + 1}</span>
                    <span className="flex-1 text-sm text-slate-800 dark:text-slate-100">{f.label}</span>
                    <span className="text-slate-300">›</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 text-center text-[11px] text-slate-400">탭하면 바로 검증할 수 있어요</p>
            </div>
          </div>
        )
      })()}

      {/* 여러 주장 검증 — 긴 글을 주장별로 나눠 각 주장 옆 [검증결과] + 클릭 시 판단근거 펼침 */}
      {multi && multi.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">📋 여러 주장 검증 · {multi.length}건</h2>
            <span className="text-[11px] text-slate-400">긴 글을 주장별로 나눠 각각 판정했어요</span>
          </div>
          <ul className="space-y-2">
            {multi.map((m, i) => <MultiItem key={i} m={m} />)}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">각 주장을 누르면 판단 근거가 펼쳐져요. 룰·클레임그래프 기반 판정(LLM이 진실을 판단하지 않아요). 공식 근거가 없는 주장은 ‘공식근거 없음’으로 표시돼요.</p>
        </div>
      )}

      {/* AI 종합 판단 카드 — 질병 + 약/음식: '먹어도 되는지' 판단 + 근거(최상단) */}
      {topJudgment && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className={`flex items-center gap-3 p-4 ${TJ_UI[topJudgment.tone].bg}`}>
            <div className={`h-11 w-1.5 rounded-full ${TJ_UI[topJudgment.tone].accent}`} />
            <div>
              <p className={`text-lg font-semibold ${TJ_UI[topJudgment.tone].text}`}>{topJudgment.label}</p>
              <p className="text-xs text-slate-500">{TJ_UI[topJudgment.tone].sub}</p>
            </div>
            <span className="ml-auto rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800">AI 종합 판단</span>
          </div>
          <div className="p-4">
            <p className="text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">{topJudgment.comment}</p>

            {topJudgment.mfds && (
              <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 dark:border-emerald-950 dark:bg-emerald-950/20">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">💊 {topJudgment.mfds.raw} — 식약처 인정 기능성</p>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{topJudgment.mfds.func}</p>
                <p className="mt-1 text-[11px] text-slate-400">출처: 식품의약품안전처 건강기능식품정보 (전국 {topJudgment.mfds.total.toLocaleString()}개 품목 기준)</p>
              </div>
            )}

            {/* 판단 근거 연결고리(Why-Trace) — 주장 분해 칩 + 룰·근거 단계. 기본 접힘(사용자가 펼침) */}
            <details className="group mt-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-xs font-medium text-slate-500 [&::-webkit-details-marker]:hidden">
                🧭 판단 근거 (룰·근거 추적)
                <span className="text-slate-400 transition group-open:rotate-180">▾</span>
              </summary>
              <div className="space-y-3 border-t border-slate-100 p-3 dark:border-slate-800">
                {topJudgment.chips.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-slate-400">주장 분해</p>
                    <div className="flex flex-wrap gap-1.5">
                      {topJudgment.chips.map((c, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
                          <span className="font-medium text-slate-700 dark:text-slate-200">{c.subject}</span>
                          <span className="text-slate-400">—[{c.link}]→</span>
                          <span className="font-medium text-slate-700 dark:text-slate-200">{c.object}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <ol className="relative ml-1 space-y-2 border-l border-slate-200 pl-4 dark:border-slate-700">
                  {topJudgment.steps.map((s, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-slate-400 ring-2 ring-white dark:ring-slate-900" />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500 dark:bg-slate-800">{s.icon} {s.tag}</span>
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{s.label}</span>
                        {s.outcome && <span className="rounded-full bg-slate-900/5 px-1.5 text-[10px] text-slate-600 dark:bg-white/10 dark:text-slate-300">→ {s.outcome}</span>}
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="text-[10px] text-slate-400">국가 공식데이터(식약처 허가효능·인정기능성, 질병청 정보)의 룰로 종합한 판단입니다.</p>
              </div>
            </details>

            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">본 판단은 공식 정보를 종합한 참고용이며 의료 진단·처방이 아닙니다. 정확한 복용·섭취는 의료진과 상담하세요.</p>
          </div>
        </div>
      )}

      {/* 합성 코멘트 — 질병 없이 2개 이상 식품/성분 질문 시 정리 */}
      {topComment && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[15px] leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200">
          <span className="mr-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">AI 정리</span>
          {topComment}
        </div>
      )}

      {/* 정보질문 응답 카드 (질병청 공식 정보) — 합성 시 최상단(질환) 카드 */}
      {info && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3 bg-blue-50 p-4 dark:bg-blue-950/30">
            <div className="h-11 w-1.5 rounded-full bg-blue-500" />
            <div>
              <p className="text-lg font-semibold text-blue-700 dark:text-blue-300">{info.disease}</p>
              <p className="text-xs text-slate-500">{info.isGuidance ? '질병관리청 건강관리 안내' : '질병관리청 공식 건강정보'}</p>
            </div>
            <span className="ml-auto rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800">{info.isGuidance ? '관리 안내' : '정보'}</span>
          </div>
          <div className="p-4">
            {info.summary ? (
              <p className="text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">{info.summary}</p>
            ) : infoSummarizing ? (
              <p className="flex items-center gap-2 text-sm text-slate-400">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
                질병청 공식 정보를 정리 중…
              </p>
            ) : info.hasOfficial ? (
              <p className="text-sm text-slate-500">아래 질병관리청 공식 자료를 확인하세요.</p>
            ) : null}
            {info.summary && info.citation && (
              <p className="mt-1.5 text-[11px] text-slate-400">출처: {info.citation.portal} — {info.citation.title}</p>
            )}

            {info.sections.length > 0 && (
              <details className="group mt-3 rounded-xl border border-slate-200 dark:border-slate-800">
                <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-medium text-slate-700 dark:text-slate-200 [&::-webkit-details-marker]:hidden">
                  📚 공식 자료 {info.sections.length}건
                  <span className="text-slate-400 transition group-open:rotate-180">▾</span>
                </summary>
                <ul className="space-y-2 border-t border-slate-100 p-3 dark:border-slate-800">
                  {info.sections.map((s, i) => (
                    <li key={i} className="text-sm">
                      {s.section && <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{s.section}</span>}
                      <p className="mt-0.5 leading-relaxed text-slate-600 dark:text-slate-300">{s.text.length > 180 ? `${s.text.slice(0, 180)}…` : s.text}</p>
                      {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 hover:underline dark:text-blue-400">원문 →</a>}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {symptomsFor(info.disease) && (
              <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">🩺 주요 증상 (자가 참고용)</p>
                <ul className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {symptomsFor(info.disease)!.map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-sm text-slate-600 dark:text-slate-300">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />{s}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[11px] text-slate-400">진단이 아니에요. 증상이 의심되면 의료기관에서 확인하세요.</p>
              </div>
            )}

            {preventionHint(info.disease) && (
              <details className="group mt-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-medium text-slate-700 dark:text-slate-200 [&::-webkit-details-marker]:hidden">
                  🛡 예방·관리 수칙 보기
                  <span className="text-slate-400 transition group-open:rotate-180">▾</span>
                </summary>
                <p className="px-3 pb-3 text-sm text-slate-600 dark:text-slate-300">{preventionHint(info.disease)}</p>
              </details>
            )}

            {!info.hasOfficial && (
              <p className="mt-3 text-sm text-slate-500">
                이 주제의 상세·최신 공식 정보는 질병관리청 국가건강정보포털에서 확인하실 수 있어요.
              </p>
            )}

            <a href="https://health.kdca.go.kr" target="_blank" rel="noreferrer"
              className="mt-3 inline-block text-sm font-medium text-blue-600 dark:text-blue-400">
              질병관리청 국가건강정보포털에서 더 보기 →
            </a>

            <Link to={`/disease/${encodeURIComponent(info.disease)}`}
              className="mt-4 block rounded-xl bg-blue-600 py-3 text-center text-sm font-semibold text-white active:scale-[0.99]">
              이 주제 관련 가짜정보도 확인하기
            </Link>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
              본 정보는 의료 진단이 아니며 참고용입니다. 증상이 의심되면 전문가와 상담하세요.
            </p>
          </div>
        </div>
      )}

      {/* 식품·약·성분 카드 — 질환 카드 아래 아코디언(질환 있거나 2개↑면 접힘), 단독이면 펼침 */}
      {substances.map((s, i) => (
        <SubstanceCard key={i} sub={s} collapsed={info != null || substances.length >= 2} />
      ))}

      {result && vui && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className={`flex items-center gap-3 p-4 ${vui.bg}`}>
            <div className={`h-11 w-1.5 rounded-full ${vui.accent}`} />
            <div>
              <p className={`text-lg font-semibold ${vui.text}`}>{vui.label}</p>
              <p className="text-xs text-slate-500">{vui.sub}</p>
            </div>
            {hitKind && (
              <span className="ml-auto rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800">
                {hitKind === 'semantic' ? '유사 질문 매칭' : '빠른 응답'}
              </span>
            )}
          </div>

          <div className="p-4">
            {/* AI 설명 (주된 답) */}
            {explanation ? (
              <p className="text-[15px] leading-relaxed text-slate-800 dark:text-slate-100">{explanation}</p>
            ) : explaining ? (
              <p className="flex items-center gap-2 text-sm text-slate-400">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-500" />
                AI가 쉽게 설명을 작성 중…
              </p>
            ) : (
              <p className="text-sm text-slate-500">{result.disclaimer}</p>
            )}

            <p className="mt-3 text-xs text-slate-400">입력한 내용: “{result.claimText}”</p>

            {mfds && (
              <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 dark:border-emerald-950 dark:bg-emerald-950/20">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">💊 {mfds.raw} — 식약처 인정 기능성</p>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{mfds.func}</p>
                <p className="mt-1.5 text-[12px] text-slate-500">건강기능식품의 기능성은 ‘질병 위험 감소·생리활성·영양소 기능’ 수준이며, 질병을 직접 <b>치료·예방</b>한다고 표방할 수 없어요(식약처). 위 기능성에 ‘질병 치료’는 포함되지 않아요.</p>
                <p className="mt-1 text-[11px] text-slate-400">출처: 식품의약품안전처 건강기능식품정보 (전국 {mfds.total.toLocaleString()}개 품목 기준)</p>
              </div>
            )}

            {grounded.length > 0 && (
              <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3 dark:border-blue-950 dark:bg-blue-950/20">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-200">📄 질병청 공식 자료</p>
                <ul className="mt-1.5 space-y-2">
                  {grounded.slice(0, 2).map((g, i) => (
                    <li key={i} className="text-sm">
                      {g.section && <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{g.section}</span>}
                      <p className="mt-0.5 leading-relaxed text-slate-700 dark:text-slate-200"><Highlight text={cleanSnippet(g.text, 220)} terms={highlightTerms} /></p>
                      {g.url && <a href={g.url} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600 hover:underline dark:text-blue-400">원문 →</a>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.warning && (
              <div className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">⚠ {result.warning}</div>
            )}

            {result.citations.length > 0 && (
              <details className="group mt-3 rounded-xl border border-slate-200 dark:border-slate-800">
                <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-medium text-slate-700 dark:text-slate-200 [&::-webkit-details-marker]:hidden">
                  📚 공식 출처 {result.citations.length}곳
                  <span className="text-slate-400 transition group-open:rotate-180">▾</span>
                </summary>
                <ul className="space-y-1 border-t border-slate-100 p-3 text-sm dark:border-slate-800">
                  {result.citations.map((c, i) => (
                    <li key={i}>
                      <a href={c.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">{c.portal} — {c.title}</a>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {evidence.length > 0 && (
              <details className="group mt-2 rounded-xl border border-slate-200 dark:border-slate-800">
                <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-sm font-medium text-slate-700 dark:text-slate-200 [&::-webkit-details-marker]:hidden">
                  🔎 이 주제 관련 공식 자료 {evidence.length}건
                  <span className="text-slate-400 transition group-open:rotate-180">▾</span>
                </summary>
                <ul className="space-y-2 border-t border-slate-100 p-3 dark:border-slate-800">
                  {evidence.map((e, i) => (
                    <li key={i} className="text-sm">
                      {e.section && <span className="text-xs font-medium text-blue-600 dark:text-blue-400">{e.section}</span>}
                      <p className="mt-0.5 leading-relaxed text-slate-600 dark:text-slate-300"><Highlight text={cleanSnippet(e.text)} terms={highlightTerms} /></p>
                      <span className="text-[11px] text-slate-400">
                        {e.portal || '질병관리청'}
                        {e.url && (<> · <a href={e.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">원문 →</a></>)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="px-3 pb-3 text-[11px] text-slate-400">하이브리드 검색(의미+키워드)으로 찾은 관련 공식 자료입니다. 판정 근거와는 별개의 참고 정보예요.</p>
              </details>
            )}

            {steps.length > 0 && (
              <details className="group mt-2 rounded-xl border border-slate-200 dark:border-slate-800">
                <summary className="flex cursor-pointer list-none items-center justify-between p-3 text-xs font-medium text-slate-500 [&::-webkit-details-marker]:hidden">
                  🧭 판정 과정 보기 (룰·근거 추적)
                  <span className="text-slate-400 transition group-open:rotate-180">▾</span>
                </summary>
                <div className="border-t border-slate-100 p-3 dark:border-slate-800">
                  <WhyTrace j={result} />
                </div>
              </details>
            )}

            <button type="button" onClick={share}
              className="mt-4 w-full rounded-xl bg-amber-300 py-3 text-sm font-semibold text-amber-900 transition active:scale-[0.99]">
              {copied ? '✓ 복사됐어요 — 붙여넣어 공유하세요' : '카카오톡으로 공유하기'}
            </button>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{result.disclaimer}</p>
          </div>
        </div>
      )}

      {/* 답변 품질 피드백 — 작게, 답변 하단. 불만족 시 관리자 부실응답 큐로(AI/규칙 1차 검토 후) */}
      {(result || info || topJudgment || substances.length > 0 || (multi && multi.length > 0)) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400">
          {fb ? (
            <span>{fb === 'up' ? '🙏 의견 고마워요!' : '🙏 알려주셔서 고마워요 — 관리자 검토 큐로 전달했어요.'}</span>
          ) : (
            <>
              <span>이 답변이 도움이 됐나요?</span>
              <button type="button" onClick={() => onFeedback('up')} className="rounded-full border border-slate-200 px-2 py-0.5 transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:hover:bg-slate-800">👍 만족</button>
              <button type="button" onClick={() => onFeedback('down')} className="rounded-full border border-slate-200 px-2 py-0.5 transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:hover:bg-slate-800">👎 불만족</button>
            </>
          )}
        </div>
      )}

      {/* 후속 질문 추천 — 맨 아래, 작게(탐색 유도) */}
      {related.length > 0 && (result || info || topJudgment || substances.length > 0 || (multi && multi.length > 0)) && (
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="mb-1.5 text-[11px] text-slate-400">🔎 이런 것도 확인해보세요</p>
          <div className="flex flex-wrap gap-1.5">
            {related.map((q) => (
              <button key={q} type="button" onClick={() => { setInput(q); check(q); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-500 active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
