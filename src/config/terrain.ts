// Emperor terrain -> WC3 terrain look (src/emperor/terrain.ts). Heights and map padding are in
// config/scale.ts, tile ids in config/wc3.ts (TERRAIN).

/** w3e ground texture slot of each terrain look (index into TERRAIN.ground). */
export const TEX = { SAND: 0, ROCK: 1, CLIFF: 2, NBROCK: 3, DUST: 4, SPICE: 5 } as const;
/** Minimap colour per texture slot. */
export const MINIMAP_COLOR: ReadonlyArray<readonly [number, number, number]> = [
  [214, 170, 104], [120, 98, 80], [80, 66, 56], [140, 118, 96], [186, 140, 86], [205, 110, 40],
];
/** A corner shared by several tiles takes the texture with the highest rank (cliffs and rock
 * edges stay visible); index = texture slot. */
export const TEX_RANK: readonly number[] = [0, 3, 4, 2, 1, 5];
/** w3e layer and "no cliff" value of every corner (no WC3 cliff levels are used). */
export const CORNER_LAYER = 2;
export const NO_CLIFF = 15;
