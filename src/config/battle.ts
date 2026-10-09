// Territory battles: what Emperor does in code rather than in mission scripts (src/emperor/battle.ts).
// Distances are WC3 world units, offsets of bases are Emperor tiles, times seconds.

/** Story maps: the map owner whose placed base the AI runs (owner 1 = Player(1), mission.ts) when it
 * has this building (#A1 / #A2 / #A3 / #C1; battle.ts storyAiHouse). */
export const STORY_AI_OWNER = 1;
export const STORY_AI_BUILDING = 'ConYard';
/** Game.exe 1.09, the defending side's minimal base (0x47f170 -> 0x42ea80): its construction yard at the
 * start point moved by `yardShift` tiles (world -128 / -192: left, and up in WC3's y), then for its house
 * these types by name suffix, [suffix, count with spice on the map, without] (barracks 0x43b920,
 * refinery 0x43b8e0, windtrap 0x43b960; Game.exe walks the types down its type list), each where the AI's
 * site code puts it (0x44c390 / 0x42a1e0). Saved buildings of the territory (0x4807e0) are not kept. */
export const MIN_BASE = {
  yardShift: [-4, 6] as readonly [number, number],
  types: [['SmWindtrap', 2, 1], ['Refinery', 1, 0], ['Barracks', 1, 1]] as ReadonlyArray<readonly [string, number, number]>,
} as const;
/** The player's minimal base in a defence battle (the same set, Game.exe places it by the AI site code
 * for any side; the player has no AI map here): offsets in tiles from its yard, a windtrap's second one
 * next. */
export const PLAYER_MIN_BASE: Readonly<Record<string, ReadonlyArray<readonly [number, number]>>> = {
  SmWindtrap: [[-5, -4], [-5, 0]], Refinery: [[5, -4]], Barracks: [[5, 2]],
};
/** Units the enemy AI produces, by name suffix (house prefix added; missing ones skipped). */
export const ENEMY_INFANTRY: readonly string[] = ['Infantry', 'LightInf', 'Trooper', 'Sniper', 'Chemical', 'Flamer', 'Mortar', 'AATrooper', 'Kindjal'];
export const ENEMY_VEHICLES: readonly string[] = ['Trike', 'Buzzsaw', 'DustScout', 'Mongoose', 'Assault', 'LaserTank', 'Flame', 'Kobra', 'Minotaurus', 'InkVine', 'Missile', 'Devastator', 'SonicTank', 'Deviator'];

/** Spice: tiles within this reach (tiles) form one field; credits per tile, minimum per field. */
export const SPICE_CLUSTER_REACH = 2;
// Credits of a spice cell: [General] SpiceValue (Game.exe 1.09 adds it to the harvester's load per
// cell harvested and gives the load 1:1 as credits; src/emperor/battle.ts). This stands in only for a
// build without Rules.txt.
export const FALLBACK_SPICE_VALUE = 200;

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
/** A replacement harvester goes to the refinery with the fewest harvesters within this range (WC3
 * units; Game.exe counts the harvesters whose home it is, a WC3 harvester has none); at most this
 * many refineries of a side are compared. */
export const HARV_HOME_RANGE = 1024;
export const HARV_MAX_REFINERIES = 16;
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
/** Where a storm hits (Game.exe 1.09 storm update 0x52ba18..0x52bc87): ground objects in the cells
 * up to STORM_GROUND_CELLS from the storm's cell (11 x 11), flying units within STORM_AIR_CELLS
 * (distance^2 < 25600 world units, 32 per cell). */
export const STORM_GROUND_CELLS = 5;
export const STORM_AIR_CELLS = 5;
export const WORM_SURFACE_OFFSET_TILES = 8;
export const SURFACE_WORM = 'SurfaceWorm';

/** Slots per house in the runtime tables of the AI (EmpAiBType, EmpAiUpg, ...). */
export const TEMPLATE_SLOTS = 16;

