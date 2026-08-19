import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/* 개발 서버에서도 사료 이미지가 보이게 한다.
   배포본은 Cloudflare Pages Function(functions/api/museum-img.js)이 처리하지만
   vite dev 에는 Functions 가 없다. 같은 일을 하는 미들웨어를 하나 둔다 —
   박물관 서버가 JPEG 를 text/html 로 보내 Chromium ORB 가 막는 문제의 우회다. */
const museumImgDev = {
  name: 'museum-img-dev',
  configureServer(server: { middlewares: { use: (fn: unknown) => void } }) {
    server.middlewares.use(async (req: { url?: string }, res: {
      statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: unknown) => void
    }, next: () => void) => {
      if (!req.url?.startsWith('/api/museum-img')) return next()
      const id = new URL(req.url, 'http://x').searchParams.get('file_id') || ''
      if (!/^\d{1,9}$/.test(id)) { res.statusCode = 400; return res.end('bad_id') }
      try {
        const up = await fetch(
          `https://reunion.unikorea.go.kr/reuni/home/museum/archive/letter/HandLttrImageView.do?mid=SM00000262&file_id=${id}`,
          { redirect: 'manual' },
        )
        if (up.status !== 200) { res.statusCode = 502; return res.end('upstream_' + up.status) }
        const buf = Buffer.from(await up.arrayBuffer())
        const type = buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg'
          : buf[0] === 0x89 && buf[1] === 0x50 ? 'image/png'
            : buf[0] === 0x47 && buf[1] === 0x49 ? 'image/gif' : null
        if (!type) { res.statusCode = 415; return res.end('not_an_image') }
        res.statusCode = 200
        res.setHeader('content-type', type)
        res.setHeader('cache-control', 'public, max-age=3600')
        res.end(buf)
      } catch { res.statusCode = 502; res.end('upstream_error') }
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), museumImgDev],
})
