// api.txt(gitignore됨)에서 환경변수를 읽는다 — 키를 코드/커밋에 넣지 않기 위함
import fs from 'node:fs'
import path from 'node:path'

export function loadEnv(file = 'api.txt') {
  const p = path.resolve(file)
  if (!fs.existsSync(p)) return process.env
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.+?)\s*(?:#.*)?$/)
    if (!m) continue
    const [, k, v] = m
    if (!process.env[k]) process.env[k] = v.replace(/^["']|["']$/g, '')
  }
  return process.env
}