/** Enemy base builder (src/jass/battle/ai.j): the group of a building of its house, Game.exe 1.09
 * 0x42e9b0, by the first Rules.txt flag set in this order; else a wall (Rules.txt Wall, type kind 0x1e)
 * of a great house is critical, else none. Only core / defence / manufacturing / resource are built by
 * the ai.ini [BuildingConstructionRatios]; critical ones only by the critical needs (ai.j
 * EmpAiCritical: windtraps, helipads, barracks without a flag), none never (factory frigates, the
 * yard). Dockable types (refinery pads) are never available to build (0x53d3d0). Defence types are
 * the turrets (MinimumGapBetweenTurrets, MaxTurretsAtLowTech, FirstTechLevelToBuildTurrets); AiExit
 * gives the [PositionAlgorithmRatiosExits] weights (builder list entry +0xc). */
export const AI_GROUP_FLAGS: ReadonlyArray<readonly [string, 'core' | 'critical' | 'defence' | 'manufacturing' | 'resource']> = [
  ['AiCore', 'core'], ['AiCritical', 'critical'], ['AiDefence', 'defence'], ['AiManufacturing', 'manufacturing'], ['AiResource', 'resource'],
];
export const AI_EXIT_FLAG = 'AiExit';
/** The enemy AI's map of tiles (Game.exe 1.09 AiMap, src/emperor/ai-map.ts, ai-map.j), a byte per
 * tile: class (bits 0-1: 0 free rock, 1 a building's body, 2 no building may stand here: 0x433e50
 * takes the first building type's terrain mask, HKSmWindtrap "Terrain = Rock" - inferred from the type
 * order, 0x46afe0 not traced), road 0x4, reserved 0x8, ramp top 0x20 (a rock tile next to a ramp,
 * 0x4369a0, reserved too). `rock` marks the static rock tiles here (unsaved = class 2). Game.exe drops
 * class 2 map-wide when one of its buildings dies (0x436f90) and never sets it again; here it stays.
 * Distances in tiles: `reserve` round a building that is no defence (0x434564), `join` a building to a
 * cluster box (0x42c69a), `grow` the box for the contour (0x435b7f), `gapFill` the widest gap closed
 * (0x435c06), `edge` the map margin of plan points (0x4364c6), `apron` the strips before an exit
 * (0x435690), `rampRoad` the half length of the strips towards a ramp (0x434ad0), `probeTurn` the
 * steps before the road turns (0x436b70), `roadWidth` the strips of a road. */
/** Game.exe 1.09 builder state 3, the defence plan (ai.j EmpAiShouldDefend / EmpAiWallsGo / EmpAiBuild):
 * entered (0x430c90) with AiBuildsDefences, a tech level over FirstCampaignGameTechLevel + 1, `units`
 * units, no critical need, and `gold` credits while the newest cluster's plan runs, else
 * MinMoneyToStartBuildingWalls credits past `minutes` + rand(0..minutesRand) minutes of the game
 * (`defensiveMinutes` when DEFENSIVE, + `weakPlus` when the strength is 0; 0x430d93..0x430e18); kept
 * (0x42f07d) with `stayUnits` units and `stayGold` credits; plans give up `wallTicks` after the first
 * entry (0x42e70a, "AI has been building walls for %d minutes so aborting"). `facing`: the side the
 * exits of a building face (0 -y, 1 +x, 2 +y, 3 -x; WC3 buildings face south, Game.exe's default
 * vector 0xb7d8c8 not traced). The plan's turret per house (0x43c1c0) by name suffix. */
