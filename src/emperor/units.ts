// Emperor units/buildings (rules.ts) -> Warcraft III custom object data (war3map.w3u) on stock WC3
// base objects, with Emperor's own models (src/emperor/models.ts) and icons (icons.ts) when given,
// plus a neutral combat table (war3mapMisc.txt DamageBonus*): the warheads act at run time (damage.j).
//
// Scaling (Emperor -> WC3): HP /2, bullet damage /2, reload ticks /25 = seconds, range tiles *128,
// speed (game coords per tick) *40, view range tiles *128, build time ticks /25 = seconds.
// Power: Rules.txt balance is applied at run time by battle.ts (EmpPowerTick, the Game.exe rule).
// Veterancy: Rules.txt levels are applied at run time by mission.ts (EmpVetData / EmpOnKill).

import { writeObjects, idAllocator } from '../wc3/objects.ts';
import type { ObjectDef, ObjectMod } from '../wc3/objects.ts';
import type { Bullet, Rules, RulesObject, Turret } from './rules.ts';
import type { IconSet } from './icons.ts';
import type { ModelSet } from './models.ts';
import { HOUSE_CODES, HOUSE_BY_CODE, HOUSE_RACE } from '../config/houses.ts';
import type { Wc3Race } from '../config/houses.ts';
import { UNIT_FIELD as F, ABILITY_FIELD, UPGRADE_FIELD as G, ABILITY, UNIT, CUSTOM_ID } from '../config/wc3.ts';
import * as S from '../config/scale.ts';
import * as U from '../config/units.ts';
import { DEPLOY_BUTTON_ORDER as RT_DEPLOY_ORDER, PROJECTION_ORDER as RT_PROJECTION_ORDER, ADV_DROP_ORDER as RT_ADV_DROP_ORDER } from '../config/runtime.ts';
import { superweaponKind } from './superweapons.ts';
import type { EffectUse, EffectSet } from './effects.ts';
import { EFFECT_PLAYED, EFFECT_MAX_RADIUS, EFFECT_MIN_SCALE, MUZZLE_FALLBACK } from '../config/models.ts';
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
  /** reserve stack marker of the Arrakis hub */
  stackMarker: string;
  /** the APC's cargo hold (config APC) */
  apcCargo: string;
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

/** A refinery pad order: the dock type (Rules.txt Dockable) as a type its refinery trains for its
 * UpgradeCost and UpgradeBuildTime from UpgradeTechLevel; done, it fills a slot of the refinery (+ the
 * dock's Health) and brings its GetUnitWhenBuilt. */
export interface PadOrder {
  id: string;
  /** Emperor dock name */
  dock: string;
  /** WC3 id of the refinery that trains it (the dock's SecondaryBuilding of its house) */
  refinery: string;
  /** WC3 hit points the pad adds */
  health: number;
  techLevel: number;
  /** WC3 id of its GetUnitWhenBuilt, '' none */
  unit: string;
  /** UpgradeCost */
  cost: number;
  /** the order's training time (s), UpgradeBuildTime */
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
  /** WC3 type -> the attachment its muzzle flash goes to when not "weapon" (converted model without one) */
  muzzleAt: Map<string, string>;
  /** effect model path -> how far it reaches (src/emperor/effects.ts; shown at most config EFFECT_MAX_RADIUS) */
  effectRadius: Map<string, number>;
  /** starport order type -> the unit a frigate delivers for it (mission starport.j) */
  portOrders: Map<string, string>;
  /** refinery pads: orders a refinery trains (Game.exe: the dock type's upgrade, mission pads.j) */
  padOrders: PadOrder[];
  /** veteran types with a longer range (Rules.txt ExtraRange) and the morph abilities into them */
  vetRange: VetRangeType[];
  /** deployable types, their deployed copies, buttons and morphs */
  deploy: DeployType[];
  /** types that blow themselves up (Devastator, Infiltrator, EITS) and their buttons */
  detonators: Detonator[];
  /** ADV Fremen: the worm call button, the WormRider it becomes (Resource) */
  wormCallers: { type: string; button: string; rider: string }[];
  /** ADV carryalls (Rules.txt AdvancedCarryall): their pick and drop buttons; the types they can carry */
  advCarryalls: { type: string; pick: string; drop: string }[];
  carriable: string[];
  /** projectors: the projection button their deployed copy has, the replicas' lifespan (s) */
  projectors: { type: string; deployed: string; button: string; lifespan: number }[];
  /** NIAB tanks: the teleport button, seconds before the jump (deploy + Enter Portal) and after it
   * (Exit Portal + TeleportSleepTime) */
  teleporters: { type: string; button: string; before: number; after: number }[];
}

