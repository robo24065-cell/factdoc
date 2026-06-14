-- FactDoc — W1 확장: 질문 로그·검토 큐 + RLS 보안 정책

-- 질문 로그 (트렌드 레이더·누적 검증·핫토픽)
create table query_log (
  id              bigint generated always as identity primary key,
  raw_text        text not null,
  canonical_claim text,
  verdict         verdict_t,
  category        text,
  created_at      timestamptz default now()
);
create index query_log_created on query_log (created_at desc);

-- 사람 검토 큐 (자동·미검증 → 검증완료 승격)
create type review_status_t as enum ('pending', 'approved', 'rejected');
create table review_queue (
  id              bigint generated always as identity primary key,
  claim_hash      text,
  canonical_claim text,
  reason          text,
  status          review_status_t not null default 'pending',
  created_at      timestamptz default now()
);

-- ── RLS: 참조 데이터는 공개 읽기만 ──
alter table source_doc     enable row level security;
alter table ontology_term  enable row level security;
alter table chunk          enable row level security;
alter table claim_triple   enable row level security;
alter table mfds_rule      enable row level security;
alter table coverage_map   enable row level security;
alter table outbreak_trend enable row level security;
alter table verdict_cache  enable row level security;

create policy public_read_source_doc     on source_doc     for select using (true);
create policy public_read_ontology_term  on ontology_term  for select using (true);
create policy public_read_chunk          on chunk          for select using (true);
create policy public_read_claim_triple   on claim_triple   for select using (true);
create policy public_read_mfds_rule      on mfds_rule      for select using (true);
create policy public_read_coverage_map   on coverage_map   for select using (true);
create policy public_read_outbreak_trend on outbreak_trend for select using (true);
create policy public_read_verdict_cache  on verdict_cache  for select using (true);

-- verdict_cache: 공개 캐시 적재
create policy public_insert_verdict_cache on verdict_cache for insert with check (true);

-- query_log: 공개 삽입 + 집계 읽기
alter table query_log enable row level security;
create policy public_insert_query_log on query_log for insert with check (true);
create policy public_read_query_log   on query_log for select using (true);

-- review_queue: RLS 활성·공개 정책 없음(anon 접근 차단, 서버 전용)
alter table review_queue enable row level security;