export const AI_PLAN = {
  units: 22, stayUnits: 20, gold: 600, stayGold: 500, minutes: 7, defensiveMinutes: 2, minutesRand: 1, weakPlus: 2,
  wallTicks: 15000, facing: 2, turret: { AT: 'Pillbox', HK: 'FlameTurret', OR: 'GasTurret' } as Readonly<Record<string, string>>,
} as const;
export const AI_MAP = {
  classMask: 3, free: 0, body: 1, blocked: 2, road: 0x4, reserved: 0x8, intrusion: 0x10, rampTop: 0x20, rock: 0x40,
  reserve: 3, join: 6, grow: 5, gapFill: 3, edge: 3, apron: 3, rampRoad: 7, probeTurn: 5, roadWidth: 3,
  /** clusters kept (Game.exe: a list); tiles clear of units round a plan point (EmpAiFree) */
  maxClusters: 32, fitClear: 0.4,
  /** EmpAiMapRun / EmpAiOcc calls per data function (each its own thread: the op limit) */
  linesPerChunk: 400,
} as const;
export const AI_WALL = 'Wall';
/** "Low tech" for MaxTurretsAtLowTech (ai.ini: "Max turrets at tech < 5"). */
export const AI_LOW_TECH_BELOW = 5;
/** Building sites (ai-map.j EmpAiPlace; Game.exe 1.09 0x42f6a0, 0x42a1e0, 0x42a680): square rings from
 * the cluster centre +- ring out to its box + the footprint + margin; DistanceFromCentre and
 * OuterPerimeter out of distance (80, 0x4297f0 / 0x5d08f8), FurtherFromEdge out of edgeMax (15);
 * Perpendicular perpCentre (0.1, 0x5d090c) on the centre line; road bonuses min(roads round, roadRing)
 * / roadRing and 2 (roadLen - min(L, roadLen)) / roadLen (0x5d0904, 0x5d0900); defence types at most
 * defenceList intrusion tiles (0x42a7ce), a ramp top looked for rampSearch rings out; past
 * turretsNormal defences a type other than the plan turret takes the normal code on 1 in normalOneIn
 * (0x42f74b / 0x42f77c). Intrusions: enemy ground units within intrusionReach tiles of a cluster box
 * every intrusionPeriod s, cleared every intrusionClear ticks (6000 AI updates of every second tick,
 * 0x436980), at most intrusionMax kept. clear: tiles free of units round a site. */
export const AI_SITE = {
  ring: 4, margin: 2, distance: 80, edgeMax: 15, perpCentre: 0.1, roadRing: 24, roadLen: 35, defenceList: 123, rampSearch: 24,
  turretsNormal: 3, normalOneIn: 3, intrusionReach: 12, intrusionPeriod: 2.0, intrusionClear: 12000, intrusionMax: 2000, clear: 1.0,
} as const;
/** Tactics tick (seconds): scouts, base defence, harvester escort, construction yard defence, waves. */
export const AI_TACTIC_PERIOD = 2;
/** Game.exe 1.09 CAiMoney (0x439620 by builder state, 0x42f131): the shares (%) of the credits for
 * units / buildings in builder state 0 (before the start script), 1 (start script), 2 (by ratio), 3
 * (walls), 4 (maintenance), 5 (no construction yard here; Game.exe's log calls state 0 "all money to
 * units" too); units get nothing at `unitFloor` or less (0x439580); a unit over 1 / `expensive` of its
 * share is turned down on 1 in `expensiveOneIn` (0x4651c1). */
export const AI_MONEY = {
  shares: [[0, 100], [20, 80], [50, 60], [70, 30], [70, 50], [100, 0]] as ReadonlyArray<readonly [number, number]>,
  unitFloor: 500, expensive: 3, expensiveOneIn: 4, expensiveRollMax: 4 - 1,
} as const;
/** Game.exe 1.09 updates an AI side every second tick (0x428370, run by the game step 0x47ea56: side i
 * when (i xor tick) & 1 == 0; the update is the tactics manager step 0x44aba0 -> 0x44d040); its 1-in-n
 * starts (rand % n == 0 per update) are a roll of AI_UPDATES_PER_TACTIC in n here, once a tactics tick.
 * Counters the manager keeps in its own steps (n * 25 "seconds", 0x46c1a0) run at half the tick rate. */
export const AI_UPDATES_PER_TACTIC = (AI_TACTIC_PERIOD * 25) / 2;
/** Scouts (0x4582a0): the route's points NW, NE, SE, SW and the centre, `edge` tiles in (table 0x4584a0);
 * a scout at its point within `arrive` tiles, or idle, takes the next one; past the fifth one a point
 * no other scout heads for, else a random one. EmpWaveTab child `key`: its next point. */
export const AI_SCOUT = { edge: 4, points: 5, arrive: 2, key: 6 } as const;
/** Game.exe 1.09 0x450020, the harvester guard (GuardObject): with a strength, skill >= `skill`,
 * `units` units, past TicksBeforeDefendHarvesterTactic, on rand % `oneIn` == 0. */
export const AI_DEFEND_HARVESTER = { skill: 4, units: 10, oneIn: 3000, rollMax: 3000 - 1 } as const;
/** Game.exe 1.09 0x4500d0, the construction yard guard (GuardObject): a DEFENSIVE AI, tech >=
 * FirstTechLevelForDefendCYTactic, `units` units, past TicksBeforeDefendCYTactic + (`skillTop` - skill)
 * * `perSkill` ticks, on rand % `oneIn` == 0. Its team: `team` units (GuardObject's size not traced). */
