// Warcraft III identifiers the generator writes: object data field codes, ability/unit/doodad ids,
// custom ids, effect models, terrain tiles. Field codes come from Units\UnitMetaData.slk and
// AbilityMetaData.slk of the game data.

/** Unit object data fields (war3map.w3u). */
export const UNIT_FIELD = {
  name: 'unam',
  /** command card cell (WurstStdlib2 UnitObjEditing.wurst setButtonPositionX/Y) */
  buttonX: 'ubpx',
  buttonY: 'ubpy',
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
  /** Art - Icon - Game Interface (command card; seen in game 2026-10-07: src/smoke/build-icon-probe.ts) */
  icon: 'uico',
  /** Art - Model File: an .mdl path, the game loads the .mdx next to it (seen in game 2026-10-07,
   * src/smoke/build-model-probe.ts: a .mdx path draws nothing) */
  model: 'umdl',
  /** Art - Required Animation Names (WurstStdlib2 objediting/UnitObjEditing.wurst
   * setRequiredAnimationNames) */
  animationNames: 'uani',
  /** Movement - Transported Size (WurstStdlib2 UnitObjEditing.wurst setTransportedSize) */
  cargoSize: 'ucar',
} as const;

/** Ability object data fields (war3map.w3a). */
export const ABILITY_FIELD = {
  name: 'anam',
  /** Ahar: damage to trees (column 2) and gold per trip (column 3) */
  harvestLumber: 'Har2',
  harvestGold: 'Har3',
  /** requirements (Chaos: the Chaos research) */
  requires: 'areq',
  /** Chaos: the type the unit turns into (common.j ABILITY_ILF_NEW_UNIT_TYPE = 'Cha1'; the UnitID1
   * column of AbilityData, so level 1 without a data column) */
  newUnitType: 'Cha1',
  /** Channel (WurstStdlib2 objediting/AbilityObjEditing.wurst AbilityDefinitionIllidanChannel, per
   * level, data columns 1..6): follow-through time, target type (0 none), options (bit 0 visible,
   * presets/ChannelAbilityPreset.wurst Option), art duration, disable other abilities, base order */
  channelFollowThrough: 'Ncl1',
  channelTarget: 'Ncl2',
  channelOptions: 'Ncl3',
  channelArtDuration: 'Ncl4',
  channelDisableOthers: 'Ncl5',
  channelOrder: 'Ncl6',
  /** Cargo Hold: Cargo Capacity (AbilityObjEditing.wurst AbilityDefinitionCargoHoldTransport, column 1) */
  cargoCapacity: 'Car1',
  /** hero ability flag and level count (level 0) */
  hero: 'aher',
  levels: 'alev',
  /** common ability fields (AbilityObjEditing.wurst AbilityDefinition): icon, tooltips (level 1)
   * and button cell, normal and turned-off; casting time and cooldown per level */
  icon: 'aart',
  iconOff: 'auar',
  tooltip: 'atp1',
  tooltipExtended: 'aub1',
  tooltipOff: 'aut1',
  tooltipOffExtended: 'auu1',
  buttonX: 'abpx',
  buttonY: 'abpy',
  buttonOffX: 'aubx',
  buttonOffY: 'auby',
  castTime: 'acas',
  /** Cast Range per level (AbilityObjEditing.wurst setCastRange) */
  castRange: 'aran',
  cooldown: 'acdn',
} as const;

/** Upgrade object data fields (war3map.w3q), from WurstStdlib2 objediting/UpgradeObjEditing.wurst:
 * name / tooltips / icon per level (level 1), costs, time and level count at level 0. */
export const UPGRADE_FIELD = {
  name: 'gnam',
  tooltip: 'gtp1',
  tooltipExtended: 'gub1',
  icon: 'gar1',
  goldBase: 'gglb',
  lumberBase: 'glmb',
  timeBase: 'gtib',
  levels: 'glvl',
  buttonX: 'gbpx',
  buttonY: 'gbpy',
} as const;

