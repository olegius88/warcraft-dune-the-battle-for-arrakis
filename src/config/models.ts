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

/** The attachment point of a converted model's first fire node (model.ts); a muzzle flash goes there,
 * or to MUZZLE_FALLBACK on a converted model without one (17 of them: HKBuzzsaw, ATMongoose...). */
export const WEAPON_ATTACHMENT = 'Weapon Ref';
export const MUZZLE_FALLBACK = 'chest';
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
/** Effects are drawn in their non-looping sequence (Death) only, their layers at layerAlpha; how they
 * end is their FXData MASTER events' (textures going dark, nodes hidden: Game.exe has no fade of its
 * own; they used to fade from 60 % of the animation here, a stand-in for the events). */
export const EFFECT_SHOWN = { layerAlpha: 1 } as const;
/** Which effects the runtime plays: [death explosion, muzzle flash, hit]; with none, the converted
 * effects are not imported either. All three play (fx probes, 1.31.1, 2026-10-08: a fireball growing,
 * a smoke sphere, a gun flash at the weapon, the hits' fire debris and smoke as FXData particles,
 * FX_PARTICLE).
 * The MASTER events keep their frames and the emitters emit from their start to their stop event
 * (Game.exe 1.09, effects.ts fxTrack); FXData of version 2 is not read, as Game.exe refuses it
 * ("Version 2 of FX Data not supported!", 0x4b2213).
 * The particles' fields: FX_PARTICLE. */
export const EFFECT_PLAYED: readonly [boolean, boolean, boolean] = [true, true, true];
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
/** FXData particle emitters as particle emitters 2 (src/emperor/effects.ts fxEmitters). From Game.exe
 * 1.09 (0x4b0000): an emitter started by its MASTER event makes `count` particles every tick until its
 * stop event, each living `life` + rand(0..lifeRandom) ticks (at least minLifeFrames here, the mean
 * used: WC3 has one life span), flying at `speed` Emperor units a tick, falling by `gravity` (+0x14) a
 * tick², `size` (+0x18) Emperor units wide; after +0x50 ticks their colour moves by its step a tick,
 * after +0x68 ticks their size by its factor a tick; a texture frame lasts +0x34 + 1 ticks, the frames
 * (prefix0..N, atlasColumns to a row) looping (0x4b0b10). Direction (+0x3c, 0x4b04e1): 0 any way
 * (`sphere` degrees of up), > 0 within that many degrees, < 0 a ring (FX_RING). Their speed along the
 * start direction drops by +0x40 a tick (0x4b0c36), here the mean speed over the life.
 * Their alpha: +0x28 is the top byte of a particle's vertex colour at birth (0x4b04a2) and the colour
 * step rewrites the colour without it (0x4b0ef2); not taken: 32 emitters have 0 there and 13 of the
 * smokes with an alpha texture (@) and 255 step their colour, which would leave them invisible half
 * way if Emperor drew by that byte. +0x60 is read neither at birth nor a tick. TODO(models): the
 * fade over the life (`alphas`) is ours: how Emperor's renderer blends particles is not traced.
 * Risk: particles end more softly than in Emperor. */
export const FX_PARTICLE = { minLifeFrames: 3, sphere: 180, atlasColumns: 8, areaShare: 0.5, flags: 0x8000, maxSize: 256, alphas: [255, 220, 0] as [number, number, number] } as const;
/** FXData rings (+0x3c < 0; Game.exe 1.09 0x4b074e): +0x3c rounded (x - 0.4999, 0x4b0100) -1 emits in
 * Emperor's YZ plane, -2 in XY, else in XZ (flat; y is up). A WC3 line emitter (PRE2 flag 0x20000,
 * mdx-m3-viewer parsers/mdlx/particleemitter2.ts) emits in its own YZ plane within `latitude` degrees
 * (ring probe, 1.31.1, 2026-10-08: unturned upright edge on, turned 90 degrees about Y flat, about Z
 * upright facing the camera); `turn` (KGRT, x y z w) by the ring: WC3 x = -Emperor z, y = Emperor x,
 * z = Emperor y (model.ts K): Emperor XZ -> WC3 XY, YZ -> XZ, XY -> YZ (no turn). */
export const FX_RING = {
  flag: 0x20000, latitude: 180,
  turn: (ring: number): [number, number, number, number] | null => (ring === -2 ? null : ring === -1 ? [0, 0, Math.SQRT1_2, Math.SQRT1_2] : [0, Math.SQRT1_2, 0, Math.SQRT1_2]),
} as const;
/** Particle filter by the texture flag: @ (an alpha of its own) blend 0, else (! glows on black) additive
 * 1; unshaded (FX_PARTICLE.flags 0x8000): blended by their light they were near invisible (probe
 * 2026-10-08). */
export const FX_PARTICLE_FILTER = (texture: string): number => (texture.includes('@') ? 0 : 1);
/** FXData track events (Game.exe 1.09: handlers by type at 0x46e31c): 1 hides a node and 2 shows it
 * (0x4afa50 / 0x4afac0 -> 0x4130a0, the node's hidden flag +0x4b), 3 starts an emitter at a node
 * (0x4afb30), 4 stops it (0x4afc50), 6 sets a node's texture (0x4afd40), 7 scrolls a node's texture by
 * two values a tick (0x4afde0; 0x575630 adds them to the mesh's UVs), 8 stops that (0x4afee0). */
export const FX_EVENT = { hide: 1, show: 2, emitStart: 3, emitStop: 4, texture: 6, scroll: 7, scrollStop: 8 } as const;
/** The track the effect plays (FXData; Game.exe reads every track by name). */
export const FX_MASTER_TRACK = 'MASTER';
/** What an event's flags word carries, in this order (Game.exe 1.09 0x46e360): [flag, kind, bytes]; a
 * string is zero-terminated: 0x2 the emitter id, 0x4 the node, 0x8 two f32 (a scroll), 0x10 a texture /
 * particle name. */
export const FX_EVENT_FIELDS: ReadonlyArray<readonly [number, 'id' | 'node' | 'name' | 'pair' | 'skip', number]> = [
  [0x2, 'id', 0], [0x4, 'node', 0], [0x8, 'pair', 8], [0x10, 'name', 0], [0x20, 'skip', 4], [0x40, 'skip', 8], [0x80, 'skip', 4], [0x100, 'skip', 0x68],
];
/** Name of an emitter's texture atlas: its frame prefix + this (Emperor\Textures\!cexp_atlas.blp). */
export const FX_ATLAS_SUFFIX = '_atlas';
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
