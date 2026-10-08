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
  /** CanSelfRepair: health regained per repair period (0 = none; Rules.txt asks "Need 0.5?" next to
   * 1, so it is an amount, not a flag) */
  selfRepair: number;
  elite: boolean;
  /** invisible while it stands still (ATSniper level 3) */
  stealthedWhenStill: boolean;
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
  /** building upgrade: UpgradeCost (0 = none), UpgradeTechLevel, UpgradeBuildTime (ticks, 0 = not given) */
  upgradeCost: number;
  upgradeTechLevel: number;
  upgradeBuildTime: number;
  /** needs the upgraded PrimaryBuilding (UpgradedPrimaryRequired) */
  upgradedPrimaryRequired: boolean;
  unitWhenBuilt: string;
  spiceCapacity: number;
  infantry: boolean;
  canFly: boolean;
  harvester: boolean;
  conYard: boolean;
  /** generated minus used */
  power: number;
  /** turret that stops while its side lacks power */
  disableWithLowPower: boolean;
  /** value of the unit in reinforcement / reserve sets (0 = never sent) */
  reinforcementValue: number;
  /** how attractive a target it is for the AI (SetThreatLevel overrides it per type) */
  aiThreat: number;
  /** invisible while it stands still (scouts) */
  stealthedWhenStill: boolean;
  /** ExcludeFromCampaignLose: does not keep its side alive (walls, small windtraps) */
  excludeFromLose: boolean;
  /** tiles within which it reveals stealthed enemies (turrets, scouts; 0 = none) */
  unstealthRange: number;
  /** worms eat it (TastyToWorms; false for story characters) */
  tastyToWorms: boolean;
  /** weight with which a worm picks it (WormAttraction; GUMaker -20 = never) */
  wormAttraction: number;
  size: number;
  /** [width, height] in tiles from the Occupy rows */
  footprint: [number, number] | null;
  turrets: Turret[];
  /** base-level key/values as written */
  raw: Record<string, string>;
}

/** Sandworms ([General] worm keys of Rules.txt; chances are "1 in N per tick", times in ticks). */
export interface WormRules {
  maxSurface: number;
  surfaceChance: number;
  verticalChance: number;
  minLife: number;
  maxLife: number;
  /** % health at which a surface worm goes away */
  disappearHealth: number;
  /** no worm before this tick */
  minTick: number;
  /** tiles */
  attractionRadius: number;
}

/** Reinforcements, reserves and starting armies of territory battles ([General]; values are sums of
 * the units' ReinforcementValue, times in ticks). */
export interface ReinforcementRules {
  /** initial army of the attacking side */
  attacker: number;
  /** initial army of the defending side */
  defender: number;
  reserves: number;
  /** first and later reinforcement sets */
  initial: number;
  subsequent: number;
  /** delay between sets, random +- variation, screen message this long before a set arrives */
  delay: number;
  variation: number;
  messageBefore: number;
}

/** Credits of the player in a campaign battle ([General] CampaignAttackMoney / CampaignDefendMoney). */
export interface CampaignMoney {
  attack: number;
  defend: number;
}

