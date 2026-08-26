import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SURFACE, TYPE, TEXT, PROSE, FOCUS, TAP_INLINE } from '../../theme/gohyang'
import { BUKBTI_AXIS_OF, type BukbtiGame } from '../../data/bukbti'
import { BUKBTI_EVENT, bukbtiCode, bukbtiFilled, bukbtiRemaining, readBukbti, type BukbtiState } from '../../lib/bukbti'

/* ────────────────────────────────────────────────────────────────
   북BTI 한 줄 조각 — 게임 결과 화면(PickResult·BalanceGame)에 붙는다

   · 이 게임으로 채워진 글자와 진행(3/4), 남은 게임 링크를 한 줄로 알린다.
   · 4/4 완성이면 「네 글자가 모두 채워졌습니다 — 당신의 북BTI 보기 →」.
   · 글자 쓰기는 부모(Tournament/BalanceGame)의 확정 effect 가 한다 —
     여기서는 읽고, BUKBTI_EVENT 로 그 갱신을 따라잡는다(effect 순서 무관).
   ──────────────────────────────────────────────────────────────── */

export default function BukbtiNudge({ game }: { game: BukbtiGame }) {
  const [state, setState] = useState<BukbtiState>(() => readBukbti())

  useEffect(() => {
    const sync = () => setState(readBukbti())
    sync()   // 부모 확정 effect 가 이미 지나간 경우를 마운트 직후 한 번 따라잡는다
    window.addEventListener(BUKBTI_EVENT, sync)
    return () => window.removeEventListener(BUKBTI_EVENT, sync)
  }, [])

  const letter = state.letters[game]
  if (!letter) return null   // 이 게임의 글자가 아직 없다(기록 실패·태그 밖) — 조각을 억지로 그리지 않는다

  const code = bukbtiCode(state.letters)
  const filled = bukbtiFilled(state.letters)
  const remaining = bukbtiRemaining(state.letters)
  const axis = BUKBTI_AXIS_OF.get(game)

  return (
    <p className={`max-w-[46rem] rounded-md ${SURFACE.inset} px-3.5 py-2.5 ${TYPE.sub} ${TEXT.soft} ${PROSE}`} data-bukbti-nudge>
      <span className={`${TYPE.eyebrow} ${TEXT.faint}`}>북BTI · 재미로 보는 취향 놀이</span>
      <br />
      {code ? (
        <>
          네 글자가 모두 채워졌습니다 —{' '}
          <Link to="/pick/bukbti" className={`${TAP_INLINE} font-semibold ${TEXT.blue} underline underline-offset-2 ${FOCUS}`}>
            당신의 북BTI 보기 <span aria-hidden="true">→</span>
          </Link>
        </>
      ) : (
        <>
          북BTI 네 글자 중 「<b className={`font-bold ${TEXT.ink}`}>{letter}</b>」{axis ? `(${axis.title})` : ''}이 채워졌습니다{' '}
          <span className="tabular-nums">({filled}/4)</span> — 남은 게임:{' '}
          {remaining.map((ax, i) => (
            <span key={ax.game}>
              {i > 0 && ' · '}
              <Link to={ax.to} className={`${TAP_INLINE} underline underline-offset-2 ${FOCUS}`}>{ax.gameLabel}</Link>
            </span>
          ))}
        </>
      )}
    </p>
  )
}
