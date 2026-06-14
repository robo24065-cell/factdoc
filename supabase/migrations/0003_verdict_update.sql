-- verdict_cache 승격(검증완료)·query_count 갱신용 공개 update 정책
-- ⚠ W1 데모 — 운영 단계에선 인증/관리자 역할로 게이트 필요(현재는 anon 허용)
create policy public_update_verdict_cache on verdict_cache for update using (true) with check (true);
