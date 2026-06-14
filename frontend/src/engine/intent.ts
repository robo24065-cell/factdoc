// 입력 의도 분류 — 정보질문("X가 뭔가요/증상/예방") vs 주장검증("X가 Y를 완치한다").
// 정보질문은 질병청 공식 정보로 바로 응답(§13.10a 공식 정보 카드), 주장은 4단계 판정.
import { findInText } from './ontology'

export type Intent = 'verify' | 'info'
export interface IntentResult { intent: Intent; disease?: string }

// 정의/설명 요청 표지
const DEF_Q = /(뭐|뭔|무엇|뭡니까|머예요|머에요|이란|이라는|란\s|에\s*대해|에\s*대한|에\s*관해|설명|알려|궁금|어떤\s*(병|질병)|정의|정보)/
// 증상/원인/예방 등 정보 질의
const SYMPTOM_Q = /(증상|원인|예방법|예방\s*방법|예방\s*수칙|치료법|치료\s*방법|전염|감염\s*경로|잠복기|전파|어떻게\s*(걸|옮|감염|생기))/
// 조언/허용 질문 — "X질환에 Y 먹어도 되나/안되나/조심" → 정보(관리 안내)로
const ADVICE_Q = /(먹어도|마셔도|드셔도|해도\s*되|먹으면\s*안|마시면\s*안|먹어도\s*될|괜찮|되나요|돼요|되요|피해야|줄여야|조심|주의해야|어떤\s*음식|무슨\s*음식|뭘\s*먹|뭐\s*먹|뭐\s*먹어|식단|먹지\s*말|먹어야\s*하나)/
// 주장(claim) 동사 — 있으면 검증 의도
const CLAIM_VERB = /(완치|치료된|치료한|치료해|치료된다|낫는|낫나|낫게|나아|나았|고친|고쳐|예방한|효과|좋다|좋아|좋대|좋은|걸린다|걸리나|걸려|걸리게|위험|높인|높아|낮춘|낮춰|낮아|도움|관리|조절|막아|막는|개선|완화|줄여|줄인|먹으면|마시면|맞으면|복용|섭취하면|바르면)/

export function classifyIntent(text: string): IntentResult {
  const disease = findInText(text, 'disease')
  if (!disease) return { intent: 'verify' } // 질병 미인식 → 기존 경로(주장 검증/보류)
  if (DEF_Q.test(text) || SYMPTOM_Q.test(text)) return { intent: 'info', disease: disease.canonical }
  if (ADVICE_Q.test(text)) return { intent: 'info', disease: disease.canonical } // 조언 질문(검증보다 우선)
  if (!CLAIM_VERB.test(text)) return { intent: 'info', disease: disease.canonical } // 질병명 위주·주장 동사 없음
  return { intent: 'verify', disease: disease.canonical }
}
