// Warcraft III identifiers the generator writes: object data field codes, ability/unit/doodad ids,
// custom ids, effect models, terrain tiles. Field codes come from Units\UnitMetaData.slk and
// AbilityMetaData.slk of the game data.

/** Unit object data fields (war3map.w3u). */
export const UNIT_FIELD = {
  name: 'unam',
  hitPoints: 'uhpm',
  defenseType: 'udty',
  defense: 'udef',
  goldCost: 'ugol',
  lumberCost: 'ulum',
  foodCost: 'ufoo',
  foodMade: 'ufma',
  buildTime: 'ubld',
  sightDay: 'usid',
  sightNight: 'usin',
  race: 'urac',
  scale: 'usca',
  selectionScale: 'ussc',
  moveSpeed: 'umvs',
  attacksEnabled: 'uaen',
  damageBase: 'ua1b',
  damageDice: 'ua1d',
  damageSides: 'ua1s',
  range: 'ua1r',
  acquireRange: 'uacq',
  cooldown: 'ua1c',
  attackType: 'ua1t',
  targets: 'ua1g',
  abilities: 'uabi',
  builds: 'ubui',
  trains: 'utra',
  upgrades: 'upgr',
  researches: 'ures',
  requires: 'ureq',
  tintRed: 'uclr',
  tintGreen: 'uclg',
  tintBlue: 'uclb',
} as const;

/** Ability object data fields (war3map.w3a). */
export const ABILITY_FIELD = {
  name: 'anam',
  /** Ahar: damage to trees (column 2) and gold per trip (column 3) */
  harvestLumber: 'Har2',
  harvestGold: 'Har3',
} as const;

/** Stock abilities. */
export const ABILITY = {
  harvest: 'Ahar',
  build: 'AHbu',
  returnResources: 'Argd',
  invulnerable: 'Avul',
} as const;

/** Stock units used as helpers. */
export const UNIT = {
  goldMine: 'ngol',
  guardTower: 'hgtw',
  peasant: 'hpea',
  /** non-unit Emperor object types in scripts (explosions, bullets) fall back to this harmless unit */
  fallback: 'hfoo',
  /** civilian buildings placed in maps */
  civilianHouse: 'nfh0',
  /** point markers of the terrain preview */
  marker: 'ewsp',
} as const;

/** Stock destructables standing in for Emperor scenery. */
export const DESTRUCTABLE = {
  barrel: 'LTbr',
  tree: 'BTtc',
  wreck: 'LTrc',
} as const;

/** Stock items. */
export const ITEM = {
  /** look of an Emperor crate */
  crate: 'gold',
} as const;

/** Ids of our custom objects. Fixed so the JASS runtime can refer to them. */
export const CUSTOM_ID = {
  /** first letter of the ids allocated to Emperor units/buildings */
  unitPrefix: 'x',
  harvestAbility: 'A000',
  spiceField: 'xS00',
  territoryMarker: 'xM00',
  /** builder spawned by a construction yard, per house */
  builder: { AT: 'xBA0', HK: 'xBH0', OR: 'xBO0' },
} as const;

/** Effect models (JASS paths: written through str(), which escapes the backslashes). */
export const EFFECT = {
  crateTaken: 'Abilities\\Spells\\Items\\ResourceItems\\ResourceEffectTarget.mdl',
  elite: 'Abilities\\Spells\\Other\\GeneralAuraTarget\\GeneralAuraTarget.mdl',
  levelUp: 'Abilities\\Spells\\Other\\Levelup\\LevelupCaster.mdl',
  wormStrike: 'Objects\\Spawnmodels\\Undead\\ImpaleTargetDust\\ImpaleTargetDust.mdl',
} as const;

/** Already compressed media: stored in the MPQ without zlib (it would only cost build time). */
export const STORED_UNCOMPRESSED = /\.(bik|mp3|ogg|flac|blp|dds)$/i;

/** Folders for files imported into a map. */
export const IMPORT_DIR = {
  speech: 'war3mapImported\\speech\\',
} as const;

/** Icons (JASS paths, through str()). */
export const ICON = {
  /** the mission's briefing quest */
  briefingQuest: 'ReplaceableTextures\\CommandButtons\\BTNSpell_Holy_SealOfMight.blp',
} as const;

/** Barrens terrain: tileset, ground tiles (index = w3e texture slot) and cliff tile. */
export const TERRAIN = {
  tileset: 'B',
  /** sand, rough dirt, rock, desert, dark sand, grass-dirt (spice) */
  ground: ['Bdsr', 'Bdrh', 'Bflr', 'Bdrr', 'Bdsd', 'Bdrt'],
  cliff: 'CBde',
  /** ground tiles of the Arrakis hub map */
  hubGround: ['Bdsr', 'Bdsd', 'Bdrh'],
} as const;
