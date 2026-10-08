// Rules.txt parser on small synthetic inputs (no game data needed).

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadRules } from '../src/emperor/rules.ts';
import { RAW_DIR } from '../src/config/paths.ts';

function withRules(text: string, check: (file: string) => void): void {
  const file = path.join(os.tmpdir(), `rules-test-${crypto.randomUUID()}.txt`);
  fs.writeFileSync(file, text, 'latin1');
  try { check(file); } finally { fs.rmSync(file); }
}

// Regression: the crate gift was split with /s+/ instead of /\s+/ (a shell heredoc ate the
// backslash when the code was added), so a gift name containing a lowercase "s" was cut at it
// ("Fremens" -> "Fremen"). It never showed: no gift in the shipped Rules.txt has a lowercase "s".
// Guaranteed now: the gift is the first whitespace-separated word, whatever letters it has.
test('crate gift keeps names with a lowercase "s" and drops trailing words', () => {
  withRules([
    '[CrateTypes]',
    'FremenCrate',
    'MoneyCrate',
    '[FremenCrate]',
    'CrateGiftObject = Fremens Elite // comment',
    '[MoneyCrate]',
    'CrateGiftObject = CASH2000',
  ].join('\r\n'), (file) => {
    const rules = loadRules(file);
    assert.strictEqual(rules.crates.get('FremenCrate'), 'Fremens');
    assert.strictEqual(rules.crates.get('MoneyCrate'), 'CASH2000');
  });
});

test('reinforcement values of units and the [General] reinforcement / campaign money keys', () => {
  withRules([
    '[General]',
    'UnitValueAttacker = 20 // c',
    'UnitValueDefender = 5',
    'UnitValueReserves = 20',
    'UnitValueInitialReinforcements = 20',
    'UnitValueSubsequentReinforcements = 10',
    'TicksBetweenReinforcements = 6600',
    'TicksBetweenReinforcementsVariation = 600',
    'TicksBeforeReinforcementsForMessage = 100',
    'CampaignAttackMoney = 5000',
    'CampaignDefendMoney = 2500',
    '[UnitTypes]',
    'ATTrike',
    'ATScout',
    '[ATTrike]',
    'House = Atreides',
    'ReinforcementValue = 5',
    '[ATScout]',
    'House = Atreides',
    '//ReinforcementValue = 6',
  ].join('\r\n'), (file) => {
    const rules = loadRules(file);
    assert.deepStrictEqual(rules.reinforcements, { attacker: 20, defender: 5, reserves: 20, initial: 20, subsequent: 10, delay: 6600, variation: 600, messageBefore: 100 });
    assert.deepStrictEqual(rules.campaignMoney, { attack: 5000, defend: 2500 });
    assert.strictEqual(rules.objects.get('ATTrike')?.reinforcementValue, 5);
    assert.strictEqual(rules.objects.get('ATScout')?.reinforcementValue, 0);
  });
});

test('ai.ini: unit mix, defence share, rebuild money, retreat chance (first [Strategy] value wins)', async () => {
  const { parseAiRules } = await import('../src/emperor/ai-rules.ts');
  const ai = parseAiRules([
    '[UnitConstructionRatios]', 'Foot=20 // foot soldiers', 'Tank=80',
    '[Strategy]', 'PercentageOfUnitsForDefence=24\t// c', 'MinMoneyToConstructBuildings=600', 'ChanceOfRetreating=50, // campaign',
    '[Strategy]', 'ExtraPower=20',
  ].join('\r\n'));
  const { foot, tank, defencePercent, minMoneyToBuild, retreatChance } = ai;
  assert.deepStrictEqual({ foot, tank, defencePercent, minMoneyToBuild, retreatChance }, { foot: 20, tank: 80, defencePercent: 24, minMoneyToBuild: 600, retreatChance: 50 });
});