export const AI_DEFEND_CY = { units: 10, skillTop: 11, perSkill: 400, oneIn: 1500, rollMax: 1500 - 1, team: 2 } as const;
/** Attack waves gather this far from their base towards the target (share of the way) before attacking. */
export const AI_STAGING_SHARE = 0.33;
/** A wave is formed when all its units are within this many tiles of the staging point. */
export const AI_FORMED_TILES = 6;
/** Harvester escort: units that follow the AI's harvesters (DefendHarvester tactic). */
export const AI_ESCORTS = 2;
/** Debug report of the AI (DuneTest\<map>_AI.pld): lines kept. */
export const AI_REPORT_LINES = 60;
/** ai_difficulty.ini has [Tech1]..[Tech8]. */
export const AI_TECH_LEVELS = 8;

/** The AI values a SideAIBehaviour* call re-tunes, by the name of their JASS variable (src/jass/battle
 * forces.j EmpAiBehave): per tech level (arrays indexed by l) or single. */
export type AiTuned = 'EmpAiTMax' | 'EmpAiTBuildTicks' | 'EmpAiTMaintTicks' | 'EmpAiTGapTicks' | 'EmpAiTFirst' | 'EmpAiTMinDef' | 'EmpAiTMaxDef' | 'EmpAiDefPct' | 'EmpAiWander';
/** SideAIBehaviourAggressive / Normal / Defensive: Game.exe 1.09 runs script ids 0x42 / 0x44 / 0x4d as
 * AI side behaviour 1 / 0 / 2 (jump table 0x4f3fb4, 0x428c40, 0x431d90), i.e. personality and strength
 * (0x432040): AGGRESSIVE + STRONG, no change, DEFENSIVE + STRONG. Each value becomes v + v * pct / 100
 * of its current value (calls compound). Their ai.ini / ai_difficulty.ini keys (Strategy index /
 * Difficulty index in Game.exe's key tables 0x5f2770 / 0x5f2820): MaxAiUnits D0, BuildingDelay D2,
 * MaintenanceDelay D3, GapBetweenNewScripts D6, FirstAttackDelay D5, Minimum- / MaximumUnitsForDefence D8 / D10,
 * PercentageOfUnitsForDefence S10, DefenceTacticWanderDistance S11. Not modelled here (the AI has no
 * such value): AGGRESSIVE MaxScriptsToRunAtOnce D4 +50 and
 * DefensiveLocationTileAddition S18 = 16, and the AI skill (+0x400: side difficulty +2, used by
 * Game.exe's random checks). */
export const AI_BEHAVIOUR_PCT: Readonly<Record<'strong' | 'aggressive' | 'defensive', ReadonlyArray<readonly [AiTuned, number]>>> = {
  strong: [['EmpAiTMax', 25], ['EmpAiTBuildTicks', -25], ['EmpAiTMaintTicks', -25]],
  aggressive: [['EmpAiTGapTicks', -52], ['EmpAiDefPct', -50], ['EmpAiWander', 25], ['EmpAiTFirst', -25], ['EmpAiTMinDef', -25], ['EmpAiTMaxDef', -20]],
  defensive: [['EmpAiTGapTicks', 80], ['EmpAiDefPct', 50], ['EmpAiWander', 0], ['EmpAiTFirst', 55], ['EmpAiTMinDef', 50], ['EmpAiTMaxDef', 100]],
};
/** Values the personalities set outright: AiBuildsDefences S15 (AGGRESSIVE 0, DEFENSIVE 1),
 * NumberOfScoutTeams S4 (DEFENSIVE 1). */
