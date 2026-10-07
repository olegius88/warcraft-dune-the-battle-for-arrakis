// String lookup of the mission context (src/emperor/context.ts) on synthetic string files.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadContext } from '../src/emperor/context.ts';

function utf16(text: string): Buffer {
  return Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(text.replace(/\n/g, '\r\n'), 'utf16le')]);
}

// Regression: the localised strings were one table keyed by the string key alone, so a key that
// appears in two sections took the text of the last file read. ATTrike is both an object name
// (ObjectTips, "Песчаный Байк Атрейдесов") and a spoken unit briefing (Uispoken.txt UnitBriefing,
// a long description); Uispoken.txt sorts after the ObjectTips files, so every unit and building
// named in UnitBriefing showed the description as its WC3 name. It went unnoticed because the
// English table (used by the tests) keeps the first entry. Now the section is part of the lookup.
test('localised object name is taken from its own section, not from a same-key unit briefing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emp-context-'));
  try {
    const raw = path.join(root, 'raw');
    const local = path.join(root, 'local');
    fs.mkdirSync(raw);
    fs.mkdirSync(local);
    fs.writeFileSync(path.join(raw, 'Rules.txt'), '');
    fs.writeFileSync(path.join(raw, 'Text strings.txt'), utf16('ObjectTips\nATTrike\t{Atreides Sand Bike}\n'));
    fs.writeFileSync(path.join(raw, 'Uispoken.txt'), utf16('UnitBriefing\nATTrike\t{Primary scout vehicle, fast}\n'));
    fs.writeFileSync(path.join(local, 'Text strings.txt'), utf16('ObjectTips\nATTrike\t{Песчаный Байк Атрейдесов}\n'));
    fs.writeFileSync(path.join(local, 'Uispoken.txt'), utf16('UnitBriefing\nATTrike\t{Первичное разведывательное транспортное средство}\n'));
    const ctx = loadContext(raw, local);
    const n = ctx.tooltips.findIndex((t) => t.key === 'ATTrike');
    assert.strictEqual(ctx.tooltipText(n), 'Песчаный Байк Атрейдесов');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
