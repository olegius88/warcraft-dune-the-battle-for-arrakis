// Emperor sidebar icons -> WC3 command card icons. ArtIni.txt names the icon of every object
// (Icon / IconGrey = "icons\\<file>.tga"); the files are Textures/<file>.tga in 3DDATA0001
// (64x64 TGA). Each becomes a BLP1 (palette, mipmaps) at the stock icon paths (config ICON_PATH).

import { readArchive } from './rfh.ts';
import { baseName } from './artini.ts';
import type { ArtEntry } from './artini.ts';
import { readTga } from '../wc3/tga.ts';
import { writeBlpImage, resize } from '../wc3/blp.ts';
import { ICON_PATH, ICON_SIZE } from '../config/wc3.ts';
import { gameData } from '../config/paths.ts';

export interface IconSet {
  /** Emperor object name -> enabled icon path */
  icon: Map<string, string>;
  /** archive path -> BLP */
  files: Record<string, Buffer>;
}

/** Textures/<name> of 3DDATA0001 by lower-case file name (only the wanted ones are read). */
function readTextures(wanted: Set<string>, archive = gameData('3DDATA0001')): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const f of readArchive(archive, (n) => /^textures\//i.test(n) && wanted.has(baseName(n).toLowerCase()))) {
    out.set(baseName(f.name).toLowerCase(), f.data);
  }
  return out;
}

/** Icons of the given objects (those ArtIni.txt gives an icon whose texture exists). */
function buildIcons(names: Iterable<string>, art: Map<string, ArtEntry>, textures?: Map<string, Buffer>): IconSet {
  const wanted = [...names].map((n) => art.get(n.toLowerCase())).filter((e): e is ArtEntry => Boolean(e && e.icon));
  const files = new Set<string>();
  for (const e of wanted) {
    files.add(baseName(e.icon as string).toLowerCase());
    if (e.iconGrey) files.add(baseName(e.iconGrey).toLowerCase());
  }
  const tex = textures ?? readTextures(files);
  const set: IconSet = { icon: new Map(), files: {} };
  const blp = (file: string): Buffer | null => {
    const t = tex.get(baseName(file).toLowerCase());
    return t ? writeBlpImage(resize(readTga(t), ICON_SIZE, ICON_SIZE), { mipmaps: false }) : null; // UI art: no mipmaps
  };
  for (const e of wanted) {
    const on = blp(e.icon as string);
    if (!on) continue;
    const key = e.name.replace(/[^A-Za-z0-9_]/g, '');
    set.icon.set(e.name, ICON_PATH.enabled(key));
    set.files[ICON_PATH.enabled(key)] = on;
    const off = e.iconGrey ? blp(e.iconGrey) : null;
    if (off) set.files[ICON_PATH.disabled(key)] = off;
  }
  return set;
}

export { buildIcons, readTextures };
