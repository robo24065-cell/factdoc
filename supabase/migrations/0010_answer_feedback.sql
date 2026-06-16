-- 답변 품질 피드백 + 부실응답 큐 (사용자 만족/불만족 → AI 검토 → 관리자 큐)
-- 적용: npx supabase db push --project-ref fcezfdnymianzxrezkdf  (또는 Supabase 대시보드 SQL 편집기에 붙여넣기)
-- 미적용 시 프론트는 localStorage로 동작(단일 기기). 적용 시 교차 기기로 확장.

create table if not exists public.answer_feedback (
  id          bigint generated always as identity primary key,
  rating      text not null check (rating in ('up','down')),
  claim       text not null,
  verdict     text,
  snapshot    text,                       -- 사용자가 본 답변 전체(불만족만)
  ai_verdict  text check (ai_verdict in ('poor','looks-ok','pending')),
  ai_reason   text,
  user_reason text,                       -- 사용자가 고른 불만 사유(설문)
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_answer_feedback_rating_time on public.answer_feedback (rating, created_at desc);

alter table public.answer_feedback enable row level security;

-- 프로토타입: 익명(anon) 클라이언트가 피드백 적재·조회·관리 가능(관리자 페이지가 anon 키 사용).
-- 운영 전환 시 select/delete/update는 service_role 또는 인증 관리자로 제한 권장.
drop policy if exists af_insert on public.answer_feedback;
create policy af_insert on public.answer_feedback for insert to anon, authenticated with check (true);
drop policy if exists af_select on public.answer_feedback;
create policy af_select on public.answer_feedback for select to anon, authenticated using (true);
drop policy if exists af_update on public.answer_feedback;
create policy af_update on public.answer_feedback for update to anon, authenticated using (true) with check (true);
drop policy if exists af_delete on public.answer_feedback;
create policy af_delete on public.answer_feedback for delete to anon, authenticated using (true);
