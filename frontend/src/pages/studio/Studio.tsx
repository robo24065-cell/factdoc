import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BTN, FONT, SURFACE, TYPE, TEXT, PROSE, FOCUS, TAP, TAP_INLINE } from '../../theme/gohyang'
import {
  STUDIO_REGIONS, STUDIO_MEDIA, STUDIO_RATIOS, STUDIO_MOODS, STUDIO_STORY_GROUPS,
  RELIC_CATS, RELIC_CAT_LABEL, PLATFORM_GUIDE, STUDIO_NOTICES, STUDIO_PHOTOS,
  STUDIO_SOURCE_LABELS, STUDIO_LINE_BADGES, STUDIO_REPRO_TOOLS, NEG_SWAP,
} from '../../data/studio'
import type { StudioMedium, StudioRatio, StudioRegionSel, StudioOutput, StudioRelic, StudioVariant } from '../../data/studio'
import { buildStudioOutput, probeStudioLLM, refineStudio, applyStudioRefine } from '../../lib/studioPrompt'

/* ────────────────────────────────────────────────────────────────
   AI 스튜디오 (/studio) — 후손의 도구: 가족 이야기 → 생성 AI 프롬프트

   원칙 (CLAUDE.md §5 LLM 4원칙 + 권리·개인정보 규약)
     · 규칙 템플릿(engine/nk-studio.mjs)이 먼저 5구획 산출을 완성한다 —
       네트워크가 죽어도, dev 에 /api/llm 이 없어도 결과는 항상 나온다.
     · Gemini 는 「AI로 다듬기」를 눌렀을 때 문장만 다듬는다. 출력 검증 실패는
       조용히 버리고 템플릿 산출을 유지한다.
     · 이야기 입력은 메모리에만 있다 — 저장·전송 0 (다듬기 1회 전송만, 화면 고지).
     · 사료 사진은 「보며 참고」 전용이다 — 생성 AI 입력으로 유도하지 않는다.
       개인 사진은 「본인 가족이 소장한 사진」만 쓰라고 안내한다.
     · 놀이가 아니다 — 점수·집계·통계 없음. 서버로 가는 것도 없다.
   ──────────────────────────────────────────────────────────────── */

const STEP_TITLES = ['형식', '비율', '고향', '이야기', '분위기', '사료 참고'] as const

type ChipMap = Record<string, string[]>
type TextMap = Record<string, string>

/** 출처 라벨 배지 색 — theme/gohyang.ts 의 TEXT 토큰만 쓴다(새 색을 만들지 않는다) */
const TONE: Record<string, string> = { ink: TEXT.ink, blue: TEXT.blue, soft: TEXT.soft, stale: TEXT.stale }

/* ★ 여기 문구는 이용자가 판을 고르는 바로 그 자리에 뜬다 — 조건 없이 「같은 그림이 나온다」고 말하면
   그 자체가 과잉 주장이다(조건을 단 reproNote 전문은 한참 아래 산출 ⑥에 있다).
   verify-studio 가 이 배열의 문구까지 금칙어로 훑는다. */
const VARIANTS: Array<{ id: StudioVariant; label: string; note: string }> = [
  { id: 'precise', label: '정밀', note: '정밀 — 값을 많이 못박아 두었습니다. 같은 모델에 같은 시드를 쓰시면 결과가 덜 흔들립니다. 긴 프롬프트를 받는 도구에 쓰십시오.' },
  { id: 'simple', label: '간단', note: '간단 — 짧은 프롬프트를 좋아하는 도구용입니다. 못박은 값이 적어 정밀판보다 결과가 더 흔들립니다.' },
]

function CopyButton({ text, id, copied, onCopy }: { text: string; id: string; copied: string | null; onCopy: (id: string, text: string) => void }) {
  return (
    <button type="button" onClick={() => onCopy(id, text)} className={BTN.ghost} aria-live="polite">
      {copied === id ? '복사되었습니다' : '복사'}
    </button>
  )
}

