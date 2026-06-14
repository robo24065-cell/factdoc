// 캐시된 판정을 현재 엔진으로 재검증 → 판정이 바뀐 항목을 needs_review로 플래그(사유 포함).
// 사용: SUPABASE_DB_URL='postgresql://...' npx tsx scripts/revalidate.ts
// 정기 실행(GitHub Actions cron) → 지식베이스 변화/출처 갱신 시 검증완료 항목을 자동으로 재검토 큐에.
// 주의: Node에선 규칙 파서만 동작(Gemini 미사용) → 보수적으로 플래그(사람 검토 전제).
import pg from 'pg'
import { runPipeline } from '../frontend/src/engine'

const DB = process.env.SUPABASE_DB_URL
if (!DB) { console.error('SUPABASE_DB_URL 필요'); process.exit(1) }

const c = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await c.connect()
const { rows } = await c.query('select id, canonical_claim, verdict from verdict_cache')
let flagged = 0
for (const r of rows as { id: number; canonical_claim: string; verdict: string }[]) {
  const fresh = runPipeline(r.canonical_claim).verdict
  if (fresh !== r.verdict) {
    await c.query(
      'update verdict_cache set needs_review = true, review_reason = $1 where id = $2 and tier = $3',
      [`재검증: 판정이 '${r.verdict}' → '${fresh}'(으)로 변경됨(지식베이스 갱신)`, r.id, 'verified'],
    )
    flagged++
  }
}
console.log(`재검증 완료: ${rows.length}건 중 변경 ${flagged}건 → 재검토 플래그`)
await c.end()
process.exit(0)
