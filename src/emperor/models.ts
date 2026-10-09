// Emperor art of the Rules.txt objects -> WC3 models: ArtIni.txt Xaf names the model
// (Units|Buildings/<Xaf>_H0.xbf in 3DDATA0001, the high level of detail); each is converted by
// model.ts and its textures (Textures/*.tga) become BLP1 with mipmaps (alpha kept when used).

import { readArchive, readIndex } from './rfh.ts';
import { readXbf, readAnimations } from './xbf.ts';
import { xbfToMdx } from './model.ts';
import type { TextureRef } from './model.ts';
import type { ArtEntry } from './artini.ts';
import { baseName } from './artini.ts';
import { readTga } from '../wc3/tga.ts';
import { writeBlpImage, resize, pow2Ceil } from '../wc3/blp.ts';
import { writeMdx } from '../wc3/mdx.ts';
import { gameData } from '../config/paths.ts';
import { MODEL_PATH, MODEL_DEPLOY_ANIMS, MS_PER_FRAME, MAX_TEXTURE_SIZE, HOUSE_COLOUR_TEXTURE, HOUSE_COLOUR_PIXEL, COLOUR_KEY_PIXEL, WEAPON_ATTACHMENT } from '../config/models.ts';

export interface ModelSet {
  /** Emperor object name -> value of the unit model field */
  model: Map<string, string>;
  /** archive path -> MDX / BLP */
  files: Record<string, Buffer>;
  /** objects whose model could not be converted, with the reason */
  failed: Map<string, string>;
  /** objects whose converted model has a weapon attachment (a #fire node: model.ts) */
  weapon: Set<string>;
  /** objects whose model has the deploy animations: seconds a deploy and an undeploy take
   * (config MODEL_DEPLOY_ANIMS, at MS_PER_FRAME) */
  deploy: Map<string, [number, number]>;
}

/** Convert the models of the given objects (those ArtIni.txt gives an Xaf whose _H0 file exists). */
function buildModels(names: Iterable<string>, art: Map<string, ArtEntry>, archive = gameData('3DDATA0001')): ModelSet {
  const set: ModelSet = { model: new Map(), files: {}, failed: new Map(), weapon: new Set(), deploy: new Map() };
  const armed = new Set<string>(); // archive model files with a weapon attachment
  const index = readIndex(archive + '.RFH');
  const byLower = new Map(index.map((e) => [e.name.toLowerCase(), e.name]));
  // object -> archive name of its model
  const wanted = new Map<string, string>();
  for (const n of names) {
    const e = art.get(n.toLowerCase());
    if (!e?.xaf) continue;
    const file = [`units/${e.xaf}_h0.xbf`, `buildings/${e.xaf}_h0.xbf`].map((p) => byLower.get(p.toLowerCase())).find(Boolean);
    if (file) wanted.set(e.name, file);
    else set.failed.set(e.name, `no model file for Xaf ${e.xaf}`);
  }
  const files = new Set(wanted.values());
  const xbf = new Map<string, Buffer>();
  for (const f of readArchive(archive, (n) => files.has(n))) xbf.set(f.name, f.data);
  // two passes: the textures the models use, converted (which have a colour key), then the models,
  // whose layers on keyed textures are alpha-tested (COLOUR_KEY_PIXEL)
  const textureFiles = new Set<string>();
  const keyed = new Set<string>();
  const scenes = new Map<string, ReturnType<typeof readXbf>>();
  for (const [obj, file] of wanted) {
    if (scenes.has(file) || set.failed.has(obj)) continue;
    try {
      const scene = readXbf(xbf.get(file) as Buffer);
      xbfToMdx(baseName(file), scene, readAnimations(xbf.get(file) as Buffer), (tex) => { textureFiles.add(tex.toLowerCase()); return { path: MODEL_PATH.texture(tex), alpha: false }; });
      scenes.set(file, scene);
    } catch (e) {
      set.failed.set(obj, `${file}: ${(e as Error).message}`);
    }
  }
  Object.assign(set.files, convertTextures(archive, textureFiles, undefined, keyed));
  const converted = new Map<string, string>(); // archive model file -> model field
  for (const [obj, file] of wanted) {
    const scene = scenes.get(file);
    if (!scene) continue;
    let field = converted.get(file);
    if (!field) {
      const data = xbf.get(file) as Buffer;
      const key = baseName(file).replace(/_H0\.xbf$/i, '');
      try {
        const ref = (tex: string): TextureRef => ({ path: MODEL_PATH.texture(tex), alpha: keyed.has(tex.toLowerCase()), teamColour: HOUSE_COLOUR_TEXTURE(tex) });
        const { model } = xbfToMdx(key, scene, readAnimations(data), ref);
        if (model.attachments?.some((a) => a.name === WEAPON_ATTACHMENT)) armed.add(file);
        set.files[MODEL_PATH.model(key)] = writeMdx(model);
        field = MODEL_PATH.modelField(key);
        converted.set(file, field);
      } catch (e) {
        set.failed.set(obj, `${file}: ${(e as Error).message}`);
        continue;
      }
    }
    set.model.set(obj, field);
    if (armed.has(file)) set.weapon.add(obj);
    const anims = readAnimations(xbf.get(file) as Buffer);
    const len = MODEL_DEPLOY_ANIMS.map((n) => anims.get(n)?.[0]).map((r) => (r ? (Math.abs(r.end - r.start) * MS_PER_FRAME) / 1000 : 0));
    if (len.every((s) => s > 0)) set.deploy.set(obj, len as [number, number]);
  }
  return set;
}