export default function Studio() {
  const [step, setStep] = useState(1)                       // 1~6 위저드 · 7 결과
  const [medium, setMedium] = useState<StudioMedium | null>(null)
  const [ratio, setRatio] = useState<StudioRatio | null>(null)
  const [region, setRegion] = useState<StudioRegionSel | null>(null)
  const [customText, setCustomText] = useState('')
  const [openGroups, setOpenGroups] = useState<string[]>([])
  const [chips, setChips] = useState<ChipMap>({})
  const [texts, setTexts] = useState<TextMap>({})
  const [sceneryOnly, setSceneryOnly] = useState(false)
  const [mood, setMood] = useState<string | null>(null)
  const [relicCat, setRelicCat] = useState<string | null>(null)
  const [relicSel, setRelicSel] = useState<string[]>([])
  const [llmOk, setLlmOk] = useState(false)
  const [refined, setRefined] = useState<{ ko: string; en: string } | null>(null)
  const [refining, setRefining] = useState(false)
  const [refineFailed, setRefineFailed] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [variant, setVariant] = useState<StudioVariant>('precise')   // 기본값은 정밀

  useEffect(() => {
    let alive = true
    /* dev 에는 /api/llm 이 없다 — 탐침이 JSON 을 못 받으면 다듬기 단추를 아예 그리지 않는다 */
    void probeStudioLLM().then(ok => { if (alive) setLlmOk(ok) })
    return () => { alive = false }
  }, [])

  function copy(id: string, text: string) {
    void (async () => {
      let ok = false
      try {
        await navigator.clipboard.writeText(text)
        ok = true
      } catch {
        /* 권한 거부·구형 브라우저 — 보이지 않는 textarea 로 폴백. 실패하면 피드백을 내지 않는다(거짓 「복사됨」 금지) */
        try {
          const ta = document.createElement('textarea')
          ta.value = text
          ta.setAttribute('readonly', '')
          ta.style.position = 'fixed'
          ta.style.opacity = '0'
          document.body.appendChild(ta)
          ta.select()
          ok = document.execCommand('copy')
          ta.remove()
        } catch { ok = false }
      }
      if (ok) {
        setCopied(id)
        setTimeout(() => setCopied(c => (c === id ? null : c)), 2000)
      }
    })()
  }

  /* ── 고지 2벌 선택 — 화면에 없는 단추(AI로 다듬기)를 가리키는 문장을 내보내지 않는다.
        이야기 입력 0인 풍경 중심 경로에서는 「들려주신 이야기」 문구도 사실이 아니게 되므로 가른다 ── */
  const privacyNotice = llmOk ? STUDIO_NOTICES.privacy : STUDIO_NOTICES.privacyNoLlm

  /* ── 이야기 입력 여부 — 하나라도 있어야 「다음」, 없으면 풍경 중심 경로가 안내한다 ── */
  const hasStory = useMemo(
    () =>
      Object.values(chips).some(a => a.length > 0) ||
      Object.values(texts).some(t => t.trim().length > 0),
    [chips, texts],
  )

  /* ── 사료 후보 — ③의 고향으로 거른다 ──
        ★ 걸러지지 않은 경우(직접 입력 무매칭 · 모름)를 「그 고향의 사료」라고 부르지 않는다.
          예전에는 무매칭이면 조용히 전체 129장을 내놓고 표제만 「그 고향의 사료 사진」으로 두었다 —
          「평안남도 강동군」을 적은 분에게 함경북도 사료를 그 고향의 사료로 내민 셈이었다.
          이제 filtered 플래그로 갈라 표제·설명·카드 표기를 전부 바꾼다. */
  const relicPoolInfo: { items: StudioRelic[]; filtered: boolean } = useMemo(() => {
    const all = STUDIO_PHOTOS.items
    if (region?.kind === 'old') return { items: all.filter(it => it.oldKeys.includes(region.id)), filtered: true }
    if (region?.kind === 'custom') {
      const t = region.text.trim()
      if (t) {
        const hit = all.filter(it => it.name.includes(t) || it.areaRaw.includes(t))
        if (hit.length) return { items: hit, filtered: true }
      }
      return { items: all, filtered: false }                // 직접 입력이 사료 제목·지역명과 맞지 않음
    }
    return { items: all, filtered: false }                  // 모름 — 전 지역(미배정 4건 포함)
  }, [region])
  const relicPool = relicPoolInfo.items
  const relicFiltered = relicPoolInfo.filtered

  const catCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of relicPool) m.set(it.category, (m.get(it.category) ?? 0) + 1)
    return m
  }, [relicPool])

  const relicShown = useMemo(
    () => (relicCat ? relicPool.filter(it => it.category === relicCat) : relicPool),
    [relicPool, relicCat],
  )

  function toggleRelic(fileId: string) {
    setRelicSel(sel =>
      sel.includes(fileId) ? sel.filter(x => x !== fileId) : sel.length >= 4 ? sel : [...sel, fileId],
    )
  }

  /* ── 결과 조립 — 순수 함수 1회. 같은 입력 = 같은 출력 ── */
  const out: StudioOutput | null = useMemo(() => {
    if (step !== 7 || !medium || !ratio || !region || !mood) return null
    const picks = STUDIO_STORY_GROUPS
      .filter(g => openGroups.includes(g.id))
      .map(g => ({ group: g.id, chipIds: chips[g.id] ?? [], text: texts[g.id] ?? '' }))
    const relics = relicSel
      .map(id => STUDIO_PHOTOS.items.find(it => it.fileId === id))
      .filter((it): it is StudioRelic => Boolean(it))
      .map(it => ({ fileId: it.fileId, name: it.name, category: it.category, provider: it.provider, sourceUrl: it.sourceUrl }))
    return buildStudioOutput({ medium, ratio, region, story: { sceneryOnly, picks }, mood, relics })
  }, [step, medium, ratio, region, mood, openGroups, chips, texts, sceneryOnly, relicSel])

  function refine() {
    if (!out || refining) return
    setRefining(true)
    setRefineFailed(false)
    void refineStudio(out).then(r => {
      setRefining(false)
      if (r) setRefined(r)
      else setRefineFailed(true)
    })
  }

  function back() {
    setRefined(null); setRefineFailed(false); setShowOriginal(false); setVariant('precise')
    setStep(s => Math.max(1, s - 1))
  }
  function restart() {
    setStep(1); setMedium(null); setRatio(null); setRegion(null); setCustomText('')
    setOpenGroups([]); setChips({}); setTexts({}); setSceneryOnly(false)
    setMood(null); setRelicCat(null); setRelicSel([])
    setRefined(null); setRefineFailed(false); setShowOriginal(false); setVariant('precise')
  }

  /* ── 다듬은 「들려주신 이야기」 블록을 제자리에 끼워 넣은 정밀판 전문.
        블록 순서·라벨·촬영값은 그대로다 — 다듬기가 닿는 곳은 이야기 블록 하나뿐이다. ── */
  const refinedFull = useMemo(() => (out && refined ? applyStudioRefine(out, refined) : null), [out, refined])
  const simple = variant === 'simple'
  const shownKo = !out ? '' : simple ? out.promptKoSimple : (refinedFull?.ko ?? out.promptKo)
  const shownEn = !out ? '' : simple ? out.promptEnSimple : (refinedFull?.en ?? out.promptEn)

  /* 금지 목록 평문 — 네거티브 칸에 통째로 붙여 넣는 자리 */
  const negKoText = out ? [...out.negative.commonKo, ...out.negative.moodKo].join(', ') : ''
  const negEnText = out ? [...out.negative.commonEn, ...out.negative.moodEn].join(', ') : ''

  /* 산출 ③ 평문 — 화면과 같은 배지를 달고 나간다(라벨을 뗀 복사본을 만들지 않는다) */
  const scenesText = useMemo(() => {
    if (!out) return ''
    const lines = out.scenes ?? out.compositions ?? []
    return lines
      .map((s, i) => [
        `${out.scenes ? `S${i + 1}` : `${i + 1}안`}. ${s.roleKo}`,
        ...s.parts.map(p => `  ${STUDIO_LINE_BADGES[p.src]?.badge ?? '● 연출 설정'} ${p.text}`),
      ].join('\n'))
      .join('\n')
  }, [out])

  /* 전체 복사용 평문 — 결과 화면의 일곱 구획을 한 문서로. 라벨 머리 문자열이 함께 나간다 */
  const fullText = useMemo(() => {
    if (!out) return ''
    const ko = shownKo
    const en = shownEn
    const L: string[] = []
    L.push(`■ 최종 프롬프트 (${simple ? '간단' : '정밀'}판 · 한글)`, ko, '', `■ 최종 프롬프트 (${simple ? '간단' : '정밀'}판 · 영문)`, en, '')
    L.push('■ 사용할 이미지 순서')
    L.push(STUDIO_NOTICES.rights)
    if (out.ownPhotos) {
      L.push(`· 본인 가족이 소장한 사진 (${out.ownPhotos.place})`)
      out.ownPhotos.order.forEach((o, i) => L.push(`  ${i + 1}) ${o}`))
    } else {
      L.push('· 본인 소장 사진 없음 — 프롬프트만으로 생성합니다.')
    }
    if (out.relics.length) {
      L.push('· 보며 참고할 사료(생성 AI에 올리지 않습니다):')
      for (const r of out.relics) L.push(`  - ${r.name} (${RELIC_CAT_LABEL[r.category] ?? r.category}, 제공: ${r.provider}) ${r.sourceUrl}`)
    }
    L.push('')
    L.push(out.scenes ? '■ 영상 구성(장면별)' : '■ 구도 제안')
    L.push('줄마다 어디서 온 말인지 배지로 갈라 두었습니다. 「● 고른 사료에서」는 참고용 병기일 뿐, 그 고향의 지형이라는 뜻이 아닙니다.')
    L.push(scenesText)
    L.push('', `■ 권장 길이: ${out.lengthLine} · ${out.sceneLine}`, '')
    L.push('■ 네거티브 프롬프트 (한글)', negKoText, '', '■ 네거티브 프롬프트 (영문)', negEnText, '')
    L.push(STUDIO_NOTICES.negFallback)
    for (const s of NEG_SWAP) L.push(`· ${s.itemKo} → ${s.ko} / ${s.en}`)
    L.push('')
    L.push('■ 재현 설정')
    L.push(`권장 시드 ${out.seed} — 이 프롬프트에서 계산한 값입니다. 다른 수를 쓰셔도 됩니다.`)
    for (const t of STUDIO_REPRO_TOOLS) L.push(`· ${t.name} — 가이던스 ${t.guidance} · 스텝 ${t.steps} · ${t.note}`)
    L.push(STUDIO_NOTICES.reproNote, '')
    L.push('■ 생성형 AI 플랫폼 안내')
    L.push(PLATFORM_GUIDE.asOfLine)
    for (const p of (out.medium === 'video' ? PLATFORM_GUIDE.video : PLATFORM_GUIDE.photo)) {
      L.push(`· ${p.name} — ${p.desc}${p.official ? ` 공식 안내: ${p.official}` : ''}`)
    }
    L.push('공통 순서: ' + PLATFORM_GUIDE.common.map((c, i) => `${i + 1}) ${c}`).join(' '))
    L.push('', out.sceneryOnly ? STUDIO_NOTICES.imaginedScenery : STUDIO_NOTICES.imagined)
    L.push(STUDIO_NOTICES.periodGeneric)
    L.push(STUDIO_NOTICES.directionNote)
    return L.join('\n')
  }, [out, shownKo, shownEn, simple, negKoText, negEnText, scenesText])

  const sceneryBanner = sceneryOnly
    ? (region?.kind === 'old' || (region?.kind === 'custom' && region.text.trim())
        ? '고향 풍경 중심으로 만듭니다'
        : '북녘 고향의 옛 모습 중심으로 만듭니다')
    : null

  /* ══════════ 렌더 ══════════ */
  return (
    <div className="mx-auto max-w-5xl">
      <nav aria-label="현재 위치" className={`${TYPE.cap} ${TEXT.faint}`}>
        <Link to="/pick" className={`${TAP_INLINE} underline underline-offset-2 ${FOCUS}`}>참여</Link>
        <span aria-hidden="true"> › </span>AI 스튜디오
      </nav>
      <header className="mt-2 max-w-[46rem]">
        <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>후손의 도구</p>
        <h2 className={`mt-1 ${TYPE.h2} ${TEXT.ink} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
          AI 스튜디오 — 가족 이야기를 생성 AI 프롬프트로
        </h2>
        <p className={`mt-1.5 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
          들은 이야기를 영상·사진 생성 AI에 넣을 프롬프트로 바꿔 드립니다. 산출물은 프롬프트와 사용 안내뿐이며,
          영상·사진을 여기서 만들지는 않습니다.
        </p>
        <p className={`mt-1.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{STUDIO_NOTICES.memoryOnly}</p>
      </header>

      {/* ── 진행 표시 + 이전 ── */}
      {step <= 6 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className={`${TYPE.sub} font-bold tabular-nums ${TEXT.blue}`} aria-live="polite">
            {step} / 6 · {STEP_TITLES[step - 1]}
          </p>
          {step > 1 && (
            <button type="button" onClick={back} className={BTN.ghost}>
              <span aria-hidden="true">←</span> 이전
            </button>
          )}
        </div>
      )}
      {sceneryBanner && step >= 5 && step <= 6 && (
        <p className={`mt-2 ${TYPE.cap} font-semibold ${TEXT.blue}`}>{sceneryBanner}</p>
      )}

      {/* ══════════ ① 형식 ══════════ */}
      {step === 1 && (
        <div className="mt-5">
          <p className={`max-w-[46rem] text-[1.3125rem] font-bold leading-[1.6] ${TEXT.ink} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
            무엇을 만들 프롬프트입니까?
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {STUDIO_MEDIA.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => { setMedium(m.id); setStep(2) }}
                className={`min-h-[72px] rounded-md border bg-white p-4 text-left hover:border-[#1a4e9c] dark:bg-transparent ${SURFACE.line} ${FOCUS}`}
              >
                <span className={`block ${TYPE.body} font-semibold ${TEXT.ink} ${PROSE}`}>{m.label}</span>
                <span className={`mt-0.5 block ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{m.sub}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══════════ ② 비율 ══════════ */}
      {step === 2 && (
        <div className="mt-5">
          <p className={`max-w-[46rem] text-[1.3125rem] font-bold leading-[1.6] ${TEXT.ink} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
            어떤 화면 비율입니까?
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {STUDIO_RATIOS.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => { setRatio(r.id); setStep(3) }}
                className={`min-h-[72px] rounded-md border bg-white p-4 text-left hover:border-[#1a4e9c] dark:bg-transparent ${SURFACE.line} ${FOCUS}`}
              >
                <span className={`block ${TYPE.body} font-bold tabular-nums ${TEXT.ink}`}>{r.label}</span>
                <span className={`mt-0.5 block ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{r.sub}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══════════ ③ 고향 ══════════ */}
      {step === 3 && (
        <div className="mt-5">
          <p className={`max-w-[46rem] text-[1.3125rem] font-bold leading-[1.6] ${TEXT.ink} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
            그분의 고향은 어디입니까?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {STUDIO_REGIONS.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => { setRegion({ kind: 'old', id: r.id }); setRelicSel([]); setRelicCat(null); setStep(4) }}
                className={`inline-flex min-h-[52px] items-center rounded-md border bg-white px-4 py-2 ${TYPE.sub} font-medium hover:border-[#1a4e9c] dark:bg-transparent ${SURFACE.line} ${TEXT.ink} ${FOCUS}`}
              >
                {r.ko}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setRegion({ kind: 'unknown' }); setRelicSel([]); setRelicCat(null); setStep(4) }}
              className={`inline-flex min-h-[52px] items-center rounded-md border bg-white px-4 py-2 ${TYPE.sub} font-medium hover:border-[#1a4e9c] dark:bg-transparent ${SURFACE.line} ${TEXT.soft} ${FOCUS}`}
            >
              모릅니다
            </button>
          </div>
          <div className="mt-4 max-w-[30rem]">
            <label htmlFor="studio-region-custom" className={`${TYPE.sub} font-semibold ${TEXT.ink}`}>직접 입력</label>
            <p className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>군·면 단위까지 아신다면 그대로 적으셔도 됩니다 (예: 평안북도 의주군).</p>
            <div className="mt-1.5 flex gap-2">
              <input
                id="studio-region-custom"
                type="text"
                value={customText}
                onChange={e => setCustomText(e.target.value)}
                className={`w-full min-h-[48px] rounded-md border bg-white px-3 ${TYPE.body} ${SURFACE.line} ${TEXT.ink} ${FOCUS} dark:bg-transparent`}
              />
              <button
                type="button"
                disabled={!customText.trim()}
                onClick={() => { setRegion({ kind: 'custom', text: customText.trim() }); setRelicSel([]); setRelicCat(null); setStep(4) }}
                className={`${BTN.primary} shrink-0 disabled:opacity-50`}
              >
                이 이름으로
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ ④ 이야기 ══════════ */}
      {step === 4 && (
        <div className="mt-5">
          <p className={`max-w-[46rem] text-[1.3125rem] font-bold leading-[1.6] ${TEXT.ink} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
            그분께 들은 이야기를 담아 보십시오 — 정확하지 않아도 됩니다.
          </p>
          <p className={`mt-1 max-w-[46rem] ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
            아래에서 기억나는 것만 고르시면, 나머지는 저희가 문장으로 엮습니다.
          </p>

          <div className="mt-3 space-y-3">
            {STUDIO_STORY_GROUPS.map(g => {
              const open = openGroups.includes(g.id)
              return (
                <div key={g.id} className={`${SURFACE.card} p-3.5`}>
                  <button
                    type="button"
                    onClick={() => setOpenGroups(a => (open ? a.filter(x => x !== g.id) : [...a, g.id]))}
                    aria-expanded={open}
                    className={`flex w-full min-h-[48px] items-center justify-between gap-2 text-left ${FOCUS}`}
                  >
                    <span className={`${TYPE.body} font-semibold ${TEXT.ink}`}>{g.title}</span>
                    <span className={`${TYPE.cap} ${TEXT.blue}`} aria-hidden="true">{open ? '접기' : '펼치기'}</span>
                  </button>
                  {open && (
                    <div className="mt-2">
                      <p className={`${TYPE.sub} ${TEXT.soft} ${PROSE}`}>{g.question}</p>
                      {g.chips.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {g.chips.map(c => {
                            const on = (chips[g.id] ?? []).includes(c.id)
                            return (
                              <button
                                key={c.id}
                                type="button"
                                aria-pressed={on}
                                onClick={() =>
                                  setChips(m => {
                                    const cur = m[g.id] ?? []
                                    return { ...m, [g.id]: on ? cur.filter(x => x !== c.id) : [...cur, c.id] }
                                  })
                                }
                                className={`inline-flex ${TAP} items-center rounded-md border px-3 py-1.5 ${TYPE.sub} font-medium ${FOCUS} ${
                                  on
                                    ? 'border-[#1a4e9c] bg-[#eef3fb] text-[#1a4e9c] dark:border-[#7aa9e8] dark:bg-[#16202c] dark:text-[#7aa9e8]'
                                    : `bg-white dark:bg-transparent ${SURFACE.line} ${TEXT.soft}`
                                }`}
                              >
                                {c.label}
                              </button>
                            )
                          })}
                        </div>
                      )}
                      <textarea
                        value={texts[g.id] ?? ''}
                        onChange={e => setTexts(m => ({ ...m, [g.id]: e.target.value }))}
                        placeholder={g.placeholder}
                        rows={2}
                        aria-label={`${g.title} — 들은 이야기 적기(선택)`}
                        className={`mt-2 w-full rounded-md border bg-white p-3 ${TYPE.body} ${SURFACE.line} ${TEXT.ink} ${FOCUS} dark:bg-transparent`}
                      />
                      {g.note && <p className={`mt-1 ${TYPE.cap} font-semibold ${TEXT.stale} ${PROSE}`}>{g.note}</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 별도 경로 — 기억이 없어도 막다른 길이 아니다 */}
          <div className={`mt-4 ${SURFACE.slab} p-4`}>
            <p className={`${TYPE.body} font-semibold ${TEXT.ink} ${PROSE}`}>정확히 기억나지 않으십니까? 괜찮습니다.</p>
            <button
              type="button"
              onClick={() => { setSceneryOnly(true); setStep(5) }}
              className={`mt-2 ${BTN.primary}`}
            >
              {region?.kind === 'old' || (region?.kind === 'custom' && region.text.trim())
                ? '고향의 당시 모습 중심으로 만들어볼까요?'
                : '북녘 고향의 옛 모습 중심으로 만들어볼까요?'}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={!hasStory}
              onClick={() => { setSceneryOnly(false); setStep(5) }}
              className={`${BTN.primary} disabled:opacity-50`}
            >
              다음 <span aria-hidden="true">→</span>
            </button>
            {!hasStory && <span className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>고른 것이 없으면 위의 「고향 모습 중심」 경로를 쓰십시오.</span>}
          </div>

          <p className={`mt-4 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{privacyNotice}</p>
        </div>
      )}

      {/* ══════════ ⑤ 분위기 ══════════ */}
      {step === 5 && (
        <div className="mt-5">
          <p className={`max-w-[46rem] text-[1.3125rem] font-bold leading-[1.6] ${TEXT.ink} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
            어떤 분위기로 만들까요?
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STUDIO_MOODS.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => { setMood(m.id); setStep(6) }}
                className={`min-h-[72px] rounded-md border bg-white p-4 text-left hover:border-[#1a4e9c] dark:bg-transparent ${SURFACE.line} ${FOCUS}`}
              >
                <span className={`block ${TYPE.body} font-semibold ${TEXT.ink} ${PROSE}`}>{m.label}</span>
                <span className={`mt-0.5 block ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{m.ko}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══════════ ⑥ 사료 참고 ══════════ */}
      {step === 6 && (
        <div className="mt-5">
          <p className={`max-w-[46rem] text-[1.3125rem] font-bold leading-[1.6] ${TEXT.ink} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
            {relicFiltered
              ? '그 고향의 사료 사진을 참고 자료로 고르시겠습니까?'
              : '전 지역 사료 사진 — 고향과 일치하지 않을 수 있습니다'}
          </p>
          {!relicFiltered && (
            <p className={`mt-1 max-w-[46rem] ${TYPE.sub} font-semibold ${TEXT.stale} ${PROSE}`}>
              {region?.kind === 'custom'
                ? '적어 주신 고향 이름으로 걸러지는 사료가 없어 전 지역을 그대로 보여 드립니다. 아래 사료는 그 고향의 사료가 아닐 수 있으니, 카드에 적힌 지역을 보고 고르십시오.'
                : '고향을 「모릅니다」로 두셨으므로 전 지역을 그대로 보여 드립니다. 아래 사료는 그 고향의 사료가 아닐 수 있으니, 카드에 적힌 지역을 보고 고르십시오.'}
            </p>
          )}
          <p className={`mt-1 max-w-[46rem] ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{STUDIO_NOTICES.rights}</p>

          {relicPool.length > 0 ? (
            <>
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="사료 갈래 고르기">
                <button
                  type="button"
                  aria-pressed={relicCat === null}
                  onClick={() => setRelicCat(null)}
                  className={`inline-flex ${TAP} items-center rounded-md border px-3.5 py-2 ${TYPE.sub} font-medium ${FOCUS} ${
                    relicCat === null
                      ? 'border-[#1a4e9c] bg-[#eef3fb] text-[#1a4e9c] dark:border-[#7aa9e8] dark:bg-[#16202c] dark:text-[#7aa9e8]'
                      : `bg-white dark:bg-transparent ${SURFACE.line} ${TEXT.soft}`
                  }`}
                >
                  전체 {relicPool.length}
                </button>
                {RELIC_CATS.filter(c => (catCounts.get(c.id) ?? 0) > 0).map(c => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={relicCat === c.id}
                    onClick={() => setRelicCat(c.id)}
                    className={`inline-flex ${TAP} items-center rounded-md border px-3.5 py-2 ${TYPE.sub} font-medium tabular-nums ${FOCUS} ${
                      relicCat === c.id
                        ? 'border-[#1a4e9c] bg-[#eef3fb] text-[#1a4e9c] dark:border-[#7aa9e8] dark:bg-[#16202c] dark:text-[#7aa9e8]'
                        : `bg-white dark:bg-transparent ${SURFACE.line} ${TEXT.soft}`
                    }`}
                  >
                    {c.label} {catCounts.get(c.id)}
                  </button>
                ))}
              </div>

              <p className={`mt-2 ${TYPE.cap} tabular-nums ${TEXT.faint}`} aria-live="polite">
                최대 4장까지 고를 수 있습니다 · 지금 {relicSel.length}장
              </p>

              <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {relicShown.map(it => {
                  const on = relicSel.includes(it.fileId)
                  /* 사료 129장 중 35장은 원자료에 지역 표기가 없다 — 제목으로 지역을 추정해 채우지 않는다 */
                  const area = it.areaRaw.trim() || '지역 미표기'
                  return (
                    <li key={it.fileId} className={`overflow-hidden ${SURFACE.card} ${on ? 'border-[#1a4e9c] dark:border-[#7aa9e8]' : ''}`}>
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={`${it.name} — ${area} — ${on ? '선택 해제' : '참고 사료로 선택'}`}
                        onClick={() => toggleRelic(it.fileId)}
                        className={`block w-full text-left ${FOCUS}`}
                      >
                        <RelicThumb relic={it} />
                        <span className="block p-2.5">
                          <span className={`block ${TYPE.sub} font-semibold ${TEXT.ink} ${PROSE}`}>{it.name}</span>
                          {/* 지역 표기는 항상 붙인다 — 걸러지지 않은 목록에서 특히, 이용자가 대조할 유일한 근거다 */}
                          <span className={`mt-0.5 block ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
                            {area} · {RELIC_CAT_LABEL[it.category]} · 제공: {it.provider}
                          </span>
                          <span className={`mt-1 block ${TYPE.cap} font-semibold ${on ? TEXT.blue : TEXT.faint}`}>
                            {on ? '선택됨 ●' : '누르면 선택'}
                          </span>
                        </span>
                      </button>
                      <p className="border-t px-2.5 py-1 dark:border-[#2a2f36]">
                        <a
                          href={it.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={`${TAP_INLINE} ${TYPE.cap} justify-start underline underline-offset-2 ${TEXT.blue} ${FOCUS}`}
                        >
                          통일부 원문 페이지 <span aria-hidden="true">↗</span>
                        </a>
                      </p>
                    </li>
                  )
                })}
              </ul>
            </>
          ) : (
            <p className={`mt-3 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>이 고향으로 걸러지는 사료가 없습니다 — 건너뛰셔도 됩니다.</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={() => setStep(7)} className={BTN.primary}>
              {relicSel.length ? `${relicSel.length}장 골라 프롬프트 만들기` : '사료 없이 프롬프트 만들기'} <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      )}

      {/* ══════════ 결과 — 5구획 산출 ══════════ */}
      {step === 7 && out && (
        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={back} className={BTN.ghost}><span aria-hidden="true">←</span> 사료 다시 고르기</button>
            <button type="button" onClick={restart} className={BTN.ghost}>처음부터 다시</button>
            <CopyButton text={fullText} id="all" copied={copied} onCopy={copy} />
            <span className={`${TYPE.cap} ${TEXT.faint}`}>「복사」는 일곱 구획 전체를 한 문서로 복사합니다.</span>
          </div>
          <p className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{privacyNotice}</p>
          {sceneryBanner && <p className={`${TYPE.cap} font-semibold ${TEXT.blue}`}>{sceneryBanner}</p>}

          {/* ① 최종 프롬프트 */}
          <section className={`${SURFACE.slab} p-4`}>
            <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>산출 ① 최종 프롬프트</p>

            {/* 정밀 ↔ 간단 — 기본은 정밀. 두 판은 같은 시드를 쓴다 */}
            <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="프롬프트 판 고르기">
              {VARIANTS.map(v => (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={variant === v.id}
                  onClick={() => setVariant(v.id)}
                  className={`inline-flex ${TAP} items-center rounded-md border px-4 py-2 ${TYPE.sub} font-semibold ${FOCUS} ${
                    variant === v.id
                      ? 'border-[#1a4e9c] bg-[#eef3fb] text-[#1a4e9c] dark:border-[#7aa9e8] dark:bg-[#16202c] dark:text-[#7aa9e8]'
                      : `bg-white dark:bg-transparent ${SURFACE.line} ${TEXT.soft}`
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <p className={`mt-1.5 ${TYPE.cap} ${TEXT.soft} ${PROSE}`}>
              {VARIANTS.find(v => v.id === variant)?.note}
            </p>
            <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
              간단판은 정밀판과 같은 시드를 쓰지만, 값이 적어 결과가 더 흔들립니다.
            </p>

            {/* 출처 라벨 4종 — 프롬프트 안의 블록이 각각 어디서 왔는지 */}
            <ul className={`mt-3 divide-y ${SURFACE.hair}`}>
              {STUDIO_SOURCE_LABELS.map(s => (
                <li key={s.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5">
                  <span className={`${TYPE.sub} font-bold ${TONE[s.tone] ?? TEXT.ink}`}>{s.badge}</span>
                  <span className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{s.note}</span>
                </li>
              ))}
            </ul>

            <div className="mt-3 space-y-3">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className={`${TYPE.h3} ${TEXT.ink}`}>한글</h3>
                  <CopyButton text={shownKo} id="ko" copied={copied} onCopy={copy} />
                </div>
                <p className={`mt-1.5 whitespace-pre-wrap break-words rounded-md bg-white p-3 ${TYPE.body} ${TEXT.ink} ${PROSE} dark:bg-[#181c22]`}>
                  {shownKo}
                </p>
              </div>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className={`${TYPE.h3} ${TEXT.ink}`}>영문 — 대부분의 생성 AI가 더 잘 알아듣습니다</h3>
                  <CopyButton text={shownEn} id="en" copied={copied} onCopy={copy} />
                </div>
                <p className="mt-1.5 whitespace-pre-wrap break-words rounded-md bg-white p-3 text-[0.9375rem] leading-[1.75] text-[#191919] dark:bg-[#181c22] dark:text-[#e6e9ed]">
                  {shownEn}
                </p>
              </div>

              {/* AI 다듬기 — /api/llm 이 있을 때만 그린다(dev 에는 없다 → 템플릿 산출이 기본).
                  다듬기가 닿는 곳은 「들려주신 이야기」 블록 하나뿐이라, 간단판을 보는 중에는 그리지 않는다. */}
              {llmOk && !refined && !simple && (
                <div className="flex flex-wrap items-center gap-2.5">
                  <button type="button" onClick={refine} disabled={refining} className={`${BTN.ghost} disabled:opacity-50`}>
                    {refining ? '다듬는 중입니다…' : 'AI로 다듬기 (Gemini)'}
                  </button>
                  <span className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
                    누르시면 「들려주신 이야기」 블록만 다듬기를 위해 한 번 전송됩니다 — 촬영값은 보내지 않으며, 저장되지 않습니다.
                  </span>
                </div>
              )}
              {refined && !simple && (
                <div>
                  {/* 검증 범위를 정직하게 — validateStudio 는 숫자 부분집합·스키마·이모지·길이·사료 제목 보존만 잰다.
                      그 밖의 지명은 프롬프트로 금지를 요청할 뿐 기계 검증이 없으므로, 하지 않은 검증을 했다고 말하지 않는다. */}
                  <p className={`${TYPE.cap} ${TEXT.live}`}>
                    AI가 「들려주신 이야기」 블록의 이음새 문장만 다듬었습니다 — 연출 설정·금지·재현 설정 값은 전송되지도 않았으므로 그대로입니다.
                    적어 주신 말과 사료 제목이 한 글자도 바뀌지 않고 남아 있는지, 수치는 입력에 있던 것만 썼는지 검사했고, 하나라도 어긋나면 다듬기를 통째로 버립니다.
                    그 밖의 이음새 표현은 아래 「원문 보기」로 직접 대조하십시오.
                  </p>
                  <button type="button" onClick={() => setShowOriginal(v => !v)} className={`mt-1.5 ${BTN.ghost}`}>
                    {showOriginal ? '원문 접기' : '원문 보기'}
                  </button>
                  {showOriginal && (
                    <div className="mt-2 space-y-2">
                      <p className={`whitespace-pre-wrap rounded-md bg-white p-3 ${TYPE.sub} ${TEXT.soft} ${PROSE} dark:bg-[#181c22]`}>{out.promptKo}</p>
                      <p className="whitespace-pre-wrap break-words rounded-md bg-white p-3 text-sm leading-[1.7] text-[#555555] dark:bg-[#181c22] dark:text-[#a4acb6]">{out.promptEn}</p>
                    </div>
                  )}
                </div>
              )}
              {refineFailed && (
                <p className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>다듬기가 되지 않았습니다 — 원문 템플릿 산출을 그대로 쓰시면 됩니다.</p>
              )}
            </div>
            <div className={`mt-3 border-t pt-2.5 ${SURFACE.hair}`}>
              <p className={`${TYPE.sub} font-semibold ${TEXT.stale} ${PROSE}`}>
                {out.sceneryOnly ? STUDIO_NOTICES.imaginedScenery : STUDIO_NOTICES.imagined}
              </p>
              {/* 기존 고지 바로 아래 줄 — 「시대 일반 표현」이 무엇인지 밝힌다 */}
              <p className={`mt-1 ${TYPE.cap} ${TEXT.stale} ${PROSE}`}>{STUDIO_NOTICES.periodGeneric}</p>
              <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{STUDIO_NOTICES.directionNote}</p>
            </div>
          </section>

          {/* ② 사용할 이미지 순서 */}
          <section className={`${SURFACE.card} p-4`}>
            <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>산출 ② 사용할 이미지 순서</p>
            {/* 권리 고지는 6단계에만 있었다 — 본인 소장 사진을 적은 경로에서는 결과 화면에서 완전히 사라졌다.
                생성 AI에 무엇을 올려도 되는지 판단하는 자리가 바로 여기라 이 구획에 다시 붙인다. */}
            <p className={`mt-1.5 ${TYPE.cap} font-semibold ${TEXT.stale} ${PROSE}`}>{STUDIO_NOTICES.rights}</p>
            {out.ownPhotos ? (
              <div className="mt-2">
                <h3 className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>본인 가족이 소장한 사진 — {out.ownPhotos.place}</h3>
                <ol className="mt-1.5 list-decimal space-y-1 pl-5">
                  {out.ownPhotos.order.map((o, i) => (
                    <li key={i} className={`${TYPE.sub} ${TEXT.soft} ${PROSE}`}>{o}</li>
                  ))}
                </ol>
              </div>
            ) : (
              <p className={`mt-2 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
                본인 소장 사진을 적지 않으셨습니다 — 프롬프트만으로 생성합니다. 이미지 참조 기능을 쓰시려면 본인 가족이 소장한 사진만 올리십시오.
              </p>
            )}
            {out.relics.length > 0 && (
              <div className={`mt-3 border-t pt-3 ${SURFACE.hair}`}>
                <h3 className={`${TYPE.h3} ${TEXT.ink}`}>보며 참고할 사료 ({out.relics.length}장)</h3>
                <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>{STUDIO_NOTICES.relicUse}</p>
                <ul className={`mt-2 divide-y ${SURFACE.hair}`}>
                  {out.relics.map((r, i) => (
                    <li key={r.fileId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className={`${TYPE.sub} ${TEXT.ink} ${PROSE}`}>
                        <b className="tabular-nums">{i + 1}.</b> {r.name}
                        <span className={`${TEXT.faint}`}> — {RELIC_CAT_LABEL[r.category]} · 제공: {r.provider}</span>
                      </span>
                      <a href={r.sourceUrl} target="_blank" rel="noreferrer" className={`${TAP_INLINE} ${TYPE.cap} underline underline-offset-2 ${TEXT.blue} ${FOCUS}`}>
                        통일부 원문 <span aria-hidden="true">↗</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* ③ 영상 구성 / 구도 제안 — 프롬프트 본문과 같은 규약: 조각마다 출처 배지를 붙인다.
              「● 비어 있음」은 이야기를 적지 않으신 자리다 — 없는 이야기를 지어내 채우지 않는다. */}
          <section className={`${SURFACE.card} p-4`}>
            <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>{out.scenes ? '산출 ③ 영상 구성(장면별)' : '산출 ③ 구도 제안'}</p>
            <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
              줄마다 어디서 온 말인지 배지로 갈라 두었습니다. 「● 고른 사료에서」는 참고용 병기일 뿐, 그 고향의 지형이라는 뜻이 아닙니다.
            </p>
            <ol className="mt-2 space-y-2.5">
              {(out.scenes ?? out.compositions ?? []).map((s, i) => (
                <li key={i} className={`${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
                  <p className={`${TYPE.sub} font-semibold ${TEXT.ink}`}>
                    <b className="tabular-nums">{out.scenes ? `S${i + 1}.` : `${i + 1}안.`}</b> {s.roleKo}
                  </p>
                  <ul className="mt-0.5 space-y-0.5">
                    {s.parts.map((p, j) => (
                      <li key={j} className="flex flex-wrap items-baseline gap-x-1.5">
                        <span className={`${TYPE.cap} font-bold ${TONE[STUDIO_LINE_BADGES[p.src]?.tone ?? 'soft'] ?? TEXT.soft}`}>
                          {STUDIO_LINE_BADGES[p.src]?.badge ?? '● 연출 설정'}
                        </span>
                        <span className={`${TYPE.sub} ${TEXT.soft} ${PROSE}`}>{p.text}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
            <div className="mt-2.5 text-right">
              <CopyButton text={scenesText} id="scenes" copied={copied} onCopy={copy} />
            </div>
          </section>

          {/* ④ 권장 길이 */}
          <section className={`${SURFACE.card} p-4`}>
            <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>산출 ④ 권장 길이</p>
            <p className={`mt-2 ${TYPE.body} ${TEXT.ink} tabular-nums ${PROSE}`}>
              {out.medium === 'video' ? `권장 길이 ${out.lengthLine} (이 구성은 합 ${out.totalSec}초)` : '사진 — 길이 없음'} · {out.sceneLine}
            </p>
          </section>

          {/* ⑤ 네거티브 프롬프트 — 도구에 네거티브 칸이 있을 때 통째로 붙여 넣는 자리 */}
          <section className={`${SURFACE.card} p-4`}>
            <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>산출 ⑤ 네거티브 프롬프트</p>
            <p className={`mt-2 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
              네거티브 칸이 있는 도구에서는 아래 영문을 그대로 붙여 넣으십시오. 프롬프트 본문의 「금지」 블록과 같은 내용입니다.
            </p>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
              <h3 className={`${TYPE.h3} ${TEXT.ink}`}>한글</h3>
              <CopyButton text={negKoText} id="neg-ko" copied={copied} onCopy={copy} />
            </div>
            <p className={`mt-1 rounded-md bg-white p-3 ${TYPE.sub} ${TEXT.soft} ${PROSE} dark:bg-[#181c22]`}>{negKoText}</p>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
              <h3 className={`${TYPE.h3} ${TEXT.ink}`}>영문</h3>
              <CopyButton text={negEnText} id="neg-en" copied={copied} onCopy={copy} />
            </div>
            <p className="mt-1 break-words rounded-md bg-white p-3 text-sm leading-[1.7] text-[#555555] dark:bg-[#181c22] dark:text-[#a4acb6]">{negEnText}</p>

            <div className={`mt-3 border-t pt-3 ${SURFACE.hair}`}>
              <h3 className={`${TYPE.h3} ${TEXT.ink} ${PROSE}`}>네거티브 칸이 없는 도구라면</h3>
              <p className={`mt-1 ${TYPE.sub} font-semibold ${TEXT.stale} ${PROSE}`}>{STUDIO_NOTICES.negFallback}</p>
              <ul className={`mt-2 divide-y ${SURFACE.hair}`}>
                {NEG_SWAP.map(s => (
                  <li key={s.itemKo} className="py-2">
                    <p className={`${TYPE.sub} font-semibold ${TEXT.ink} ${PROSE}`}>
                      {s.itemKo} <span aria-hidden="true">→</span> {s.ko}
                    </p>
                    <p className="mt-0.5 break-words text-[11px] leading-[1.6] text-[#767676] dark:text-[#7f8792]">{s.en}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* ⑥ 재현 설정 — 시드와 도구별 권장값. 재현성을 과장하지 않는다 */}
          <section className={`${SURFACE.card} p-4`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>산출 ⑥ 재현 설정</p>
              <CopyButton
                text={[
                  `권장 시드 ${out.seed} — 이 프롬프트에서 계산한 값입니다. 다른 수를 쓰셔도 됩니다.`,
                  ...STUDIO_REPRO_TOOLS.map(t => `${t.name} — 가이던스 ${t.guidance} · 스텝 ${t.steps} · ${t.note}`),
                  STUDIO_NOTICES.reproNote,
                ].join('\n')}
                id="repro" copied={copied} onCopy={copy}
              />
            </div>
            <p className={`mt-2 ${TYPE.body} font-bold tabular-nums ${TEXT.ink} ${PROSE}`}>권장 시드 {out.seed}</p>
            <p className={`mt-0.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
              이 프롬프트에서 계산한 값입니다. 다른 수를 쓰셔도 됩니다. 정밀판과 간단판은 같은 시드를 씁니다.
            </p>
            <div className="mt-2.5 overflow-x-auto">
              <table className={`w-full min-w-[34rem] border-collapse ${TYPE.sub}`}>
                <caption className="sr-only">도구 계열별 권장 설정</caption>
                <thead>
                  <tr className={`border-b ${SURFACE.line}`}>
                    <th scope="col" className={`py-1.5 pr-3 text-left font-bold ${TEXT.ink}`}>도구 계열</th>
                    <th scope="col" className={`py-1.5 pr-3 text-left font-bold ${TEXT.ink}`}>가이던스</th>
                    <th scope="col" className={`py-1.5 pr-3 text-left font-bold ${TEXT.ink}`}>스텝</th>
                    <th scope="col" className={`py-1.5 text-left font-bold ${TEXT.ink}`}>비고</th>
                  </tr>
                </thead>
                <tbody>
                  {STUDIO_REPRO_TOOLS.map(t => (
                    <tr key={t.name} className={`border-b ${SURFACE.hair}`}>
                      <th scope="row" className={`py-1.5 pr-3 text-left font-semibold ${TEXT.ink} ${PROSE}`}>{t.name}</th>
                      <td className={`py-1.5 pr-3 tabular-nums ${TEXT.soft}`}>{t.guidance}</td>
                      <td className={`py-1.5 pr-3 tabular-nums ${TEXT.soft}`}>{t.steps}</td>
                      <td className={`py-1.5 ${TEXT.faint} ${PROSE}`}>{t.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={`mt-3 border-t pt-2.5 ${SURFACE.hair} ${TYPE.sub} font-semibold ${TEXT.stale} ${PROSE}`}>
              {STUDIO_NOTICES.reproNote}
            </p>
          </section>

          {/* ⑦ 플랫폼 안내 */}
          <section className={`${SURFACE.card} p-4`}>
            <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>산출 ⑦ 생성형 AI 플랫폼 안내</p>
            <p className={`mt-2 ${TYPE.cap} font-semibold ${TEXT.stale} ${PROSE}`}>{PLATFORM_GUIDE.asOfLine}</p>
            <ul className={`mt-2 divide-y ${SURFACE.hair}`}>
              {(out.medium === 'video' ? PLATFORM_GUIDE.video : PLATFORM_GUIDE.photo).map(p => (
                <li key={p.name} className="py-2">
                  <p className={`${TYPE.sub} font-semibold ${TEXT.ink}`}>{p.name}</p>
                  <p className={`mt-0.5 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
                    {p.desc}{p.official ? <> 공식 안내: <span className={TEXT.blue}>{p.official}</span></> : null}
                  </p>
                </li>
              ))}
            </ul>
            <div className={`mt-3 border-t pt-3 ${SURFACE.hair}`}>
              <h3 className={`${TYPE.h3} ${TEXT.ink}`}>공통 순서</h3>
              <ol className="mt-1.5 list-decimal space-y-1 pl-5">
                {PLATFORM_GUIDE.common.map((c, i) => (
                  <li key={i} className={`${TYPE.sub} ${TEXT.soft} ${PROSE}`}>{c}</li>
                ))}
              </ol>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-2.5">
            <CopyButton text={fullText} id="all2" copied={copied} onCopy={copy} />
            <button type="button" onClick={restart} className={BTN.ghost}>처음부터 다시</button>
            <Link to="/pick" className={BTN.ghost}>참여로 돌아가기</Link>
          </div>
        </div>
      )}

      <p className={`mt-6 border-t pt-3 ${SURFACE.hair} ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        {STUDIO_NOTICES.sourceSplit} 이 도구는 프롬프트 문장을 만들어 드릴 뿐이며, 어떤 입력도 서버에 저장하지 않습니다.
      </p>
    </div>
  )
}

/** 사료 썸네일 — 원본 주소 직결(비보관). 못 불러오면 글자 칸으로 폴백하고 선택은 그대로 된다. */
function RelicThumb({ relic }: { relic: StudioRelic }) {
  const [broken, setBroken] = useState(false)
  if (broken) {
    return (
      <span className={`flex aspect-[4/3] w-full items-center justify-center ${SURFACE.inset}`}>
        <span className={`${TYPE.cap} ${TEXT.faint} ${PROSE} px-2 text-center`}>사진을 불러오지 못했습니다</span>
      </span>
    )
  }
  return (
    <img
      src={relic.thumbUrl}
      alt={`사료 사진 — ${relic.name}`}
      loading="lazy"
      className="aspect-[4/3] w-full bg-[#f5f7fa] object-cover"
      onError={() => setBroken(true)}
    />
  )
}
