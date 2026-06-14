-- 검토 큐 품질 강화: 재검토 플래그/사유 + 삭제 정책
alter table verdict_cache add column if not exists needs_review boolean not null default false;
alter table verdict_cache add column if not exists review_reason text;

-- 삭제 정책(데모-허용 — 운영 시 관리자 인증으로 게이트)
create policy public_delete_verdict_cache on verdict_cache for delete using (true);
