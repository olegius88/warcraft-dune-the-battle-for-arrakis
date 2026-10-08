// Emperor units/buildings (rules.ts) -> Warcraft III custom object data (war3map.w3u) on stock WC3
// base objects, with Emperor's own models (src/emperor/models.ts) and icons (icons.ts) when given,
// plus the combat table (war3mapMisc.txt DamageBonus*) derived from Emperor warheads.
//
// Scaling (Emperor -> WC3): HP /2, bullet damage /2, reload ticks /25 = seconds, range tiles *128,
// speed (game coords per tick) *40, view range tiles *128, build time ticks /25 = seconds.
// Power: Rules.txt balance is applied at run time by battle.ts (EmpPowerTick; TODO(power) there).
// Veterancy: Rules.txt levels are applied at run time by mission.ts (EmpVetData / EmpOnKill).

import { writeObjects, idAllocator } from '../wc3/objects.ts';
import type { ObjectDef, ObjectMod } from '../wc3/objects.ts';
import type { Rules, RulesObject, Warhead } from './rules.ts';
import type { IconSet } from './icons.ts';
import type { ModelSet } from './models.ts';
import { HOUSE_CODES, HOUSE_BY_CODE, HOUSE_RACE } from '../config/houses.ts';
import type { Wc3Race } from '../config/houses.ts';
import { UNIT_FIELD as F, ABILITY_FIELD, UPGRADE_FIELD as G, ABILITY, UNIT, CUSTOM_ID } from '../config/wc3.ts';
import * as S from '../config/scale.ts';
import * as U from '../config/units.ts';
import { superweaponKind } from './superweapons.ts';
import type { EffectUse, EffectSet } from './effects.ts';
import { EFFECT_PLAYED, EFFECT_MAX_RADIUS, EFFECT_MIN_SCALE } from '../config/models.ts';
import { SUBHOUSE_BUILDINGS } from '../config/campaign.ts';

type RaceOrNeutral = Wc3Race | 'neutral';

/** Custom WC3 object made from an Emperor object (emperor = null: helper objects). */
export interface UnitObject extends ObjectDef {
  id: string;
  emperor: RulesObject | null;
}

export interface UnitIds {
  /** harvest ability (Ahar with Emperor capacity) */
  harvestAbility: string;
  /** spice field (gold mine) */
  spiceField: string;
  /** spice mound (bursts into a spice field) */
  spiceMound: string;
  /** house prefix (AT/HK/OR) -> builder unit spawned by a construction yard */
  builders: Record<string, string>;
  /** second builder per house: walls and turrets */
  defenceBuilders: Record<string, string>;
  /** third builder per house: the sub-house buildings */
  allyBuilders: Record<string, string>;
  mcvBuilders: Record<string, string>;
  /** territory marker of the Arrakis hub */
  territoryMarker: string;
}

/** Building upgrade (Rules.txt UpgradeCost): a custom WC3 upgrade the building researches. */
export interface UpgradeInfo {
  id: string;
  /** Emperor building name */
  building: string;
  cost: number;
  /** UpgradeTechLevel: not before this tech level */
  techLevel: number;
  /** research time: UpgradeBuildTime, else the building's own BuildTime (assumption: Rules.txt only
   * gives it for the refinery pads, as 'same as building a ref') */
  seconds: number;
}

export interface UnitData {
  objects: UnitObject[];
  /** Emperor name -> WC3 id */
  rawcode: Map<string, string>;
  ids: UnitIds;
  /** war3mapMisc.txt with the DamageBonus table */
  misc: string;
  w3u: Buffer;
  w3a: Buffer;
  /** building upgrades (war3map.w3q) */
  upgrades: UpgradeInfo[];
  /** command card cell (x, y) of each upgrade's research button */
  upgradeButtons: [string, [number, number]][];
  w3q: Buffer;
  /** command card icons the object data refers to: archive path -> BLP (import once per campaign) */
  icons: Record<string, Buffer>;
  /** converted Emperor models and their textures: archive path -> MDX / BLP (import once per campaign) */
  models: Record<string, Buffer>;
  /** WC3 type -> its effect models [when it dies, where it fires, where its bullet hits] ('' none;
   * src/emperor/effects.ts, mission effects.j) */
  effects: Map<string, [string, string, string]>;
  /** effect model path -> how far it reaches (src/emperor/effects.ts; shown at most config EFFECT_MAX_RADIUS) */
  effectRadius: Map<string, number>;
  /** starport order type -> the unit a frigate delivers for it (mission starport.j) */
  portOrders: Map<string, string>;
}

