// Emperor Rules.txt parser. INI-like: [Section] then "Key = Value" lines; "//" comments; keys
// may repeat (Occupy rows, per-veterancy-level overrides after "VeterancyLevel"); a section name
// can appear again later in the file (patch blocks) and extends/overrides the earlier one.
// Object categories come from the *Types lists (see context.js for the same list order).

import fs from 'node:fs';

function parseSections(text) {
  const sections = new Map();
  const order = [];
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^\[([^\]]+)\]/);
    if (m) {
      const name = m[1].trim();
      const key = name.toLowerCase(); // section names are case-insensitive (ATPillbox vs [ATPillBox])
      if (!sections.has(key)) { sections.set(key, { name, entries: [], items: [] }); order.push(name); }
      cur = sections.get(key);
      continue;
    }
    if (!cur) continue;
    const eq = line.indexOf('=');
    if (eq < 0) cur.items.push(line.split(/\s+/)[0]);
    else cur.entries.push([line.slice(0, eq).trim(), line.slice(eq + 1).trim()]);
  }
  return { sections, order };
}

const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const bool = (v) => /^(true|1)$/i.test(String(v || '').trim());

/** Base-level key/values (everything before the first VeterancyLevel) plus repeated keys as arrays. */
function baseValues(section) {
  const single = {};
  const multi = {};
  for (const [k, v] of section.entries) {
    if (k === 'VeterancyLevel') break;
    if (!(k in single)) single[k] = v;
    (multi[k] = multi[k] || []).push(v);
  }
  return { single, multi };
}

/**
 * Veterancy blocks: every `VeterancyLevel = <score required>` starts a level; the keys after it
 * (Health / Speed = new absolute values, ExtraDamage / ExtraArmour / ExtraRange in %, CanSelfRepair, Elite)
 * belong to that level.
 */
function veterancyLevels(section) {
  const levels = [];
  let cur = null;
  for (const [k, v] of section.entries) {
    if (k === 'VeterancyLevel') {
      cur = { score: num(v), health: 0, extraDamage: 0, extraArmour: 0, extraRange: 0, speed: 0, selfRepair: false, elite: false };
      levels.push(cur);
    } else if (cur) {
      if (k === 'Health') cur.health = num(v);
      else if (k === 'ExtraDamage') cur.extraDamage = num(v);
      else if (k === 'ExtraArmour') cur.extraArmour = num(v);
      else if (k === 'ExtraRange') cur.extraRange = num(v);
      else if (k === 'CanSelfRepair') cur.selfRepair = bool(v);
      else if (k === 'Elite') cur.elite = bool(v);
      else if (k === 'Speed') cur.speed = num(v); // absolute, like the base Speed
      // TODO(veterancy): StealthedWhenStill (ATSniper level 3) is not modelled.
    }
  }
  return levels;
}

function loadRules(rulesPath) {
  const { sections } = parseSections(fs.readFileSync(rulesPath, 'latin1'));
  const sec = (n) => sections.get(String(n || '').toLowerCase());
  const listOf = (n) => (sec(n) ? sec(n).items : []);
  const category = new Map();
  for (const [list, cat] of [['UnitTypes', 'Unit'], ['BuildingTypes', 'Building'], ['TurretTypes', 'Turret'], ['BulletTypes', 'Bullet'], ['WarheadTypes', 'Warhead']]) {
    for (const n of listOf(list)) category.set(n, cat);
  }
  const armourTypes = listOf('ArmourTypes');
  const general = sec('General') ? baseValues(sec('General')).single : {};

  const warhead = (name) => {
    const s = sec(name);
    if (!s) return null;
    const vs = {};
    for (const [k, v] of s.entries) if (armourTypes.includes(k) || k === 'Earplugs') vs[k] = num(v);
    return { name, vs };
  };
  const bullet = (name) => {
    const s = sec(name);
    if (!s) return null;
    const b = baseValues(s).single;
    return {
      name, damage: num(b.Damage), range: num(b.MaxRange), speed: num(b.Speed, -1), warhead: warhead(b.Warhead),
      antiAircraft: bool(b.AntiAircraft), blast: num(b.BlastRadius), homing: bool(b.Homing),
    };
  };
  const turret = (name) => {
    const s = sec(name);
    if (!s) return null;
    const t = baseValues(s).single;
    return { name, reload: num(t.ReloadCount, 50), bullet: bullet(t.Bullet), ammo: num(t.Ammo) };
  };

  const objects = new Map();
  for (const [name, cat] of category) {
    if (cat !== 'Unit' && cat !== 'Building') continue;
    const s = sec(name);
    if (!s) continue;
    const { single: v, multi } = baseValues(s);
    const turrets = (multi.TurretAttach || []).flatMap((x) => x.split(',').map((y) => y.trim())).filter(Boolean).map(turret).filter(Boolean);
    const occupy = multi.Occupy || [];
    objects.set(name, {
      name, category: cat,
      score: num(v.Score, 1), veterancy: veterancyLevels(s),
      house: (v.House || '').trim(),
      cost: num(v.Cost), buildTime: num(v.BuildTime), health: num(v.Health, 100),
      speed: num(v.Speed), armour: (v.Armour || 'None').split(',')[0].trim(),
      viewRange: num(String(v.ViewRange || '5').split(',')[0]), techLevel: num(v.TechLevel),
      primaryBuilding: (v.PrimaryBuilding || '').split(',').map((x) => x.trim()).filter(Boolean),
      prerequisites: (v.Prerequisite || v.Prerequisites || '').split(',').map((x) => x.trim()).filter(Boolean),
      secondaryBuilding: (v.SecondaryBuilding || '').split(',').map((x) => x.trim()).filter(Boolean),
      unitWhenBuilt: (v.GetUnitWhenBuilt || '').trim(), spiceCapacity: num(v.SpiceCapacity),
      infantry: bool(v.Infantry), canFly: bool(v.CanFly) || bool(v.Aircraft), harvester: bool(v.Harvester),
      conYard: bool(v.ConYard), power: num(v.PowerGenerated) - num(v.PowerUsed), size: num(v.Size, 1),
      footprint: occupy.length ? [Math.max(...occupy.map((r) => r.length)), occupy.length] : null,
      turrets, raw: v,
    });
  }
  // crates: [CrateTypes] (two sections with the same name, merged) -> CrateGiftObject
  // (a unit type, or CASH<n> = n credits)
  const crates = new Map();
  for (const n of listOf('CrateTypes')) {
    const s = sec(n);
    const gift = s && s.entries.find(([k]) => k === 'CrateGiftObject');
    if (gift) crates.set(s.name, gift[1].split(/s+/)[0]);
  }
  return { sections, objects, armourTypes, general, category, crates };
}

export { loadRules, parseSections };