/** A glow drawn additive on black in Emperor: its light becomes its alpha, so blending shows the colour
 * where it shines and nothing where it is black, without burning to white. A texture with an alpha
 * of its own (the @ ones, !@%Bru: 0..201) keeps it; all 255 or all 0 is no alpha (!05gunstr). */
function lightAlpha(rgba: Uint8Array | Buffer): void {
  let lo = 255, hi = 0;
  for (let i = 3; i < rgba.length; i += 4) { lo = Math.min(lo, rgba[i] as number); hi = Math.max(hi, rgba[i] as number); }
  if (lo !== hi) return;
  for (let i = 0; i < rgba.length; i += 4) rgba[i + 3] = Math.max(rgba[i] as number, rgba[i + 1] as number, rgba[i + 2] as number);
}

/** Textures/<file>.tga of the archive (names in lower case) -> BLP (power-of-two sides, at most
 * MAX_TEXTURE_SIZE, mipmaps, alpha when used), by archive path. */
function convertTextures(archive: string, textureFiles: Set<string>, alphaFromLight?: (name: string) => boolean, keyed?: Set<string>): Record<string, Buffer> {
  const files: Record<string, Buffer> = {};
  for (const f of readArchive(archive, (n) => /^textures\//i.test(n) && textureFiles.has(baseName(n).toLowerCase()))) {
    const img = readTga(f.data);
    const side = (n: number): number => Math.min(MAX_TEXTURE_SIZE, pow2Ceil(n));
    let alpha = false;
    // colour key (COLOUR_KEY_PIXEL): see-through, the texture's layers alpha-tested (`keyed`)
    let key = false;
    for (let i = 0; i < img.rgba.length; i += 4) {
      if (!COLOUR_KEY_PIXEL(img.rgba[i] as number, img.rgba[i + 1] as number, img.rgba[i + 2] as number)) continue;
      img.rgba[i] = 0; img.rgba[i + 1] = 0; img.rgba[i + 2] = 0; img.rgba[i + 3] = 0;
      key = true;
    }
    if (key) { alpha = true; keyed?.add(baseName(f.name).toLowerCase()); }
    if (alphaFromLight?.(baseName(f.name))) {
      lightAlpha(img.rgba);
      alpha = true;
    } else if (HOUSE_COLOUR_TEXTURE(baseName(f.name))) {
      // house-colour panels become see-through: the team colour layer under them shows
      for (let i = 0; i < img.rgba.length; i += 4) if (HOUSE_COLOUR_PIXEL(img.rgba[i] as number, img.rgba[i + 1] as number, img.rgba[i + 2] as number)) img.rgba[i + 3] = 0;
      alpha = true;
    }
    for (let i = 3; i < img.rgba.length && !alpha; i += 4) if ((img.rgba[i] as number) < 250) alpha = true;
    files[MODEL_PATH.texture(baseName(f.name))] = writeBlpImage(resize(img, side(img.width), side(img.height)), { alpha });
  }
  return files;
}

export { buildModels, convertTextures, lightAlpha };