/** A type that blows itself up on its deploy command (Game.exe 1.09 classes 0x1c Devastator, 0x1b
 * Infiltrator, 9 EyeInTheSky; mission detonate.j): its button, the Resource bomb (damage, BlastRadius in
 * WC3 units, warhead), the wait before (Lifespan ticks, Infiltrator), how many bombs (EITS 10), the
 * reveal pulse (Infiltrator: its own BlastRadius tiles, Damage ticks) and the unit it leaves (EITS:
 * an ORSaboteur, hard-coded 0x62f254). */
export interface Detonator {
  type: string;
  button: string;
  kind: 'devastator' | 'infiltrator' | 'eits' | 'mine';
  /** an airborne mine (ORADP, AirborneMine; Game.exe 0x5665e0) goes off by itself at an enemy aircraft
   * within its bullet's MinRange (WC3 units; its rockets: `bombs`, Lifespan); 0 = by its button */
  trigger: number;
  damage: number;
  radius: number;
  warhead: string;
  delaySeconds: number;
  bombs: number;
  pulseRadius: number;
  pulseTicks: number;
  leaves: string;
}

/** A deployable type (Rules.txt DeployInf / Kobra), its deployed copy armed with the turret it fires
 * when deployed (weapon), the buttons (Channel) on the two forms, and the Chaos morphs into each form
 * (mission deploy.j). */
export interface DeployType {
  type: string;
  deployed: string;
  deploy: string;
  undeploy: string;
  toDeployed: string;
  toNormal: string;
  weapon: Turret;
  /** a form switched by the game itself, not by a button (Game.exe class 0x12, the ADV Sardaukar's
   * knife): enemy infantry within this range (WC3 units) switches to the copy; 0 for a deploy */
  auto: number;
  /** seconds a deploy / an undeploy take: the model's animations (models.ts deploy), 0 without */
  deploySeconds: number;
  undeploySeconds: number;
}

/** A unit type's copy with ExtraRange percent more range, and the Chaos ability that turns a unit of
 * the type into it (mission veterancy.j). */
export interface VetRangeType {
  type: string;
  percent: number;
  veteran: string;
  morph: string;
}

export interface CombatTable {
  misc: string;
}

/** war3mapMisc.txt: a neutral DamageBonus table (config WC3_ATTACK_TYPES); the warheads act at run
 * time through each type's weapon (weaponOf, mission.ts EmpDmgTab, damage.j). */
function combatTable(): CombatTable {
  const misc = ['[Misc]'];
  for (const type of U.WC3_ATTACK_TYPES) {
    const key = (type[0] as string).toUpperCase() + type.slice(1);
    misc.push(`DamageBonus${key}=${U.WC3_ARMOUR_ORDER.map(() => U.NEUTRAL_DAMAGE_BONUS.toFixed(2)).join(',')}`);
  }
  return { misc: misc.join('\r\n') + '\r\n' };
}

/** The weapon of an Emperor object in WC3: its first turret whose bullet does damage (WC3 units here
 * have one attack) and that fires in the given state of a deployable unit (TurretDisableIfUnit*). */
function weaponOf(o: RulesObject, deployed = false): Turret | undefined {
  return o.turrets.find((t) => t.bullet && t.bullet.damage > 0 && !(deployed ? t.disableIfDeployed : t.disableIfUndeployed));
}

/** Rules.txt DeployInf (ATKindjal, ORMortar) or Kobra (ORKobra): Game.exe 1.09 gives them their own
 * unit classes (0x10 / 0xb, unit parser 0x527d81 / 0x527d3d) and the AI's "Deployable" set
 * (objectsets.txt). The flags of IMSardaukar, ATGeneral, DukeAchillus, HKEngineer and WormRider do
 * nothing there (their IsDeployed is always false, 0x568350).
 * IMADVSardaukar / IMGeneral switch to the knife by themselves (knifeRange); IXProjector (class 0x17)
 * deploys as these do (its projection button: projectors). The ADV Fremen's deploy calls a worm
 * (wormCallers, mission wormride.j) and the NIAB's teleports (teleporters, mission teleport.j): it is
 * paused all through, so its "deployed" gun state does not show. */
function deployable(o: RulesObject): boolean {
  return o.category === 'Unit' && ['DeployInf', 'Kobra', 'Projector'].some((k) => /^true$/i.test((o.raw[k] ?? '').trim()));
}

/** Rules.txt AdvancedSardaukar (IMADVSardaukar, IMGeneral; Game.exe class 0x12): "deployed" while its
 * target is infantry within the unit's own MaxRange (0x567190), which turns the gun off and the knife
 * on: that range in WC3 units, else 0. */
function knifeRange(o: RulesObject): number {
  return o.category === 'Unit' && /^true$/i.test((o.raw.AdvancedSardaukar ?? '').trim()) ? Math.max(1, parseFloat(o.raw.MaxRange ?? '') || 0) * S.RANGE_PER_TILE : 0;
}

const WEAPON_FIELDS: readonly string[] = [F.attacksEnabled, F.damageBase, F.damageDice, F.damageSides, F.range, F.acquireRange, F.cooldown, F.attackType, F.targets];

