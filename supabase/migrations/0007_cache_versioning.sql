-- 0007: 캐시 오염 방지 — 엔진 버전 게이팅 + 보류 비서빙 + 과거 캐시 정리
-- 문제: 엔진/온톨로지 개선 전의 '보류' 판정이 캐시에 박혀 계속 서빙됨(예: "비타민C가 당뇨를 치료한대요"→보류).
-- 해결: ① engine_version 컬럼 ② 버전 미일치/과거 자동캐시 삭제 ③ 시맨틱 매칭에서 보류·구버전 제외.

alter table verdict_cache add column if not exists engine_version text;

-- 과거(버전 없는) 자동 캐시 정리 — 개선된 엔진으로 재판정되도록 (사람검증 verified 행은 보존)
delete from verdict_cache where engine_version is null and tier = 'auto_unverified';

-- 시맨틱 매칭 RPC 재정의: 보류(unverified) 제외 + 엔진 버전 필터
drop function if exists match_verdict_cache(text, float, boolean);
create or replace function match_verdict_cache(
  query_embedding text,
  match_threshold float default 0.92,
  fresh_only boolean default true,
  req_version text default null
)
returns table (
  id bigint, canonical_claim text, verdict verdict_t, citations jsonb,
  confidence real, decision_trace jsonb, explanation text, tier tier_t,
  query_count int, similarity float
)
language sql stable security definer set search_path = public, extensions as $$
  with q as (select query_embedding::vector(1024) as e)
  select vc.id, vc.canonical_claim, vc.verdict, vc.citations, vc.confidence,
         vc.decision_trace, vc.explanation, vc.tier, vc.query_count,
         1 - (vc.embedding <=> (select e from q)) as similarity
  from verdict_cache vc
  where vc.embedding is not null
    and vc.verdict <> 'unverified'                                   -- 보류는 캐시 서빙 안 함(재판정)
    and (req_version is null or vc.engine_version = req_version)     -- 구버전 캐시 제외
    and (not fresh_only or vc.ttl is null or vc.ttl > now())
    and 1 - (vc.embedding <=> (select e from q)) >= match_threshold
  order by vc.embedding <=> (select e from q)
  limit 1
$$;
grant execute on function match_verdict_cache(text, float, boolean, text) to anon, authenticated;
