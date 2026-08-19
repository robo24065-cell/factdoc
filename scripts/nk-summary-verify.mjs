#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────────
   덱 요약 재검 — 네트워크 없이, 굽던 순간의 주장을 다시 사실로 만든다.

   왜 따로 두는가
     「검증했다」가 굽던 순간의 주장으로 남으면 그건 검증이 아니라 자기 신고다.
     이 스크립트는 deck-summary.json + analysis.json **두 파일만** 읽고
     frontend/src/engine/nk-summary.mjs 의 같은 검증기를 다시 돌린다. 키도 호출도 없다.
     그래서 「검증했다」가 언제든 재현되는 사실이 된다.

   무엇을 더 보는가 (verifySummary 위에 얹는 것)
     · schema · sourceBuiltAt 이 analysis.builtAt 과 같은가 · sourceHash 가 지금 카드 해시와 같은가
     · **figures[] 를 다시 계산해 파일에 적힌 것과 한 글자도 다르지 않은가**
       — 이것이 「근거 포인터를 LLM 이 만들지 않았다」의 증명이다. LLM 이 손댔다면 여기서 갈린다.
     · closing·notice·shape·label 이 규칙 문자열 그대로인가 (LLM 이 만들지 않는 필드)

   사용
     node scripts/nk-summary-verify.mjs                # 기본 경로
     node scripts/nk-summary-verify.mjs <요약.json>    # 경로 지정
   나가는 값: 통과 0, 실패 1.
   ────────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  verifySummary, SECTIONS, CLOSING, NOTICE, SUMMARY_SCHEMA, VERIFIER_VERSION,
} from '../frontend/src/engine/nk-summary.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u

export function cardsHashOf(analysis) {
  return 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(analysis.cards)).digest('hex')
}

/** 굽힌 파일 → LLM 원출력 모양 (검증기는 원출력을 받는다) */
export function toRaw(baked) {
  if (!baked?.headline) return null
  const out = { headline: { text: baked.headline.text, cards: baked.headline.cardIds ?? [] } }
  for (const sec of baked.sections ?? []) {
    out[sec.key] = (sec.lines ?? []).map((l) => ({ text: l.text, cards: l.cardIds ?? [] }))
  }
  return out
}

/**
 * 요약 하나를 analysis 에 대고 다시 검사한다.
 * @returns {{ok: boolean, problems: Array<{where:string,why:string}>, stats: object|null}}
 */
