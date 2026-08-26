import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BTN, FONT, SURFACE, TYPE, TEXT, PROSE, FOCUS, TAP_INLINE, josa } from '../../theme/gohyang'
import ItemCard, { itemKey, itemName, itemRegionId, itemRegionName, photoOf, type CardItem } from '../../components/pick/ItemCard'
import RegionStatBlock from '../../components/pick/RegionStatBlock'
import PickShareCard, { type ShareModel } from '../../components/pick/PickShareCard'
import TallyDeck from '../../components/pick/TallyDeck'
import BukbtiNudge from '../../components/pick/BukbtiNudge'
import { ITEMS, loadPickStats, shuffle, type PickStats, type PickWord } from '../../lib/pickData'
import { readAllTallies, tallyByKey, type PickGame, type Tally } from '../../lib/pickTally'

/* ────────────────────────────────────────────────────────────────
   월드컵 결과 — 취향에서 기록 공백으로 건너가는 자리

   구성(위에서 아래로): 우승 카드 → 통일부 실측 구획(순위·남은 분·1인당 기록)
   → 연결 문장(명조 — 사람에게 하는 말) → 행동 3단추(지도·기억 카드·그 고향의 기록)
   → 참여 통계 한 줄(0판이면 없음, 1판부터 「지금까지 N판 중 M번」으로 n 병기) → 공유 그림 · 처음부터.

   ★ 기증 사료는 여기서 「그 고향에서 온 기록 보기」 링크로만 등장한다 —
     놀이 콘텐츠에 남의 집 기록을 쓰지 않는다(절대규칙).
   ★ 수치는 전부 analysis.json 확정값(lib/pickData)이고 기준일이 붙는다.
     말 월드컵은 지역 축이 없다 — 지역 통계를 붙이지 않고 그 사실을 화면에 적는다.
   ──────────────────────────────────────────────────────────────── */

const nf = (v: number) => (Number.isFinite(v) ? v.toLocaleString('ko-KR') : '—')

const GAME_TITLE: Record<Exclude<PickGame, 'balance'>, string> = {
  food: '고향의 음식 월드컵',
  scene: '고향의 풍경 월드컵',
  word: '북녘의 말 월드컵',
}