export const AI_BEHAVIOUR_SET = {
  aggressive: { buildsDefences: false },
  defensive: { buildsDefences: true, scoutTeams: 1 },
} as const;
/** Behaviour codes of SideAIBehaviour* (EmpAiBehaveMode): Game.exe's AI side behaviour numbers. */
export const AI_BEHAVIOUR = { normal: 0, aggressive: 1, defensive: 2 } as const;
/** The side the base-running AI (src/jass/battle/ai.j, Player(1)) plays. */
export const AI_RUN_SIDE = 1;
/** The AI's losing test (Game.exe 1.09 0x43f260; ai.j EmpAiLosingCase): not before fromTicks; with a
 * construction yard only under yardUnits units, then no refinery and under lowCredits credits, or no
 * AiManufacturing building and no refinery under credits; without one see ai.j. Then it retreats or
 * attacks all out by ChanceOfRetreating (0x43f4b0). */
export const AI_LOSING = { fromTicks: 15000, yardUnits: 40, lowCredits: 2000, credits: 4000, poorCredits: 1200, fewUnits: 20, fewBuildings: 7, fewBuildingsOneFactory: 6 } as const;
/** A [StartScript] step with no building to pick waits this many builder turns, then is skipped
 * (Game.exe 1.09 0x42f29c). */
export const AI_START_WAITS = 60;
/** The base builder's maintenance builds a category only when its share of all buildings is short of
 * its ratio share by over this (Game.exe 1.09 0x42fd35: the double at 0x5d0928, -0.15). */
export const AI_MAINTAIN_SHORT = -0.15;
/** The campaign enemy's strength and personality in a territory battle (Game.exe 1.09). CreateGame
 * (0x48e990) gives the enemy side a computer player record (+0x32 = 1, 0x48f023) with the personality
 * +0x8c / strength +0x90 of a territory (+0x70 / +0x74, 0x48f037 / 0x48f058), which 0x493830 rolls for
 * every territory at each battle by the PhaseRules phase (the phase manager +0x8, 0x4942e0) and by
 * whether the attack comes from the human's territory (house flag +0x114, set for the player's house
 * only, 0x48d510): phase 1 strength 0 and personality 2 (player attacking) or 0; phase 2 both rand % 3
 * (personality 0 when the AI attacks); phase 3 strength 2, personality as phase 2; any other phase
 * strength 2, personality 0. The ai.ini load (0x4310e0) passes them to 0x432040 (strength 2: STRONG,
 * personality 1 / 2: AGGRESSIVE / DEFENSIVE, AI_BEHAVIOUR_PCT). `random`: rand % 3 (GetRandomInt 0..2). */
export const AI_CAMPAIGN = {
  random: -1,
  phases: [[1, 0, 2], [2, -1, -1], [3, 2, -1]] as ReadonlyArray<readonly [phase: number, strength: number, personalityAttacked: number]>,
  other: { strength: 2, personality: 0 },
  strong: 2,
} as const;
/** The AI skill (Game.exe 1.09 +0x400): the record's difficulty (0x493b20: the tech level +1, -1 in
 * PhaseRules phases 1 and 2, at most baseMax) + (strength - 1) * step (0x432526), then min .. max
 * (0x432570; 0x4667a0 returns 10). Without a computer record it stays -1 (0x4310aa). It drives the AI's
 * rolls rand % (n * 10) < skill (0x46c5d0, 17 places). */
export const AI_SKILL = { none: -1, baseMax: 8, lowPhases: [1, 2] as readonly number[], step: 2, min: 1, max: 9 } as const;
/** Game.exe 1.09 0x42f3d0, the builder's choice in maintenance: rand % (ratioRoll * 10) < skill with at
 * least ratioGold credits (0x439990: the side's credits less a reserve, by a percentage, >= 1100;
 * here the credits) builds a group by ratio; else the maintenance choice (0x42fca0). */
/** Game.exe 1.09 0x42db2d ("Critical: More barracks required", the builder's critical needs 0x42d6e0,
 * asked in every state): past `late` minutes when the strength is 0 (0x432800) or the skill under
 * `skillUnder` (0x46c5b0), else past `early` minutes (0x46c180: minutes x 1500 ticks), on
 * rand % (roll * 10) < skill, a side without a building of its barracks type (0x43b920, 0x46c680)
 * builds one first. */
export const AI_CRITICAL_BARRACKS = { early: 2, late: 6, skillUnder: 4, roll: 10, rollMax: 10 * 10 - 1, ticksPerMinute: 1500 } as const;
/** Game.exe 1.09 0x45a8f9 ("Harvester under attack, sending to new spice", AiTacticsManager task 3,
 * every AI update = tick): a harvester hit less than `window` ticks ago by a live attacker, on
 * rand % 10 < skill, past tech FirstCampaignGameTechLevel + 1 (else only on rand % 100 == 0), with a
 * refinery (0x44cc40), goes to FindRandomReachableTileWithinRange (0x46b770) of its base point within
 * rand % 120 + 8 tiles; then it harvests the nearest spice again (economy.j). `tries`: tiles tried. */
