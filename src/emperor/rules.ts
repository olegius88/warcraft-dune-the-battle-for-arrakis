// Emperor Rules.txt parser. INI-like: [Section] then "Key = Value" lines; "//" comments; keys
// may repeat (Occupy rows, per-veterancy-level overrides after "VeterancyLevel"); a section name
// can appear again later in the file (patch blocks) and extends/overrides the earlier one.
// Object categories come from the *Types lists (see context.ts for the same list order).

import fs from 'node:fs';

export interface RulesSection {
  /** name as first written in the file */
  name: string;
  /** "Key = Value" lines in file order (keys may repeat) */
  entries: Array<[string, string]>;
  /** bare lines (list sections such as [UnitTypes]): first word */
  items: string[];
}

export interface Warhead {
  name: string;
  /** damage % against each armour type (+ Earplugs) */
  vs: Record<string, number>;
}

export interface Bullet {
  name: string;
  damage: number;
  /** tiles */
  range: number;
  speed: number;
  warhead: Warhead | null;
  antiAircraft: boolean;
  blast: number;
  homing: boolean;
}

export interface Turret {
  name: string;
  /** ticks between shots */
  reload: number;
  bullet: Bullet | null;
  ammo: number;
}

export interface VeterancyLevel {
  /** score required */
  score: number;
  /** new absolute health (0 = unchanged) */
  health: number;
  /** % more damage */
  extraDamage: number;
  /** % less damage received */
  extraArmour: number;
  /** % more range */
  extraRange: number;
  /** new absolute speed (0 = unchanged) */
  speed: number;
  selfRepair: boolean;
  elite: boolean;
}

export type ObjectCategory = 'Unit' | 'Building' | 'Turret' | 'Bullet' | 'Warhead';

export interface RulesObject {
  name: string;
  category: 'Unit' | 'Building';
  /** score the killer gets */
  score: number;
  veterancy: VeterancyLevel[];
  house: string;
  cost: number;
  /** ticks */
  buildTime: number;
  health: number;
  speed: number;
  armour: string;
  /** tiles */
  viewRange: number;
  techLevel: number;
  primaryBuilding: string[];
  prerequisites: string[];
  secondaryBuilding: string[];
  unitWhenBuilt: string;
  spiceCapacity: number;
  infantry: boolean;
  canFly: boolean;
  harvester: boolean;
  conYard: boolean;
  /** generated minus used */
  power: number;
  size: number;
  /** [width, height] in tiles from the Occupy rows */
  footprint: [number, number] | null;
  turrets: Turret[];
  /** base-level key/values as written */
  raw: Record<string, string>;
}

export interface Rules {
  sections: Map<string, RulesSection>;
  objects: Map<string, RulesObject>;
  armourTypes: string[];
  general: Record<string, string>;
  category: Map<string, ObjectCategory>;
  /** crate type -> CrateGiftObject (unit type or CASH<n>) */
  crates: Map<string, string>;
}

function parseSections(text: string): { sections: Map<string, RulesSection>; order: string[] } {
  const sections = new Map<string, RulesSection>();
  const order: string[] = [];
  let cur: RulesSection | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^\[([^\]]+)\]/);
    if (m) {
      const name = (m[1] as string).trim();
      const key = name.toLowerCase(); // section names are case-insensitive (ATPillbox vs [ATPillBox])
      if (!sections.has(key)) { sections.set(key, { name, entries: [], items: [] }); order.push(name); }
      cur = sections.get(key);
      continue;
    }
    if (!cur) continue;
    const eq = line.indexOf('=');
    if (eq < 0) cur.items.push(line.split(/\s+/)[0] as string);
    else cur.entries.push([line.slice(0, eq).trim(), line.slice(eq + 1).trim()]);
  }
  return { sections, order };
}

const num = (v: string | undefined, d = 0): number => { const n = parseFloat(v as string); return Number.isFinite(n) ? n : d; };
const bool = (v: string | undefined): boolean => /^(true|1)$/i.test(String(v || '').trim());

