import { useEffect, useMemo, useRef, useState } from 'react'
import { SURFACE, TYPE, TEXT, BTN, PROSE, FOCUS } from '../theme/gohyang'

/* 박물관 둘러보기 — 「빠짐없이, 그러나 헤매지 않게」
 *
 * 왜 이렇게 만드는가 (사용자 지적 2026-08-19):
 *   박물관 자체는 좋은 자료를 갖고 있는데 고령자·어린이가 메뉴를 파고들어 찾기 어렵다.
 *   우리가 할 일은 자료를 대신 갖는 것이 아니라 **한눈에 펼쳐 보이고 바로 건너가게** 하는 것이다.
 *     · 분류를 계층으로 쪼개지 않는다. 한 줄로 늘어놓고 넘기면 다음 묶음이 나온다.
 *     · 자료 자체는 끌어안지 않고 링크로 넘긴다("링크 형식으로 카드까지만").
 *
 * 접근성 — 스크롤만으로 만들면 포인터·시력에 기대게 된다. 세 경로를 함께 둔다:
 *   ① 옆으로 밀기(스냅)  ② 좌우 큰 단추  ③ 키보드 ←→ 와 묶음 이름 누르기
 *   prefers-reduced-motion 이면 부드러운 이동을 끈다.
 */

type Cover = { fileId: number | null; title: string; recordUrl: string } | null
type Item = {
  kind: 'collection' | 'corner'
  id: string
  title: string
  what?: string
  count: number | null
  cover: Cover
  url: string
}
export type MuseumSections = {
  builtAt: string
  source: { name: string; url: string; note: string }
  totalRecords: number
  collections: Item[]
  corners: Item[]
  meta: { coversResolved: number }
}

const nf = (n?: number | null) => (typeof n === 'number' ? n.toLocaleString('ko-KR') : '—')
const imgOf = (c: Cover) => (c?.fileId ? `/api/museum-img?file_id=${c.fileId}` : null)
const reduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function Card({ it }: { it: Item }) {
  const [broken, setBroken] = useState(false)
  const src = imgOf(it.cover)
  return (
    <a
      href={it.url}
      target="_blank"
      rel="noreferrer"
      className={`block overflow-hidden ${SURFACE.card} ${FOCUS}`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#f0f1f3]">
        {src && !broken ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className={`flex h-full w-full items-center justify-center ${TYPE.cap} ${TEXT.faint}`}>
            {it.kind === 'corner' ? '박물관 코너' : '표지 없음'}
          </span>
        )}
        {/* 제목을 사진 위에 얹는다 — 박물관 자신의 컬렉션 카드와 같은 형태 */}
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
          <span className="block text-[1.0625rem] font-bold text-white">{it.title}</span>
          {it.count != null && (
            <span className="block text-[12px] text-white/85">{nf(it.count)}건</span>
          )}
        </span>
      </div>
      <div className="p-3">
        <p className={`${TYPE.cap} ${TEXT.soft} ${PROSE}`}>
          {it.what ?? '박물관에서 이 묶음을 펼쳐 봅니다.'}
        </p>
        <p className={`mt-1.5 ${TYPE.cap} font-medium ${TEXT.blue}`}>박물관에서 보기 ↗</p>
      </div>
    </a>
  )
}

