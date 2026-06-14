-- 0006: 시맨틱 캐시(verdict_cache 임베딩 + ANN) + 하이브리드 코퍼스 검색(tsvector+벡터 RRF)
-- §4 시맨틱 캐시 매칭 / §6② 검색은 부품. 임베딩 = Gemini embedding-001 1024d(쿼리·코퍼스 동일).

-- ① verdict_cache 임베딩 컬럼 + HNSW(코사인)
alter table verdict_cache add column if not exists embedding vector(1024);
create index if not exists verdict_cache_embedding_hnsw
  on verdict_cache using hnsw (embedding vector_cosine_ops);

-- ② 유사 판정 검색: 코사인 유사도 top-1 (>= threshold). 읽기 전용·security definer로 RLS 우회.
--    인자는 text로 받아 내부에서 ::vector 캐스팅(PostgREST 벡터 직렬화 모호성 회피).
create or replace function match_verdict_cache(
  query_embedding text,
  match_threshold float default 0.92,
  fresh_only boolean default true
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
    and (not fresh_only or vc.ttl is null or vc.ttl > now())
    and 1 - (vc.embedding <=> (select e from q)) >= match_threshold
  order by vc.embedding <=> (select e from q)
  limit 1
$$;
grant execute on function match_verdict_cache(text, float, boolean) to anon, authenticated;

-- ③ 코퍼스 tsv 자동 갱신 트리거(향후 insert/갱신 보장; 기존 135행은 채워져 있음)
create or replace function chunk_tsv_refresh() returns trigger language plpgsql as $$
begin new.tsv := to_tsvector('simple', coalesce(new.text, '')); return new; end $$;
drop trigger if exists chunk_tsv_trg on chunk;
create trigger chunk_tsv_trg before insert or update of text on chunk
  for each row execute function chunk_tsv_refresh();

-- ④ 하이브리드 검색: dense(벡터 ANN) + lexical(tsvector ts_rank) → RRF(k=60) 융합.
--    한국어 접사 문제 대응: lexical 쿼리는 단어별 prefix(:*) OR 로 구성(안전하게 한글/영숫자만 허용).
create or replace function search_chunks_hybrid(
  query_embedding text,
  query_text text,
  match_count int default 5
)
returns table (
  id bigint, text text, source_span jsonb, source_doc_id bigint,
  portal text, title text, url text, score float
)
language sql stable security definer set search_path = public, extensions as $$
  with q as (select query_embedding::vector(1024) as e),
  tq as (
    select to_tsquery('simple', nullif(array_to_string(array(
      select w || ':*'
      from regexp_split_to_table(
        regexp_replace(coalesce(query_text, ''), '[^[:alnum:]가-힣 ]', ' ', 'g'), '\s+') as w
      where char_length(w) >= 2
    ), ' | '), '')) as tsq
  ),
  dense as (
    select c.id, row_number() over (order by c.embedding <=> (select e from q)) as rk
    from chunk c
    where c.embedding is not null
    order by c.embedding <=> (select e from q)
    limit 20
  ),
  lexical as (
    select c.id, row_number() over (order by ts_rank(c.tsv, (select tsq from tq)) desc) as rk
    from chunk c
    where (select tsq from tq) is not null and c.tsv @@ (select tsq from tq)
    limit 20
  ),
  fused as (
    select coalesce(d.id, l.id) as id,
           coalesce(1.0 / (60 + d.rk), 0) + coalesce(1.0 / (60 + l.rk), 0) as score
    from dense d full outer join lexical l on d.id = l.id
  )
  select c.id, c.text, c.source_span, c.source_doc_id,
         sd.portal, sd.title, sd.url, f.score
  from fused f
  join chunk c on c.id = f.id
  left join source_doc sd on sd.id = c.source_doc_id
  order by f.score desc
  limit match_count
$$;
grant execute on function search_chunks_hybrid(text, text, int) to anon, authenticated;
