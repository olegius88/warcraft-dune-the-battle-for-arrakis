// Rules.txt parser on small synthetic inputs (no game data needed).

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadRules } from '../src/emperor/rules.ts';

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
