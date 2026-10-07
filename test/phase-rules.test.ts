// PhaseRules.txt parser (src/emperor/phase-rules.ts) on the structure of the shipped file.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { parsePhaseRules, loadPhaseRules } from '../src/emperor/phase-rules.ts';
import { RAW_DIR } from '../src/config/paths.ts';

test('phases: battle counts, story jumps, jump point, warning / lose; tech levels by phase or capture', () => {
  const r = parsePhaseRules([
    '[Phase 1]', 'Battles 2', 'Captured 1', 'MaxBattles 2', 'JumpToChoice1 10',
    '[Phase 3]', 'JumpPoint 1', 'JumpToChoice1 12', 'Warning 3', 'Lose 5 // comment',
    '[Tech Level 1]', 'Phase 1',
    '[Tech Level 2]', 'Captured 1',
    '[Tech Level 5] ', 'Phase 3',
    '[Tech Level 6]', 'Captured 1',
    '[Tech Level 7]', 'Captured 2',
  ].join('\r\n'));
  assert.deepStrictEqual(r.phases.get(1), { battles: 2, captured: 1, maxBattles: 2, jumpToChoice1: 10, jumpPoint: false, warning: 0, lose: 0 });
  assert.deepStrictEqual(r.phases.get(3), { battles: 0, captured: 0, maxBattles: 0, jumpToChoice1: 12, jumpPoint: true, warning: 3, lose: 5 });
  assert.deepStrictEqual(r.tech, [
    { level: 1, phase: 1, inPhase: 1 }, { level: 2, captured: 1, inPhase: 1 },
    { level: 5, phase: 3, inPhase: 3 }, { level: 6, captured: 1, inPhase: 3 }, { level: 7, captured: 2, inPhase: 3 },
  ]);
  assert.throws(() => parsePhaseRules('[Phase 1]\nSpeed 3'), /unknown phase key/);
});

const file = path.join(RAW_DIR, 'PhaseRules.txt');
test('the shipped PhaseRules.txt', { skip: fs.existsSync(file) ? false : 'game data not extracted' }, () => {
  const r = loadPhaseRules(file);
  assert.strictEqual(r.phases.get(2)?.battles, 2);
  assert.strictEqual(r.phases.get(3)?.lose, 5);
  assert.deepStrictEqual(r.tech.find((t) => t.level === 8), { level: 8, phase: 12, inPhase: 12 });
  assert.deepStrictEqual(r.tech.find((t) => t.level === 4), { level: 4, captured: 1, inPhase: 2 });
});

// The hub ran a simplified phase model (TODO(phases)): two captures per phase, tech +1 on the first
// capture, 2 * phase - 1 at a phase start, no warning / lose. It now follows PhaseRules.txt.
test('the hub phase JASS follows the shipped PhaseRules.txt', { skip: fs.existsSync(file) ? false : 'game data not extracted' }, async () => {
  const { phaseJass } = await import('../src/emperor/hub.ts');
  const j = phaseJass(loadPhaseRules(file));
  assert.ok(j.phaseDoneLines.includes('if EmpPhase == 1 then\n        return (EmpBattles >= 2 and EmpCaptured >= 1) or EmpBattles >= 2'));
  assert.ok(j.phaseTechLines.includes('if EmpPhase == 4 then\n        set EmpTech = IMaxBJ(EmpTech, 8)'), 'home-world attack (phase 12) = tech 8');
  assert.ok(j.captureTechLines.includes('if EmpPhase == 3 and EmpCaptured == 2 then\n        set EmpTech = IMaxBJ(EmpTech, 7)'));
  assert.deepStrictEqual(j.noGain, { warning: 3, lose: 5 });
});
