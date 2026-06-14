-- FactDoc — W1 초기 스키마 (CLAUDE.md §13 반영)
-- 받침①: verdict_cache.decision_trace (Why-Trace)
-- 받침②: chunk.source_span (Span Grounding)
-- 받침③: coverage_map (보류 라우터)
-- 임베딩: BGE-m3 1024차원 → vector(1024), HNSW 인덱스(2000차원 한계 OK)

create extension if not exists vector with schema extensions;

-- ── enums ───────────────────────────────────────────────
create type relation_t as enum (
  'cures','prevents','reduces_risk','increases_risk','manages',
  'no_effect','insufficient_evidence','causes_or_worsens','diagnoses','replaces_treatment'
);
create type polarity_t as enum ('assert','negate');
create type strength_t as enum ('absolute','strong','moderate','weak');
create type evidence_level_t as enum (
  'official_guideline',  -- 표준치료/공식권고 (국가건강정보포털)
  'statistics',          -- 통계근거 (KNHANES/만성질환통계)
  'mfds_approved',       -- 식약처 인정기능성
  'regulatory_counter',  -- 반증·규제근거 (식약처 부당광고 적발)
  'limited',             -- 제한적·관찰
  'none'                 -- 근거없음 → 보류
);
create type verdict_t as enum ('true','partial_overstated','false','unverified');
create type tier_t as enum ('auto_unverified','verified');

-- ── 출처 문서 레지스트리 ────────────────────────────────
create table source_doc (
  id            bigint generated always as identity primary key,
  portal        text not null,        -- health.kdca / knhanes / chs / dportal / mfds
  doc_id        text,
  title         text,
  url           text,
  license       text,                 -- 예: 'KOGL-4'(공공누리 4유형), 'MFDS-open'
  source_version text,
  fetched_at    timestamptz default now()
);

-- ── 한국어 건강-클레임 온톨로지 (동의어층) ──────────────
create table ontology_term (
  id         bigint generated always as identity primary key,
  canonical  text not null,
  variants   text[] not null default '{}',
  term_type  text,                    -- subject / disease / relation
  note       text,
  unique (canonical, term_type)
);

-- ── 코퍼스 청크 (받침②: source_span) ───────────────────
create table chunk (
  id             bigint generated always as identity primary key,
  source_doc_id  bigint references source_doc(id) on delete cascade,
  text           text not null,
  embedding      vector(1024),        -- BGE-m3
  tsv            tsvector,
  source_span    jsonb,               -- {page, char_start, char_end} 형광펜 추적
  evidence_level evidence_level_t,
  created_at     timestamptz default now()
);
create index chunk_embedding_hnsw on chunk using hnsw (embedding vector_cosine_ops);
create index chunk_tsv_gin       on chunk using gin (tsv);

-- ── 클레임 그래프 (주장-근거 트리플) ───────────────────
create table claim_triple (
  id             bigint generated always as identity primary key,
  subject        text not null,       -- 정규화 엔티티 (사람/브랜드명 금지)
  relation       relation_t not null,
  object_disease text not null,
  polarity       polarity_t not null default 'assert',
  strength       strength_t,
  qualifier      text,
  evidence_level evidence_level_t,     -- §13.2 출처가 결정
  source_doc_id  bigint references source_doc(id),
  chunk_id       bigint references chunk(id),
  tier           tier_t not null default 'auto_unverified',
  confidence     real,
  created_at     timestamptz default now()
);
create index claim_triple_lookup on claim_triple (object_disease, relation, subject);

-- ── 식약처 룰테이블 ─────────────────────────────────────
create table mfds_rule (
  id                        bigint generated always as identity primary key,
  ingredient                text not null,
  approved_function         text,                 -- 인정 기능성(3종 한정)
  disease_treatment_allowed boolean not null default false,  -- 질병 치료/예방 표방=원칙 불가
  source_doc_id             bigint references source_doc(id),
  note                      text
);

-- ── 받침③: 보류 라우터용 커버리지 맵 ───────────────────
create table coverage_map (
  id        bigint generated always as identity primary key,
  category  text not null unique,     -- 질환 대분류/세부
  covered   boolean not null default false,
  doc_count int default 0,
  note      text
);

-- ── 판정 캐시 (받침①: decision_trace = Why-Trace) ──────
create table verdict_cache (
  id              bigint generated always as identity primary key,
  claim_hash      text unique not null,
  canonical_claim text not null,
  verdict         verdict_t not null,
  citations       jsonb not null default '[]',
  confidence      real,
  decision_trace  jsonb,              -- 룰/트리플/근거수준 발화 경로(Why-Trace)
  source_version  text,
  tier            tier_t not null default 'auto_unverified',
  ttl             timestamptz,
  query_count     int not null default 0,
  created_at      timestamptz default now()
);

-- ── 감염병 트렌드 캐시 (§13.10a, 감염병포털 배치 적재) ──
create table outbreak_trend (
  id         bigint generated always as identity primary key,
  disease    text not null,
  period     text,
  case_count bigint,
  trend      text,                    -- up / flat / down
  fetched_at timestamptz default now()
);

-- TODO(보안): 운영 전 각 테이블 RLS 정책 추가. W1 개발 단계에선 비활성.
