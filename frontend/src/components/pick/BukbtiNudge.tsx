import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SURFACE, TYPE, TEXT, PROSE, FOCUS, TAP_INLINE } from '../../theme/gohyang'
import { BUKBTI_AXIS_OF, BUKBTI_RATIO_LIMIT_SHORT, type BukbtiGame } from '../../data/bukbti'
import {
  BUKBTI_EVENT, bukbtiAxisView, bukbtiCode, bukbtiCountLine, bukbtiFilled, bukbtiMinePct,
  bukbtiRemaining, readBukbti, type BukbtiState,
} from '../../lib/bukbti'

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

  /* 이 게임 축의 비율 한 줄 — 횟수를 늘 병기한다(대비 매치는 실측 네 번에서 열한 번이 98.4%다).
     비율을 못 내는 판(밸런스·대비 0회·반반)과 옛 기록은 그 사실을 그대로 적는다.
     ★ 비율과 사유(note)는 배타적이지 않다 — 정확히 반씩 고르신 판은 비율도 있고 사유도
       있어서, 예전처럼 삼항으로 하나만 고르면 「50%입니다」로 끝나 근거가 사라진다. */
  const view = bukbtiAxisView(game, state)
  const pct = bukbtiMinePct(view)
  const counted = bukbtiCountLine(view)
  const ratioLine = pct != null && counted ? `이 판에서는 ${counted} — ${pct}%입니다.` : null
  const noteLine = view.note

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
      {(ratioLine || noteLine) && (
        <span className={`mt-1 block ${TYPE.cap} ${TEXT.faint} ${PROSE}`} data-bukbti-ratio>
          {ratioLine}
          {ratioLine && noteLine && <br />}
          {noteLine}
          {ratioLine && <span className="mt-0.5 block">{BUKBTI_RATIO_LIMIT_SHORT}</span>}
        </span>
      )}
    </p>
  )
}
