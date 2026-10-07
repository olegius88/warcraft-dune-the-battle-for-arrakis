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
import { MODEL_PATH, MAX_TEXTURE_SIZE, HOUSE_COLOUR_TEXTURE, HOUSE_COLOUR_PIXEL } from '../config/models.ts';

export interface ModelSet {
  /** Emperor object name -> value of the unit model field */
  model: Map<string, string>;
  /** archive path -> MDX / BLP */
  files: Record<string, Buffer>;
  /** objects whose model could not be converted, with the reason */
  failed: Map<string, string>;
}

/** Convert the models of the given objects (those ArtIni.txt gives an Xaf whose _H0 file exists). */
function buildModels(names: Iterable<string>, art: Map<string, ArtEntry>, archive = gameData('3DDATA0001')): ModelSet {
  const set: ModelSet = { model: new Map(), files: {}, failed: new Map() };
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
  const textureFiles = new Set<string>();
  const converted = new Map<string, string>(); // archive model file -> model field
  for (const [obj, file] of wanted) {
    let field = converted.get(file);
    if (!field) {
      const data = xbf.get(file) as Buffer;
      const key = baseName(file).replace(/_H0\.xbf$/i, '');
      try {
        const scene = readXbf(data);
        const ref = (tex: string): TextureRef => { textureFiles.add(tex.toLowerCase()); return { path: MODEL_PATH.texture(tex), alpha: false, teamColour: HOUSE_COLOUR_TEXTURE(tex) }; };
        const { model } = xbfToMdx(key, scene, readAnimations(data), ref);
        set.files[MODEL_PATH.model(key)] = writeMdx(model);
        field = MODEL_PATH.modelField(key);
        converted.set(file, field);
      } catch (e) {
        set.failed.set(obj, `${file}: ${(e as Error).message}`);
        continue;
      }
    }
    set.model.set(obj, field);
  }
  // textures: TGA -> BLP (power-of-two sides, at most MAX_TEXTURE_SIZE, mipmaps, alpha when used)
  for (const f of readArchive(archive, (n) => /^textures\//i.test(n) && textureFiles.has(baseName(n).toLowerCase()))) {
    const img = readTga(f.data);
    const side = (n: number): number => Math.min(MAX_TEXTURE_SIZE, pow2Ceil(n));
    let alpha = false;
    if (HOUSE_COLOUR_TEXTURE(baseName(f.name))) {
      // house-colour panels become see-through: the team colour layer under them shows
      for (let i = 0; i < img.rgba.length; i += 4) if (HOUSE_COLOUR_PIXEL(img.rgba[i] as number, img.rgba[i + 1] as number, img.rgba[i + 2] as number)) img.rgba[i + 3] = 0;
      alpha = true;
    }
    for (let i = 3; i < img.rgba.length && !alpha; i += 4) if ((img.rgba[i] as number) < 250) alpha = true;
    set.files[MODEL_PATH.texture(baseName(f.name))] = writeBlpImage(resize(img, side(img.width), side(img.height)), { alpha });
  }
  return set;
}

export { buildModels };
