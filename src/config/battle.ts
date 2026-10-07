// Territory battles: what Emperor does in code rather than in mission scripts (src/emperor/battle.ts).
// Distances are WC3 world units, offsets in the base template are Emperor tiles, times seconds.

/** Enemy base: [Emperor building suffix, dx, dy] in tiles from the base point (house prefix added). */
export const BASE_TEMPLATE: ReadonlyArray<readonly [string, number, number]> = [
  ['ConYard', 0, 0], ['SmWindtrap', -5, -4], ['SmWindtrap', -5, 0], ['Refinery', 5, -4], ['Barracks', 5, 2],
  ['Factory', 0, 6], ['Outpost', -5, 5], ['Pillbox', -8, -8], ['Pillbox', 8, -8], ['GunTurret', 8, 8], ['GunTurret', -8, 8],
];
/** Units the enemy AI produces, by name suffix (house prefix added; missing ones skipped). */
export const ENEMY_INFANTRY: readonly string[] = ['Infantry', 'LightInf', 'Trooper', 'Sniper', 'Chemical', 'Flamer', 'Mortar', 'AATrooper', 'Kindjal'];
export const ENEMY_VEHICLES: readonly string[] = ['Trike', 'Buzzsaw', 'DustScout', 'Mongoose', 'Assault', 'LaserTank', 'Flame', 'Kobra', 'Minotaurus', 'InkVine', 'Missile', 'Devastator', 'SonicTank', 'Deviator'];

/** Spice: tiles within this reach (tiles) form one field; credits per tile, minimum per field. */
export const SPICE_CLUSTER_REACH = 2;
export const SPICE_PER_TILE = 1500;
export const SPICE_FIELD_MIN = 2000;

/** Starting credits and army values come from Rules.txt (Campaign*Money, UnitValueAttacker /
 * UnitValueDefender); these stand in only for a build without Rules.txt. */
export const FALLBACK_CREDITS = 2500;
export const FALLBACK_ARMY_VALUE = 10;
/** Random spread of the attacking army around the entrance. */
export const START_ARMY_SPREAD = 200;
/** Defence: spread of the defending army around the player's base. */
export const DEFEND_ARMY_SPREAD = 300;

/** Where helper units appear relative to their building / the base point. */
export const BUILDER_OFFSET = 256;
export const NEW_HARVESTER_OFFSET = 256;
export const BASE_HARVESTER_OFFSET = 512;
export const BASE_GUARD_OFFSET = 300;
export const PRODUCED_INFANTRY_OFFSET = 256;
export const PRODUCED_VEHICLE_OFFSET = 320;
/** An MCV within this radius of a starting construction yard is consumed by it. */
export const MCV_CONSUME_RADIUS = 900;

/** Timers. */
export const HARVEST_CHECK_PERIOD = 3;
export const ENEMY_PRODUCE_PERIOD = 20;
export const ENEMY_WAVE_PERIOD = 150;
/** Defence: the attacker's army arrives this long after the start, spread around its entrance;
 * later only its reinforcement sets come. */
export const DEFEND_ATTACK_DELAY = 45;
export const DEFEND_WAVE_SPREAD = 250;
export const DEFEND_WAVE_PING_SECONDS = 4;
export const DEFEND_WAVE_MESSAGE_SECONDS = 8;
export const DEFEND_WAVE_MESSAGE = 'Ментат: Враг атакует нашу базу!';
/** Random picks of an enemy unit allowed at the current tech level before falling back. */
export const ENEMY_PICK_TRIES = 20;

/** Power (Rules.txt PowerGenerated / PowerUsed / DisableWithLowPower): balance check period, the
 * player's balance shown in the (unused) lumber field, warning when the player runs short. */
export const POWER_CHECK_PERIOD = 2;
export const LOW_POWER_MESSAGE = 'Ментат: Недостаточно энергии! Турели отключены — постройте ветряные ловушки.';

/** Sandworms (chances, lifetimes and radius come from Rules.txt): check period, how far from its
 * victim a surface worm surfaces, worm unit name in Rules.txt. Worms belong to neutral hostile. */
export const WORM_CHECK_PERIOD = 1;
export const WORM_SURFACE_OFFSET_TILES = 8;
export const SURFACE_WORM = 'SurfaceWorm';
