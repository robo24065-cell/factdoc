import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FONT, SURFACE, TYPE, TEXT, PROSE, FOCUS } from '../../theme/gohyang'
import { BUKBTI_AXES, BUKBTI_DISCLAIMER, bukbtiDisplay } from '../../data/bukbti'
import { BUKBTI_EVENT, bukbtiCode, bukbtiFilled, readBukbti, type BukbtiState } from '../../lib/bukbti'

/* ────────────────────────────────────────────────────────────────
   북BTI 진행판 — 허브(/pick) 2×2 게임 카드 바로 위의 가로 스트립

   · 4칸 = 네 게임. 채워진 글자(명조 대활자) 또는 「?」. 칸 전체가 그 게임 링크(≥48px).
   · 진행 「2/4」 병기. 4/4 완성이면 스트립 전체가 결과 화면(/pick/bukbti) 링크로 바뀐다.
   · 진행 상태는 이 기기 localStorage 뿐 — 서버에는 완성 유형 4글자만 간다(lib/bukbti).
   · 재미로 보는 취향 놀이임을 eyebrow 에 상시 밝힌다(통일부 자료와 구분).
   ──────────────────────────────────────────────────────────────── */

export default function BukbtiBoard() {
  const [state, setState] = useState<BukbtiState>(() => readBukbti())

  useEffect(() => {
    const sync = () => setState(readBukbti())
    window.addEventListener(BUKBTI_EVENT, sync)
    return () => window.removeEventListener(BUKBTI_EVENT, sync)
  }, [])

  const filled = bukbtiFilled(state.letters)
  const code = bukbtiCode(state.letters)

  /* ── 완성 — 스트립이 결과 화면 링크 한 장으로 바뀐다 ── */
  if (code) {
    return (
      <Link to="/pick/bukbti" className={`block min-h-[48px] rounded-md ${FOCUS}`} data-bukbti-board>
        <section className={`${SURFACE.card} p-4 hover:border-[#1a4e9c] dark:hover:border-[#7aa9e8]`}>
          <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>재미로 보는 취향 놀이 · 통일부 자료 아님</p>
          <p className={`mt-1.5 text-[1.3125rem] font-bold leading-snug ${TEXT.ink} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
            당신의 북BTI는 {bukbtiDisplay(code)}입니다
          </p>
          <p className={`mt-1.5 ${TYPE.cap} font-semibold ${TEXT.blue}`}>결과 보기 <span aria-hidden="true">→</span></p>
        </section>
      </Link>
    )
  }

  /* ── 진행 중 — 4칸 스트립(칸 = 게임 링크) ── */
  return (
    <section className={`${SURFACE.card} p-4`} aria-label="북BTI 진행판" data-bukbti-board>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div>
          <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>재미로 보는 취향 놀이 · 통일부 자료 아님</p>
          <h3 className={`mt-1 ${TYPE.h3} ${TEXT.ink} ${PROSE}`}>참여해서 북BTI를 채워보세요</h3>
        </div>
        <p className={`${TYPE.cap} font-semibold tabular-nums ${TEXT.blue}`}>{filled}/4 채워짐</p>
      </div>
      <ul className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {BUKBTI_AXES.map(ax => {
          const letter = state.letters[ax.game]
          return (
            <li key={ax.game}>
              <Link
                to={ax.to}
                className={`block min-h-[48px] rounded-md ${FOCUS}`}
                aria-label={`${ax.gameLabel} — ${letter ? `채워진 글자 ${letter}, 다시 하면 마지막 판 기준으로 바뀝니다` : '아직 비어 있음, 하러 가기'}`}
              >
                <div className={`h-full rounded-md p-2.5 text-center ${SURFACE.inset} hover:outline hover:outline-1 hover:outline-[#1a4e9c]`}>
                  <p
                    className={`text-[1.75rem] font-bold leading-tight ${letter ? TEXT.ink : TEXT.faint}`}
                    style={letter ? { fontFamily: FONT.serif } : undefined}
                    aria-hidden="true"
                  >
                    {letter ?? '?'}
                  </p>
                  <p className={`mt-0.5 ${TYPE.cap} ${TEXT.soft} ${PROSE}`}>{ax.gameLabel}</p>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
      <p className={`mt-2 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        {BUKBTI_DISCLAIMER} 게임을 다시 하면 마지막 판 기준으로 글자가 바뀝니다. 진행은 이 기기에만 저장됩니다.
      </p>
    </section>
  )
}
