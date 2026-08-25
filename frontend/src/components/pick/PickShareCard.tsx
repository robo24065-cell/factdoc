import { useState } from 'react'
import { BTN, C, FONT, TYPE, TEXT, PROSE, WEBFONT_SERIF, FOCUS, TAP_INLINE } from '../../theme/gohyang'
import { wrapLines } from '../../lib/wrapLines.mjs'

/* ────────────────────────────────────────────────────────────────
   참여(/pick) 공유 카드 — canvas 로 이 기기에서 그린다 (MemoryCard 규약 재사용)

   담는 것: 글자와 통일부 수치뿐이다.
   ★ 사진을 굽지 않는다 — 풍경 사진의 저작권은 제공처(평화문제연구소 등)에 있고,
     PNG 에 구우면 재배포가 된다. 원본은 화면에서 URL 직결로만 보인다.
   ★ 출처 구분 두 줄을 카드 하단에 고정한다 — 문화적 통설(음식·풍경)과
     통일부 공공데이터(수치·말)를 종이 위에서도 섞지 않는다.
   글꼴은 theme/gohyang.ts 의 FONT 를 화면과 공유하고, 그리기 전에
   document.fonts.load() 로 명조를 기다린다 — 안 기다리면 폴백 폭으로 재고
   명조로 그려 줄이 갈린다(MemoryCard 실측과 같은 사고).
   ──────────────────────────────────────────────────────────────── */

export type ShareModel = {
  /** 예: 고향의 음식 월드컵 */
  gameLabel: string
  /** 우승 항목 — 명조(사람의 말) */
  winnerName: string
  /** 고향 이름(말 월드컵은 null — 지역 축이 없다) */
  regionName: string | null
  /** 통일부 실측 3줄 — analysis.json 확정값 옮겨 적기. 없으면 구획째 생략 */
  stats: {
    rank: number
    survivors: number
    density: number
    densityMaxName: string
    densityMaxValue: number
    asOf: string
  } | null
  /** 말 월드컵 — 표준어 대응 */
  wordStandard: string | null
  /** 0판이면 null, 1판부터 「지금까지 N판 중 M번」으로 n 을 병기해 넘어온다 */
  tallyLine: string | null
  /** 출처 구분 꼬리 — 게임 종류별 두 줄 고정 */
  attributionLines: string[]
}

type Fam = 'serif' | 'gothic'
const famCss = (f: Fam) => (f === 'serif' ? FONT.serif : FONT.gothic)

const SERIF_SPECS = [`400 21px ${WEBFONT_SERIF}`, `700 40px ${WEBFONT_SERIF}`, `700 26px ${WEBFONT_SERIF}`] as const
const uniqChars = (s: string) => [...new Set(String(s ?? '').normalize('NFC'))].join('')

/* MemoryCard.loadSerif 와 같은 판정식 — 스타일시트 차단 시 check() 만으로는 못 잡는다 */
async function loadSerif(text: string, ms = 2500): Promise<boolean> {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined
  if (!fonts || typeof fonts.load !== 'function') return false
  const chars = uniqChars(text)
  if (!chars) return false
  try {
    const faces = await Promise.race([
      Promise.all(SERIF_SPECS.map(s => fonts.load(s, chars))).then(a => a.flat()),
      new Promise<never>((_, rj) => { setTimeout(() => rj(new Error('font-timeout')), ms) }),
    ])
    return faces.length > 0 && SERIF_SPECS.every(s => fonts.check(s, chars))
  } catch {
    return false
  }
}

const nf = (v: number) => (Number.isFinite(v) ? v.toLocaleString('ko-KR') : '—')

function nowStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 한 벌의 그리기 절차 — measure=true 면 높이만 잰다 (MemoryCard.paint 와 같은 구조) */
function paint(ctx: CanvasRenderingContext2D, m: ShareModel, W: number, measure: boolean): number {
  const M = 64
  const maxW = W - M * 2
  let y = 0
  const line = (text: string, size: number, weight: string, color: string, lead: number, fam: Fam) => {
    ctx.font = `${weight} ${size}px ${famCss(fam)}`
    ctx.fillStyle = color
    for (const ln of wrapLines(ctx, text, maxW)) {
      y += lead
      if (!measure) ctx.fillText(ln, M, y)
    }
  }
  const rule = (color: string = C.line, h = 1) => {
    y += 14
    if (!measure) { ctx.fillStyle = color; ctx.fillRect(M, y, maxW, h) }
    y += 6
  }

  if (!measure) { ctx.fillStyle = C.blue; ctx.fillRect(0, 0, W, 10) }
  y = 40
  line(m.gameLabel, 17, '700', C.faint, 30, 'gothic')
  line(m.winnerName, 40, '700', C.ink, 50, 'serif')
  if (m.wordStandard) line(`표준어 ${m.wordStandard}`, 17, '400', C.soft, 28, 'gothic')
  if (m.regionName) {
    y += 6
    line(m.regionName, 26, '700', C.blue, 36, 'serif')
  }
  rule(C.blue, 2)

  if (m.stats) {
    y += 8
    line('이 고향의 기록, 통일부 실측', 15, '700', C.soft, 26, 'gothic')
    line(`기록 계승 우선순위  전국 ${m.stats.rank}위 / 7  (점수가 아니라 일곱 고향의 순서입니다)`, 16, '400', C.ink, 28, 'gothic')
    line(`이 고향이 원적인 생존 신청자  ${nf(m.stats.survivors)}명`, 16, '400', C.ink, 28, 'gothic')
    line(
      `생존자 1인당 공식 기록  ${m.stats.density}건 — 가장 많은 ${m.stats.densityMaxName}(${m.stats.densityMaxValue}건)과 나란히 두고 보십시오`,
      16, '400', C.ink, 28, 'gothic',
    )
    /* 축 명시 — 분모(생존자)만 이 기준일이고 분자(기록 수)는 계열마다 수집일이 다르다(record-density-gap caveat) */
    line(`생존자 기준일 ${m.stats.asOf} · 기록 수는 계열마다 수집일이 다름 · 출처 통일부 공공데이터(이산가족 등록현황·남북관계 연표 등)`, 14, '400', C.faint, 24, 'gothic')
  }
  if (m.tallyLine) {
    y += 6
    line(m.tallyLine, 15, '400', C.soft, 26, 'gothic')
    /* ★ 출처 구분 — 화면에는 꼬리가 붙는데 카드에서 빠지면, 카드가 화면 밖으로 나가는 순간
       로컬 집계가 바로 위의 통일부 수치처럼 읽힌다. tallyLine 이 그려질 때는 반드시 함께 그린다. */
    line('(고향잇기 참여 익명 집계 · 통일부 자료 아님)', 13, '400', C.faint, 22, 'gothic')
  }

  y += 10
  rule()
  for (const a of m.attributionLines) line(a, 14, '400', C.faint, 24, 'gothic')
  y += 8
  line(`고향잇기 — 참여(/pick) · ${nowStamp()} 이 기기에서 그려짐 · 공모전 출품 시제품`, 14, '400', C.faint, 24, 'gothic')
  y += 40
  return y
}

async function renderPng(m: ShareModel): Promise<{ url: string; bytes: number } | null> {
  await loadSerif(m.gameLabel + m.winnerName + (m.regionName ?? '') + '0123456789')
  try {
    const W = 1000
    const dpr = 2
    const probe = document.createElement('canvas')
    probe.width = W
    probe.height = 10
    const pctx = probe.getContext('2d')
    if (!pctx) return null
    const need = Math.max(560, Math.ceil(paint(pctx, m, W, true)))

    const cv = document.createElement('canvas')
    cv.width = W * dpr
    cv.height = need * dpr
    const ctx = cv.getContext('2d')
    if (!ctx) return null
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, need)
    ctx.textBaseline = 'alphabetic'
    paint(ctx, m, W, false)
    const url = cv.toDataURL('image/png')
    if (!url.startsWith('data:image/png')) return null
    return { url, bytes: Math.round((url.length - url.indexOf(',') - 1) * 0.75) }
  } catch {
    return null
  }
}

export default function PickShareCard({ model, fileName }: { model: ShareModel; fileName: string }) {
  const [png, setPng] = useState<{ url: string; bytes: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState(false)

  const make = async () => {
    if (busy) return
    setBusy(true)
    let out: Awaited<ReturnType<typeof renderPng>> = null
    try { out = await renderPng(model) } finally { setBusy(false) }
    if (!out) { setFail(true); setPng(null); return }
    setFail(false)
    setPng(out)
    try {
      const a = document.createElement('a')
      a.href = out.url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch { /* 내려받기가 막힌 환경 — 아래 링크가 남는다 */ }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" onClick={() => { void make() }} disabled={busy} aria-busy={busy} className={`${BTN.ghost} disabled:opacity-70`}>
          공유 그림 저장
        </button>
        {busy && <span className={`${TYPE.sub} ${TEXT.faint}`}>카드를 그리는 중입니다</span>}
      </div>
      {png && (
        <p className={`mt-2 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>
          그림 파일 한 장을 만들었습니다 (약 {nf(Math.round(png.bytes / 1024))}KB). 사진은 담지 않고 글자와 수치만 담았습니다.
          {' '}자동으로 저장되지 않으면{' '}
          <a href={png.url} download={fileName} className={`${TAP_INLINE} font-medium text-[#1a4e9c] underline underline-offset-2 ${FOCUS}`}>
            여기를 눌러 저장
          </a>
          하십시오.
        </p>
      )}
      {fail && (
        <p className={`mt-2 ${TYPE.cap} ${TEXT.faint} ${PROSE}`}>이 브라우저에서는 그림 파일을 만들지 못했습니다. 화면을 갈무리해 쓰셔도 됩니다.</p>
      )}
    </div>
  )
}