/** Stock abilities. */
export const ABILITY = {
  harvest: 'Ahar',
  build: 'AHbu',
  returnResources: 'Argd',
  invulnerable: 'Avul',
  /** Chaos (grunt): adding it turns the unit into another type while it stays the same unit
   * (handle, data, groups kept; damage, speed, regeneration and added abilities reset): veterancy
   * ExtraRange (src/smoke/build-morph-probe.ts, 2026-10-08, 1.31.1) */
  chaos: 'Sca1',
  /** permanent invisibility (not in common.ai; UnitAddAbility('Apiv') succeeded in game, probe 2026-10-07) */
  invisibility: 'Apiv',
  /** Locust: not selectable, not targeted (AbilityData.slk of 1.31.1: Aloc "Locust"); the starport frigate */
  locust: 'Aloc',
  /** Channel: a button that does nothing but cast (the deploy / undeploy buttons, mission deploy.j).
   * Bear Form was tried first: in 1.31.1 its alternate form (Emeu) read 0 in game, from the object
   * data and after BlzSetAbilityIntegerLevelField, and no bearform order was taken (probe --deploy,
   * 2026-10-09) */
  channel: 'ANcl',
  /** Cargo Hold (Transport), Load (Goblin Zeppelin), Unload (Goblin Zeppelin): WurstStdlib2
   * _wurst/assets/AbilityIds.wurst cargoHoldTransport / load / unload; the APC (units.ts) */
  cargoHold: 'Sch3',
  load: 'Aloa',
  unload: 'Adro',
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
  /** Death Hand fallout cloud (Disease Cloud of the abomination) */
  fallout: { id: 'Aap1', type: 'EFFECT_TYPE_TARGET' },
  /** spice mound burst (Thunder Clap's dust ring) */
  spiceBloom: { id: 'AHtc', type: 'EFFECT_TYPE_CASTER' },
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
  /** first letter of the building upgrades (war3map.w3q; stock upgrades are Rh../Ro../Re../Ru..) */
  upgradePrefix: 'R',
  /** first letter of the veterancy morph abilities (Chaos into a longer-range veteran type) */
  vetMorphPrefix: 'V',
  /** first letter of the deploy buttons (Channel) and of the morphs between a type and its deployed
   * copy (Chaos) */
  deployPrefix: 'D',
  deployMorphPrefix: 'E',
  /** stock upgrade the building upgrades are made from (Iron Forged Swords): its effects reach no
   * unit, every Emperor unit has an empty upgrade list (units.ts, F.upgrades) */
  upgradeBase: 'Rhme',
  harvestAbility: 'A000',
  /** the APC's cargo hold (Sch3 with APC.capacity) */
  apcCargo: 'A001',
  spiceField: 'xS00',
  spiceMound: 'xS01',
  territoryMarker: 'xM00',
  /** a reserve stack on the hub */
  stackMarker: 'xM01',
  /** builder spawned by a construction yard, per house */
  builder: { AT: 'xBA0', HK: 'xBH0', OR: 'xBO0' },
  /** walls and turrets builder, per house */
  defenceBuilder: { AT: 'xBA1', HK: 'xBH1', OR: 'xBO1' },
  /** sub-house buildings builder, per house */
  allyBuilder: { AT: 'xBA2', HK: 'xBH2', OR: 'xBO2' },
} as const;

/** Effect models (JASS paths: written through str(), which escapes the backslashes). */
export const EFFECT = {
  crateTaken: 'Abilities\\Spells\\Items\\ResourceItems\\ResourceEffectTarget.mdl',
  elite: 'Abilities\\Spells\\Other\\GeneralAuraTarget\\GeneralAuraTarget.mdl',
  levelUp: 'Abilities\\Spells\\Other\\Levelup\\LevelupCaster.mdl',
  wormStrike: 'Objects\\Spawnmodels\\Undead\\ImpaleTargetDust\\ImpaleTargetDust.mdl',
  /** sandstorm: Cyclone's tornado (on screen in src/smoke/build-tornado-probe.ts, 2026-10-08) */
  sandstorm: 'Abilities\\Spells\\NightElf\\Cyclone\\CycloneTarget.mdl',
} as const;

/** Already compressed media: stored in the MPQ without zlib (it would only cost build time). */
export const STORED_UNCOMPRESSED = /\.(bik|mp3|ogg|flac|blp|dds)$/i;

/** Folders for files imported into a map. */
export const IMPORT_DIR = {
  speech: 'war3mapImported\\speech\\',
} as const;

/** Command card icons converted from Emperor (ArtIni.txt Icon / IconGrey): the enabled icon and
 * the disabled one at the paths the stock icons use (CommandButtons\BTN* and
 * CommandButtonsDisabled\DISBTN*): the game finds the grey one next to the coloured one (a dead
 * hero's bar icon showed it in game, src/smoke/build-icon-probe.ts, 2026-10-07). */
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
