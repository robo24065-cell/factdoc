/* 박물관 사료 이미지 경유로 — **헤더만 바로잡는다**
 *
 * 왜 필요한가: 박물관 서버가 JPEG 를 Content-Type: text/html + nosniff 로 보낸다.
 *   Chromium 의 ORB(Opaque Response Blocking)가 이걸 이미지로 인정하지 않고 막는다.
 *   iOS Safari 는 ORB 가 없어 그냥 보인다 — 그래서 "모바일에선 보이는데 PC 에선 안 보이는"
 *   현상이 났다(실측 2026-08-19: 실제 Chrome onerror, curl 은 200 JPEG).
 *
 * 무엇을 하지 않는가 — 저장하지 않는다. 캐시에 굽지 않는다. 변형하지 않는다.
 *   원본 바이트를 그대로 흘려보내고 Content-Type 만 실제 값으로 고쳐 준다.
 *   기증자 저작물이므로 우리 쪽에 사본이 남으면 안 된다.
 *
 * 통일부가 자체 구현하면 이 파일 자체가 필요 없다(같은 도메인이라 ORB 가 걸리지 않는다).
 */

const UPSTREAM = 'https://reunion.unikorea.go.kr/reuni/home/museum/archive/letter/HandLttrImageView.do'

export async function onRequestGet({ request }) {
  const id = new URL(request.url).searchParams.get('file_id') || ''
  // 열린 프록시가 되지 않도록 — 숫자 id 만 받는다. 임의 URL 은 통과시키지 않는다.
  if (!/^\d{1,9}$/.test(id)) return new Response('bad_id', { status: 400 })

  let up
  try {
    up = await fetch(`${UPSTREAM}?mid=SM00000262&file_id=${id}`, {
      // mid 가 없으면 302 다(실측). redirect 를 따라가지 않아야 로그인 페이지를 이미지로 넘기지 않는다.
      redirect: 'manual',
      cf: { cacheTtl: 0 },
    })
  } catch {
    return new Response('upstream_error', { status: 502 })
  }
  if (up.status !== 200) return new Response('upstream_' + up.status, { status: 502 })

  /* 실제 바이트로 형식을 판정한다 — 상류가 알려주는 Content-Type 은 틀렸다.
     JPEG(ffd8ff) · PNG(89504e47) · GIF(GIF8) 만 통과시킨다. HTML 이 오면 막는다. */
  const buf = await up.arrayBuffer()
  const b = new Uint8Array(buf.slice(0, 4))
  const type =
    b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? 'image/jpeg'
      : b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? 'image/png'
        : b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 ? 'image/gif'
          : null
  if (!type) return new Response('not_an_image', { status: 415 })

  return new Response(buf, {
    headers: {
      'content-type': type,
      'cache-control': 'public, max-age=3600',   // 브라우저 캐시만. 우리는 저장하지 않는다.
      'x-upstream': 'reunion.unikorea.go.kr',
    },
  })
}
