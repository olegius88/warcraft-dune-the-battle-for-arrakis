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
/** Construction yards of the player without their builders are looked for this often (s). */
export const YARD_CHECK_PERIOD = 2;
/** Harvester replacement and cash delivery (Rules.txt HarvReplacementDelay, CashDeliveryWhenNoSpice*)
 * are checked this often (s). */
export const HARV_REPLACE_PERIOD = 2;
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
 * player's balance shown in the (unused) lumber field. */
export const POWER_CHECK_PERIOD = 2;

/** Sandworms (chances, lifetimes and radius come from Rules.txt): check period, how far from its
 * victim a surface worm surfaces, worm unit name in Rules.txt. Worms belong to neutral hostile. */
export const WORM_CHECK_PERIOD = 1;
/** Sandstorms (Rules.txt Storm*): move / hit period (s), size of the tornado effect, random tries
 * to find a sand point. */
export const STORM_TICK = 0.25;
export const STORM_SCALE = 3;
export const STORM_SPAWN_TRIES = 30;
/** StormDamage = class * STORM_CLASS_STEP + damage (Rules.txt '74 // (1*64)+10'); class 0 is
 * never picked up. */
export const STORM_CLASS_STEP = 64;
export const WORM_SURFACE_OFFSET_TILES = 8;
export const SURFACE_WORM = 'SurfaceWorm';

/** Enemy base template entries per house in the runtime table (EmpTpl*). */
export const TEMPLATE_SLOTS = 16;

/** Enemy base builder (src/jass/battle/ai.j): ai.ini [BuildingConstructionRatios] category of a
 * building by its name suffix (house prefix added; missing ones skipped). The construction yard and
 * the refinery dock (built by Emperor on a refinery) are not built by it. Walls are Defence too. */
export const AI_BUILDING_CATEGORY: ReadonlyArray<readonly [string, 'core' | 'defence' | 'manufacturing' | 'resource']> = [
  ['SmWindtrap', 'core'], ['Outpost', 'core'], ['Palace', 'core'],
  ['Barracks', 'manufacturing'], ['Factory', 'manufacturing'], ['Hanger', 'manufacturing'], ['Helipad', 'manufacturing'], ['Starport', 'manufacturing'],
  ['Refinery', 'resource'],
  ['Pillbox', 'defence'], ['RocketTurret', 'defence'], ['FlameTurret', 'defence'], ['GunTurret', 'defence'], ['GasTurret', 'defence'], ['PopUpTurret', 'defence'],
];
/** Buildings that release units (ai.ini [PositionAlgorithmRatiosExits] weights), by name suffix. */
export const AI_EXIT_BUILDINGS: readonly string[] = ['Barracks', 'Factory', 'Hanger', 'Helipad', 'Starport', 'Refinery'];
/** Turrets (MinimumGapBetweenTurrets, MaxTurretsAtLowTech, FirstTechLevelToBuildTurrets) and walls. */
export const AI_TURRETS: readonly string[] = ['Pillbox', 'RocketTurret', 'FlameTurret', 'GunTurret', 'GasTurret', 'PopUpTurret'];
export const AI_WALL = 'Wall';
/** Wall pieces built in a row on the outer side of a turret once the AI has MinMoneyToStartBuildingWalls. */
export const AI_WALL_PIECES = 3;
/** "Low tech" for MaxTurretsAtLowTech (ai.ini: "Max turrets at tech < 5"). */
export const AI_LOW_TECH_BELOW = 5;
/** Building sites tried: rings around the base point every AI_SITE_STEP tiles out to AI_SITE_MAX,
 * AI_SITE_ANGLES directions each; a site must be buildable and free within AI_SITE_CLEAR tiles. */
export const AI_SITE_MIN = 3;
export const AI_SITE_MAX = 15;
export const AI_SITE_STEP = 2;
export const AI_SITE_ANGLES = 16;
export const AI_SITE_CLEAR = 2.5;
/** A site lines up with a building of the same type when within this many tiles on one axis. */
export const AI_ALIGN_TILES = 1;
/** Tactics tick (seconds): scouts, base defence, harvester escort, construction yard defence, waves. */
export const AI_TACTIC_PERIOD = 2;
/** Attack waves gather this far from their base towards the target (share of the way) before attacking. */
export const AI_STAGING_SHARE = 0.33;
/** A wave is formed when all its units are within this many tiles of the staging point. */
export const AI_FORMED_TILES = 6;
/** Harvester escort: units that follow the AI's harvesters (DefendHarvester tactic). */
export const AI_ESCORTS = 2;
/** Construction yard defence: the yard counts as attacked for this long after a hit (seconds). */
export const AI_CY_ALARM_SECONDS = 15;
/** Debug report of the AI (DuneTest\<map>_AI.pld): lines kept. */
export const AI_REPORT_LINES = 60;
/** ai_difficulty.ini has [Tech1]..[Tech8]. */
export const AI_TECH_LEVELS = 8;