export interface CombatTable {
  /** warhead name -> WC3 attack type */
  attackOf: Map<string, string>;
  misc: string;
}

function warheadVector(w: Warhead): number[] {
  // average Emperor percentages per WC3 armour class
  const sums: Record<string, number[]> = Object.fromEntries(U.WC3_ARMOUR_ORDER.map((a) => [a, [] as number[]]));
  for (const [em, wc] of Object.entries(U.ARMOUR_MAP)) { const v = w.vs[em]; if (v != null && wc) sums[wc].push(v); }
  return U.WC3_ARMOUR_ORDER.map((a) => (sums[a].length ? sums[a].reduce((x, y) => x + y, 0) / sums[a].length : U.DEFAULT_DAMAGE_PERCENT) / 100);
}

/** k-means (k = 5) of warhead vectors -> WC3 attack type per warhead + DamageBonus table rows. */
function combatTable(warheads: Map<string, Warhead>): CombatTable {
  const names = [...warheads.keys()].sort();
  const vecs = names.map((n) => warheadVector(warheads.get(n) as Warhead));
  const k = Math.min(U.WC3_ATTACK_TYPES.length, vecs.length);
  let cent = vecs.slice(0, k).map((v) => v.slice());
  // deterministic init: spread by index
  cent = Array.from({ length: k }, (_, i) => vecs[Math.floor((i * vecs.length) / k)].slice());
  let assign: number[] = Array.from({ length: vecs.length }, () => 0);
  for (let it = 0; it < U.COMBAT_KMEANS_ITERATIONS; it++) {
    assign = vecs.map((v) => cent.map((c) => c.reduce((s, x, j) => s + (x - v[j]) ** 2, 0)).reduce((bi, d, i, a) => (d < a[bi] ? i : bi), 0));
    cent = cent.map((c, i) => {
      const mem = vecs.filter((_, j) => assign[j] === i);
      return mem.length ? c.map((_, j) => mem.reduce((s, v) => s + v[j], 0) / mem.length) : c;
    });
  }
  const attackOf = new Map(names.map((n, i): [string, string] => [n, U.WC3_ATTACK_TYPES[assign[i]] as string]));
  const misc = ['[Misc]'];
  cent.forEach((c, i) => {
    const type = U.WC3_ATTACK_TYPES[i] as string;
    const key = (type[0] as string).toUpperCase() + type.slice(1);
    misc.push(`DamageBonus${key}=${c.map((x) => x.toFixed(2)).join(',')}`);
  });
  return { attackOf, misc: misc.join('\r\n') + '\r\n' };
}

const str = (field: string, value: string | number | undefined): ObjectMod => ({ field, type: 'string', value: String(value) });
const int = (field: string, value: number): ObjectMod => ({ field, type: 'int', value: Math.round(value) });
const unreal = (field: string, value: number): ObjectMod => ({ field, type: 'unreal', value });
const real = (field: string, value: number): ObjectMod => ({ field, type: 'real', value });

