-- 0009: verdict_t enum 정합 — 프론트(Verdict)는 'partial'인데 DB는 'partial_overstated'였음.
-- 결과: partial 판정이 캐시 저장 실패(enum 오류 무시됨)·쿼리 오류·대시보드 분포 누락.
-- 값 rename으로 정합(기존 행은 거의 없음 — 프론트가 partial을 쓴 적이 없으므로).
alter type verdict_t rename value 'partial_overstated' to 'partial';
