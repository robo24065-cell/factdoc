-- 캐시에 AI 설명문 저장(반복 질문 시 재생성 없이 재사용 = API 절약)
alter table verdict_cache add column if not exists explanation text;
