// Game.exe AI script tactics (src/emperor/ai-scripts.ts) parsed from the extracted AI_DATA files.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { loadAiScripts } from '../src/emperor/ai-scripts.ts';
import { RAW_DIR } from '../src/config/paths.ts';

const have = fs.existsSync(path.join(RAW_DIR, 'objectsets.txt')) && fs.existsSync(path.join(RAW_DIR, '4'));
const opts = { skip: have ? false : 'game data not extracted' };

// The port's battle AI said "no AI script file in the game data" and sent invented waves. Game.exe 1.09
// loads exactly 217 strategies (0x43c420 refuses another count) with objectsets.txt. Guaranteed now:
// all are read, with their teams, targets, staging and steps.
test('the AI script tactics: 217 strategies, 82 object sets', opts, () => {
  const { sets, strategies } = loadAiScripts(RAW_DIR);
  assert.strictEqual(strategies.length, 217);
  assert.strictEqual(sets.length, 82);
  assert.strictEqual(strategies.flatMap((s) => s.steps.flat()).filter((a) => a.kind === 'send').length, 622);
  assert.deepStrictEqual(sets.find((s) => s.name === 'T3Tanks')?.objects, ['ATMongoose', 'ORLaserTank', 'HKAssault']);
  const waves = strategies.find((s) => s.name === 'WavesT4');
  assert.ok(waves, 'WavesT4 (4/Gen_Waves.txt)');
  assert.deepStrictEqual([waves.frequency, waves.mintech, waves.maxtech, waves.house, waves.losses, waves.reactive], [4, 4, 4, 'all', 90, false]);
  assert.deepStrictEqual(waves.teams, [{ name: 'wave1', teamtype: 't2tanks', min: 5, max: 10 }, { name: 'wave2', teamtype: 't3tanks', min: 5, max: 10 }]);
  assert.deepStrictEqual(waves.targets, [{ name: 'the_enemy', type: 'enemybase' }]);
  assert.deepStrictEqual(waves.staging.map((s) => [s.name, s.relative, s.type, s.distance]), [['stag1', 'the_enemy', 'front', 'medium'], ['stag2', 'the_enemy', 'front', 'far']]);
  assert.deepStrictEqual(waves.steps[0]?.map((a) => (a.kind === 'send' ? [a.who, a.destination, a.encounter] : a.kind)), [['wave1', 'stag1', 'attack'], ['wave2', 'stag2', 'attack']]);
  // WAIT / GOTO (2/Gen_CliffPatrol.txt loops)
  assert.ok(strategies.some((s) => s.steps.flat().some((a) => a.kind === 'goto')) && strategies.some((s) => s.steps.flat().some((a) => a.kind === 'wait' && a.ticks > 0)));
});
