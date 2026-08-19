/* ────────────────────────────────────────────────────────────────
   S13 — 출처 (압축 1뷰포트)

   승격: "기준일이 최대 N년 벌어져 있습니다" — 한 화면에 있다고 같은 시점의 값이 아니다.
   ★ N 은 리터럴이 아니라 **아래 표에서 계산**한다(frozen 포함·제외를 갈라 말한다).
   행당 1줄: 필(as-of 배지) + 이름 + 기관 + 기준일 + 원본 링크.
   마지막 줄: "지도에 없는 것은 팩트체커에 물어보세요 →"
   ──────────────────────────────────────────────────────────────── */

import { Link } from 'react-router-dom'
import { coverageEndOf, datasetLabel } from '../../engine/nk-search.mjs'
import { TYPE, TEXT, ASOF, FONT } from '../../theme/gohyang'
import type { Level, Pack } from '../../components/gohyang/pack-types'
import { nf, notice } from '../../components/gohyang/format'
import { CARD, PROSE, FOCUS, AsOfPill, OutLink } from '../../components/gohyang/bits'

type SourceRow = { name: string; org: string; end: string; fresh: Level; url?: string | null; reason?: string; outside?: boolean }

export default function SourcesScene({ pack }: { pack: Pack }) {
  /* ★ 표를 만들고 나서 그 표에서 「최대 격차」를 **계산한다** (실측 지적 2026-08-19).
       예전 h2 는 "기준일이 최대 6년 벌어져 있습니다"라는 리터럴이었는데, 아래 행을 실제로 재면
       비-frozen 최고령이 2018-07-27(디지털박물관 사료)이라 8.06년이고, frozen 을 넣으면 10.52년이다.
       6년에 해당하는 조합은 이제 최대가 아니다. 하드코딩이라 갱신도 되지 않았다.
       그래서 문장의 숫자를 표에서 뽑고, frozen 포함·제외를 문장에서 갈라 말한다. */
  const rows: SourceRow[] = [
    { name: '이산가족 신청 현황 (월별 공표 HWP)', org: '통일부 이산가족정보통합시스템', end: pack.isan.latest.asOf, fresh: 'live', url: pack.isan.latest.boardUrl },
    /* 합산 한 줄(sources.find 가 동향 기준일을 참칭하던 자리) → 계열별 병기.
       기준일은 카탈로그 coverageEnd(coverageEndOf), 배지는 notice() 가 계산한다. */
    { name: datasetLabel('timeline'), org: '통일부', end: coverageEndOf('timeline') ?? pack.region.builtAt, fresh: 'live', url: 'https://www.data.go.kr/data/15090949/fileData.do' },
    { name: datasetLabel('briefing'), org: '통일부', end: coverageEndOf('briefing') ?? pack.region.builtAt, fresh: 'live', url: 'https://www.data.go.kr/data/15079284/openapi.do' },
    { name: datasetLabel('nkinfoTrend'), org: '북한정보포털', end: coverageEndOf('nkinfoTrend') ?? pack.region.builtAt, fresh: 'live', url: 'https://nkinfo.unikorea.go.kr' },
    { name: datasetLabel('nkinfoOverview'), org: '북한정보포털', end: coverageEndOf('nkinfoOverview') ?? pack.region.builtAt, fresh: 'live', url: 'https://nkinfo.unikorea.go.kr' },
    { name: '이산가족찾기 등록현황 월별 통계 (파일데이터)', org: '공공데이터포털 — 통일부', end: pack.isan.monthly.at(-1)?.month ?? '', fresh: 'live', url: pack.isan.sources[0]?.landing },
    { name: '기상 관측 (Global Summary of the Day)', org: 'NOAA NCEI', end: pack.region.meta.weather.latestObsDate, fresh: 'stale', url: 'https://www.ncei.noaa.gov/data/global-summary-of-the-day/' },
    { name: '이산가족 교류 현황 (월별 공표 HWP)', org: '통일부 이산가족정보통합시스템', end: pack.isan.exchange.asOf, fresh: 'live', url: pack.isan.exchange.boardUrl },
    { name: '북한이탈주민 재북 출신지역별 현황', org: '통일부', end: pack.region.regions['평양']?.defectorOrigin?.asOf ?? '', fresh: 'stale', url: 'https://www.data.go.kr/data/15090949/fileData.do' },
    { name: '남북이산가족 관련 연표 (파일데이터)', org: '공공데이터포털 — 통일부', end: pack.isan.chronology.at(-1)?.date ?? '', fresh: 'stale', url: pack.isan.sources[3]?.landing },
    /* ★ frozen 도 **주제 단위**로 갈라야 한다 — 한 행에 묶으면 금강산이 8년 늦은 개성공단 날짜를
         뒤집어쓴다(합산 행 단일 기준일이 frozen 차선에서 재현된 자리). CLAUDE.md TOPIC_STATUS 그대로. */
    { name: '개성공단', org: '통일부 (주제 종료)', end: '2016-02-10', fresh: 'frozen', url: null, reason: '2016-02-10 개성공단 전면중단 이후 신규 데이터가 생성되지 않습니다.' },
    { name: '금강산 관광', org: '통일부 (주제 종료)', end: '2008-07-11', fresh: 'frozen', url: null, reason: '2008-07-11 관광 중단 이후 신규 데이터가 생성되지 않습니다. 배포 파일명이 20201231 이어도 관광은 2008-07 에 끊겼습니다.' },
    { name: `남북이산가족 디지털박물관 공개 사료 ${nf(pack.museum.archive.totCnt)}건`, org: '통일부 이산가족정보통합시스템', end: pack.paths.meta.measured?.archiveNewestProducedOn ?? pack.museum.builtAt, fresh: 'stale', url: pack.museum.sources[0]?.url ?? null },
    { name: `후손이 신청할 수 있는 제도 ${nf(pack.paths.summary.totalPaths)}종 (창구 링크 실측)`, org: '통일부 · 법제처 국가법령정보', end: pack.paths.builtAt, fresh: 'live', url: pack.paths.sources[0]?.url ?? null },
    { name: '통일의식조사 — 남북한 통일의 필요성', org: '서울대학교 통일평화연구원', end: pack.opinion.reports.at(-1)?.fieldPeriod?.to ?? '', fresh: 'stale', url: pack.opinion.licenseUrl, outside: true },
  ]

  const spanYears = (list: SourceRow[]) => {
    const ts = list.map(r => Date.parse(r.end)).filter(Number.isFinite)
    if (ts.length < 2) return null
    return Math.round(((Math.max(...ts) - Math.min(...ts)) / 31557600000) * 10) / 10
  }
  const gapLive = spanYears(rows.filter(r => r.fresh !== 'frozen'))
  const gapAll = spanYears(rows)

  return (
    <section>
      <header className={PROSE}>
        <p className={`${TYPE.eyebrow} ${TEXT.faint}`}>이 화면이 쓴 자료 전부</p>
        <h2
          className={`mt-2 max-w-[46rem] text-[1.375rem] font-bold leading-[1.5] sm:text-[1.5rem] ${TEXT.ink}`}
          style={{ fontFamily: FONT.serif }}
        >
          기준일이 최대 {gapLive != null ? `${gapLive.toFixed(1)}년` : '여러 해'} 벌어져 있습니다.
        </h2>
        <p className={`mt-1 max-w-[46rem] ${TYPE.sub} ${TEXT.faint}`}>
          한 화면에 있다고 같은 시점의 값이 아닙니다. 그래서 값마다 기준일을 함께 적었습니다.
          {gapAll != null && gapLive != null && gapAll > gapLive && (
            <> 종료가 확정된 주제(개성공단·금강산 관광)까지 넣으면 {gapAll.toFixed(1)}년입니다 —
              그 둘은 「모른다」가 아니라 「없다」라서 따로 셉니다.</>
          )}
        </p>
      </header>

      <div className={`mt-3 overflow-hidden ${CARD}`}>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map(s => {
            const n = s.end ? notice(s.end, s.fresh, (s as { reason?: string }).reason) : null
            return (
              /* 행당 1줄 — 좁은 화면에서도 줄바꿈 없이 이름이 잘리는 쪽을 택한다.
                 잘려도 기준일·원본 링크는 남고, 링크 끝에 전체 이름이 있다(title). */
              <div key={s.name} className="flex items-center gap-x-2 px-3 py-1.5" title={`${s.name} — ${s.org}`}>
                {n && <AsOfPill level={n.level as Level} size="sm" />}
                <span className={`min-w-0 flex-1 truncate text-[13px] leading-[1.6] text-slate-700 dark:text-slate-200`}>
                  {s.name}
                  <span className="ml-1 text-[11px] text-[#767676]">{s.org}</span>
                  {(s as { outside?: boolean }).outside && (
                    <span className={`ml-1.5 rounded px-1.5 py-0.5 ${TYPE.cap} font-semibold ${ASOF.stale.chip}`}>통일부 자료 아님</span>
                  )}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-slate-500">기준 {s.end || '미상'}</span>
                <OutLink href={s.url}>원본</OutLink>
              </div>
            )
          })}
        </div>
        <div className="border-t border-slate-100 p-3 dark:border-slate-800">
          <p className={`text-[11px] leading-relaxed text-[#767676] ${PROSE}`}>데이터 팩 생성일 {pack.map.builtAt} · 지도 {pack.map.builtAt} · 지역 {pack.region.builtAt} · 이산가족 {pack.isan.builtAt} · 추계 {pack.proj.builtAt} · 박물관 사료 {pack.museum.builtAt} · 후손 경로 {pack.paths.builtAt} · 통일의식조사 {pack.opinion.builtAt}.
            북한 관련 정보 특성상 공식자료에 수록되지 않은 사실이 존재할 수 있습니다.
          </p>
          <p className={`mt-1 text-[11px] leading-relaxed text-[#767676] ${PROSE}`}>
            박물관 사료는 공개 {nf(pack.museum.archive.totCnt)}건 가운데 본문에서 지역명이 확인된 {nf(pack.museum.meta.slim.keptRecords)}건만 이 화면에 실려 있습니다
            {' '}— 나머지 {nf(pack.museum.meta.slim.droppedRecords)}건은 고향이 없어서가 아니라 본문에 지명이 적혀 있지 않아 지도에 걸 자리가 없는 것입니다.
            {' '}사료 이미지는 저장하지 않고 박물관 원본을 그대로 참조합니다.
            {' '}통일의식조사만 통일부 자료가 아닙니다 — {pack.opinion.licenseFullText}
          </p>
        </div>
      </div>

      {/* ── 마지막 줄 — 다음 갈 곳 ── */}
      <p className="mt-4">
        <Link
          to="/factcheck"
          className={`inline-flex min-h-[48px] items-center gap-1 rounded text-[1.0625rem] font-medium text-[#1a4e9c] underline underline-offset-[3px] ${FOCUS} ${PROSE}`}
          style={{ fontFamily: FONT.serif }}
        >
          지도에 없는 것은 팩트체커에 물어보세요 <span aria-hidden="true">→</span>
        </Link>
      </p>
    </section>
  )
}