export interface Rules {
  sections: Map<string, RulesSection>;
  objects: Map<string, RulesObject>;
  armourTypes: string[];
  general: Record<string, string>;
  category: Map<string, ObjectCategory>;
  /** crate type -> CrateGiftObject (unit type or CASH<n>) */
  crates: Map<string, string>;
  worms: WormRules;
  reinforcements: ReinforcementRules;
  campaignMoney: CampaignMoney;
  /** StealthedWhenStill units turn invisible this many ticks after they stop / after they fired */
  stealth: { delay: number; afterFiring: number };
  /** [SpiceMound]: Health, Size (min ticks before it bursts) + up to Cost ticks, BlastRadius (bloom
   * tiles), SpiceCapacity, BuildTime (ticks before the spice appears), Min/MaxRange (ticks before it
   * grows again) */
  spiceMound: { health: number; minTicks: number; randomTicks: number; radiusTiles: number; capacity: number; delayTicks: number; regrowMin: number; regrowMax: number };
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
      cur = { score: num(v), health: 0, extraDamage: 0, extraArmour: 0, extraRange: 0, speed: 0, selfRepair: 0, elite: false, stealthedWhenStill: false };
      levels.push(cur);
    } else if (cur) {
      if (k === 'Health') cur.health = num(v);
      else if (k === 'ExtraDamage') cur.extraDamage = num(v);
      else if (k === 'ExtraArmour') cur.extraArmour = num(v);
      else if (k === 'ExtraRange') cur.extraRange = num(v);
      else if (k === 'CanSelfRepair') cur.selfRepair = bool(v) && !num(v) ? 1 : num(v);
      else if (k === 'Elite') cur.elite = bool(v);
      else if (k === 'Speed') cur.speed = num(v); // absolute, like the base Speed
      else if (k === 'StealthedWhenStill') cur.stealthedWhenStill = bool(v);
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
      upgradeCost: num(v.UpgradeCost), upgradeTechLevel: num(v.UpgradeTechLevel), upgradeBuildTime: num(v.UpgradeBuildTime), upgradedPrimaryRequired: bool(v.UpgradedPrimaryRequired),
      unitWhenBuilt: (v.GetUnitWhenBuilt || '').trim(), spiceCapacity: num(v.SpiceCapacity),
      infantry: bool(v.Infantry), canFly: bool(v.CanFly) || bool(v.Aircraft), harvester: bool(v.Harvester),
      conYard: bool(v.ConYard), power: num(v.PowerGenerated) - num(v.PowerUsed), disableWithLowPower: bool(v.DisableWithLowPower),
      reinforcementValue: num(v.ReinforcementValue), aiThreat: num(v.AIThreat), stealthedWhenStill: bool(v.StealthedWhenStill), excludeFromLose: bool(v.ExcludeFromCampaignLose), unstealthRange: num(v.UnstealthRange),
      tastyToWorms: v.TastyToWorms === undefined || bool(v.TastyToWorms), wormAttraction: num(v.WormAttraction, 1),
      size: num(v.Size, 1),
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
  const worms: WormRules = {
    maxSurface: num(general.MaximumSurfaceWorms), surfaceChance: num(general.ChanceOfSurfaceWorm),
    verticalChance: num(general.ChanceOfVerticalWorm), minLife: num(general.SurfaceWormMinLife),
    maxLife: num(general.SurfaceWormMaxLife), disappearHealth: num(general.SurfaceWormDisappearHealth),
    minTick: num(general.MinimumTicksWormCanAppear), attractionRadius: num(general.WormAttractionRadius),
  };
  const reinforcements: ReinforcementRules = {
    attacker: num(general.UnitValueAttacker), defender: num(general.UnitValueDefender), reserves: num(general.UnitValueReserves),
    initial: num(general.UnitValueInitialReinforcements), subsequent: num(general.UnitValueSubsequentReinforcements),
    delay: num(general.TicksBetweenReinforcements), variation: num(general.TicksBetweenReinforcementsVariation),
    messageBefore: num(general.TicksBeforeReinforcementsForMessage),
  };
  const campaignMoney: CampaignMoney = { attack: num(general.CampaignAttackMoney), defend: num(general.CampaignDefendMoney) };
  const stealth = { delay: num(general.StealthDelay), afterFiring: num(general.StealthDelayAfterFiring) };
  const mound = sec('SpiceMound') ? baseValues(sec('SpiceMound') as RulesSection).single : {};
  const spiceMound = {
    health: num(mound.Health), minTicks: num(mound.Size), randomTicks: num(mound.Cost), radiusTiles: num(mound.BlastRadius),
    capacity: num(mound.SpiceCapacity), delayTicks: num(mound.BuildTime), regrowMin: num(mound.MinRange), regrowMax: num(mound.MaxRange),
  };
  return { sections, objects, armourTypes, general, category, crates, worms, reinforcements, campaignMoney, stealth, spiceMound };
}

export { loadRules, parseSections };