export const AI_HARV_FLIGHT = { window: 16, rollMax: 1 * 10 - 1, luckyMax: 99, rangeRandMax: 119, rangeMin: 8, tries: 20 } as const;
/** Game.exe 1.09 0x430e30: the builder update asks its critical needs on rand % 1000 < skill (0x46c5d0 n 100). */
export const AI_CRITICAL_TICK = { rollMax: 100 * 10 - 1 } as const;
/** Defensive assembly points of a base (Game.exe 1.09, src/emperor/ai-points.ts): `count` per cluster
 * (0x42acc0 "D AP"); point k is the ramp of the k-th direction (0 north, clockwise, 0x46c8d0 sectors
 * ending at `sectors` degrees) that has one (0x42b770), `out` tiles further that way (0x42cba0:
 * diagonals half per axis), else `boxOut` + `out` tiles from the cluster box (`boxTiles` round the
 * base here) towards the enemy (0x42bb20); kept `edge` tiles from the map edge (0x46ca50). The
 * reserve's team k (1-based, ai.ini NumReserveTeams of MaxUnitsPerReserveTeam) goes to point k after a
 * fight (0x452940 -> 0x460880); teams past the last point have none (0x42badb). */
/** EmpWaveTab children of a unit of side 1: its reserve team (ai.j EmpAiResTeam), sent to its point. */
export const AI_TAB_RESERVE_TEAM = 2;
export const AI_TAB_RESERVE_POSTED = 3;
export const AI_DEF_POINT = { count: 3, out: 12, boxOut: 4, edge: 6, boxTiles: 8, sectors: [30, 60, 120, 150, 210, 240, 300, 330] as readonly number[] } as const;
export const AI_MAINTAIN_RATIO = { roll: 7, rollMax: 7 * 10 - 1, gold: 1100 } as const;
/** EmpAiTab child: the type has Rules.txt AiManufacturing (counted by the losing test). */
export const AI_TAB_MANUFACTURING = 6;
/** EmpAiTab child: the type is a construction yard (Rules.txt ConYard). Game.exe's losing test asks
 * the per-side flag at game +0xc4 (0x44cc20); where it is false the AI builds an MCV ("Emergency
 * building an MCV", 0x42d72f), so it stands for "has a construction yard". */
export const AI_TAB_YARD = 7;
/** EmpAiTab child: the unit type has Rules.txt AiSpecial (AI_SPECIAL_UNIT). */
export const AI_TAB_SPECIAL = 8;
/** EmpAiTab child: the type found no room (Game.exe builder list entry +0xE, 0x42f861): it is not
 * chosen while it holds the AI's room epoch, which a new or lost building of side 1 moves on (0x42df2d,
 * 0x42ee92, 0x42e980). */
export const AI_TAB_NO_ROOM = 10;
/** EmpAiTab child: the unit type has Rules.txt Ornithoptor (Game.exe type kind 5, 0x43ba70). */
export const AI_TAB_ORNI = 9;
/** Game.exe 1.09 0x42d7c9, the builder's critical need for refineries (after the MCV, 0x42d6e0): it
 * wants `level` refineries past `minutes` (0x46c180: minutes x 1500 ticks) plus `latePlus` when the
 * strength is 0 or the skill under AI_CRITICAL_BARRACKS.skillUnder (0x432800, 0x46c5b0), with a skill
 * over `skillOver` (-1: any), first match from the top. Fewer refineries (0x44cc40): with none, a
 * refinery; else a refinery pad (the dock upgrade, 0x438fc0 -> 0x4c21c0), else another refinery.
 * Only on maps with spice (0x51ed80, Rules.txt DisableIfNoSpiceOnMap). */
