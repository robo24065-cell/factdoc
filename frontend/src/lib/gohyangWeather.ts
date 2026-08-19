import { useEffect, useState } from 'react'

/* ────────────────────────────────────────────────────────────────
   고향의 지금 날씨 — 화면이 직접 부르는 유일한 계열

   왜 NOAA 를 안 쓰고 따로 부르는가 — 실측했다(2026-08-19):
     GSOD  /access/2026/            → HTTP 404
     ISD   /global-hourly/2026/     → HTTP 404
     KN 27지점 최신 관측            → 2025-08-24 (1년 정지)
   기상청 계열은 북한관측·ASOS·apihub 전부 로그인이 걸려 있어 익명으로 못 받는다.

   그래서 Open-Meteo 를 쓴다 — 키·로그인·신청 없이 익명 호출이 되고,
   13개 지역을 한 번의 요청으로 받는다(실측 1.2초 · 7.7KB).

   ★ 빌드에 굽지 않고 **브라우저가 직접** 부른다. 기상은 빌드 시점의 값을 저장하는 순간
     그 자체로 stale 이 되는 유일한 계열이라, as-of 를 지키는 방법이 '실시간'이다.
     네트워크가 죽으면 조용히 실패로 두고 화면이 감춘다(LLM 4원칙 ④와 같은 태도).

   ※ 이 파일은 지도 화면(GohyangOn)과 기억 카드(MemoryCard)가 함께 쓴다.
     두 벌로 두면 반드시 한쪽이 낡는다 — 좌표표와 호출 규약은 여기 하나뿐이다.
   ──────────────────────────────────────────────────────────────── */

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'

/** 지역 대표 지점 — 도 소재지·주요 도시 좌표. 지도 centroid 는 SVG 좌표라 쓸 수 없다. */
export const REGION_LATLON: Record<string, [number, number]> = {
  평양: [39.019, 125.738], 남포: [38.737, 125.408], 개성: [37.970, 126.554], 라선: [42.256, 130.294],
  평안남도: [39.238, 125.876], 평안북도: [40.104, 124.398], 자강도: [40.969, 126.585],
  황해남도: [38.044, 125.715], 황해북도: [38.507, 126.640], 강원도: [39.147, 127.444],
  함경남도: [39.918, 127.536], 함경북도: [41.795, 129.775], 량강도: [41.396, 128.180],
}

export type LiveWx = { name: string; tempC: number; maxC: number; minC: number; prcpMm: number; at: string }
export type LiveWxState = 'idle' | 'loading' | 'ok' | 'fail'

/** 선택한 지역들의 현재 기상. 실패·미지원은 빈 배열로 두고 화면에서 감춘다. */
export function useLiveWeather(names: string[]): { rows: LiveWx[]; state: LiveWxState } {
  const [rows, setRows] = useState<LiveWx[]>([])
  const [state, setState] = useState<LiveWxState>('idle')
  const key = names.join('|')

  useEffect(() => {
    const targets = names.filter(n => REGION_LATLON[n])
    if (!targets.length) { setRows([]); setState('idle'); return }
    let alive = true
    setState('loading')
    const q = new URLSearchParams({
      latitude: targets.map(n => REGION_LATLON[n][0]).join(','),
      longitude: targets.map(n => REGION_LATLON[n][1]).join(','),
      current: 'temperature_2m,precipitation',
      daily: 'temperature_2m_max,temperature_2m_min',
      timezone: 'Asia/Pyongyang',
      forecast_days: '1',
    })
    fetch(`${OPEN_METEO}?${q}`)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then((j: unknown) => {
        if (!alive) return
        // 지점이 1곳이면 객체, 여러 곳이면 배열로 온다
        const arr = (Array.isArray(j) ? j : [j]) as Array<{
          current?: { temperature_2m?: number; precipitation?: number; time?: string }
          daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] }
        }>
        const out: LiveWx[] = []
        arr.forEach((x, i) => {
          const t = x?.current?.temperature_2m
          if (typeof t !== 'number' || !targets[i]) return
          out.push({
            name: targets[i],
            tempC: t,
            maxC: x?.daily?.temperature_2m_max?.[0] ?? NaN,
            minC: x?.daily?.temperature_2m_min?.[0] ?? NaN,
            prcpMm: x?.current?.precipitation ?? 0,
            at: x?.current?.time ?? '',
          })
        })
        setRows(out)
        setState(out.length ? 'ok' : 'fail')
      })
      .catch(() => { if (alive) { setRows([]); setState('fail') } })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { rows, state }
}
