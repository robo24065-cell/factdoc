import { useEffect, useMemo, useRef, useState } from 'react'
import { SURFACE, TYPE, TEXT, PROSE, FOCUS } from '../theme/gohyang'

/* 큰 사진 배너 — 「먼저 사람이 보이게」
 *
 * 왜 필요한가(사용자 지시 2026-08-19): 작은 카드 격자만으로는 사료가 자료 목록처럼 보인다.
 *   이 화면에서 먼저 와야 하는 것은 통계가 아니라 **사람의 얼굴과 집안의 사진**이다.
 *   박물관 자신의 「스토리」 배너처럼 가운데 한 장을 크게 두고 양옆을 살짝 보여 준다.
 *
 * 감정을 연출하지는 않는다 — 사진을 크게 놓을 뿐, 설명에 수식어를 붙이지 않는다.
 *   구체적인 사실(누가 언제 어디서)이 감정을 만들지, 형용사가 만들지 않는다.
 *
 * 접근성 — 자동으로 넘기지 않는다. 노인·어린이가 읽는 속도를 기계가 정하면 안 된다.
 *   좌우 큰 단추 · 키보드 ←→ · 손가락 밀기 세 경로를 둔다.
 */

type Rec = {
  iId: number
  title: string
  producedOn?: string | null
  donor?: string | null
  form?: string | null
  regions?: string[]
  imageUrl?: string | null
  /** 원본 팩에서 null 이 올 수 있다 — 링크가 없으면 카드가 아니라 그림으로만 둔다 */
  recordUrl?: string | null
}

const imgOf = (r: Rec) => {
  const m = String(r.imageUrl || '').match(/file_id=(\d+)/)
  return m ? `/api/museum-img?file_id=${m[1]}` : null
}

/* 생산일자는 원자료가 제각각이다(1987.03.24 · 1997.00.00 · 빈칸).
   0 이 든 자리는 「모름」이므로 지어내지 않고 있는 만큼만 읽는다. */
function whenKo(s?: string | null): string {
  const m = String(s || '').match(/^(\d{4})\.(\d{2})\.(\d{2})/)
  if (!m) return '생산일자 미상'
  const [, y, mo, d] = m
  if (mo === '00') return `${Number(y)}년`
  if (d === '00') return `${Number(y)}년 ${Number(mo)}월`
  return `${Number(y)}년 ${Number(mo)}월 ${Number(d)}일`
}