export function recheckSummary(summary, analysis) {
  const problems = []
  const bad = (where, why) => problems.push({ where, why })

  if (!summary || typeof summary !== 'object') { bad('파일', '요약 JSON 을 읽지 못했다'); return { ok: false, problems, stats: null } }
  if (summary.schema !== SUMMARY_SCHEMA) bad('schema', `${summary.schema} ≠ ${SUMMARY_SCHEMA}`)
  if (summary.verifierVersion !== VERIFIER_VERSION) {
    bad('verifierVersion', `파일 ${summary.verifierVersion} ≠ 지금 검증기 ${VERIFIER_VERSION} — 다시 구워야 한다`)
  }
  if (summary.sourceBuiltAt !== analysis.builtAt) {
    bad('sourceBuiltAt', `요약 ${summary.sourceBuiltAt} ≠ analysis ${analysis.builtAt} — 두 파일의 세대가 다르다`)
  }
  const hash = cardsHashOf(analysis)
  if (summary.sourceHash !== hash) bad('sourceHash', '카드가 바뀌었다 — 요약을 다시 구워야 한다')

  /* 규칙 문자열은 LLM 이 만들지 않는다 — 그대로인지 본다 */
  if (summary.closing !== CLOSING) bad('closing', '맺음 문장이 규칙 문자열과 다르다')
  for (const k of ['who', 'when', 'checked']) {
    if (summary.notice?.[k] !== NOTICE[k]) bad(`notice.${k}`, '고지 문구가 규칙 문자열과 다르다')
  }
  const m = analysis.meta ?? {}
  if (summary.shape?.tried !== m.tried || summary.shape?.accepted !== m.accepted ||
      summary.shape?.weak !== m.weak || summary.shape?.rejected !== m.rejectedCount) {
    bad('shape', 'meta 의 시도/성립/약함/불가와 다르다')
  }
  const secKeys = (summary.sections ?? []).map((s) => s.key).join(',')
  if (secKeys !== SECTIONS.map((s) => s.key).join(',')) bad('sections', `구획 구성이 다르다: ${secKeys}`)
  for (const sec of summary.sections ?? []) {
    const spec = SECTIONS.find((s) => s.key === sec.key)
    if (!spec) continue
    if (sec.label !== spec.label || sec.verdict !== spec.verdict) bad(`sections.${sec.key}`, '라벨·판정이 규칙 값과 다르다')
  }

  /* 본검사 — 굽던 때와 같은 함수, 같은 입력 */
  const v = verifySummary(toRaw(summary), analysis)
  for (const p of v.problems) bad(p.where, p.why)

  /* ★ figures 재계산 대조 — 「근거 포인터를 LLM 이 만들지 않았다」의 증명 */
  if (v.ok) {
    const mine = [v.summary.headline, ...v.summary.sections.flatMap((s) => s.lines)]
    const theirs = [summary.headline, ...(summary.sections ?? []).flatMap((s) => s.lines ?? [])]
    if (mine.length !== theirs.length) bad('figures', '문장 수가 다르다')
    else {
      for (let i = 0; i < mine.length; i++) {
        if (JSON.stringify(mine[i].figures) !== JSON.stringify(theirs[i].figures ?? [])) {
          bad(`figures[${i}]`, '파일의 근거 포인터가 재계산 결과와 다르다 — 사람이나 LLM 이 손댄 흔적이다')
        }
      }
    }
    if (v.stats.figures !== summary.verified?.figures) bad('verified.figures', `${summary.verified?.figures} ≠ 재계산 ${v.stats.figures}`)
    if (v.stats.cardsCited !== summary.verified?.cardsCited) bad('verified.cardsCited', '인용 카드 수가 다르다')
  }

  /* 이모지 — public/gohyang 감사와 같은 식 */
  if (EMOJI.test(JSON.stringify(summary))) bad('이모지', '요약 안에 이모지가 있다')

  return { ok: problems.length === 0, problems, stats: v.stats }
}

/* ══════════════════════ CLI ══════════════════════ */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const target = process.argv.slice(2).find((a) => !a.startsWith('--')) || '북한자료-api/deck-summary.json'
  const sumPath = path.isAbsolute(target) ? target : path.join(root, target)
  const anaPath = path.join(root, '북한자료-api/analysis.json')

  if (!fs.existsSync(sumPath)) {
    console.log(`△ 요약 파일이 없다: ${target}`)
    console.log('  화면은 요약 구획을 그리지 않고 나머지는 그대로 동작한다 — 이것은 정상 상태다.')
    process.exit(0)
  }
  const summary = JSON.parse(fs.readFileSync(sumPath, 'utf8'))
  const analysis = JSON.parse(fs.readFileSync(anaPath, 'utf8'))
  const r = recheckSummary(summary, analysis)

  console.log(`\n▶ 덱 요약 재검 (네트워크 없음) — ${target}`)
  console.log(`  구운 날 ${summary.builtAt} · 모델 ${summary.model} · ${summary.attempt}번째 시도 · 프롬프트 v${summary.promptVersion}`)
  if (r.ok) {
    console.log(`  ✓ 통과 — 문장 ${r.stats.lines}개 · 수치 ${r.stats.figures}개(전부 카드까지 되짚음) · 인용 카드 ${r.stats.cardsCited}장 · 검사 ${r.stats.checks}종\n`)
  } else {
    console.error(`  ✗ 실패 ${r.problems.length}건`)
    for (const p of r.problems) console.error(`      · ${p.where} — ${p.why}`)
    console.error('')
  }
  process.exitCode = r.ok ? 0 : 1
}
