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

/** Starting credits: attack battle, defence battle. */
export const START_CREDITS = 3000;
export const DEFEND_CREDITS = 2500;
/** Random spread of the starting army around the entrance. */
export const START_ARMY_SPREAD = 200;
/** Defence: units of the starting army (index range) placed in the base, spread around it. */
export const DEFEND_ARMY_FROM = 1;
export const DEFEND_ARMY_TO = 4;
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
export const DEFEND_WAVE_PERIOD = 75;
export const DEFEND_WAVES = 4;
/** Defence wave: DEFEND_WAVE_BASE + tech level / 2 units, spread around the enemy entrance. */
export const DEFEND_WAVE_BASE = 3;
export const DEFEND_WAVE_SPREAD = 250;
export const DEFEND_WAVE_PING_SECONDS = 4;
export const DEFEND_WAVE_MESSAGE_SECONDS = 8;
export const DEFEND_WAVE_MESSAGE = 'Ментат: Враг атакует! Осталось волн: ';
/** Random picks of an enemy unit allowed at the current tech level before falling back. */
export const ENEMY_PICK_TRIES = 20;

/** Power (Rules.txt PowerGenerated / PowerUsed / DisableWithLowPower): balance check period, the
 * player's balance shown in the (unused) lumber field, warning when the player runs short. */
export const POWER_CHECK_PERIOD = 2;
export const LOW_POWER_MESSAGE = 'Ментат: Недостаточно энергии! Турели отключены — постройте ветряные ловушки.';
