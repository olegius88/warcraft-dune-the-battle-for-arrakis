// Parameters of the JASS runtime of a mission map (src/emperor/runtime.ts, mission.ts): Emperor
// sides, distances used by the "near" API functions, timers, speech queue, crates, veterancy.
// Distances are WC3 world units (128 per Emperor tile), times seconds unless named *_TICKS.
import { TICKS_PER_SECOND } from './scale.ts';

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
/** Crates of the scripts (NewCrate*) disappear after this many ticks (Rules.txt [Crate] Lifespan). */
export const CRATE_LIFESPAN_TICKS = 10000;

/** StealthedWhenStill check period (the delays themselves come from Rules.txt). */
export const STEALTH_TICK = 0.2;

/** Time of day on every map (frozen): noon. */
export const TIME_OF_DAY = 12;
/** Briefing text on mission start stays this long. */
export const BRIEFING_SECONDS = 25;

/** Veterancy hashtable: level L of a unit type is stored at children L * VET_SLOT_STRIDE + 1..8. */
export const VET_SLOT_STRIDE = 16;
/** Veterancy hashtable: the morph ability of a unit type into its veteran type with ExtraRange p %
 * is at child VET_MORPH_KEY + p (above every level slot). */
export const VET_MORPH_KEY = 1000;
/** A morph takes effect a frame later (src/smoke/build-morph-probe.ts): the unit is checked every
 * VET_MORPH_CHECK seconds, at most VET_MORPH_TRIES times, before its veterancy stats are put back. */
export const VET_MORPH_CHECK = 0.05;
export const VET_MORPH_TRIES = 20;
/** Base order of the deploy / undeploy buttons (Channel, units.ts deploy): the stock Channel's own
 * (WurstStdlib2 objediting/presets/OrderStringFactory.wurst lists it); the two never share a unit. */
export const DEPLOY_BUTTON_ORDER = 'channel';
/** How often (s) the forms the game switches itself are checked (mission deploy.j EmpDeployAutoTick;
 * Game.exe asks every tick, 0x567190). */
export const DEPLOY_AUTO_PERIOD = 0.25;

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

/** Main camera spin (CameraStartRotate(speed, direction)): degrees per second for speed 1, update
 * period. Game.exe 1.09 turns the camera speed * pi / 180 radians every update (0x532564), the
 * updates follow the game ticks: the scripts spin at speed 2 for exactly 180 ticks (ATStart 250..430,
 * ATP1M3SA 170..350 and 20 more), one full turn. Direction 0 turns the other way, any other value
 * (the scripts' 1 and 2) the same way. Which way a growing yaw turns on screen is not established;
 * the WC3 rotation grows with it. */
export const CAMERA_SPIN_DEGREES = TICKS_PER_SECOND;
export const CAMERA_SPIN_PERIOD = 0.05;
/** WC3 camera rotation the spin returns to (the default game camera looks north). */
export const CAMERA_DEFAULT_ROTATION = 90;
/** CameraZoomTo(zoom 0..100, ticks): WC3 camera distance at zoom 0 and at zoom 100. */
export const CAMERA_ZOOM_NEAR = 1000;
export const CAMERA_ZOOM_FAR = 2500;

/** PIP (Emperor's picture-in-picture view; WC3 has no second viewport): its target is revealed in
 * this radius for the player and pinged on the minimap; a tracked object is followed this often. */
export const PIP_REVEAL_RADIUS = 1024;
export const PIP_PING_SECONDS = 2;
export const PIP_UPDATE = 0.5;

/** SetThreatLevel: AI units attack the most threatening object type within this radius first. */
export const AI_THREAT_RADIUS = 1536;
/** BehaviourNormal: AI units further than this from their own base return to it. */
export const AI_HOME_RADIUS = 1536;

/** Shroud areas opened by RemoveShroud, remembered so ReplaceShroud can close them again. */
export const SHROUD_SLOTS = 64;

/** Palace super weapons (src/emperor/superweapons.ts; SideNuke strikes with the Death Hand): a unit
 * hit by the Hawk Strike is ordered SW_FLEE_STEP away from the strike point every SW_FLEE_PERIOD s. */
export const SW_FLEE_STEP = 600;
export const SW_FLEE_PERIOD = 0.5;

