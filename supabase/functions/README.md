# Supabase Edge Functions

## parse-claim (주장 → 트리플 파서, Gemini)
진실 판단은 하지 않고 주장을 트리플(JSON)로 파싱만 한다(판정은 클라이언트/엔진의 룰·그래프). CLAUDE.md §13.4.

**배포 절차 (Gemini 표준 키 확보 후):**
```bash
# 1) CLI 로그인 (SUPABASE_ACCESS_TOKEN 사용)
npx supabase login   # 또는 SUPABASE_ACCESS_TOKEN 환경변수
# 2) 프로젝트 링크
npx supabase link --project-ref fcezfdnymianzxrezkdf
# 3) Gemini 표준 API 키(AIza...) 시크릿 등록
npx supabase secrets set GEMINI_API_KEY=AIza...
# 4) 배포
npx supabase functions deploy parse-claim
```

**프론트 연동 (배포 후):**
```ts
const { data } = await supabase.functions.invoke('parse-claim', { body: { text } })
// data.claims → 엔진 judge()에 투입. 실패 시 규칙기반 parseClaim()으로 폴백.
```

> 상태(2026-06-14): **배포 완료**(시크릿 GEMINI_API_KEY 등록, `--no-verify-jwt`). 프론트(`lib/parseRemote.ts`)가 규칙 파서 + Gemini를 결합해 판정. Edge Function 코드 수정 시 `supabase functions deploy parse-claim`로 재배포.
