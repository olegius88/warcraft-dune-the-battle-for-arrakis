// How Emperor units/buildings become WC3 objects: armour and attack classes, stand-in models,
// helper objects (harvesting, spice fields, builders, hub markers).

import type { RulesObject } from '../emperor/rules.ts';
import type { Wc3Race } from './houses.ts';

/** Emperor armour -> WC3 defense type. */
export const ARMOUR_MAP: Readonly<Partial<Record<string, string>>> = {
  None: 'none', BPV: 'small', Light: 'small', Medium: 'medium', Heavy: 'large', Concrete: 'fort', Walls: 'fort',
  Building: 'fort', CY: 'fort', Harvester: 'normal', Invulnerable: 'divine', Aircraft: 'hero',
};
/** WC3 defense type of an Emperor armour missing from ARMOUR_MAP. */
export const DEFAULT_DEFENSE_TYPE = 'normal';
/** WC3 defense types in war3mapMisc.txt DamageBonus column order. */
export const WC3_ARMOUR_ORDER: readonly string[] = ['small', 'medium', 'large', 'fort', 'normal', 'hero', 'divine', 'none'];
/** WC3 attack types the Emperor warheads are clustered into: only types without side effects
 * (magic/spells interact with spell immunity). k-means k = this length. */
export const WC3_ATTACK_TYPES: readonly string[] = ['normal', 'pierce', 'siege', 'chaos', 'hero'];
export const DEFAULT_ATTACK_TYPE = 'normal';
/** k-means iterations of the warhead clustering. */
export const COMBAT_KMEANS_ITERATIONS = 50;
/** Damage % used for an armour class a warhead says nothing about. */
export const DEFAULT_DAMAGE_PERCENT = 100;

/** Weapon targets: anti-aircraft weapons hit air only. */
export const TARGETS_AIR = 'air';
export const TARGETS_GROUND = 'ground,structure,debris,item,ward';

/** Stand-in unit model: first matching rule wins; the last rule matches everything. */
export const UNIT_MODELS: ReadonlyArray<[(o: RulesObject) => boolean, string, number]> = [
  [(o) => /worm/i.test(o.name), 'ucry', 2.5],
  [(o) => /Carryall|EITS|DropShip|Frigate|Scavenger|INFlyer/i.test(o.name), 'nzep', 1.0],
  [(o) => o.canFly || /Orni|Gunship|ADP|NIAP/i.test(o.name), 'hgyr', 1.1],
  [(o) => /^Harvester$|FakeHarvester/.test(o.name), 'ngir', 1.2],
  [(o) => /^MCV$/.test(o.name), 'umtw', 1.3],
  [(o) => /Yak/i.test(o.name), 'okod', 0.9],
  [(o) => /Civ|Slave|Scientist|Advisor/i.test(o.name), 'nvil', 1.0],
  [(o) => /Engineer|Scout/i.test(o.name), 'hpea', 1.0],
  [(o) => /Saboteur|Infiltrator|Fremen|WormRider/i.test(o.name), 'nass', 1.0],
  [(o) => /Contaminator/i.test(o.name), 'nzom', 1.0],
  [(o) => /General|Duke/i.test(o.name), 'hcth', 1.1],
  [(o) => /Mortar/i.test(o.name), 'hmtm', 1.0],
  [(o) => /Trooper|Flamer|AATrooper|Chemical/i.test(o.name), 'ohun', 1.0],
  [(o) => o.infantry, 'hrif', 1.0],
  [(o) => /InkVine|Minotaurus|Kobra|Missile|Projector/i.test(o.name), 'ocat', 1.1],
  [(o) => o.armour === 'Heavy', 'hmtt', 1.2],
  [(o) => o.armour === 'Medium', 'hmtt', 0.9],
  [() => true, 'ncgb', 1.3],
];

