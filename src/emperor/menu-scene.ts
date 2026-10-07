// The campaign screen background: Emperor's main menu scene (config/menu.ts MENU_SCENE) without its
// buttons, converted like the unit models (model.ts) but as a whole scene: every texture drawn with
// the blend its flag character asks for, every animated node (the planet, rings, stars) looping on
// its own, and a camera where Emperor's menu camera stands. Its textures become BLPs with mipmaps.

import { readArchive } from './rfh.ts';
import { readXbf } from './xbf.ts';
import { xbfToMdx, AXES } from './model.ts';
import type { TextureRef } from './model.ts';
import { baseName } from './artini.ts';
import { readTga } from '../wc3/tga.ts';
import { writeBlpImage, resize, pow2Ceil } from '../wc3/blp.ts';
import type { RgbaImage } from '../wc3/blp.ts';
import { writeMdx, FILTER } from '../wc3/mdx.ts';
import type { V3 } from '../wc3/mdx.ts';
import { gameData } from '../config/paths.ts';
import { MENU_SCENE, MENU_SKIP_ROOT, MENU_MODEL, MENU_CAMERA, MENU_STAND_MS, MENU_TEXTURE_FLAG_FILTER } from '../config/menu.ts';

/** Column-major 4x4 times a point. */
const apply = (m: number[], p: V3): V3 => [0, 1, 2].map((r) => (m[r] as number) * p[0] + (m[4 + r] as number) * p[1] + (m[8 + r] as number) * p[2] + (m[12 + r] as number)) as V3;

/** Archive path -> file (the model and its textures). */
function buildMenuScene(): Record<string, Buffer> {
  const [file] = readArchive(gameData(MENU_SCENE.archive), (n) => n.toLowerCase() === MENU_SCENE.file.toLowerCase());
  if (!file) throw new Error(`${MENU_SCENE.file} not in ${MENU_SCENE.archive}`);
  const scene = readXbf(file.data);
  // the scene's textures (3DDATA0001 Textures/)
  const wanted = new Set(scene.textures.map((t) => t.toLowerCase()));
  const images = new Map<string, RgbaImage>();
  for (const f of readArchive(gameData('3DDATA0001'), (n) => /^textures\//i.test(n) && wanted.has(baseName(n).toLowerCase()))) images.set(baseName(f.name).toLowerCase(), readTga(f.data));
  const hasAlpha = (img: RgbaImage): boolean => { for (let i = 3; i < img.rgba.length; i += 4) if ((img.rgba[i] as number) < 250) return true; return false; };
  const blend = (raw: string): number | null => {
    const img = images.get(raw.toLowerCase());
    if (!img) return null; // missing texture: leave the faces out
    const flag = MENU_TEXTURE_FLAG_FILTER[raw[0] as keyof typeof MENU_TEXTURE_FLAG_FILTER];
    if (flag) return FILTER[flag];
    return hasAlpha(img) ? FILTER.blend : FILTER.none;
  };
  const ref = (tex: string): TextureRef | null => images.has(tex.toLowerCase()) ? { path: MENU_MODEL.texture(tex), alpha: false, teamColour: false } : null;
  const { model, textures } = xbfToMdx('MainMenu', scene, new Map(), ref, { keepRoot: (n) => !MENU_SKIP_ROOT(n), blend, ownLoops: MENU_STAND_MS });
  // Emperor's camera: at the origin looking along +Z, Y up; in model space through the same axes
  const eye = apply(AXES, [0, 0, 0]);
  const target = apply(AXES, [0, 0, MENU_CAMERA.lookAt]);
  model.cameras = [{ name: 'MenuCamera', position: eye, target, fieldOfView: MENU_CAMERA.fieldOfView, nearClip: MENU_CAMERA.near, farClip: MENU_CAMERA.far }];
  const out: Record<string, Buffer> = { [MENU_MODEL.model]: writeMdx(model) };
  for (const t of textures) {
    const img = images.get(t.toLowerCase()) as RgbaImage;
    // full size (the scene's are at most 512)
    out[MENU_MODEL.texture(t)] = writeBlpImage(resize(img, pow2Ceil(img.width), pow2Ceil(img.height)), { alpha: hasAlpha(img) });
  }
  return out;
}

export { buildMenuScene };
