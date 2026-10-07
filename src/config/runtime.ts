// Parameters of the JASS runtime of a mission map (src/emperor/runtime.ts, mission.ts): Emperor
// sides, distances used by the "near" API functions, timers, speech queue, crates, veterancy.
// Distances are WC3 world units (128 per Emperor tile), times seconds unless named *_TICKS.

/** Sides 0..MAX_SIDE map to Player(side); NEUTRAL_SIDE -> Player(PLAYER_NEUTRAL_PASSIVE). */
export const MAX_SIDE = 11;
export const NEUTRAL_SIDE = 12;
/** EmpAttacked[a * SIDE_STRIDE + b]: side a was attacked by side b. */
export const SIDE_STRIDE = 16;
/** Emperor entrance tag of an entrance that leads to no territory; also "base taken" marker. */
export const NEUTRAL_TAG = 99;

/** Facing of created units (degrees, WC3: 270 = south). */
export const DEFAULT_FACING = 270;
/** Random spread around a delivery point. */
export const SPAWN_SPREAD = 96;

/** "Near" radii of the Emperor API. */
export const NEAR_OBJECT_TO_SIDE = 1280;
export const NEAR_OBJECT_TO_BASE = 2048;
export const NEAR_OBJECT_TO_OBJECT = 1024;
export const NEAR_SIDE_TO_OBJECT = 1536;
export const NEAR_SIDE_TO_BASE = 2048;
export const NEAR_SIDE_TO_POINT = 1024;
/** An AI group has reached its target point. */
export const AI_TARGET_REACHED = 512;
/** AI "guard": units within this of the guarded object count as guarding. */
export const AI_GUARD_RADIUS = 256;
/** AI "headless chicken": random move up to this far. */
export const AI_WANDER = 800;
/** Worm strike: kill radius in tiles. */
export const WORM_STRIKE_TILES = 3;

/** Text messages stay on screen this long. */
export const MESSAGE_SECONDS = 15;
/** Minimap ping of RadarAlert. */
export const RADAR_PING_SECONDS = 3;
/** Interface fade of DisableUI/EnableUI. */
export const UI_FADE_SECONDS = 0.5;

/** Speech queue: polling period, gap between lines, lines waiting at most, array guard, volume. */
export const SPEECH_TICK = 0.25;
export const SPEECH_GAP = 0.3;
export const SPEECH_QUEUE_MAX = 4;
export const SPEECH_ARRAY_LIMIT = 8000;
export const SPEECH_VOLUME = 127;

/** Normal win/lose rule (territory battles) is not checked during the first ticks. */
export const NORMAL_CHECK_GRACE_TICKS = 250;

/** Timers of a mission map. */
export const AI_TICK = 2;
export const NORMAL_CHECK_PERIOD = 1;
export const DEBUG_REPORT_PERIOD = 10;
export const RETURN_TO_HUB_DELAY = 4;
export const INITIAL_CAMERA_DELAY = 0.5;

/** Crates: pickup check period, pickup radius, credits of a crate whose gift is unknown. */
export const CRATE_TICK = 0.5;
export const CRATE_RADIUS = 160;
export const CRATE_DEFAULT_CASH = 500;

/** Veterancy self-repair: share of max HP per second (TODO(veterancy): Emperor's rate unknown). */
export const VET_SELF_REPAIR_RATE = 0.01;

/** Time of day on every map (frozen): noon. */
export const TIME_OF_DAY = 12;
/** Briefing text on mission start stays this long. */
export const BRIEFING_SECONDS = 25;

/** Veterancy hashtable: level L of a unit type is stored at children L * VET_SLOT_STRIDE + 1..8. */
export const VET_SLOT_STRIDE = 16;

/** Debug report for unattended tests: sides 0..DEBUG_REPORT_SIDES, written to
 * CustomMapData\<DEBUG_REPORT_DIR>\<map>.pld every DEBUG_REPORT_PERIOD seconds. */
export const DEBUG_REPORT_SIDES = 4;
export const DEBUG_REPORT_DIR = 'DuneTest';

/** Players of a mission map: the user and the computer sides 1..MAX_SIDE. */
export const PLAYER_NAME = 'Командор';
export const SIDE_NAME_PREFIX = 'Сторона ';

/** Object health in the Emperor API is modelled as percent of max health. */
export const HEALTH_SCALE = 100;
/** NewObjectOffsetOrientation: orientation 0..3 = steps of this many degrees. */
export const ORIENTATION_STEP = 90;

/** AirStrike: aircraft attack the enemy base and leave after AIRSTRIKE_SECONDS; strike ids of the
 * scripts map to AIRSTRIKE_SLOTS slots. */
export const AIRSTRIKE_SECONDS = 60;
export const AIRSTRIKE_SLOTS = 64;

/** sounds.txt section that holds the spoken mission briefings (key = mission script name). */
export const SPEECH_BRIEFING_SECTION = 'Briefing';
