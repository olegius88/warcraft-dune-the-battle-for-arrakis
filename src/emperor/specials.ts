// Special abilities of Emperor's units from Rules.txt (runtime: src/jass/mission/specials.j):
//   Deviator      a turret bullet with Deviate = TRUE: the hit unit fights for the shooter's side for
//                 [General] DeviateDuration ticks (the first of its two values wins, like ai.ini);
//                 CanBeDeviated = FALSE objects are immune
//   Leech         a bullet with Leech = TRUE: Infantry tells which targets it takes (TLLeech: vehicles,
//                 TLContaminator: infantry), ShieldHealth the damage per tick to the taken unit
//                 (10000 = "Kill outright"), Damage the hit on anything else
//   Engineer      Engineer = TRUE: takes over an enemy building with CanBeEngineered = TRUE
//   Saboteur      Saboteur = TRUE: blows up at an enemy building with [SaboteurBomb] (Damage, BlastRadius)
//   Crushes / Crushable   vehicles that run over infantry

import type { Rules } from './rules.ts';
import { EMPEROR_TILE } from '../config/scale.ts';

export interface LeechData {
  name: string;
  /** takes infantry (true) or vehicles (false) */
  infantry: boolean;
  damagePerTick: number;
  /** the bullet's damage on a target it does not take */
  damage: number;
}

export interface SpecialAbilities {
  deviateTicks: number;
  deviators: string[];
  leeches: LeechData[];
  engineers: string[];
  saboteurs: { name: string; damage: number; radiusTiles: number }[];
  crushers: string[];
  crushable: string[];
  notDeviatable: string[];
  engineerable: string[];
  /** Repair = TRUE vehicles: [General] RepairTileRange, RepairRate (health per 10 ticks; Rules.txt
   * states it for buildings, the repair vehicle is assumed to repair at the same rate) */
  repair: { units: string[]; rangeTiles: number; perTenTicks: number };
  /** CanBeRepaired = FALSE */
  notRepairable: string[];
  /** story characters (TastyToWorms = FALSE): not leeched, not contaminated. An inference: Rules.txt
   * states no such rule (the nine are infantry, so it changes only contamination) */
  story: string[];
  /** walls: a saboteur does not blow up at them. An inference: [ORSaboteur] / [SaboteurBomb] say nothing */
  walls: string[];
}

function specialAbilities(rules: Rules): SpecialAbilities {
  const value = (v: string | undefined): string => (v ?? '').split('//')[0]?.trim() ?? '';
  const isTrue = (v: string | undefined): boolean => /^true$/i.test(value(v));
  const isFalse = (v: string | undefined): boolean => /^false$/i.test(value(v));
  const num = (v: string | undefined): number => { const n = parseFloat(value(v)); return Number.isFinite(n) ? n : 0; };
  const raw = (name: string): Record<string, string> => Object.fromEntries(rules.sections.get(name.toLowerCase())?.entries ?? []);
  const objects = [...rules.objects.values()];
  const bulletOf = (name: string): Record<string, string>[] => (rules.objects.get(name)?.turrets ?? []).map((t) => (t.bullet ? raw(t.bullet.name) : {}));
  const bomb = raw('SaboteurBomb');
  return {
    deviateTicks: num(rules.general.DeviateDuration),
    deviators: objects.filter((o) => bulletOf(o.name).some((b) => isTrue(b.Deviate))).map((o) => o.name),
    leeches: objects.flatMap((o) => bulletOf(o.name).filter((b) => isTrue(b.Leech)).map((b) => ({ name: o.name, infantry: isTrue(b.Infantry), damagePerTick: num(b.ShieldHealth), damage: num(b.Damage) }))),
    engineers: objects.filter((o) => isTrue(o.raw.Engineer)).map((o) => o.name),
    saboteurs: objects.filter((o) => isTrue(o.raw.Saboteur) || isTrue(o.raw.Infiltrator)).map((o) => ({ name: o.name, damage: num(bomb.Damage), radiusTiles: num(bomb.BlastRadius) / EMPEROR_TILE })),
    crushers: objects.filter((o) => isTrue(o.raw.Crushes)).map((o) => o.name),
    crushable: objects.filter((o) => isTrue(o.raw.Crushable)).map((o) => o.name),
    notDeviatable: objects.filter((o) => isFalse(o.raw.CanBeDeviated)).map((o) => o.name),
    engineerable: objects.filter((o) => isTrue(o.raw.CanBeEngineered)).map((o) => o.name),
    repair: { units: objects.filter((o) => isTrue(o.raw.Repair)).map((o) => o.name), rangeTiles: num(rules.general.RepairTileRange), perTenTicks: num(rules.general.RepairRate) },
    notRepairable: objects.filter((o) => isFalse(o.raw.CanBeRepaired)).map((o) => o.name),
    story: objects.filter((o) => o.category === 'Unit' && !o.tastyToWorms).map((o) => o.name),
    walls: objects.filter((o) => o.category === 'Building' && o.name.endsWith('Wall')).map((o) => o.name),
  };
}

export { specialAbilities };