export const AI_CRITICAL_REFINERY = {
  latePlus: 4,
  levels: [
    { minutes: 10, skillOver: 6, level: 6 }, { minutes: 6, skillOver: 6, level: 5 }, { minutes: 3, skillOver: 6, level: 4 },
    { minutes: 1, skillOver: 5, level: 3 }, { minutes: 1, skillOver: 2, level: 2 }, { minutes: 1, skillOver: -1, level: 1 },
  ] as ReadonlyArray<{ minutes: number; skillOver: number; level: number }>,
} as const;
/** Game.exe 1.09 0x42dae7: with ornithopters (0x465320) and no helipad (type kind 0x21) or more than
 * `orniPerPad` (0x5d0920: 2.5) per pad, a helipad. */
export const AI_CRITICAL_HELIPAD = { orniPerPad: 2.5 } as const;
/** Game.exe 1.09 0x465473: the AI makes a special unit (Rules.txt AiSpecial, left out of its team types
 * at 0x43a5bf) only at tech >= `tech`, past `ticks` (0x46c180: 3 minutes), with `gold` credits
 * (0x439580 >= 800), `units` units (0x44c670 >= 16) and rand % (roll * 10) < skill; a rand % 30 == 0
 * then asks tech >= `superTech` (its other limit, +0x44, is not identified). */
export const AI_SPECIAL_UNIT = { tech: 5, ticks: 3 * 1500, gold: 800, units: 16, rollMax: 3 * 10 - 1, superOneIn: 30, superTech: 8 } as const;
/** Units the AI may have beyond MaxAiUnits in a story mission (Game.exe 1.09 0x464473: +100 when
 * the mission came from CCampaignManager::SetupMissionData, not from a territory battle). */
export const STORY_AI_EXTRA_UNITS = 100;
/** Game.exe 1.09 deployable units of the AI (objectsets.txt "Deployable": ATKindjal, ORMortar, ORKobra;
 * behaviour 0x465860, update 0x465a80): in an attack an undeployed unit deploys when its deployed
 * weapon reaches a target (0x465bc2) and a deployed one undeploys when it does not (0x465af9);
 * standing still for ai.ini NumTicksStandingStillUntilDeploy it deploys (0x465bf1: an update counter
 * against NumTicks / 21, 0x46c610, so the behaviour updates are taken as 21 ticks apart: about the
 * ticks themselves; the cadence is not traced). EmpWaveTab
 * children of the unit: last x / y and the ticks it has stood still (ai.j EmpAiDeployTick). */
export const AI_DEPLOY = { keyX: 11, keyY: 12, keyStill: 13 } as const;
/** Game.exe 1.09 MCV of the AI (tactics manager 0x45a600 case 3, CanDeploy 0x56e460): it deploys where
 * it stands when a construction yard fits there (0x5999e0, the MCV itself left out); else, idle, it
 * drives to the nearest unused base position (0x4b46b0), else to the first spot that fits on a square
 * spiral round it (0x45bd80, radius up to 0x100). Here: no other unit within `freeTiles` and buildable
 * ground fit; a base position is used while a building stands within MCV_CONSUME_RADIUS (Game.exe
 * compares with an array of positions, [+0x34], not identified); the spiral goes `rings` rings of
 * `ringStep` tiles, one thread per ring (op limit). */
export const AI_MCV = { freeTiles: 3, ringStep: 2, rings: 40 } as const;
/** The base a territory keeps for its next battle (Game.exe 1.09 StoreSideBuildings 0x480200): the
 * winner's buildings of these types (house prefix + name; lists at 0x4802af / 0x48035c / 0x4803f6), one
 * of each, at their positions; an MCV alone is kept as the house's construction yard (0x481160). */
export const SAVED_BASE = { types: ['Barracks', 'Refinery', 'SmWindtrap', 'ConYard', 'Factory', 'Hanger', 'Outpost'] as readonly string[] } as const;
/** The explored map a territory keeps for the player (battle explored.j; Game.exe 0x47fd50 -> 0x495ea0
 * -> 0x47fbf0): tiles per stored integer (below the sign bit). */
export const EXPLORED = { bits: 30 } as const;
/** Carryalls carrying harvesters (battle carryall.j; Game.exe 1.09 class 7): the service tick (s), how
 * near a carryall picks a harvester up and sets it down by its destination (WC3 units). The distance
 * that makes a harvester ask is [General] MinCarryTileDist. */