/** The attack fields of a unit armed with turret w. */
function weaponMods(o: RulesObject, w: Turret, b: Bullet): ObjectMod[] {
  return [
    int(F.attacksEnabled, 1),
    int(F.damageBase, Math.max(1, b.damage / S.DAMAGE_DIVISOR)), int(F.damageDice, 1), int(F.damageSides, 1),
    int(F.range, Math.max(1, b.range) * S.RANGE_PER_TILE), unreal(F.acquireRange, Math.max(b.range, o.viewRange) * S.RANGE_PER_TILE),
    unreal(F.cooldown, Math.max(S.MIN_ATTACK_COOLDOWN, w.reload / S.TICKS_PER_SECOND)),
    str(F.attackType, U.DEFAULT_ATTACK_TYPE),
    // both flags (bug fixed 2026-10-09: AntiAircraft alone made a weapon hit aircraft only; test
    // "AntiAircraft adds air targets")
    str(F.targets, [...(b.antiAircraft ? [U.TARGETS_AIR] : []), ...(b.antiGround || !b.antiAircraft ? [U.TARGETS_GROUND] : [])].join(',')),
  ];
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
  const combat = combatTable();

  const rawcode = new Map<string, string>(); // Emperor name -> WC3 id
  const objects: UnitObject[] = [];
  const all = [...rules.objects.values()];
  for (const o of all) rawcode.set(o.name, nextId(CUSTOM_ID.unitPrefix));
  const idOf = (name: string): string => rawcode.get(name) as string;
  // building upgrades: one custom upgrade per building with an UpgradeCost
  const dockable = (o: RulesObject): boolean => /^true$/i.test((o.raw.Dockable ?? '').trim());
  const upgrades: UpgradeInfo[] = all.filter((o) => o.category === 'Building' && o.upgradeCost > 0 && !dockable(o)).map((o) => ({
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
    // only infantry fits an APC (config APC)
    if (o.category === 'Unit') mods.push(int(F.cargoSize, o.infantry ? U.APC.infantrySize : U.APC.otherSize));
    // Emperor's own sidebar icon (src/emperor/icons.ts)
    const icon = icons?.icon.get(o.name);
    if (icon) mods.push(str(F.icon, icon));
    // Emperor's own model (src/emperor/models.ts)
    const model = models?.model.get(o.name);
    if (model) mods.push(str(F.model, model));
    const weapon = weaponOf(o);
    if (weapon && weapon.bullet) {
      mods.push(...weaponMods(o, weapon, weapon.bullet));
    } else if (!charge && (o.category !== 'Building' || /Wall/i.test(o.name))) {
      mods.push(int(F.attacksEnabled, 0));
    }
    objects.push({ base, id: idOf(o.name), mods, emperor: o });
  }

  // ---- economy / construction objects (ids fixed so the runtime can refer to them) ----
  const HARVEST_ABILITY = CUSTOM_ID.harvestAbility; // Ahar with Emperor capacity
  // Territory marker of the Arrakis hub map: invulnerable, unarmed, house-coloured tower.
  const ids: UnitIds = { harvestAbility: HARVEST_ABILITY, spiceField: CUSTOM_ID.spiceField, spiceMound: CUSTOM_ID.spiceMound, builders: {}, defenceBuilders: {}, allyBuilders: {}, mcvBuilders: {}, territoryMarker: CUSTOM_ID.territoryMarker, stackMarker: CUSTOM_ID.stackMarker, apcCargo: CUSTOM_ID.apcCargo };
  const abilities: ObjectDef[] = [{ base: ABILITY.harvest, id: HARVEST_ABILITY, mods: [
    { field: ABILITY_FIELD.harvestGold, type: 'int', value: U.HARVEST_CAPACITY, level: 1, column: 3 },
    { field: ABILITY_FIELD.harvestLumber, type: 'int', value: 0, level: 1, column: 2 },
    { field: ABILITY_FIELD.name, type: 'string', value: U.HARVEST_ABILITY_NAME },
  ] }, { base: ABILITY.cargoHold, id: CUSTOM_ID.apcCargo, mods: [
    { field: ABILITY_FIELD.cargoCapacity, type: 'int', value: U.APC.capacity, level: 1, column: 1 },
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

  objects.push({ base: UNIT.fallback, id: ids.stackMarker, mods: [str(F.name, U.STACK_MARKER_NAME), str(F.abilities, ABILITY.invulnerable), int(F.attacksEnabled, 0),
    real(F.scale, U.STACK_MARKER_SCALE), real(F.selectionScale, U.STACK_MARKER_SCALE), str(F.upgrades, ''), str(F.researches, '')], emperor: null });
  objects.push({ base: UNIT.guardTower, id: ids.territoryMarker, mods: [str(F.name, U.TERRITORY_MARKER_NAME), str(F.abilities, ABILITY.invulnerable), int(F.attacksEnabled, 0),
    real(F.scale, U.TERRITORY_MARKER_SCALE), real(F.selectionScale, U.TERRITORY_MARKER_SCALE), str(F.upgrades, ''), str(F.researches, '')], emperor: null });

  const houseOf = (o: RulesObject): string | null => (/^(AT|HK|OR)/.exec(o.name) || [])[1] || null;
  // Starport orders: one type per Starportable unit, which a starport trains in PORT_ORDER_SECONDS
  // (Emperor: no build time, a CHOAM frigate brings the order after FrigateCountdown; mission
  // starport.j). The unit keeps its own type, cost and BuildTime at the factory.
  const portable = all.filter((u) => u.category === 'Unit' && u.cost > 0 && /^true$/i.test((u.raw.Starportable ?? '').trim()));
  const orderOf = new Map(portable.map((u) => [u.name, nextId(CUSTOM_ID.unitPrefix)]));
  const ownVariant = (list: string[], h: string): string => list.find((n) => n.startsWith(h)) || (list[0] as string);
  // refinery pads: the docks (Rules.txt Dockable) and the refinery of their house that trains each
  const docks = all.filter((o) => o.category === 'Building' && dockable(o) && o.upgradeCost > 0 && houseOf(o))
    .map((d) => ({ d, id: nextId(CUSTOM_ID.unitPrefix), refinery: ownVariant(d.secondaryBuilding, houseOf(d) as string) }))
    .filter((x) => x.refinery && rawcode.has(x.refinery));
  const houseBuildings = (h: string): RulesObject[] => all.filter((b) => b.category === 'Building' && b.cost > 0 && houseOf(b) === h && /ConYard/.test(b.primaryBuilding.join(',')));

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
      // at run time and each side has a stock of them (mission starport.j).
      const sells = /^true$/i.test((o.raw.Starport ?? '').trim())
        ? portable.filter((u) => u.house === o.house || (!u.house && !houseOf(u)))
        : [];
      const trains = [...new Set([
        ...all.filter((u) => u.category === 'Unit' && (u.cost > 0 || superweaponKind(u)) && u.primaryBuilding.includes(o.name)).map((u) => rawcode.get(u.name)),
        ...sells.map((u) => orderOf.get(u.name)),
        ...docks.filter((x) => x.refinery === o.name).map((x) => x.id),
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
    } else if (/^true$/i.test((o.raw.APC ?? '').trim())) {
      // APC: carries infantry (config APC, mission apc.j)
      obj.mods.push(str(F.abilities, [ids.apcCargo, ABILITY.load, ABILITY.unload].join(',')));
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
  // the order types: the unit's look, its Rules.txt Cost, unarmed, PORT_ORDER_SECONDS, and no
  // requirements: Game.exe offers a starport type by house and DisableIfNoSpiceOnMap only, never
  // asking for buildings or the factory upgrade (tab check 0x53e4f0; test/emperor-mission.test.ts)
  const portOrders = new Map<string, string>();
  for (const u of portable) {
    const real = objects.find((x) => x.emperor === u) as UnitObject;
    const keep = [F.icon, F.model, F.scale, F.selectionScale, F.race];
    const kept = keep.map((f) => real.mods.filter((m) => m.field === f).at(-1)).filter((m): m is ObjectMod => Boolean(m));
    const id = orderOf.get(u.name) as string;
    portOrders.set(id, real.id);
    objects.push({ base: real.base, id, emperor: null, mods: [...kept,
      str(F.name, displayName(u.name) + U.PORT_ORDER_SUFFIX), int(F.goldCost, u.cost), int(F.lumberCost, 0), int(F.foodCost, 0),
      int(F.buildTime, U.PORT_ORDER_SECONDS), int(F.attacksEnabled, 0), str(F.abilities, ''), str(F.upgrades, ''), str(F.researches, '')] });
  }
  // the pad orders: the dock's icon, UpgradeCost, UpgradeBuildTime, unarmed (mission pads.j)
  const padOrders: PadOrder[] = docks.map(({ d, id, refinery }) => {
    const dockObj = objects.find((x) => x.emperor === d);
    const icon = dockObj?.mods.filter((m) => m.field === F.icon).at(-1);
    objects.push({ base: UNIT.peasant, id, emperor: null, mods: [...(icon ? [icon] : []),
      str(F.name, displayName(d.name)), int(F.goldCost, d.upgradeCost), int(F.lumberCost, 0), int(F.foodCost, 0),
      int(F.buildTime, Math.max(1, (d.upgradeBuildTime || d.buildTime || S.DEFAULT_BUILD_TICKS) / S.TICKS_PER_SECOND)),
      int(F.attacksEnabled, 0), str(F.abilities, ''), str(F.upgrades, ''), str(F.researches, '')] });
    const unit = d.raw.GetUnitWhenBuilt ? rawcode.get(d.raw.GetUnitWhenBuilt.split('//')[0]?.trim() ?? '') ?? '' : '';
    return { id, dock: d.name, refinery: idOf(refinery), health: Math.max(S.MIN_HP, d.health / S.HP_DIVISOR), techLevel: d.upgradeTechLevel, unit, cost: d.upgradeCost,
      seconds: Math.max(1, (d.upgradeBuildTime || d.buildTime || S.DEFAULT_BUILD_TICKS) / S.TICKS_PER_SECOND) };
  });
  // Veteran types (Rules.txt ExtraRange %): 1.31.1 cannot lengthen one unit's range (the weapon range
  // setter changes nothing, src/smoke/build-range-probe.ts), so a level with ExtraRange turns the
  // unit into a copy of its type with the longer range through a Chaos ability; the unit stays the
  // same one (mission veterancy.j EmpVetApply / EmpVetRestore, runtime EmpType).
  const vetRange: VetRangeType[] = [];
  // (the copies go into objects: walk the Emperor units taken before)
  for (const obj of objects.filter((x) => x.emperor?.category === 'Unit')) {
    const o = obj.emperor as RulesObject;
    const last = (f: string): ObjectMod | undefined => obj.mods.filter((m) => m.field === f).at(-1);
    const range = last(F.range);
    if (!range) continue;
    for (const percent of new Set(o.veterancy.map((l) => l.extraRange).filter((p) => p > 0))) {
      const veteran = nextId(CUSTOM_ID.unitPrefix);
      const morph = nextId(CUSTOM_ID.vetMorphPrefix);
      const longer = Math.round((Number(range.value) * (100 + percent)) / 100);
      objects.push({ base: obj.base, id: veteran, emperor: null, mods: [
        ...obj.mods.filter((m) => m.field !== F.range && m.field !== F.acquireRange),
        int(F.range, longer), unreal(F.acquireRange, Math.max(longer, Number(last(F.acquireRange)?.value ?? 0))),
      ] });
      abilities.push({ base: ABILITY.chaos, id: morph, mods: [
        { field: ABILITY_FIELD.requires, type: 'string', value: '' },
        { field: ABILITY_FIELD.newUnitType, type: 'string', value: veteran, level: 1 },
      ] });
      vetRange.push({ type: obj.id, percent, veteran, morph });
    }
  }
  // Deployable units: a copy of the type armed with the turret it fires when deployed, standing
  // still; a Channel button on each form ("deploy" / "undeploy"), and the Chaos morphs into the other
  // form that the button's cast adds (mission deploy.j; Chaos keeps the unit, veterancy.j)
  const deploy: DeployType[] = [];
  const withAbility = (mods: ObjectMod[], ability: string): ObjectMod[] => {
    const abil = mods.filter((m) => m.field === F.abilities).map((m) => String(m.value)).at(-1) ?? '';
    return [...mods.filter((m) => m.field !== F.abilities), str(F.abilities, [...abil.split(',').filter(Boolean), ability].join(','))];
  };
  const channelButton = (id: string, name: string, tip: string, icon: string | undefined): ObjectDef => ({ base: ABILITY.channel, id, mods: [
    { field: ABILITY_FIELD.name, type: 'string', value: name },
    { field: ABILITY_FIELD.hero, type: 'int', value: 0 }, { field: ABILITY_FIELD.levels, type: 'int', value: 1 },
    { field: ABILITY_FIELD.requires, type: 'string', value: '' },
    { field: ABILITY_FIELD.tooltip, type: 'string', value: name, level: 1 },
    { field: ABILITY_FIELD.tooltipExtended, type: 'string', value: tip, level: 1 },
    { field: ABILITY_FIELD.buttonX, type: 'int', value: U.DEPLOY.button[0] }, { field: ABILITY_FIELD.buttonY, type: 'int', value: U.DEPLOY.button[1] },
    { field: ABILITY_FIELD.channelFollowThrough, type: 'unreal', value: 0, level: 1, column: 1 },
    { field: ABILITY_FIELD.channelTarget, type: 'int', value: 0, level: 1, column: 2 },
    { field: ABILITY_FIELD.channelOptions, type: 'int', value: 1, level: 1, column: 3 },
    { field: ABILITY_FIELD.channelArtDuration, type: 'unreal', value: 0, level: 1, column: 4 },
    { field: ABILITY_FIELD.channelDisableOthers, type: 'int', value: 0, level: 1, column: 5 },
    { field: ABILITY_FIELD.channelOrder, type: 'string', value: RT_DEPLOY_ORDER, level: 1, column: 6 },
    { field: ABILITY_FIELD.cooldown, type: 'unreal', value: 0, level: 1 }, { field: ABILITY_FIELD.castTime, type: 'unreal', value: 0, level: 1 },
    ...(icon ? [{ field: ABILITY_FIELD.icon, type: 'string' as const, value: icon }] : []),
  ] });
  const morph = (id: string, into: string): ObjectDef => ({ base: ABILITY.chaos, id, mods: [
    { field: ABILITY_FIELD.requires, type: 'string', value: '' },
    { field: ABILITY_FIELD.newUnitType, type: 'string', value: into, level: 1 },
  ] });
  // (the ADV Sardaukar's knife form: no buttons, it walks; a periodic check switches it, deploy.j)
  for (const obj of objects.filter((x) => x.emperor && (deployable(x.emperor) || knifeRange(x.emperor) > 0))) {
    const o = obj.emperor as RulesObject;
    const w = weaponOf(o, true);
    if (!w?.bullet) continue;
    const auto = knifeRange(o);
    const d: DeployType = { type: obj.id, deployed: nextId(CUSTOM_ID.unitPrefix), deploy: auto ? '' : nextId(CUSTOM_ID.deployPrefix), undeploy: auto ? '' : nextId(CUSTOM_ID.deployPrefix),
      toDeployed: nextId(CUSTOM_ID.deployMorphPrefix), toNormal: nextId(CUSTOM_ID.deployMorphPrefix), weapon: w, auto,
      deploySeconds: auto ? 0 : models?.deploy.get(o.name)?.[0] ?? 0, undeploySeconds: auto ? 0 : models?.deploy.get(o.name)?.[1] ?? 0 };
    const mods = [
      ...obj.mods.filter((m) => !WEAPON_FIELDS.includes(m.field) && (auto > 0 || m.field !== F.moveSpeed)),
      ...weaponMods(o, w, w.bullet), ...(auto ? [] : [int(F.moveSpeed, U.DEPLOY.moveSpeed), str(F.animationNames, U.DEPLOY.animation)]),
    ];
    objects.push({ base: obj.base, id: d.deployed, emperor: null, mods: auto ? mods : withAbility(mods, d.undeploy) });
    if (!auto) {
      obj.mods = withAbility(obj.mods, d.deploy);
      const icon = obj.mods.filter((m) => m.field === F.icon).map((m) => String(m.value)).at(-1);
      abilities.push(channelButton(d.deploy, U.DEPLOY.deployName, U.DEPLOY.deployTooltip, icon), channelButton(d.undeploy, U.DEPLOY.undeployName, U.DEPLOY.undeployTooltip, icon));
    }
    abilities.push(morph(d.toDeployed, d.deployed), morph(d.toNormal, d.type));
    deploy.push(d);
  }
  // Detonating types: a Channel button; the bomb is their Resource bullet (mission detonate.j)
  const detonators: Detonator[] = [];
  const flag = (o: RulesObject, k: string): boolean => /^true$/i.test((o.raw[k] ?? '').split('//')[0]?.trim() ?? '');
  const raw = (name: string): Record<string, string> => Object.fromEntries((rules.sections.get(name.toLowerCase())?.entries ?? []).map(([k, v]) => [k, v.split('//')[0]?.trim() ?? '']));
  for (const obj of objects.filter((x) => x.emperor && ['Devastator', 'Infiltrator', 'EyeInTheSky', 'AirborneMine'].some((k) => flag(x.emperor as RulesObject, k)))) {
    const o = obj.emperor as RulesObject;
    const kind = flag(o, 'Devastator') ? 'devastator' : flag(o, 'Infiltrator') ? 'infiltrator' : flag(o, 'AirborneMine') ? 'mine' : 'eits';
    const bomb = raw((o.raw.Resource ?? '').split(',')[0]?.split('//')[0]?.trim() ?? '');
    if (!bomb.Damage) continue;
    if (kind === 'mine') {
      detonators.push({ type: obj.id, button: '', kind, trigger: (Number(bomb.MinRange) || 0) * S.WC3_UNITS_PER_TILE,
        damage: Math.max(1, Number(bomb.Damage) / S.DAMAGE_DIVISOR), radius: 0, warhead: bomb.Warhead ?? '', delaySeconds: 0,
        bombs: Number(o.raw.Lifespan) || 1, pulseRadius: 0, pulseTicks: 0, leaves: '' });
      continue;
    }
    const button = nextId(CUSTOM_ID.deployPrefix);
    const icon = obj.mods.filter((m) => m.field === F.icon).map((m) => String(m.value)).at(-1);
    abilities.push({ ...channelButton(button, U.DETONATE.name, U.DETONATE.tooltip, icon), mods: [...channelButton(button, U.DETONATE.name, U.DETONATE.tooltip, icon).mods.filter((m) => m.field !== ABILITY_FIELD.buttonX && m.field !== ABILITY_FIELD.buttonY),
      { field: ABILITY_FIELD.buttonX, type: 'int', value: U.DETONATE.button[0] }, { field: ABILITY_FIELD.buttonY, type: 'int', value: U.DETONATE.button[1] }] });
    obj.mods = withAbility(obj.mods, button);
    detonators.push({
      type: obj.id, button, kind, trigger: 0,
      damage: Math.max(1, Number(bomb.Damage) / S.DAMAGE_DIVISOR),
      radius: (Number(bomb.BlastRadius) || 0) / S.EMPEROR_TILE * S.WC3_UNITS_PER_TILE,
      warhead: bomb.Warhead ?? '',
      delaySeconds: kind === 'infiltrator' ? (Number(o.raw.Lifespan) || 0) / S.TICKS_PER_SECOND : 0,
      bombs: kind === 'eits' ? U.EITS_BOMBS : 1,
      pulseRadius: kind === 'infiltrator' ? (Number(o.raw.BlastRadius) || 0) * S.WC3_UNITS_PER_TILE : 0,
      pulseTicks: kind === 'infiltrator' ? Number(o.raw.Damage) || 0 : 0,
      leaves: kind === 'eits' ? rawcode.get('ORSaboteur') ?? '' : '',
    });
  }
  // ADV Fremen (Rules.txt AdvancedFremen): a worm call button; it becomes its Resource (mission wormride.j)
  const wormCallers: { type: string; button: string; rider: string }[] = [];
  for (const obj of objects.filter((x) => x.emperor && flag(x.emperor as RulesObject, 'AdvancedFremen'))) {
    const o = obj.emperor as RulesObject;
    const rider = rawcode.get((o.raw.Resource ?? '').split(',')[0]?.split('//')[0]?.trim() ?? '');
    if (!rider) continue;
    const button = nextId(CUSTOM_ID.deployPrefix);
    const icon = obj.mods.filter((m) => m.field === F.icon).map((m) => String(m.value)).at(-1);
    const b = channelButton(button, U.WORM_CALL.name, U.WORM_CALL.tooltip, icon);
    abilities.push({ ...b, mods: [...b.mods.filter((m) => m.field !== ABILITY_FIELD.buttonX && m.field !== ABILITY_FIELD.buttonY),
      { field: ABILITY_FIELD.buttonX, type: 'int', value: U.WORM_CALL.button[0] }, { field: ABILITY_FIELD.buttonY, type: 'int', value: U.WORM_CALL.button[1] }] });
    obj.mods = withAbility(obj.mods, button);
    wormCallers.push({ type: obj.id, button, rider });
  }
  // Projectors (Rules.txt Projector, deployable above): the deployed copy's unit-target projection
  // button (mission projector.j)
  const projectors: { type: string; deployed: string; button: string; lifespan: number }[] = [];
  for (const d of deploy) {
    const obj = objects.find((x) => x.id === d.type);
    const o = obj?.emperor;
    if (!o || !flag(o, 'Projector')) continue;
    const copy = objects.find((x) => x.id === d.deployed) as UnitObject;
    const button = nextId(CUSTOM_ID.deployPrefix);
    const icon = obj.mods.filter((m) => m.field === F.icon).map((m) => String(m.value)).at(-1);
    const b = channelButton(button, U.PROJECTION.name, U.PROJECTION.tooltip, icon);
    abilities.push({ ...b, mods: [...b.mods.filter((m) => !([ABILITY_FIELD.buttonX, ABILITY_FIELD.buttonY, ABILITY_FIELD.channelTarget, ABILITY_FIELD.channelOrder] as string[]).includes(m.field)),
      { field: ABILITY_FIELD.buttonX, type: 'int', value: U.PROJECTION.button[0] }, { field: ABILITY_FIELD.buttonY, type: 'int', value: U.PROJECTION.button[1] },
      // its own order: the undeploy button beside it on the deployed copy has "channel"
      { field: ABILITY_FIELD.channelOrder, type: 'string', value: RT_PROJECTION_ORDER, level: 1, column: 6 },
      // a unit target (ChannelAbilityPreset.wurst Targettype UNIT = 1)
      { field: ABILITY_FIELD.channelTarget, type: 'int', value: 1, level: 1, column: 2 },
      { field: ABILITY_FIELD.castRange, type: 'unreal', value: U.PROJECTION.castRange, level: 1 }] });
    copy.mods = withAbility(copy.mods, button);
    projectors.push({ type: d.type, deployed: d.deployed, button, lifespan: (Number(o.raw.Lifespan) || 0) / S.TICKS_PER_SECOND });
  }
  // ADV carryalls (Rules.txt AdvancedCarryall; Game.exe class 8): a unit-target pick button and a
  // point-target drop button (battle carryall.j). Carriable (0x55ead0): a unit not infantry, not flying,
  // not a worm or a worm rider.
  const advCarryalls: { type: string; pick: string; drop: string }[] = [];
  for (const obj of objects.filter((x) => x.emperor && flag(x.emperor as RulesObject, 'AdvancedCarryall'))) {
    const pick = nextId(CUSTOM_ID.deployPrefix);
    const drop = nextId(CUSTOM_ID.deployPrefix);
    const icon = obj.mods.filter((m) => m.field === F.icon).map((m) => String(m.value)).at(-1);
    const own = (id: string, name: string, tip: string, target: number, order: string, range: number, cell: readonly [number, number]): ObjectDef => {
      const b = channelButton(id, name, tip, icon);
      return { ...b, mods: [...b.mods.filter((m) => !([ABILITY_FIELD.buttonX, ABILITY_FIELD.buttonY, ABILITY_FIELD.channelTarget, ABILITY_FIELD.channelOrder] as string[]).includes(m.field)),
        { field: ABILITY_FIELD.buttonX, type: 'int', value: cell[0] }, { field: ABILITY_FIELD.buttonY, type: 'int', value: cell[1] },
        { field: ABILITY_FIELD.channelTarget, type: 'int', value: target, level: 1, column: 2 },
        { field: ABILITY_FIELD.channelOrder, type: 'string', value: order, level: 1, column: 6 },
        { field: ABILITY_FIELD.castRange, type: 'unreal', value: range, level: 1 }] };
    };
    // Targettype UNIT = 1, POINT = 2 (ChannelAbilityPreset.wurst)
    abilities.push(own(pick, U.ADV_CARRY.pickName, U.ADV_CARRY.pickTooltip, 1, RT_DEPLOY_ORDER, U.ADV_CARRY.pickRange, U.ADV_CARRY.pickButton),
      own(drop, U.ADV_CARRY.dropName, U.ADV_CARRY.dropTooltip, 2, RT_ADV_DROP_ORDER, U.ADV_CARRY.dropRange, U.ADV_CARRY.dropButton));
    obj.mods = withAbility(withAbility(obj.mods, pick), drop);
    advCarryalls.push({ type: obj.id, pick, drop });
  }
  const carriable = objects.filter((x) => x.emperor?.category === 'Unit' && !x.emperor.infantry && !x.emperor.canFly
    && !['WormRider', 'Worm', 'BigWorm'].some((k) => flag(x.emperor as RulesObject, k)) && !/worm/i.test(x.emperor.name)).map((x) => x.id);
  // NIAB tanks (Rules.txt NiabTank): a point-target teleport button (mission teleport.j)
  const teleporters: { type: string; button: string; before: number; after: number }[] = [];
  for (const obj of objects.filter((x) => x.emperor && flag(x.emperor as RulesObject, 'NiabTank'))) {
    const o = obj.emperor as RulesObject;
    const button = nextId(CUSTOM_ID.deployPrefix);
    const icon = obj.mods.filter((m) => m.field === F.icon).map((m) => String(m.value)).at(-1);
    const b = channelButton(button, U.TELEPORT.name, U.TELEPORT.tooltip, icon);
    abilities.push({ ...b, mods: [...b.mods.filter((m) => !([ABILITY_FIELD.buttonX, ABILITY_FIELD.buttonY, ABILITY_FIELD.channelTarget, ABILITY_FIELD.channelOptions] as string[]).includes(m.field)),
      { field: ABILITY_FIELD.buttonX, type: 'int', value: U.TELEPORT.button[0] }, { field: ABILITY_FIELD.buttonY, type: 'int', value: U.TELEPORT.button[1] },
      // a point target (ChannelAbilityPreset.wurst Targettype POINT = 2), visible with a targeting image (1 | 2)
      { field: ABILITY_FIELD.channelTarget, type: 'int', value: 2, level: 1, column: 2 },
      { field: ABILITY_FIELD.channelOptions, type: 'int', value: 3, level: 1, column: 3 },
      { field: ABILITY_FIELD.castRange, type: 'unreal', value: U.TELEPORT.castRange, level: 1 }] });
    obj.mods = withAbility(obj.mods, button);
    const deploy = models?.deploy.get(o.name)?.[0] ?? 0;
    const [enter, exit] = models?.teleport.get(o.name) ?? [0, 0];
    teleporters.push({ type: obj.id, button, before: deploy + enter, after: exit + (Number(o.raw.TeleportSleepTime) || 0) / S.TICKS_PER_SECOND });
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
    objects, rawcode, ids, misc: combat.misc, icons: icons?.files ?? {}, portOrders, padOrders, vetRange, deploy, detonators, wormCallers, teleporters, projectors, advCarryalls, carriable,
    // the converted effects only when some are played (config EFFECT_PLAYED)
    models: Object.fromEntries([...Object.entries(models?.files ?? {}), ...(EFFECT_PLAYED.some(Boolean) ? Object.entries(effects?.set.files ?? {}) : [])]),
    effects: effectsOf(rules, rawcode, effects),
    effectRadius: effects?.set.radius ?? new Map(),
    muzzleAt: new Map([...rules.objects.values()].filter((o) => models?.model.has(o.name) && !models.weapon.has(o.name)).map((o) => [rawcode.get(o.name) as string, MUZZLE_FALLBACK])),
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

export { buildUnitData, combatTable, weaponOf, deployable };
