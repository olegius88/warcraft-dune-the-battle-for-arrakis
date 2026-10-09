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
/** war3mapMisc.txt DamageBonus rows (every WC3 attack type). The table is neutral (NEUTRAL_DAMAGE_BONUS
 * everywhere): eight WC3 defense types cannot hold Emperor's eleven armours and eighteen warheads (an
 * averaged, clustered table gave LMG_W 44 % against buildings instead of 5 %), so the Rules.txt
 * percentages are applied at run time (mission damage.j EmpDmgHit). */
export const WC3_ATTACK_TYPES: readonly string[] = ['normal', 'pierce', 'siege', 'magic', 'chaos', 'spells', 'hero'];
export const NEUTRAL_DAMAGE_BONUS = 1;
export const DEFAULT_ATTACK_TYPE = 'normal';

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
/** Starport order (src/emperor/units.ts portOrders): a type the starport trains in PORT_ORDER_SECONDS;
 * the unit itself comes with the frigate (mission starport.j). Name: the unit's + suffix. */
export const PORT_ORDER_SECONDS = 1;
export const PORT_ORDER_SUFFIX = ' (заказ)';
/** Refinery pads (src/emperor/units.ts padOrders, mission pads.j): Game.exe 1.09 gives a refinery two
 * slots for pads (building +0xa8 / +0xac, 0x485c00); the pad's GetUnitWhenBuilt comes by the refinery
 * (Game.exe: a carryall brings it to the new dock, 0x597f50). */
export const REFINERY_PAD = { slots: 2 } as const;
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
/** Deploy of DeployInf / Kobra units (src/emperor/units.ts deploy, mission deploy.j): a copy of the
 * type armed with the turrets a deployed unit fires (Rules.txt TurretDisableIfUnitUndeployed); a
 * Channel button on each form turns the unit into the other through a Chaos morph. A deployed unit
 * cannot move (Game.exe 1.09: the move command fails while deployed, 0x55eea1 / 0x564d00): moveSpeed 0. */
export const DEPLOY = {
  deployName: 'Развернуть',
  deployTooltip: 'Развернуть основное оружие: больше дальность, но юнит стоит на месте.',
  undeployName: 'Свернуть',
  undeployTooltip: 'Свернуть оружие, чтобы двигаться.',
  button: [0, 2] as const,
  moveSpeed: 0,
  /** animation property the deployed copy requires (its Stand / Attack / Morph Alternate, config
   * SEQUENCE_MAP) */
  animation: 'alternate',
} as const;
/** TODO(models): Ordos pop-up turrets (Rules.txt PopupTurret, Game.exe class 0x2f, buildingPopupTurret.cpp
 * 0x486380) stay up 200 ticks after their gun was last busy and retract (animations 0x18 / 0); that is
 * their look only, nothing in play changes (no armour, targeting or stealth difference). The converted
 * models play their stand animation here. Risk: a retracted turret looks raised. */
/** APC (Rules.txt APC; Game.exe 1.09 class 0xf): 5 passengers, hardcoded (0x5672f0, no Rules key);
 * only infantry boards (0x55e8a0): an infantry type takes infantrySize of the hold, every other unit
 * otherSize, more than the hold (units.ts, WC3 Transported Size). */
export const APC = { capacity: 5, infantrySize: 1, otherSize: 6 } as const;
/** The detonate button of Devastator / Infiltrator / EITS (units.ts detonators, mission detonate.j). */
export const DETONATE = {
  name: 'Взорвать',
  tooltip: 'Подорвать машину: взрыв поражает всех вокруг, сама машина гибнет.',
  button: [1, 2] as const,
} as const;
/** EITS: bombs it drops when it blows up (Game.exe 0x56916a: ten EITSBomb_B). */
export const EITS_BOMBS = 10;