export default function PickResult({ game, item, onRestart }: {
  game: Exclude<PickGame, 'balance'>
  item: CardItem
  onRestart: () => void
}) {
  const [stats, setStats] = useState<PickStats | null>(null)
  const [tally, setTally] = useState<Tally | null>(null)

  useEffect(() => {
    let alive = true
    void loadPickStats().then(s => { if (alive) setStats(s) })
    /* 자기 판의 INSERT 직후라 한 박자 늦춰 읽는다 — TallyDeck 의 지연과 같은 이유.
       3초 캐시(pickTally) 덕에 TallyDeck 과 합쳐 요청은 1건이다. */
    const t = setTimeout(() => {
      void readAllTallies().then(r => { if (alive && r.ok) setTally(r.byGame.get(game) ?? null) })
    }, 900)
    return () => { alive = false; clearTimeout(t) }
  }, [game])

  const regionId = itemRegionId(item)
  const regionName = itemRegionName(item)
  const stat = stats && regionId ? stats.byId.get(regionId) ?? null : null

  /* 말 월드컵 — 화면 안에서 대응 3쌍을 더 보여 준다(빈손 방지) */
  const morePairs = useMemo<PickWord[]>(() => {
    if (game !== 'word') return []
    const win = itemKey(item)
    return shuffle(ITEMS.words.pairs.filter(p => p.id !== win)).slice(0, 3)
  }, [game, item])

  /* 공유 PNG 용 참여 통계 한 줄 — 실집계가 있으면 판수와 함께 적는다.
     % 없이 「N판 중 M번」 꼴이라 소표본에서도 오해가 없다(정직성 규약: n 상시 병기).
     화면의 순위덱은 아래 TallyDeck 이 따로 그린다. */
  const tallyLine = useMemo(() => {
    if (!tally || tally.total === 0) return null
    const top = tallyByKey(tally)[0]
    if (!top) return null
    return `지금까지 ${nf(tally.total)}판 중 「${top.label}」${josa(top.label, '이', '가')} ${nf(top.n)}번 뽑혔습니다.`
  }, [tally])

  /* 연결 문장 — 명조(사람에게 하는 말). 수치는 확정값 인용, 배수 재계산 없음 */
  const bridge = useMemo(() => {
    if (!stat || !stats || !regionName) return null
    const name = itemName(item)
    const isMin = stat.density === Math.min(...stats.regions.map(r => r.density))
    const head =
      game === 'scene'
        ? `선택하신 「${name}」${josa(name, '이', '가')} 있는 ${regionName}${josa(regionName, '은', '는')}`
        : `선택하신 ${name}의 고향 ${regionName}${josa(regionName, '은', '는')}`
    const gapTail = isMin && stats.gapValue
      ? ` — 1인당 기록이 가장 많은 ${stats.densityMax.name}(${stats.densityMax.density}건)과 ${stats.gapValue} 차이입니다`
      : ''
    /* as-of 규약 — 분모(생존자)만 2025-08-31 기준이고 분자(기록 수)는 계열마다 수집일이 다르다.
       「기준일 ○○」 한 줄로 묶으면 단일 기준일이 있는 것처럼 읽힌다(record-density-gap caveat). */
    return `${head} 남은 분이 ${nf(stat.survivors)}명이고, 그 한 분 한 분에게 남은 공식 기록은 ${stat.density}건입니다${gapTail}. 생존자 기준일 ${stats.asOf} — 기록 수는 계열마다 수집일이 다릅니다.`
  }, [stat, stats, regionName, item, game])

  const shareModel: ShareModel = {
    gameLabel: GAME_TITLE[game],
    winnerName: itemName(item),
    regionName,
    stats: stat && stats
      ? {
          rank: stat.rank,
          survivors: stat.survivors,
          density: stat.density,
          densityMaxName: stats.densityMax.name,
          densityMaxValue: stats.densityMax.density,
          asOf: stats.asOf,
        }
      : null,
    wordStandard: item.game === 'word' ? item.word.ko : null,
    tallyLine,
    attributionLines:
      game === 'word'
        ? ['「남북한 언어비교」는 통일부 공공데이터입니다.', '말은 특정 고향에 속하지 않아 지역 통계를 붙이지 않습니다.']
        : game === 'scene'
          ? [
              `사진 출처: 통일부 이산가족정보통합시스템 「나의 살던 고향은」 · 제공: ${item.game === 'scene' ? item.scene.provider : ''} — 이 그림에는 사진을 담지 않았습니다.`,
              '지역 구분은 광복 당시 행정구역으로 옮긴 근사이며, 수치는 통일부 공공데이터입니다.',
            ]
          : [
              '음식의 지역 구분은 향토음식 문헌의 통설이며 통일부 공표 자료가 아닙니다.',
              '수치는 통일부 공공데이터입니다 · 공모전 출품 시제품.',
            ],
  }

  return (
    <div className="space-y-5">
      <header>
        <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>{GAME_TITLE[game]} — 결과</p>
        <h2 className={`mt-1 ${TYPE.h2} ${TEXT.ink} ${PROSE}`}>마지막까지 남은 것</h2>
      </header>

      {/* 우승 카드 */}
      <div className="max-w-md">
        <ItemCard item={item} big />
        {/* 참고 사진 출처 — 카드는 button 안에서도 쓰이는 부품이라 링크를 못 담는다.
            결과 화면(여기)이 링크를 거는 유일한 자리다. CC 표시 의무의 링크 이행. */}
        {photoOf(item) && (
          <p className={`mt-1.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
            <a href={photoOf(item)!.sourcePage} target="_blank" rel="noreferrer" className={`${TAP_INLINE} underline underline-offset-2 ${FOCUS}`}>
              사진 출처 열기(위키미디어 공용)<span aria-hidden="true">↗</span>
            </a>
            {item.game === 'food' && <> · 참고 사진은 그 지역의 조리법 그대로가 아닐 수 있습니다.</>}
          </p>
        )}
        {item.game === 'food' && (
          <p className={`mt-1.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
            귀속 근거 — {item.food.basis} ·{' '}
            <a href={item.food.source} target="_blank" rel="noreferrer" className={`${TAP_INLINE} underline underline-offset-2 ${FOCUS}`}>
              {item.food.sourceName}<span aria-hidden="true">↗</span>
            </a>
          </p>
        )}
        {item.game === 'scene' && (
          <p className={`mt-1.5 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
            원문 캡션 「{item.scene.caption}」 ·{' '}
            <a href={item.scene.sourceUrl} target="_blank" rel="noreferrer" className={`${TAP_INLINE} underline underline-offset-2 ${FOCUS}`}>
              통일부 원문 페이지<span aria-hidden="true">↗</span>
            </a>
            {' '}· 이미지는 저장하지 않고 원본 주소를 그대로 불러옵니다.
          </p>
        )}
      </div>

      {/* ── 지역 축이 있는 게임: 통일부 실측 + 연결 + 행동 3단추 ── */}
      {game !== 'word' && stat && stats && (
        <>
          <RegionStatBlock stat={stat} stats={stats} />
          {bridge && (
            <p className={`max-w-[46rem] ${TYPE.answer} ${TEXT.ink} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
              {bridge}
            </p>
          )}
          <div className="flex flex-wrap gap-2.5">
            <Link to={`/?고향=${stat.id}`} className={BTN.primary}>
              {stat.name} 지도로 가기 <span aria-hidden="true">→</span>
            </Link>
            <Link to={`/?고향=${stat.id}#memory-card`} className={BTN.ghost}>
              기억 카드 만들기
            </Link>
            {/* #g-museum — 지역 패널의 「그 고향에서 온 기록물」 구획(그 고향 필터가 걸린 자리).
                #museum-tour 는 전체 기증사진 덱이라 다른 고향 사진부터 보였다(실측 지적 2026-08-25). */}
            <Link to={`/?고향=${stat.id}#g-museum`} className={BTN.ghost}>
              그 고향에서 온 기록 보기
            </Link>
          </div>
        </>
      )}

      {/* ── 말 월드컵: 지역 없음을 정직하게 + 잇는 것 셋 ── */}
      {game === 'word' && item.game === 'word' && (
        <>
          <p className={`max-w-[46rem] ${TYPE.answer} ${TEXT.ink} ${PROSE}`} style={{ fontFamily: FONT.serif }}>
            「{item.word.nk}」 — 표준어로 {item.word.ko}. 이 대응은 통일부 공공데이터 「남북한 언어비교」 {nf(ITEMS.words.total)}쌍 중 하나입니다.
          </p>
          <p className={`max-w-[46rem] ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
            말은 남북 표준어(문화어)의 차이이지 특정 고향의 사투리가 아니어서, 지역 통계를 붙이지 않습니다.
          </p>
          <div className={`${SURFACE.card} max-w-md p-4`}>
            <p className={`${TYPE.cap} font-semibold ${TEXT.faint}`}>같은 자료에서 세 쌍 더</p>
            <ul className="mt-1.5 space-y-1">
              {morePairs.map(p => (
                <li key={p.id} className={`${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
                  <b className={`font-semibold ${TEXT.ink}`}>{p.nk}</b> — 표준어 {p.ko}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link to={`/factcheck?q=${encodeURIComponent(item.word.nk)}`} className={BTN.primary}>
              이 말을 팩트체커에서 찾아보기 <span aria-hidden="true">→</span>
            </Link>
            <Link to="/" className={BTN.ghost}>
              고향의 기록으로 건너가기
            </Link>
          </div>
        </>
      )}

      {/* 북BTI 한 줄 조각 — 이 판으로 채워진 글자와 남은 게임 */}
      <BukbtiNudge game={game} />

      {/* 실시간 실선택 순위덱 — 이 게임 것 하나만. 자기 판이 반영된 값을 보게 된다 */}
      <div className="max-w-md">
        <TallyDeck games={[game]} variant="result" />
      </div>

      <div className={`flex flex-wrap items-center gap-2.5 border-t pt-4 ${SURFACE.hair}`}>
        <PickShareCard model={shareModel} fileName={`고향잇기_${GAME_TITLE[game]}_${itemName(item)}.png`} />
        <button type="button" onClick={onRestart} className={BTN.ghost}>
          처음부터 다시
        </button>
        <Link to="/pick" className={BTN.ghost}>
          다른 게임 고르기
        </Link>
      </div>
    </div>
  )
}