/** Stand-in building model per WC3 race: first matching name rule wins; the last matches all. */
export const BUILDING_MODELS: ReadonlyArray<[RegExp, Readonly<Record<Wc3Race | 'neutral', string>>, number]> = [
  [/ConYard/i, { human: 'htow', orc: 'ogre', undead: 'unpl', neutral: 'htow' }, 1.0],
  [/Windtrap/i, { human: 'hhou', orc: 'otrb', undead: 'uzig', neutral: 'hhou' }, 1.0],
  [/Barracks/i, { human: 'hbar', orc: 'obar', undead: 'usep', neutral: 'hbar' }, 1.0],
  [/Factory/i, { human: 'harm', orc: 'obea', undead: 'uslh', neutral: 'harm' }, 1.0],
  [/Refinery/i, { human: 'hlum', orc: 'ofor', undead: 'ugrv', neutral: 'hlum' }, 1.0],
  [/Outpost/i, { human: 'hars', orc: 'osld', undead: 'utod', neutral: 'hars' }, 0.9],
  [/Starport|Hanger|Helipad/i, { human: 'hgra', orc: 'ovln', undead: 'ubon', neutral: 'hgra' }, 1.0],
  [/Palace/i, { human: 'hcas', orc: 'ofrt', undead: 'unp2', neutral: 'hcas' }, 1.0],
  [/Rocket|Pop|Flame|Turret|Pillbox|Gun/i, { human: 'hgtw', orc: 'owtw', undead: 'uzg1', neutral: 'hgtw' }, 1.0],
  [/Wall/i, { human: 'hwtw', orc: 'hwtw', undead: 'hwtw', neutral: 'hwtw' }, 0.5],
  [/.*/, { human: 'hvlt', orc: 'ovln', undead: 'utom', neutral: 'nmrk' }, 1.0],
];
/** WC3 race field of neutral (no house) objects. */
export const NEUTRAL_RACE_FIELD = 'other';

/** Credits a harvester carries per trip (Emperor harvester load). */
export const HARVEST_CAPACITY = 700;

/** Helper objects: names, scale and tint. */
export const HARVEST_ABILITY_NAME = 'Сбор специи';
export const SPICE_FIELD_NAME = 'Поле специи';
export const SPICE_FIELD_SCALE = 0.6;
export const SPICE_FIELD_TINT: readonly [number, number, number] = [255, 140, 40];
/** Spice mound (Rules.txt [SpiceMound]): name, scale and tint of the mine model it is made from. */
export const SPICE_MOUND_NAME = 'Курган специи';
export const SPICE_MOUND_SCALE = 0.35;
export const SPICE_MOUND_TINT: readonly [number, number, number] = [200, 150, 90];
export const TERRITORY_MARKER_NAME = 'Территория';
export const TERRITORY_MARKER_SCALE = 0.7;
export const BUILDER_NAME = 'Строитель';
/** Second builder (walls, turrets): one build menu holds 11 buildings, a house has 12. */
export const DEFENCE_BUILDER_NAME = 'Строитель укреплений';
export const DEFENCE_BUILDING = /Wall|Turret|Pillbox/;
/** Third builder: the buildings of allied sub-houses (config/campaign.ts SUBHOUSE_BUILDINGS). */
export const ALLY_BUILDER_NAME = 'Строитель союзников';
/** Name of a building upgrade (war3map.w3q): prefix + the building's name. */
export const UPGRADE_NAME_PREFIX = 'Улучшение: ';
/** Extended tooltip of a building upgrade: the types it unlocks. */
export const UPGRADE_UNLOCKS_PREFIX = 'Открывает: ';
export const UPGRADE_UNLOCKS_NONE = 'улучшенное здание';
/** Palace super weapon charge (src/emperor/superweapons.ts): a stock artillery unit (mortar team),
 * whose attack-ground order fires the strike (probe src/smoke/build-superweapon-probe.ts). */
export const SUPERWEAPON_BASE = 'hmtm';
export const SUPERWEAPON_SCALE = 1.0;
/** Command card cells for train / research buttons, in fill order: all but the rally point's (3,1)
 * (BlzGetAbilityPosX/Y('ARal'), src/smoke/build-button-probe.ts); (3,2) last, since Cancel takes it
 * while the building trains. */
export const BUTTON_CELLS: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2], [3, 2],
];