export default function MuseumTour({ data }: { data: MuseumSections }) {
  /* 한 화면에 4장씩. 컬렉션이 먼저, 코너가 뒤 — 성격이 달라 섞지 않는다. */
  const groups = useMemo(() => {
    const chunk = (arr: Item[], n: number) =>
      arr.reduce<Item[][]>((a, _, i) => (i % n ? a : [...a, arr.slice(i, i + n)]), [])
    return [
      ...chunk(data.collections, 4).map((items, i) => ({
        key: `c${i}`, label: i === 0 ? '많이 모인 묶음' : `컬렉션 ${i + 1}`, items,
      })),
      ...chunk(data.corners, 4).map((items, i) => ({
        key: `k${i}`, label: i === 0 ? '박물관의 다른 코너' : `코너 ${i + 1}`, items,
      })),
    ]
  }, [data])

  const [cur, setCur] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<Array<HTMLDivElement | null>>([])

  /* 미는 대로 차례가 따라온다 — 어느 묶음이 화면 가운데인지만 센다. */
  useEffect(() => {
    const root = boxRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      es => {
        const vis = es.filter(e => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (!vis) return
        const i = slideRefs.current.indexOf(vis.target as HTMLDivElement)
        if (i >= 0) setCur(i)
      },
      { root, threshold: 0.6 },
    )
    slideRefs.current.forEach(el => el && io.observe(el))
    return () => io.disconnect()
  }, [groups.length])

  const go = (i: number) => {
    const n = Math.max(0, Math.min(groups.length - 1, i))
    const el = slideRefs.current[n]
    const box = boxRef.current
    if (el && box) {
      box.scrollTo({ left: el.offsetLeft - box.offsetLeft, behavior: reduced() ? 'auto' : 'smooth' })
    }
    setCur(n)
  }

  return (
    <section className={`overflow-hidden ${SURFACE.card}`}>
      <div className={`border-b bg-[#f5f7fa] p-4 ${SURFACE.hair}`}>
        <h2 className={`${TYPE.h2} ${TEXT.ink} ${PROSE}`}>박물관 둘러보기</h2>
        <p className={`mt-1 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>
          통일부 남북이산가족 디지털박물관이 공개한 사료 {nf(data.totalRecords)}건을 묶음별로 펼쳐 놓았습니다.
          {' '}옆으로 넘기며 훑어보시고, 마음이 가는 묶음을 누르면 박물관으로 이어집니다.
        </p>
      </div>

      {/* 묶음 이름 — 지금 어디쯤인지 알려주고, 눌러 건너뛸 수도 있다 */}
      <div className={`flex flex-wrap items-center gap-1.5 border-b px-4 py-2.5 ${SURFACE.hair}`}>
        {groups.map((g, i) => (
          <button
            key={g.key}
            type="button"
            onClick={() => go(i)}
            aria-current={i === cur ? 'true' : undefined}
            className={`rounded-full px-3 py-1 ${TYPE.cap} font-semibold transition ${FOCUS} ${
              i === cur ? 'bg-[#1a4e9c] text-white' : 'bg-[#eef1f5] text-[#555555] hover:text-[#191919]'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div
        ref={boxRef}
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1) }
          if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1) }
        }}
        className="flex snap-x snap-mandatory overflow-x-auto"
        aria-label="박물관 묶음 넘기기"
      >
        {groups.map((g, i) => (
          <div
            key={g.key}
            ref={el => { slideRefs.current[i] = el }}
            className="w-full shrink-0 snap-start p-4"
          >
            <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {g.items.map(it => <li key={it.id}><Card it={it} /></li>)}
            </ul>
          </div>
        ))}
      </div>

      <div className={`flex items-center justify-between gap-3 border-t px-4 py-3 ${SURFACE.hair}`}>
        <button
          type="button" onClick={() => go(cur - 1)} disabled={cur === 0}
          className={`${BTN.ghost} min-h-[48px] disabled:opacity-35`}
        >← 이전</button>
        <p className={`${TYPE.cap} ${TEXT.faint} tabular-nums`} aria-live="polite">
          {cur + 1} / {groups.length}
        </p>
        <button
          type="button" onClick={() => go(cur + 1)} disabled={cur >= groups.length - 1}
          className={`${BTN.primary} min-h-[48px] disabled:opacity-35`}
        >다음 →</button>
      </div>

      <div className={`border-t px-4 py-3 ${SURFACE.hair}`}>
        <p className={`${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          출처 {data.source.name} · 수집 {data.builtAt} ·{' '}
          <a href={data.source.url} target="_blank" rel="noreferrer" className={`underline ${TEXT.blue}`}>박물관 원문</a>
          {' '}— 사진은 박물관 원본을 그대로 불러온 것이며 본 화면은 저장하거나 다시 배포하지 않습니다.
          {' '}코너는 목록이 박물관 화면에서 그려져 건수를 세지 못했으므로 비워 두었습니다.
        </p>
      </div>
    </section>
  )
}
