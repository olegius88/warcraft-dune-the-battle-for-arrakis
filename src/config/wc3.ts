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
  /** Art - Icon - Game Interface (command card; code from memory, checked in game by
   * src/smoke/build-icon-probe.ts) */
  icon: 'uico',
  /** Art - Model File (code from memory, checked in game by src/smoke/build-model-probe.ts) */
  model: 'umdl',
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
  /** permanent invisibility (not in common.ai; UnitAddAbility('Apiv') succeeded in game, probe 2026-10-07) */
  invisibility: 'Apiv',
} as const;

/** Stock abilities whose art (GetAbilityEffectById, common.j) is used for effects, so the model
 * paths come from the game's own data. Codes: data/wc3/common.ai; the effect type that holds a
 * model was read in game by src/smoke/build-probe.ts (2026-10-07, 1.31.1): AUin EFFECT =
 * InfernalBirth.mdl, AHfs EFFECT = FlameStrikeTarget.mdl, AOws CASTER = WarStompCaster.mdl
 * (TARGET of AUin / AHfs is empty). */
export const ART_ABILITY = {
  /** super weapon strike */
  nuke: { id: 'AUin', type: 'EFFECT_TYPE_EFFECT' },
  /** bomb crate */
  bomb: { id: 'AHfs', type: 'EFFECT_TYPE_EFFECT' },
  /** stealth crate */
  stealth: { id: 'AOws', type: 'EFFECT_TYPE_CASTER' },
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

/** Command card icons converted from Emperor (ArtIni.txt Icon / IconGrey): the enabled icon and
 * the disabled one at the paths the stock icons use (CommandButtons\BTN* and
 * CommandButtonsDisabled\DISBTN*), so the game can find the grey one next to the coloured one
 * (assumption until seen in game). */
export const ICON_SIZE = 64;
export const ICON_PATH = {
  enabled: (name: string): string => `ReplaceableTextures\\CommandButtons\\BTNEmp${name}.blp`,
  disabled: (name: string): string => `ReplaceableTextures\\CommandButtonsDisabled\\DISBTNEmp${name}.blp`,
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
