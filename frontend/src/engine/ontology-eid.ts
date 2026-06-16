// EID 법정감염병 온톨로지 — 감염병 현황판(EID_DISEASES)의 모든 감염병을 인식·검색 가능하게.
// 코퍼스 유무와 무관하게 findInText가 잡도록(코퍼스 없으면 현황 카드·공식링크로 안내).
import type { OntologyEntry } from './ontology'
import { EID_DISEASES } from '../data/eid-region'

// 약칭·동의어(있는 것만)
const AKA: Record<string, string[]> = {
  '카바페넴내성장내세균목(CRE) 감염증': ['CRE', '카바페넴내성장내세균목', '카바페넴내성', '카바페넴'],
  '중증열성혈소판감소증후군(SFTS)': ['SFTS', '중증열성혈소판감소증후군', '진드기 바이러스', '살인진드기'],
  '수두': ['chickenpox', '물수두'],
  '말라리아': ['malaria'],
  '백일해': ['whooping cough'],
  '성홍열': ['scarlet fever'],
  '유행성이하선염': ['볼거리', '이하선염', 'mumps'],
  '매독': ['syphilis'],
  '뎅기열': ['dengue', '뎅기'],
  'A형간염': ['a형간염', 'a형 간염', '에이형간염'],
  'B형간염': ['b형간염', 'b형 간염'],
  'C형간염': ['c형간염', 'c형 간염'],
  'E형간염': ['e형간염', 'e형 간염'],
  '레지오넬라증': ['레지오넬라', 'legionella'],
  '쯔쯔가무시증': ['쯔쯔가무시', '쯔쯔가무시병', '털진드기'],
  '신증후군출혈열': ['유행성출혈열', '한타바이러스'],
  '장출혈성대장균감염증': ['장출혈성대장균', 'o157', '용혈성요독'],
  '폐렴구균 감염증': ['폐렴구균'],
  '비브리오패혈증': ['비브리오'],
  '세균성이질': ['이질', 'shigella'],
  '장티푸스': ['typhoid'],
  '파라티푸스': ['paratyphoid'],
  '일본뇌염': ['japanese encephalitis', '뇌염모기'],
  '큐열': ['q fever'],
  '렙토스피라증': ['렙토스피라', 'leptospira'],
  '라임병': ['lyme'],
  '홍역': ['measles'],
  '파상풍': ['tetanus'],
}
const cn = (d: string) => d.replace(/^@/, '')
const bare = (name: string) => name.replace(/\([^)]*\)/g, '').replace(/\s*감염증$/, '').trim()

export const ONTOLOGY_EID: OntologyEntry[] = EID_DISEASES.map((d) => {
  const name = cn(d)
  const vs = new Set<string>([name, bare(name), ...(AKA[d] ?? AKA[name] ?? [])])
  return { canonical: name, variants: [...vs].filter((v) => v.length >= 2), type: 'disease' as const, tags: ['infectious'] }
})
