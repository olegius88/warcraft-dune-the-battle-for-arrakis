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

/** Texture names start with flag characters (=, !, %, @) that are part of the file name
 * (Textures/=At_Hk_patch_high0000_256.tga); textures starting with ! or @ belong to effects.
 * They used to be cut off: no such file was found and the game drew nothing of the models
 * (regression test: test/mdx.test.ts, "every texture a converted model refers to"). */
export const EFFECT_TEXTURE = (name: string): boolean => /^[!@]/.test(name);
export const TEXTURE_FILE = (name: string): string => name;

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
  // flag characters of the file name become _ in the archive path
  texture: (file: string): string => `Emperor\\Textures\\${file.replace(/\.tga$/i, '').replace(/[^A-Za-z0-9_]/g, '_')}.blp`,
} as const;

/** Effects (src/emperor/effects.ts): their one animation plays as Death, once, when the runtime
 * destroys the effect it has just made (DestroyEffect(AddSpecialEffect(...))). */
export const EFFECT_SEQUENCES: ReadonlyArray<readonly [string, string, boolean]> = [['Stationary', 'Death', false]];
/** Effect textures: flag ! or @ = a glow, drawn additive on black in Emperor; here its light is its
 * alpha and it is blended, self-lit (additive layers burnt white where shells overlap, fx probe
 * 2026-10-08); % = one frame of a sequence (Textures/!%boom0..10.tga), played over the animation (KMTF). */
export const EFFECT_ADDITIVE = (name: string): boolean => /^[!@]/.test(name);
export const EFFECT_FLIPBOOK = /^(.*%.*?)(\d+)\.tga$/i;
/** Effect nodes not drawn: helper boxes (#, the points FXData particles come from) and the shadow plane;
 * the effect's meshes are ? nodes (Explosion/explosion.xbf ?firesphere, Muzzle1 ?bigflash1). */
export const EFFECT_HIDDEN_NODE = (name: string): boolean => name.includes('#') || name.includes('^^');
/** Effects also fade out from this share of their animation (besides their textures going dark,
 * FXData MASTER), layers at this alpha. */
export const EFFECT_FADE = { from: 0.6, layerAlpha: 1 } as const;
/** Which effects the runtime plays: [death explosion, muzzle flash, hit]; with none, the converted
 * effects are not imported either. Explosions and muzzle flashes play (fx probes, 1.31.1,
 * 2026-10-08: a fireball growing, a smoke sphere, a gun flash at the weapon).
 * TODO(models): the hits are not played: they are FXData particle emitters only (mghit, MissileHit,
 * SniperHit, ShellHit, DevImpact, DeviateHit, BloodSplat), and the explosions' sparks and smoke
 * trails are emitters too. The emitter records are read in part (texture, count, life, speed, size,
 * colour and its change per frame, src/emperor/effects.ts notes); MDX particle emitters (PRE2) are not
 * written yet. Risk: no hit effects, explosions without sparks. */
export const EFFECT_PLAYED: readonly [boolean, boolean, boolean] = [true, true, false];
/** Effects are shown at most this radius (WC3 units) [death, muzzle, hit]. TODO(models): an
 * approximation: converted,
 * the explosions span 280 (SmExplosion) .. 2800 (BigExplosion); BigExplosion filled the screen and
 * nearly stopped drawing (probe 2026-10-08); a screenshot of Emperor shows an effect dome about a
 * building across, muzzle flashes about half a unit (gameswelt.de, hardcoregaming101.net) while
 * Muzzle1 grows to 725. How large Emperor draws them is not in the data. */
export const EFFECT_MAX_RADIUS: readonly [number, number, number] = [600, 80, 120];
/** Effects that would have to shrink below this to fit EFFECT_MAX_RADIUS are beams (LTMuzzle) and left out. */
export const EFFECT_MIN_SCALE = 0.05;
/** An effect of more geosets (vertex animation copies: SFX_Wormsign_3 has 260) stalled the game. */
export const EFFECT_MAX_GEOSETS = 64;
/** FXData MASTER events (src/emperor/effects.ts nodeTextures): u32 type, u32 FX_EVENT_MARK, u32 size;
 * type FX_TEXTURE_EVENT sets a node's texture. */
export const FX_EVENT_MARK = 100;
export const FX_TEXTURE_EVENT = 6;
/** Archive folders of the effect models ArtIni.txt names. */
export const EFFECT_FOLDERS: readonly string[] = ['explosion/', 'bullets/'];
/** Converted textures are at most this many pixels a side (Emperor's are up to 256). */
export const MAX_TEXTURE_SIZE = 256;

/** Vertex animation (infantry): one geoset copy per this many frames (stored poses are every 2nd frame). */
export const MORPH_FRAME_STEP = 2;

/** The overhead attachment point sits this far above the top of a model (WC3 units). */
export const OVERHEAD_GAP = 30;

/** House colour: textures whose name starts with "=" have saturated blue panels that Emperor paints
 * in the side's colour (ArtIni.txt Recolor); they become the WC3 team colour. Blue panel = a pixel
 * whose blue clearly dominates (=At_Hk_patch_high0000_256: 6.9 % of the pixels, the panels only). */
export const HOUSE_COLOUR_TEXTURE = (file: string): boolean => file.startsWith('=');
export const HOUSE_COLOUR_PIXEL = (r: number, g: number, b: number): boolean => b > 60 && b > r * 2 && b > g * 1.6;
