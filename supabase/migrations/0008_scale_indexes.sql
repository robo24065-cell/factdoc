-- 0008: 대규모(수만+ 문서/청크) 검색 성능 — 인덱스로 풀스캔 제거.
-- 이미: chunk.embedding HNSW(벡터 ANN), chunk.tsv GIN(전문검색), claim_triple(object_disease,relation,subject).
-- 추가: 부분일치(ILIKE '%질병명%') 가속용 trigram GIN + 자주 쓰는 필터/조인 인덱스.

create extension if not exists pg_trgm with schema extensions;

-- 질병명 부분일치(fetchDiseaseInfo의 title ILIKE) — 수만 건도 인덱스 스캔
create index if not exists source_doc_title_trgm on source_doc using gin (title extensions.gin_trgm_ops);
create index if not exists chunk_text_trgm       on chunk      using gin (text  extensions.gin_trgm_ops);

-- 필터/조인 가속
create index if not exists source_doc_portal on source_doc (portal);
create index if not exists chunk_doc          on chunk (source_doc_id);
create index if not exists verdict_cache_verdict on verdict_cache (verdict);
create index if not exists query_log_category on query_log (category);

analyze source_doc;
analyze chunk;
analyze verdict_cache;
