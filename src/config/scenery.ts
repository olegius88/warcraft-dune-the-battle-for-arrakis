// Objects placed in Emperor maps (test.xbf tag 0x07) that are scenery: what is skipped, what
// becomes which stock WC3 doodad/unit (src/emperor/mission.ts, EmpPlaced).

/** Effects, animated props and set pieces without a WC3 counterpart: not placed. */
export const SKIPPED_OBJECTS = /SFX|hungfigure|NoddingDonkey|Bird|Seagul|Spotlight|DrKynes|CampFire|pyramid|bubble|MegaCannon/i;

/** Name tests of the scenery kinds, checked in this order. */
export const BARREL = /Barrel/i;
export const TREE = /Tree/i;
export const WRECK = /Wreck|Crash/i;
export const CRATE = /Crate/i;
/** Civilian buildings: an IN* (or house-prefixed IN*) name of one of these kinds. */
export const CIVILIAN_PREFIX = /^(AT|HK|OR|HL)?IN|^IN/i;
export const CIVILIAN_KIND = /House|Store|Hut|Tower|Apartment|Tennament|Townhall|hall|Mart|Palace|Sultan|Workshop|Tent|StPauls|Indi|Moss|Trafford|Twafford|Tyower|GiediRef|Oxygen|Vent|Gate/i;

/** Pseudo-random facing of barrels/trees: (tile x * hash) % 360 degrees. */
export const BARREL_FACING_HASH = 37;
export const TREE_FACING_HASH = 53;
/** Scale of wreck doodads. */
export const WRECK_SCALE = 1.2;