/** Super weapon warheads (runtime helpers.j EmpSwDamage): EmpSwTab children of a type's armour index,
 * of a strike's percentage per armour (key + index) and of its fallout's; a warhead without the armour
 * hits with SW_DEFAULT_PCT. */
export const SW_ARMOUR_KEY = 20;
export const SW_STRIKE_PCT_KEY = 30;
export const SW_FALLOUT_PCT_KEY = 60;
export const SW_DEFAULT_PCT = 100;
/** Attack damage by warhead (mission damage.j EmpDmgHit, data mission.ts): EmpDmgTab children of a
 * type's armour index (same armour list as the super weapons) and of its weapon's percentage per armour
 * (key + index); an attacker or target without them hits unchanged. */
export const DMG_ARMOUR_KEY = 1;
export const DMG_PCT_KEY = 10;

/** Buildings whose loss is not announced: the name after the house prefix (Game.exe 1.09 0x4f9c69,
 * strings 0x60f93c / 0x60f944). */
export const UI_SILENT_LOSS = ['Wall', 'FactoryFrigate'] as const;
/** House prefix length of Rules.txt names (ATWall). */
export const HOUSE_PREFIX_LENGTH = 2;

/** In-game announcements (Uispoken.txt / DATA\Sounds\sounds.txt section IngameMessages; runtime
 * helpers.j EmpUiSay): event, message key without the house prefix (the player's house version
 * <H><key> first, else <key>), seconds before the same announcement again. Event id = index + 1. */
export const UI_EVENTS: ReadonlyArray<readonly [string, string, number]> = [
  ['baseAttack', 'BaseAttack', 30], ['harvAttack', 'HarvAttack', 30], ['unitLost', 'UnitLost', 15], ['bldgLost', 'BldgLost', 10],
  ['lowPower', 'LowPower', 30], ['unitReady', 'UnitReady', 3], ['bldgStart', 'BldgStart', 3], ['conComplete', 'ConComplete', 3],
  ['upgrade', 'Upgrade', 3], ['specWepReady', 'SpecWepReady', 5], ['incomingDHand', 'IncomingDHand', 5],
  ['incomingHawk', 'IncomingHawk', 5], ['incomingChaos', 'IncomingChaos', 5], ['bldgCaptured', 'BldgCaptured', 5],
  ['bldgStolen', 'BldgStolen', 5], ['wormSign', 'WormSign', 30], ['reinforceArr', 'ReinforceArr', 10],
  ['leechAttack', 'LeechAttack', 10], ['contAttack', 'ContAttack', 10], ['reinforceApp', 'ReinforceApp', 10],
  // a starport order: E_Output_Pickup ATGenDelivery "There is a delivery, inbound." (mission starport.j)
  ['delivery', 'GenDelivery', 5],
  // cash when the map has no spice left: E_Output_Pickup ATGenresources "Payment has been received."
  // (Game.exe 0x53ec20 plays MissionMessages GenResources; battle economy.j)
  ['cashDelivery', 'Genresources', 5],
];
/** Event name -> id for the JASS templates ({{UI.lowPower}}). */
export const UI = Object.fromEntries(UI_EVENTS.map(([name], i) => [name, i + 1])) as Readonly<Record<string, number>>;

/** Special abilities (src/jass/mission/specials.j): scan period (s); how far around a unit to look,
 * how close (edge to edge) an engineer / saboteur must be to a building, a crusher to infantry. */
export const SP_TICK = 0.5;
/** Order id of Cancel (a purchase the player cannot pay at the starport's price). */
export const ORDER_CANCEL = 851976;
/** Shown at a starport purchase with the price paid (mission starport.j). */
export const PORT_PRICE_TEXT = 'Космопорт: цена ';
/** Frigate delivery (mission starport.j): first hashtable child of the waiting types under a starport's
 * handle; where the units appear, below the starport and spread sideways. */
export const PORT_SLOT = 10;
export const PORT_DELIVERY_OFFSET = 192;
export const PORT_DELIVERY_SPREAD = 128;
/** Starport stock (mission starport.j EmpPortStockTick): checked this often (s); Game.exe counts its
 * stock timer down every tick, this keeps the same delay to within a check. */