// The base builder and the tactics read the rest of ai.ini (src/jass/battle/ai.j).
test('the shipped ai.ini: building ratios, site weights, strategy values', { skip: fs.existsSync(path.join(RAW_DIR, 'ai.ini')) ? false : 'game data not extracted' }, async () => {
  const { loadAiRules } = await import('../src/emperor/ai-rules.ts');
  const ai = loadAiRules(path.join(RAW_DIR, 'ai.ini'));
  assert.deepStrictEqual(ai.buildRatios, { core: 17, defence: 17, manufacturing: 40, resource: 26 });
  assert.strictEqual(ai.positionExits.furtherFromEdge, 13);
  assert.strictEqual(ai.positionNoExits.aligned, 25);
  assert.strictEqual(ai.scoutTeams, 3);
  assert.strictEqual(ai.defenceWanderTiles, 29);
  assert.strictEqual(ai.maxRefineries, 2);
  assert.strictEqual(ai.minTurretGapTiles, 5);
  assert.strictEqual(ai.ticksDefendHarvester, 7500);
  assert.strictEqual(ai.ticksAbandonForming, 1500);
  assert.strictEqual(ai.buildsDefences, true);
  // ai_difficulty.ini next to it: per tech level, [Tech1] the default of every key
  assert.strictEqual(ai.tech.length, 9, 'index = tech level 1..8');
  assert.deepStrictEqual(ai.tech[1], { maxUnits: 22, numBuildings: 7, buildingDelay: 1200, maintenanceDelay: 3500, firstAttackDelay: 5000, gapBetweenScripts: 1300, unitDelay: 875, minDefence: 2, maxDefence: 5, maxTurrets: 0 });
  assert.deepStrictEqual(ai.tech[4], { maxUnits: 40, numBuildings: 8, buildingDelay: 480, maintenanceDelay: 2900, firstAttackDelay: 1500, gapBetweenScripts: 600, unitDelay: 525, minDefence: 6, maxDefence: 10, maxTurrets: 4 });
  assert.strictEqual(ai.tech[8]?.unitDelay, 100);
});

// ai_<house>_t<jump point>.ini: the AI defending its own capital builds no defences (AT also keeps
// 30 % home); they were not read (second audit 2026-10-08).
test('the capital overrides ai_<house>_t<n>.ini go over ai.ini', { skip: fs.existsSync(path.join(RAW_DIR, 'ai_atreides_t33.ini')) ? false : 'game data not extracted' }, async () => {
  const { loadAiRules, capitalAiOverride } = await import('../src/emperor/ai-rules.ts');
  assert.strictEqual(path.basename(capitalAiOverride(RAW_DIR, 'AT') ?? ''), 'ai_atreides_t33.ini');
  assert.strictEqual(path.basename(capitalAiOverride(RAW_DIR, 'HK') ?? ''), 'ai_harkonnen_t1.ini');
  const base = loadAiRules(path.join(RAW_DIR, 'ai.ini'));
  const at = loadAiRules(path.join(RAW_DIR, 'ai.ini'), capitalAiOverride(RAW_DIR, 'AT'));
  assert.strictEqual(base.buildsDefences, true);
  assert.strictEqual(at.buildsDefences, false);
  assert.strictEqual(at.defencePercent, 30);
  assert.strictEqual(at.maxRefineries, base.maxRefineries, 'other keys from ai.ini');
});

test('ai_difficulty.ini: a key missing in a tech level comes from [Tech1]', async () => {
  const { parseAiDifficulty } = await import('../src/emperor/ai-rules.ts');
  const t = parseAiDifficulty('[Tech1]\nMaxAiUnits=22\nUnitDelay=875 // 35 seconds\n[Tech2]\nMaxAiUnits=23\n');
  assert.strictEqual(t[2]?.maxUnits, 23);
  assert.strictEqual(t[2]?.unitDelay, 875);
  assert.strictEqual(t[8]?.maxUnits, 22, 'levels without a section are Tech1');
});