/** displayName: localised name lookup (falls back to the id). */
/** The effect models of every object that has one (Rules.txt names, converted effects only). */
function effectsOf(rules: Rules, rawcode: Map<string, string>, effects?: { use: EffectUse; set: EffectSet }): Map<string, [string, string, string]> {
  const out = new Map<string, [string, string, string]>();
  if (!effects) return out;
  const path = (m: Map<string, string>, n: string): string => effects.set.model.get((m.get(n) ?? '').toLowerCase()) ?? '';
  for (const o of rules.objects.values()) {
    const id = rawcode.get(o.name);
    const all3 = [path(effects.use.death, o.name), path(effects.use.muzzle, o.name), path(effects.use.hit, o.name)];
    // a beam stretched to its target (LTMuzzle, SonicFlash: x250 along one axis) cannot be a still
    // effect: shrunk under EFFECT_MAX_RADIUS it would vanish; such ones are left out
    const shown = (p: string, k: number): boolean => Boolean(p) && EFFECT_PLAYED[k] === true && Math.min(1, (EFFECT_MAX_RADIUS[k] as number) / Math.max(1, effects.set.radius.get(p) ?? 1)) >= EFFECT_MIN_SCALE;
    const fx = all3.map((p, k) => (shown(p, k) ? p : '')) as [string, string, string];
    if (id && fx.some(Boolean)) out.set(id, fx);
  }
  return out;
}