export const PORT_STOCK_CHECK = 1;
/** Shown when the starport has no more of a type (stock) or the frigate is full (mission starport.j). */
export const PORT_NO_STOCK_TEXT = 'Космопорт: нет в наличии';
export const PORT_CART_FULL_TEXT = 'Космопорт: фрегат заполнен';
/** The frigate arrives this many seconds before its load is out (FrigateCountdown), so that it is seen. */
export const PORT_FRIGATE_HOVER = 4;
export const SP_REACH = 400;
export const SP_TOUCH = 48;
export const SP_CRUSH = 64;
/** Crushers are checked this often (s): at 0.5 s they passed infantry between two checks. WC3 pathing
 * keeps units apart (a crusher passed a scout 108 apart, centre to centre), hence SP_CRUSH 64. */
export const SP_CRUSH_TICK = 0.1;

/** Special crates: bomb damage and radius, stealth duration and radius around the taker. */
export const CRATE_BOMB_DAMAGE = 300;
export const CRATE_BOMB_RADIUS = 384;
export const CRATE_STEALTH_SECONDS = 60;
export const CRATE_STEALTH_RADIUS = 768;
/** EmpCrateGift codes of the crates that give no unit (> 0 is a unit type, 0 = credits). */
export const CRATE_KIND = { bomb: -1, stealth: -2, shroud: -3 } as const;
/** Alpha of a stealthed unit when the invisibility ability cannot be added. */
export const STEALTH_ALPHA = 90;

/** Reinforcements (timings and set values come from Rules.txt [General]): units of one house in the
 * pick table at most, check period, random picks of a set before it is considered complete,
 * spread around the entrance, minimap ping for the player's sets (announced: helpers.j EmpUiSay). */
export const REINF_SLOT_STRIDE = 32;
export const REINF_TICK = 1;
export const REINF_PICK_TRIES = 40;
export const REINF_SPREAD = 256;
export const REINF_PING_SECONDS = 4;

/** sounds.txt section that holds the spoken mission briefings (key = mission script name). */
export const SPEECH_BRIEFING_SECTION = 'Briefing';
/** sounds.txt section of the spoken debriefings; key = script name + suffix (first found wins). */
export const SPEECH_DEBRIEFING_SECTION = 'Debriefing';
export const DEBRIEF_WIN_SUFFIXES: readonly string[] = ['win', 'debrief'];
export const DEBRIEF_LOSE_SUFFIXES: readonly string[] = ['lose'];
/** How often (s) the APCs' passenger lists are brought up to date (mission apc.j EmpApcTick). */
export const APC_TICK = 0.25;
/** EmpSwTab child BOOM_PCT_KEY + armour index: the warhead % of a detonating type's bomb (mission
 * detonate.j; above the super weapons' keys). */
export const BOOM_PCT_KEY = 100;
/** EITS bombs fall within this many tiles of it (Game.exe 0x56916a: "randomly spread", the spread not
 * read; TODO(units) in detonate.j). */
export const BOOM_EITS_SPREAD_TILES = 3;
/** How often (s) the dust scouts look whether to burrow or come up (mission burrow.j; Game.exe every
 * tick, 0x568d10). */
export const BURROW_TICK = 0.25;
/** [General] GuardTileRange when Rules.txt has none (its shipped value). */
export const FALLBACK_GUARD_TILES = 12;
/** An airborne mine's rocket hits within this radius of its aircraft (WC3 units; the rocket has no
 * BlastRadius: one target). */
export const BOOM_MINE_HIT = 48;
/** Worm rides (mission wormride.j): how often (s) the callers and riders are looked at, and the
 * message when the ground is not sand. The waits come from [General] Min/MaxWormRideWaitDelay and
 * WormRiderLifespan (ticks; FALLBACK_WORM_* without them). */
export const WORM_TICK = 0.5;
export const WORM_NO_SAND = 'Червя можно призвать только на песке.';
export const FALLBACK_WORM_WAIT = [100, 2000] as const;
export const FALLBACK_WORM_LIFESPAN = 1000;
/** The NIAB cannot teleport to ground its owner has not explored (mission teleport.j). */
export const TELEPORT_UNSEEN = 'Телепорт возможен только в разведанную точку.';