/** Base-level key/values (everything before the first VeterancyLevel) plus repeated keys as arrays. */
function baseValues(section: RulesSection): { single: Record<string, string>; multi: Record<string, string[]> } {
  const single: Record<string, string> = {};
  const multi: Record<string, string[]> = {};
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
function veterancyLevels(section: RulesSection): VeterancyLevel[] {
  const levels: VeterancyLevel[] = [];
  let cur: VeterancyLevel | null = null;
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

const CATEGORY_LISTS: Array<[string, ObjectCategory]> = [
  ['UnitTypes', 'Unit'], ['BuildingTypes', 'Building'], ['TurretTypes', 'Turret'], ['BulletTypes', 'Bullet'], ['WarheadTypes', 'Warhead'],
];

function loadRules(rulesPath: string): Rules {
  const { sections } = parseSections(fs.readFileSync(rulesPath, 'latin1'));
  const sec = (n: string | undefined): RulesSection | undefined => sections.get(String(n || '').toLowerCase());
  const listOf = (n: string): string[] => sec(n)?.items ?? [];
  const category = new Map<string, ObjectCategory>();
  for (const [list, cat] of CATEGORY_LISTS) {
    for (const n of listOf(list)) category.set(n, cat);
  }
  const armourTypes = listOf('ArmourTypes');
  const generalSection = sec('General');
  const general = generalSection ? baseValues(generalSection).single : {};

  const warhead = (name: string | undefined): Warhead | null => {
    const s = sec(name);
    if (!s || name === undefined) return null;
    const vs: Record<string, number> = {};
    for (const [k, v] of s.entries) if (armourTypes.includes(k) || k === 'Earplugs') vs[k] = num(v);
    return { name, vs };
  };
  const bullet = (name: string | undefined): Bullet | null => {
    const s = sec(name);
    if (!s || name === undefined) return null;
    const b = baseValues(s).single;
    return {
      name, damage: num(b.Damage), range: num(b.MaxRange), speed: num(b.Speed, -1), warhead: warhead(b.Warhead),
      antiAircraft: bool(b.AntiAircraft), blast: num(b.BlastRadius), homing: bool(b.Homing),
    };
  };
  const turret = (name: string): Turret | null => {
    const s = sec(name);
    if (!s) return null;
    const t = baseValues(s).single;
    return { name, reload: num(t.ReloadCount, 50), bullet: bullet(t.Bullet), ammo: num(t.Ammo) };
  };

  const objects = new Map<string, RulesObject>();
  for (const [name, cat] of category) {
    if (cat !== 'Unit' && cat !== 'Building') continue;
    const s = sec(name);
    if (!s) continue;
    const { single: v, multi } = baseValues(s);
    const turrets = (multi.TurretAttach || []).flatMap((x) => x.split(',').map((y) => y.trim())).filter(Boolean).map(turret)
      .filter((t): t is Turret => Boolean(t));
    const occupy = multi.Occupy || [];
    const firstOf = (list: string): string => (list.split(',')[0] as string).trim();
    objects.set(name, {
      name, category: cat,
      score: num(v.Score, 1), veterancy: veterancyLevels(s),
      house: (v.House || '').trim(),
      cost: num(v.Cost), buildTime: num(v.BuildTime), health: num(v.Health, 100),
      speed: num(v.Speed), armour: firstOf(v.Armour || 'None'),
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
  const crates = new Map<string, string>();
  for (const n of listOf('CrateTypes')) {
    const s = sec(n);
    const gift = s && s.entries.find(([k]) => k === 'CrateGiftObject');
    // was split(/s+/) (a heredoc ate the backslash): cut names at a lowercase "s"
    // (regression test: test/emperor-rules.test.ts)
    if (s && gift) crates.set(s.name, gift[1].split(/\s+/)[0] as string);
  }
  return { sections, objects, armourTypes, general, category, crates };
}

export { loadRules, parseSections };
