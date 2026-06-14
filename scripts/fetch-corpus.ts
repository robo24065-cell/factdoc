// 국가건강정보포털 콘텐츠 → source_doc + chunk(섹션별) + claim_triple(자동·미검증)
// 사용: KDCA_HEALTH_PORTAL_KEY=... SUPABASE_DB_URL=... npx tsx scripts/fetch-corpus.ts [id,id,...]
// 임베딩은 이후 embed.mjs로. 저작권(§13.8): 4유형(비상업·변경금지) — 출처표시+원문링크, 내부 검색/추출용.
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { parseClaim } from '../frontend/src/engine/parse'

// XML은 curl로 미리 scripts/corpus_raw/<id>.xml 에 저장(정상 인증서 검증). 이 스크립트는 로컬 파일을 읽음.
const DB = process.env.SUPABASE_DB_URL
if (!DB) { console.error('SUPABASE_DB_URL 필요'); process.exit(1) }

// 기본: 사용자가 신청한 콘텐츠 ID (감기·객혈·건선·결핵·골절·구취·기흉·낙상). 인자로 교체 가능.
const IDS = (process.argv[2] ?? '5423,6543,1344,6561,5463,5841,5493,1743').split(',').map((s) => s.trim()).filter(Boolean)

function cdata(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`))
  return m ? m[1].trim() : ''
}
function sections(xml: string): { nm: string; cn: string }[] {
  const out: { nm: string; cn: string }[] = []
  const re = /<cntntsCl>([\s\S]*?)<\/cntntsCl>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) {
    const nm = cdata(m[1], 'CNTNTS_CL_NM')
    const cn = cdata(m[1], 'CNTNTS_CL_CN')
    if (cn && cn.length > 30 && !cn.startsWith('http')) out.push({ nm, cn })
  }
  return out
}

const c = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await c.connect()
let totalDocs = 0, totalChunks = 0, totalTriples = 0
for (const id of IDS) {
  try {
    const xml = readFileSync(new URL(`./corpus_raw/${id}.xml`, import.meta.url), 'utf8')
    const title = cdata(xml, 'CNTNTSSJ')
    if (!title) { console.error(`  ${id}: 데이터 없음`); continue }
    const secs = sections(xml)

    await c.query('BEGIN')
    await c.query("delete from source_doc where doc_id = $1 and portal like '질병관리청 국가건강정보포털%'", [id])
    const url = `https://health.kdca.go.kr/healthinfo/biz/health/gnrlzHealthInfo/gnrlzHealthInfo/gnrlzHealthInfoView.do?cntnts_sn=${id}`
    const { rows } = await c.query(
      "insert into source_doc(portal,doc_id,title,url,license) values('질병관리청 국가건강정보포털(콘텐츠)',$1,$2,$3,'KOGL-4') returning id",
      [id, title, url],
    )
    const docId = rows[0].id as number
    let chunks = 0, triples = 0
    for (const s of secs) {
      const text = `[${s.nm}] ${s.cn}`.slice(0, 1500)
      const cr = await c.query(
        "insert into chunk(source_doc_id,text,tsv,source_span,evidence_level) values($1,$2,to_tsvector('simple',$2),$3::jsonb,'official_guideline') returning id",
        [docId, text, JSON.stringify({ section: s.nm, doc_id: id })],
      )
      chunks++
      for (const t of parseClaim(s.cn)) {
        if (t.subject === '(미상)') continue
        await c.query(
          "insert into claim_triple(subject,relation,object_disease,evidence_level,strength,source_doc_id,chunk_id,tier) values($1,$2::relation_t,$3,'official_guideline'::evidence_level_t,$4::strength_t,$5,$6,'auto_unverified'::tier_t)",
          [t.subject, t.relation, t.objectDisease, t.strength, docId, cr.rows[0].id],
        )
        triples++
      }
    }
    await c.query('COMMIT')
    totalDocs++; totalChunks += chunks; totalTriples += triples
    console.log(`  ${id} ${title}: 섹션 ${secs.length}, 청크 ${chunks}, 트리플 ${triples}`)
  } catch (e) {
    try { await c.query('ROLLBACK') } catch { /* ignore */ }
    console.error(`  ${id} 실패:`, e instanceof Error ? e.message : String(e))
  }
}
console.log(`적재 완료: 문서 ${totalDocs} · 청크 ${totalChunks} · 자동 트리플 ${totalTriples}`)
await c.end()
process.exit(0)
