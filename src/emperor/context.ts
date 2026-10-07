// Name tables that mission scripts (*.tok) refer to by index. All three were reverse-engineered
// 2026-10-07 and confirmed on many scripts (see test/emperor-tok.test.js):
//
// - Object types (0x82): every name listed under the object *Types sections of Rules.txt, in file
//   order, de-duplicated: Explosion, SpiceMound, Splat, Crate, Debris, Bullet, Building, Unit,
//   Turret. BuildObject/Delivery get units, ObjectDetonate gets SaboteurBomb/DeathHandBomb, etc.
// - Messages (0x83): entries of every [MissionMessages] section of the UTF-16 string files,
//   files taken in case-insensitive alphabetical order (Atreides 0.., E_Output_Pickup 502..,
//   Harkonnen 1391.., Ordos 1847..). Scripts were compiled against the ENGLISH files in the
//   archive, so ids resolve to keys there; the shown text comes from the localised (Russian)
//   DATA\strings files by key.
// - Tooltips (0x84): entries of the [ObjectTips] sections, same file order.

import fs from 'node:fs';
import path from 'node:path';
import { parseStrings } from './strings.ts';

const OBJECT_SECTIONS = new Set(['ExplosionTypes', 'SpiceMoundTypes', 'SplatTypes', 'CrateTypes', 'DebrisTypes',
  'BulletTypes', 'BuildingTypes', 'UnitTypes', 'TurretTypes']);

function objectTypesFromRules(rulesText) {
  const all = [];
  const seen = new Set();
  let section = null;
  for (const raw of rulesText.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^\[(.+?)\]/);
    if (m) { section = m[1]; continue; }
    if (!OBJECT_SECTIONS.has(section) || line.includes('=')) continue;
    const name = line.split(/\s+/)[0];
    if (!seen.has(name)) { seen.add(name); all.push({ name, category: section.replace(/Types$/, '') }); }
  }
  return all;
}

function utf16Files(dir) {
  return fs.readdirSync(dir)
    .filter((f) => /\.txt$/i.test(f))
    .filter((f) => { const b = fs.readFileSync(path.join(dir, f)); return b.length > 1 && b.readUInt16LE(0) === 0xFEFF; })
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

function sectionTable(dir, sectionName) {
  let out = [];
  for (const f of utf16Files(dir)) out = out.concat(parseStrings(path.join(dir, f)).filter((e) => e.section === sectionName));
  return out;
}

/**
 * @param {string} rawDir      data/emperor/raw (English archive files + Rules.txt)
 * @param {string} [localDir]  localised string files (DATA\strings copy); falls back to English
 */
function loadContext(rawDir, localDir) {
  const objectTypes = objectTypesFromRules(fs.readFileSync(path.join(rawDir, 'Rules.txt'), 'latin1'));
  const messages = sectionTable(rawDir, 'MissionMessages');
  const tooltips = sectionTable(rawDir, 'ObjectTips');
  const local = new Map();
  if (localDir && fs.existsSync(localDir)) {
    for (const f of utf16Files(localDir)) for (const e of parseStrings(path.join(localDir, f))) local.set(e.key.toLowerCase(), e.text);
  }
  const text = (e) => (e ? local.get(e.key.toLowerCase()) || e.text : undefined);
  const english = new Map();
  for (const f of utf16Files(rawDir)) for (const e of parseStrings(path.join(rawDir, f))) if (!english.has(e.key.toLowerCase())) english.set(e.key.toLowerCase(), e.text);
  return {
    objectTypes, messages, tooltips,
    /** any string by key (briefings etc.): localised first, English fallback */
    textByKey: (key) => local.get(String(key).toLowerCase()) || english.get(String(key).toLowerCase()),
    objectType: (n) => (objectTypes[n] ? objectTypes[n].name : undefined),
    messageKey: (n) => (messages[n] ? messages[n].key : undefined),
    messageText: (n) => text(messages[n]),
    tooltipKey: (n) => (tooltips[n] ? tooltips[n].key : undefined),
    tooltipText: (n) => text(tooltips[n]),
  };
}

export { loadContext, objectTypesFromRules };