/** Carryalls serving harvesters (battle carryall.j): the tick (s), pick-up and drop distances (WC3
 * units). A harvester with an errand that moved less than stuckMove over stuckChecks ticks and is more
 * than stuckNear from its destination counts as blocked (Game.exe asks on a blocked move, result 2). */
export const CARRYALL = { tick: 0.5, pickup: 160, drop: 256, stuckChecks: 4, stuckMove: 4, stuckNear: 384 } as const;
/** [General] MinCarryTileDist when Rules.txt has none (its shipped value). */
export const FALLBACK_MIN_CARRY_TILES = 10;
/** Game.exe 1.09 0x467b00 (log 0x5fa5dc): the AI builds a carryall while it has more than `perCarryall`
 * harvesters a carryall, over `credits` and over `units` units (0x44c670), at a hangar. */
export const AI_CARRYALL = { perCarryall: 2, credits: 2000, units: 10 } as const;
/** Ornithopters' rounds and rearming (battle orni.j; Game.exe 1.09 class 5): the tick (s), how near a
 * craft counts as landed on its pad and how far off a fully armed one is sent from a pad another needs
 * (WC3 units). The round a turret every [General] RearmRate ticks (FALLBACK_REARM_TICKS without one). */
export const ORNI = { tick: 0.5, land: 192, evict: 320 } as const;
export const FALLBACK_REARM_TICKS = 50;
/** AI script tactics (battle ai-scripts.j; src/emperor/ai-scripts.ts). slots: scripts running at once at
 * most (MaxScriptsToRunAtOnce is under it); arriveTiles: a sent unit counts as there; noTargetTicks: a
 * script without a TARGET ends (Game.exe 7500); priority1..3: rand % 100 below these picks frequency
 * 1 / 2 / 3, else 4 (table 0x44990c: 51 / 30 / 15 / 4 %); the target kinds; the built-in team types
 * ("all", "strong", "fast": any unit, TODO in ai-scripts.j); staging sides and distances (tiles; Game.exe
 * 0x44d390 not traced: assumed). */
export const AI_SCRIPT = {
  slots: 8, arriveTiles: 6, noTargetTicks: 7500, priority1: 51, priority2: 81, priority3: 96,
  targetBase: 0, targetThreat: 1, targetAny: 2, targetHarvester: 3, targetSet: 4,
  builtinTeam: { all: -1, strong: -2, fast: -3 } as Readonly<Record<string, number>>,
  sides: { front: 0, lflank: 1, rflank: 2, rear: 3 } as Readonly<Record<string, number>>,
  tiles: { verynear: 6, near: 12, medium: 20, far: 30 } as Readonly<Record<string, number>>,
} as const;
/** Reactive AI scripts (battle ai-scripts.j EmpScrReact; Game.exe 1.09 0x44e410 -> 0x44e100). The AI
 * manager steps a side every stepTicks ticks; the reactive picker runs when its step counter passes
 * periodSteps (8 * 25, 0x46c1a0), the counter set to 0 after a start and to rand retryMin..retryMax
 * after none (0x44e4d4); under MaxScriptsToRunAtOnce + extraScripts scripts (0x44e4b3). Threats: the
 * enemy's AIThreat summed by megatiles of cellTiles x cellTiles tiles (0x46b5c0, 0x462e40); one is
 * answered within nearCells megatiles of the AI's base (squared distance below nearCells^2, 0x45eb96) or
 * with a harvester of the AI within harvesterTiles of its megatile (0x45ecc3); at most maxCandidates
 * strategies are drawn from (0x44eb06); tick (s): how often the counter is looked at. */
export const AI_REACT = { stepTicks: 2, periodSteps: 200, retryMin: 100, retryMax: 199, extraScripts: 2, cellTiles: 8, nearCells: 4, harvesterTiles: 8, maxCandidates: 16, tick: 0.16 } as const;
/** EmpWaveTab children of a unit in a script: its slot + 1, its team, its last order (kind, x, y). */
export const AI_TAB_SCRIPT = 20;
export const AI_TAB_SCRIPT_TEAM = 21;
export const AI_TAB_SCRIPT_ORDER = 22;
/** [General] AdvCarryallPickupEnemyDelay (ticks) when Rules.txt has none (its shipped value). */
export const FALLBACK_ADV_ENEMY_DELAY = 60;
