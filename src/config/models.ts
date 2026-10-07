// Emperor XBF models -> WC3 MDX (src/emperor/model.ts).

/** Model units are Emperor world units (a 5-tile barracks is 154 wide: 32 per tile); WC3 has 128. */
export const MODEL_SCALE = 4;

/**
 * Emperor model axes -> WC3 axes. Emperor: +Y up, front of a vehicle at -Z (AT_Trike front wheel
 * z = -38.6). WC3: +Z up, a unit faces +X. Emperor's engine is Direct3D (left-handed, assumed), so
 * the map mirrors (y = +x) and triangle winding is reversed; flip MIRROR if models look mirrored in game.
 */
export const MIRROR = true;

/** Milliseconds per Emperor animation frame (assumed one frame per game tick, 25 per second). */
export const MS_PER_FRAME = 40;

/** Nodes that are never drawn: shadow plane, leech effect, selection mesh, light / effect helpers. */
export const HIDDEN_NODE = (name: string): boolean => name === '#^^0' || name.includes('{LEECH}') || name.startsWith('SLCT') || name.startsWith('?');

/** Texture names carry prefix flags (=, !, %, @); textures starting with ! or @ belong to effects. */
export const EFFECT_TEXTURE = (name: string): boolean => /^[!@]/.test(name);
export const TEXTURE_FILE = (name: string): string => name.replace(/^[^A-Za-z0-9_]+/, '');

/** Emperor animation -> WC3 sequence name (first match wins; a WC3 name is used once). */
export const SEQUENCE_MAP: ReadonlyArray<readonly [string, string, boolean]> = [
  // [Emperor animation, WC3 sequence, looping]
  ['Stationary', 'Stand', true],
  ['Idle 0', 'Stand - 2', true],
  ['Move', 'Walk', true],
  ['Fire 0', 'Attack', false],
  ['Fire 1', 'Attack - 2', false],
  ['Deployed Fire', 'Attack - 3', false],
  ['Explode', 'Death', false],
  ['Blow Up 1', 'Death', false],
  ['Shot 1', 'Death', false],
  ['Construct', 'Birth', false],
  ['Harv Eat Hold', 'Stand Work', true],
  ['Fly', 'Walk', true],
  ['Hover', 'Stand', true],
];

/** Draw both sides of every face (thin parts such as flags and wings are single sheets). */
export const TWO_SIDED = true;

/** Archive paths of converted art (the model field takes .mdl; the game loads the .mdx). */
export const MODEL_PATH = {
  model: (name: string): string => `Emperor\\Models\\${name}.mdx`,
  modelField: (name: string): string => `Emperor\\Models\\${name}.mdl`,
  texture: (file: string): string => `Emperor\\Textures\\${file.replace(/\.tga$/i, '')}.blp`,
} as const;

/** Converted textures are at most this many pixels a side (Emperor's are up to 256). */
export const MAX_TEXTURE_SIZE = 256;

/** Vertex animation (infantry): one geoset copy per this many frames (stored poses are every 2nd frame). */
export const MORPH_FRAME_STEP = 2;

/** The overhead attachment point sits this far above the top of a model (WC3 units). */
export const OVERHEAD_GAP = 30;
