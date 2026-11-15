// Plays a full game in the pure engine (A3 keep, D1 rover, B1 later, ice zone A with C3.1 slow, D2 rover, D3 wait),
// submits the report, prints the analysis and writes the final state to docs/evidence/ending/sample_state.json
// (used by ending_preview.mjs to render the real Ending screen).
// Usage: node scripts/ending_sample.mjs [keep|stow]
import { gameReducer, createInitialState, DAY, endingAnalysis, SAVE_SCHEMA_VERSION } from '../src/game/index.ts'
import { mkdirSync, writeFileSync } from 'node:fs'
const a3 = process.argv[2] ?? 'keep'
const ROUTE_A = { zone: 'A', name: 'PSR #1470', lengthM: 19296.6, maxSlopeDeg: 14.99, meanSlopeDeg: 9.87, nearLimitPercent: 6.15, uncertainPercent: 13.36, inPsr: true, heightM: 1295, slopeDeg: 10 }
const picks = { A1: 'recycle', A3: a3, B1: 'later', C1: 'A', C2: 'go', C31: 'slow', D1: 'rover', D2: 'rover', D3: 'wait' }
let s = gameReducer(createInitialState(), { type: 'game/start', mode: 'advanced' })
for (let guard = 0; guard < 100000 && s.phase === 'playing' && s.clock.elapsedMinutes < 20 * DAY; guard++) {
  if (s.inbox.length) { s = gameReducer(s, { type: 'notice/ack' }); continue }
  if (s.decisions.length) { const d = s.decisions[0]; s = gameReducer(s, { type: 'decide', decisionId: d.id, choice: picks[d.key] ?? d.options[0], route: d.key === 'C2' ? ROUTE_A : undefined }); continue }
  if (s.stage === 'A2') { s = gameReducer(s, { type: 'a2/activate' }); continue }
  if (s.stage === 'free') {
    const day = Math.floor(s.clock.elapsedMinutes / DAY) + 1
    let n = s
    if (!s.food.started) n = gameReducer(s, { type: 'food/begin' })
    else if (s.food.stage === 'growing' && !s.food.observations.some((o) => o.day === day)) n = gameReducer(s, { type: 'food/observe' })
    else if (s.food.stage === 'growing' && s.food.growth >= 0.85) n = gameReducer(s, { type: 'food/harvest' })
    else if (s.food.stage === 'harvested') n = gameReducer(s, { type: 'food/report' })
    else if (s.ice.stage === 'idle' && !s.ice.report && s.food.irrigation === 'ok' && s.fired.includes('B1')) n = gameReducer(s, { type: 'ice/start' })
    if (n !== s) { s = n; continue }
    if (s.food.report && s.ice.report) { s = gameReducer(s, { type: 'mission/submit' }); break }
  }
  s = gameReducer({ ...s, isPaused: false }, { type: 'clock/tick', minutes: 30 })
}
s = gameReducer(s, { type: 'mission/finishReturn' })
const a = endingAnalysis(s)
console.log(JSON.stringify({ phase: s.phase, reason: s.ending?.reason, day: Math.floor(s.clock.elapsedMinutes / DAY) + 1 }))
console.log('\n== PHẦN 1 ==\nFOOD:', a.food.status, '\n  ' + a.food.result.join('\n  '), '\nICE:', a.ice.status, '\n  ' + a.ice.result.join('\n  '), '\nLý do:', a.reason)
console.log('\n== PHẦN 2 (chuỗi nhân quả) ==')
for (const c of a.chains) { console.log(`\n[${c.weight}] ${c.title} → ${c.target}`); c.steps.forEach((x) => console.log(`   (${x.kind}) ${x.title}${x.detail ? ' — ' + x.detail : ''}`)) }
console.log('\n== PHẦN 3 ==\nFood:\n  - ' + a.why.food.join('\n  - ') + '\nIce:\n  - ' + a.why.ice.join('\n  - '))
if (a.early.length) console.log('\nEARLY:', a.early)
mkdirSync('docs/evidence/ending', { recursive: true })
writeFileSync(`docs/evidence/ending/sample_state_${a3}.json`, JSON.stringify({ schemaVersion: SAVE_SCHEMA_VERSION, savedAt: new Date().toISOString(), state: s }))
