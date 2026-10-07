// How Emperor quantities become WC3 ones. Emperor values come from Rules.txt and the map files.

/** Emperor script/game ticks per second. TODO(tick-rate): the sources disagree. For 25: ATP1D18GN
 * says "Sardaukar attack in 3/2/1 minutes" (ATSATimer3..1) at v1, v1+1500, v1+3000, attack at
 * v1+4500. For 20: Rules.txt comments "6600 = 5.5 minutes" (TicksBetweenReinforcements) and
 * "3000 = 2.5 minutes" (crate Lifespan). Message gaps against the spoken line lengths (47 pairs,
 * 2026-10-07) do not decide it, and no external source was found. 25 is kept because the mission
 * scripts, which use the tick most, state it in their own text. */
export const TICKS_PER_SECOND = 25;
export const TICK_SECONDS = 1 / TICKS_PER_SECOND;

/** Emperor world units per map tile. */
export const EMPEROR_TILE = 32;
/** One Emperor tile = one WC3 terrain cell (128 world units). */
export const WC3_UNITS_PER_TILE = 128;

/** Emperor Health / bullet Damage are divided by these. */
export const HP_DIVISOR = 2;
/** Repair period in ticks: Rules.txt [General] "RepairRate = 12 // health increase every 10 ticks".
 * CanSelfRepair = n of a veterancy level is read as n health per this period (assumption: the
 * Rules.txt only states the period for buildings). */
export const REPAIR_PERIOD_TICKS = 10;
export const DAMAGE_DIVISOR = 2;
/** WC3 hit points never go below this. */
export const MIN_HP = 10;

/** Emperor Speed (game units per tick) * this = WC3 move speed, clamped to the WC3 range. */
export const SPEED_FACTOR = 40;
export const MIN_MOVE_SPEED = 60;
export const MAX_MOVE_SPEED = 522;

/** Weapon range, acquisition range and day sight: tiles * 128; night sight: tiles * 96. */
export const RANGE_PER_TILE = 128;
export const SIGHT_DAY_PER_TILE = 128;
export const SIGHT_NIGHT_PER_TILE = 96;
/** Shortest WC3 attack cooldown (seconds). */
export const MIN_ATTACK_COOLDOWN = 0.2;
/** BuildTime used when Rules.txt gives none (ticks). */
export const DEFAULT_BUILD_TICKS = 25;
/** WC3 defence of buildings (units get 0). */
export const BUILDING_DEFENSE = 2;

/** Emperor value -> WC3 move speed (also for veterancy Speed). */
export const moveSpeed = (emperorSpeed: number): number => Math.min(MAX_MOVE_SPEED, Math.max(MIN_MOVE_SPEED, emperorSpeed * SPEED_FACTOR));

/** Maps without a usable mesh: rock plateau height in w3e layers (x128 world units); cliffs 60 %, ramps 50 % of it. */
export const PLATEAU_HEIGHT = 1.2;
export const CLIFF_HEIGHT_RATIO = 0.6;
export const RAMP_HEIGHT_RATIO = 0.5;
/** Terrain from the map mesh (src/emperor/heightmap.ts): WC3 units per Emperor height unit, as for
 * models (config/models.ts MODEL_SCALE), so buildings and cliffs keep Emperor proportions. */
export const TERRAIN_HEIGHT_SCALE = 4;
/** Boundary cells around the Emperor map; the WC3 map is padded to a multiple of MAP_SIZE_STEP. */
export const MAP_BOUNDARY_CELLS = 4;
export const MAP_SIZE_STEP = 32;

/** WC3 armour a reduces damage by ARMOR_REDUCTION * a / (1 + ARMOR_REDUCTION * a) (game constant). */
export const ARMOR_REDUCTION = 0.06;