export default function MuseumBanner({
  records, title = '기증해 주신 사진', sub,
}: {
  records: Rec[]
  title?: string
  sub?: string
}) {
  /* 사진으로 보이는 것만 고른다 — 상세 파싱이 된 44건은 form 으로, 나머지는 제목으로.
     지도·문서가 큰 배너에 걸리면 "왜 이게 크지?"가 된다. */
  const shots = useMemo(() => {
    const isPhoto = (r: Rec) =>
      /사진/.test(r.form || '') || (!r.form && /사진/.test(r.title || ''))
    const seen = new Set<number>()
    return records
      .filter(r => r.imageUrl && r.recordUrl && isPhoto(r) && !seen.has(r.iId) && seen.add(r.iId))
      .slice(0, 24)
  }, [records])

  const [cur, setCur] = useState(0)
  const touchX = useRef<number | null>(null)
  useEffect(() => { setCur(0) }, [shots])

  if (!shots.length) return null
  const n = shots.length
  const at = (i: number) => shots[((i % n) + n) % n]
  const go = (d: number) => setCur(c => ((c + d) % n + n) % n)

  const Side = ({ r, side }: { r: Rec; side: 'l' | 'r' }) => {
    const src = imgOf(r)
    return (
      <div
        aria-hidden="true"
        className={`hidden w-[22%] shrink-0 overflow-hidden rounded-md opacity-45 md:block ${side === 'l' ? 'mr-3' : 'ml-3'}`}
      >
        {src && <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />}
      </div>
    )
  }

  const c = at(cur)
  const src = imgOf(c)

  return (
    <section className={`overflow-hidden ${SURFACE.card}`}>
      <div className={`border-b bg-[#f5f7fa] p-4 ${SURFACE.hair}`}>
        <h2 className={`${TYPE.h2} ${TEXT.ink} ${PROSE}`}>{title}</h2>
        {sub && <p className={`mt-1 ${TYPE.sub} ${TEXT.soft} ${PROSE}`}>{sub}</p>}
      </div>

      <div
        className="flex items-stretch justify-center bg-[#f0f1f3] p-3 sm:p-5"
        onTouchStart={e => { touchX.current = e.touches[0]?.clientX ?? null }}
        onTouchEnd={e => {
          const x0 = touchX.current; touchX.current = null
          const x1 = e.changedTouches[0]?.clientX
          if (x0 == null || x1 == null) return
          if (Math.abs(x1 - x0) < 48) return
          go(x1 < x0 ? 1 : -1)
        }}
      >
        <Side r={at(cur - 1)} side="l" />

        <figure className="min-w-0 flex-1">
          <a
            href={c.recordUrl ?? undefined}
            target={c.recordUrl ? '_blank' : undefined}
            rel="noreferrer"
            aria-disabled={c.recordUrl ? undefined : true}
            className={`block overflow-hidden rounded-md bg-white ${FOCUS}`}
          >
            {src && (
              <img
                src={src}
                alt={c.title}
                loading="lazy"
                decoding="async"
                className="max-h-[440px] w-full object-contain"
              />
            )}
            <figcaption className="border-t p-3.5" style={{ borderColor: '#dcdfe4' }}>
              <p className={`text-[1.0625rem] font-bold ${TEXT.ink} ${PROSE}`}>{c.title}</p>
              <p className={`mt-1 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
                {whenKo(c.producedOn)}
                {c.donor ? ` · ${c.donor}님 기증` : ''}
                {c.regions?.length ? ` · ${c.regions[0]}` : ''}
              </p>
              {c.recordUrl && (
                <p className={`mt-1.5 ${TYPE.cap} font-medium ${TEXT.blue}`}>박물관에서 보기 ↗</p>
              )}
            </figcaption>
          </a>
        </figure>

        <Side r={at(cur + 1)} side="r" />
      </div>

      {/* 넘기기 — 자동으로 넘어가지 않는다. 읽는 속도는 보는 사람이 정한다. */}
      <div className={`flex items-center justify-between gap-3 border-t px-4 py-3 ${SURFACE.hair}`}>
        <button
          type="button" onClick={() => go(-1)}
          className={`min-h-[48px] rounded border px-4 text-[1.0625rem] font-medium ${SURFACE.line} ${TEXT.soft} ${FOCUS}`}
          aria-label="이전 사진"
        >← 이전</button>

        <div className="flex flex-wrap items-center justify-center gap-1.5" role="group" aria-label="사진 고르기">
          {shots.slice(0, 12).map((s, i) => (
            <button
              key={s.iId}
              type="button"
              onClick={() => setCur(i)}
              aria-label={`${i + 1}번째 사진`}
              aria-current={i === cur ? 'true' : undefined}
              className={`h-2.5 w-2.5 rounded-full ${FOCUS} ${i === cur ? 'bg-[#1a4e9c]' : 'bg-[#c9ced6]'}`}
            />
          ))}
          <span className={`ml-2 ${TYPE.cap} ${TEXT.faint} tabular-nums`} aria-live="polite">
            {cur + 1} / {n}
          </span>
        </div>

        <button
          type="button" onClick={() => go(1)}
          className={`min-h-[48px] rounded bg-[#1a4e9c] px-4 text-[1.0625rem] font-medium text-white ${FOCUS}`}
          aria-label="다음 사진"
        >다음 →</button>
      </div>

      <p className={`px-4 pb-3 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
        실향민과 가족이 통일부 남북이산가족 디지털박물관에 맡기신 실제 기록물입니다.
        사진은 박물관 원본을 그대로 불러온 것이며, 본 화면은 저장하거나 다시 배포하지 않습니다.
      </p>
    </section>
  )
}