function buildUnitData(rules: Rules, displayName: (name: string) => string = (n) => n, icons?: IconSet, models?: ModelSet, effects?: { use: EffectUse; set: EffectSet }): UnitData {
  const nextId = idAllocator();
  const warheads = new Map<string, Warhead>();
  for (const o of rules.objects.values()) for (const t of o.turrets) if (t.bullet && t.bullet.warhead) warheads.set(t.bullet.warhead.name, t.bullet.warhead);
  const combat = combatTable(warheads);

  const rawcode = new Map<string, string>(); // Emperor name -> WC3 id
  const objects: UnitObject[] = [];
  const all = [...rules.objects.values()];
  for (const o of all) rawcode.set(o.name, nextId(CUSTOM_ID.unitPrefix));
  const idOf = (name: string): string => rawcode.get(name) as string;
  // building upgrades: one custom upgrade per building with an UpgradeCost
  const upgrades: UpgradeInfo[] = all.filter((o) => o.category === 'Building' && o.upgradeCost > 0).map((o) => ({
    id: nextId(CUSTOM_ID.upgradePrefix), building: o.name, cost: o.upgradeCost, techLevel: o.upgradeTechLevel,
    seconds: (o.upgradeBuildTime || o.buildTime || S.DEFAULT_BUILD_TICKS) / S.TICKS_PER_SECOND,
  }));
  const upgradeOf = new Map(upgrades.map((u) => [u.building, u]));

  for (const o of all) {
    const race: RaceOrNeutral = HOUSE_RACE[o.house] || 'neutral';
    let base: string, scale: number;
    const charge = superweaponKind(o) !== null;
    if (charge) {
      // palace super weapon charge: an artillery unit whose attack-ground order is the strike
      // (src/jass/mission/superweapon.j)
      base = U.SUPERWEAPON_BASE; scale = U.SUPERWEAPON_SCALE;
    } else if (o.category === 'Building') {
      // the last entry matches every name
      const b = U.BUILDING_MODELS.find(([re]) => re.test(o.name)) as (typeof U.BUILDING_MODELS)[number];
      base = b[1][race] || b[1].neutral; scale = b[2];
    } else {
      // the last entry matches every object
      const b = U.UNIT_MODELS.find(([m]) => m(o)) as (typeof U.UNIT_MODELS)[number];
      base = b[1]; scale = b[2];
    }
    const mods: ObjectMod[] = [
      str(F.name, displayName(o.name)),
      int(F.hitPoints, Math.max(S.MIN_HP, o.health / S.HP_DIVISOR)),
      str(F.defenseType, U.ARMOUR_MAP[o.armour] || U.DEFAULT_DEFENSE_TYPE),
      int(F.defense, o.category === 'Building' ? S.BUILDING_DEFENSE : 0),
      int(F.goldCost, o.cost), int(F.lumberCost, 0), int(F.foodCost, 0), int(F.foodMade, 0),
      int(F.buildTime, Math.max(1, (o.buildTime || S.DEFAULT_BUILD_TICKS) / S.TICKS_PER_SECOND)),
      int(F.sightDay, Math.max(1, o.viewRange) * S.SIGHT_DAY_PER_TILE), int(F.sightNight, Math.max(1, o.viewRange) * S.SIGHT_NIGHT_PER_TILE),
      str(F.race, race === 'neutral' ? U.NEUTRAL_RACE_FIELD : race),
      // a converted Emperor model is already at WC3 scale (src/emperor/model.ts)
      real(F.scale, models?.model.has(o.name) ? 1 : scale), real(F.selectionScale, scale),
    ];
    if (o.category !== 'Building' && o.speed > 0) mods.push(int(F.moveSpeed, S.moveSpeed(o.speed)));
    // Emperor's own sidebar icon (src/emperor/icons.ts)
    const icon = icons?.icon.get(o.name);
    if (icon) mods.push(str(F.icon, icon));
    // Emperor's own model (src/emperor/models.ts)
    const model = models?.model.get(o.name);
    if (model) mods.push(str(F.model, model));
    const weapon = o.turrets.find((t) => t.bullet && t.bullet.damage > 0);
    if (weapon && weapon.bullet) {
      const b = weapon.bullet;
      mods.push(int(F.attacksEnabled, 1));
      mods.push(int(F.damageBase, Math.max(1, b.damage / S.DAMAGE_DIVISOR)), int(F.damageDice, 1), int(F.damageSides, 1));
      mods.push(int(F.range, Math.max(1, b.range) * S.RANGE_PER_TILE), unreal(F.acquireRange, Math.max(b.range, o.viewRange) * S.RANGE_PER_TILE));
      mods.push(unreal(F.cooldown, Math.max(S.MIN_ATTACK_COOLDOWN, weapon.reload / S.TICKS_PER_SECOND)));
      mods.push(str(F.attackType, (b.warhead && combat.attackOf.get(b.warhead.name)) || U.DEFAULT_ATTACK_TYPE));
      mods.push(str(F.targets, b.antiAircraft ? U.TARGETS_AIR : U.TARGETS_GROUND));
    } else if (!charge && (o.category !== 'Building' || /Wall/i.test(o.name))) {
      mods.push(int(F.attacksEnabled, 0));
    }
    objects.push({ base, id: idOf(o.name), mods, emperor: o });
  }

  // ---- economy / construction objects (ids fixed so the runtime can refer to them) ----
  const HARVEST_ABILITY = CUSTOM_ID.harvestAbility; // Ahar with Emperor capacity
  // Territory marker of the Arrakis hub map: invulnerable, unarmed, house-coloured tower.
  const ids: UnitIds = { harvestAbility: HARVEST_ABILITY, spiceField: CUSTOM_ID.spiceField, spiceMound: CUSTOM_ID.spiceMound, builders: {}, defenceBuilders: {}, allyBuilders: {}, mcvBuilders: {}, territoryMarker: CUSTOM_ID.territoryMarker };
  const abilities: ObjectDef[] = [{ base: ABILITY.harvest, id: HARVEST_ABILITY, mods: [
    { field: ABILITY_FIELD.harvestGold, type: 'int', value: U.HARVEST_CAPACITY, level: 1, column: 3 },
    { field: ABILITY_FIELD.harvestLumber, type: 'int', value: 0, level: 1, column: 2 },
    { field: ABILITY_FIELD.name, type: 'string', value: U.HARVEST_ABILITY_NAME },
  ] }];
  // Spice field = gold mine (amount set at spawn by the runtime)
  const [tintR, tintG, tintB] = U.SPICE_FIELD_TINT;
  objects.push({ base: UNIT.goldMine, id: ids.spiceField, mods: [str(F.name, U.SPICE_FIELD_NAME), real(F.scale, U.SPICE_FIELD_SCALE), real(F.selectionScale, U.SPICE_FIELD_SCALE),
    int(F.tintRed, tintR), int(F.tintGreen, tintG), int(F.tintBlue, tintB)], emperor: null });
  // Spice mound: a small sand-coloured mine with no mining, Rules.txt [SpiceMound] Health; it bursts
  // into a spice field (battle spice-fields.j)
  const [mR, mG, mB] = U.SPICE_MOUND_TINT;
  objects.push({ base: UNIT.goldMine, id: ids.spiceMound, mods: [str(F.name, U.SPICE_MOUND_NAME), str(F.abilities, ''),
    int(F.hitPoints, Math.max(S.MIN_HP, rules.spiceMound.health / S.HP_DIVISOR)), real(F.scale, U.SPICE_MOUND_SCALE), real(F.selectionScale, U.SPICE_MOUND_SCALE),
    int(F.tintRed, mR), int(F.tintGreen, mG), int(F.tintBlue, mB)], emperor: null });

  objects.push({ base: UNIT.guardTower, id: ids.territoryMarker, mods: [str(F.name, U.TERRITORY_MARKER_NAME), str(F.abilities, ABILITY.invulnerable), int(F.attacksEnabled, 0),
    real(F.scale, U.TERRITORY_MARKER_SCALE), real(F.selectionScale, U.TERRITORY_MARKER_SCALE), str(F.upgrades, ''), str(F.researches, '')], emperor: null });

  const houseOf = (o: RulesObject): string | null => (/^(AT|HK|OR)/.exec(o.name) || [])[1] || null;
  // Starport orders: one type per Starportable unit, which a starport trains in PORT_ORDER_SECONDS
  // (Emperor: no build time, a CHOAM frigate brings the order after FrigateCountdown; mission
  // starport.j). The unit keeps its own type, cost and BuildTime at the factory.
  const portable = all.filter((u) => u.category === 'Unit' && u.cost > 0 && /^true$/i.test((u.raw.Starportable ?? '').trim()));
  const orderOf = new Map(portable.map((u) => [u.name, nextId(CUSTOM_ID.unitPrefix)]));
  const houseBuildings = (h: string): RulesObject[] => all.filter((b) => b.category === 'Building' && b.cost > 0 && houseOf(b) === h && /ConYard/.test(b.primaryBuilding.join(',')));
  const ownVariant = (list: string[], h: string): string => list.find((n) => n.startsWith(h)) || (list[0] as string);

  for (const h of HOUSE_CODES) {
    // Builders spawned by a finished construction yard: the house's buildings do not fit one build
    // menu (11 cells besides Cancel), so walls and turrets have their own builder.
    const list = houseBuildings(h);
    const builder = (id: string, name: string, builds: RulesObject[]): UnitObject => ({ base: UNIT.peasant, id, mods: [str(F.name, name), str(F.abilities, ABILITY.build),
      str(F.builds, builds.map((b) => rawcode.get(b.name)).join(',')), int(F.attacksEnabled, 0), int(F.goldCost, 0), int(F.foodCost, 0),
      str(F.race, HOUSE_RACE[HOUSE_BY_CODE[h]])], emperor: null });
    ids.builders[h] = CUSTOM_ID.builder[h];
    ids.defenceBuilders[h] = CUSTOM_ID.defenceBuilder[h];
    objects.push(builder(CUSTOM_ID.builder[h], U.BUILDER_NAME, list.filter((b) => !U.DEFENCE_BUILDING.test(b.name))));
    objects.push(builder(CUSTOM_ID.defenceBuilder[h], U.DEFENCE_BUILDER_NAME, list.filter((b) => U.DEFENCE_BUILDING.test(b.name))));
    // sub-house buildings (any house's construction yard is their PrimaryBuilding; locked unless
    // allied, mission subhouse.j)
    ids.allyBuilders[h] = CUSTOM_ID.allyBuilder[h];
    objects.push(builder(CUSTOM_ID.allyBuilder[h], U.ALLY_BUILDER_NAME, SUBHOUSE_BUILDINGS.map((n) => rules.objects.get(n)).filter((b): b is RulesObject => Boolean(b))));
  }

  for (const obj of objects) {
    const o = obj.emperor;
    if (!o) continue;
    const h = houseOf(o);
    // Strip stock-unit behaviour we do not want (peasant training, upgrades, spells).
    obj.mods.push(str(F.upgrades, ''), str(F.researches, upgradeOf.get(o.name)?.id ?? ''));
    if (o.category === 'Building') {
      // Production: units whose PrimaryBuilding names this building.
      // (super weapon charges cost nothing: Cost 0, trained for their BuildTime)
      // A starport (Starport = TRUE) sells the Starportable types of its house and the houseless
      // ones (Harvester, MCV, Carryall), as orders (portOrders) a frigate delivers; their prices change
      // at run time (mission starport.j; the stock is TODO(starport) there).
      const sells = /^true$/i.test((o.raw.Starport ?? '').trim())
        ? portable.filter((u) => u.house === o.house || (!u.house && !houseOf(u)))
        : [];
      const trains = [...new Set([
        ...all.filter((u) => u.category === 'Unit' && (u.cost > 0 || superweaponKind(u)) && u.primaryBuilding.includes(o.name)).map((u) => rawcode.get(u.name)),
        ...sells.map((u) => orderOf.get(u.name)),
      ])];
      obj.mods.push(str(F.trains, trains.join(',')));
      const abil: string[] = [];
      if (/Refinery/i.test(o.name)) abil.push(ABILITY.returnResources);
      obj.mods.push(str(F.abilities, abil.join(',')));
    } else if (o.harvester || /Harvester/.test(o.name)) {
      obj.mods.push(str(F.abilities, HARVEST_ABILITY));
    } else if (superweaponKind(o)) {
      // invulnerable, and none of the stock unit's requirements
      obj.mods.push(str(F.abilities, ABILITY.invulnerable), str(F.requires, ''));
    } else if (/^MCV$/.test(o.name)) {
      // MCV builds (and is consumed by) a construction yard: runtime removes it on construct start.
      obj.mods.push(str(F.abilities, ABILITY.build), str(F.builds, HOUSE_CODES.map((c) => rawcode.get(`${c}ConYard`)).join(',')));
    } else {
      obj.mods.push(str(F.abilities, ''));
    }
    // Requirements: the own-house variant of the SecondaryBuilding (Emperor accepts any house's), and
    // the upgrade of the PrimaryBuilding for UpgradedPrimaryRequired types.
    const reqs: string[] = [];
    if (o.secondaryBuilding.length && h) {
      const req = ownVariant(o.secondaryBuilding, h);
      if (rawcode.has(req)) reqs.push(idOf(req));
    }
    if (o.upgradedPrimaryRequired && o.primaryBuilding.length) {
      const up = upgradeOf.get(h ? ownVariant(o.primaryBuilding, h) : o.primaryBuilding[0] as string);
      if (up) reqs.push(up.id);
    }
    if (reqs.length) obj.mods.push(str(F.requires, reqs.join(',')));
  }
  // the order types: the unit's look and requirements, its Rules.txt Cost, unarmed, PORT_ORDER_SECONDS
  // TODO(starport): an order keeps its unit's requirements, also the factory upgrade of
  // UpgradedPrimaryRequired types (Minotaurus, Kobra, Missile...): whether Emperor's starport asks for
  // it is not in the data (fifth audit). Risk: such units need the upgrade at the starport too.
  const portOrders = new Map<string, string>();
  for (const u of portable) {
    const real = objects.find((x) => x.emperor === u) as UnitObject;
    const keep = [F.icon, F.model, F.scale, F.selectionScale, F.race, F.requires];
    const kept = keep.map((f) => real.mods.filter((m) => m.field === f).at(-1)).filter((m): m is ObjectMod => Boolean(m));
    const id = orderOf.get(u.name) as string;
    portOrders.set(id, real.id);
    objects.push({ base: real.base, id, emperor: null, mods: [...kept,
      str(F.name, displayName(u.name) + U.PORT_ORDER_SUFFIX), int(F.goldCost, u.cost), int(F.lumberCost, 0), int(F.foodCost, 0),
      int(F.buildTime, U.PORT_ORDER_SECONDS), int(F.attacksEnabled, 0), str(F.abilities, ''), str(F.upgrades, ''), str(F.researches, '')] });
  }
  // Command card cells of the train / research buttons: without them a type keeps its stock base's
  // cell and types of the same base hide each other. Buildings with the most buttons first; each
  // button takes the first cell free in every building that shows it (test/emperor-mission.test.ts).
  const lastOf = (o: UnitObject, f: string): string => o.mods.filter((m) => m.field === f).map((m) => String(m.value)).at(-1) ?? '';
  const cell = new Map<string, number>(); // unit / upgrade id -> index into U.BUTTON_CELLS
  // (build menus too: the builders' and the MCV's lists of buildings)
  const cards = objects.filter((o) => o.emperor?.category === 'Building' || lastOf(o, F.builds))
    .map((o) => [...lastOf(o, F.trains).split(','), ...lastOf(o, F.researches).split(','), ...lastOf(o, F.builds).split(',')].filter(Boolean))
    .sort((a, b) => b.length - a.length);
  for (const card of cards) {
    const used = new Set(card.map((id) => cell.get(id)).filter((c) => c !== undefined));
    for (const id of card) {
      if (cell.has(id)) continue;
      const free = U.BUTTON_CELLS.findIndex((_, i) => !used.has(i));
      if (free < 0) throw new Error(`more than ${U.BUTTON_CELLS.length} buttons: ${card.join(',')}`);
      cell.set(id, free);
      used.add(free);
    }
  }
  const upgradeButtons: [string, [number, number]][] = [];
  for (const [id, c] of cell) {
    const [x, y] = U.BUTTON_CELLS[c] as readonly [number, number];
    const unit = objects.find((o) => o.id === id);
    if (unit) unit.mods.push(int(F.buttonX, x), int(F.buttonY, y));
    else upgradeButtons.push([id, [x, y]]);
  }
  return {
    objects, rawcode, ids, misc: combat.misc, icons: icons?.files ?? {}, portOrders,
    // the converted effects only when some are played (config EFFECT_PLAYED)
    models: Object.fromEntries([...Object.entries(models?.files ?? {}), ...(EFFECT_PLAYED.some(Boolean) ? Object.entries(effects?.set.files ?? {}) : [])]),
    effects: effectsOf(rules, rawcode, effects),
    effectRadius: effects?.set.radius ?? new Map(),
    w3u: writeObjects(objects.map(({ base, id, mods }) => ({ base, id, mods }))),
    w3a: writeObjects(abilities, true),
    upgrades,
    upgradeButtons,
    w3q: writeObjects(upgrades.map((u) => {
      const name = U.UPGRADE_NAME_PREFIX + displayName(u.building);
      const icon = icons?.icon.get(u.building);
      const [bx, by] = upgradeButtons.find(([id]) => id === u.id)?.[1] ?? U.BUTTON_CELLS[0] as readonly [number, number];
      // extended tooltip: the types that need the upgrade (else the stock one of the base shows)
      const unlocks = objects.filter((o) => o.emperor && lastOf(o, F.requires).split(',').includes(u.id)).map((o) => displayName((o.emperor as RulesObject).name));
      return { base: CUSTOM_ID.upgradeBase, id: u.id, mods: [
        int(G.buttonX, bx), int(G.buttonY, by),
        { ...str(G.name, name), level: 1 }, { ...str(G.tooltip, name), level: 1 },
        { ...str(G.tooltipExtended, U.UPGRADE_UNLOCKS_PREFIX + (unlocks.join(', ') || U.UPGRADE_UNLOCKS_NONE)), level: 1 },
        ...(icon ? [{ ...str(G.icon, icon), level: 1 }] : []),
        int(G.goldBase, u.cost), int(G.lumberBase, 0), int(G.timeBase, Math.max(1, u.seconds)), int(G.levels, 1),
      ] };
    }), true),
  };
}

export { buildUnitData, combatTable };
