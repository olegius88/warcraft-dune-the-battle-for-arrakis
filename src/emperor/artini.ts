// ArtIni.txt (MODEL0001): art of every Rules.txt object.
//   [Name]
//   Icon = "icons\\HK_LightInf.tga"      sidebar icon (the file is Textures/<basename> in 3DDATA0001)
//   IconGrey = "icons\\grey_HK_LightInf.tga"  icon while it cannot be built
//   Xaf = "HK_ltinf"                     model: Units|Buildings/<Xaf>_H0/M0/L0.xbf (levels of detail)
//   XafConstruction = "construction_...xbf"   model while being built
//   ClipSphere = 140, SideBarType = "Units", LoadFlagOnlyPreplaced (flags without a value)
// Values are C strings (backslashes doubled).

import fs from 'node:fs';

export interface ArtEntry {
  name: string;
  icon?: string;
  iconGrey?: string;
  xaf?: string;
  xafConstruction?: string;
  /** every key = value as written (strings unquoted and unescaped) */
  raw: Record<string, string>;
}

function parseArtIni(text: string): Map<string, ArtEntry> {
  const out = new Map<string, ArtEntry>();
  let cur: ArtEntry | null = null;
  for (const line0 of text.split(/\r?\n/)) {
    const line = line0.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    const sec = /^\[([^\]]+)\]$/.exec(line);
    if (sec) {
      cur = { name: (sec[1] as string).trim(), raw: {} };
      out.set(cur.name.toLowerCase(), cur);
      continue;
    }
    const kv = /^(\w+)\s*=\s*(.*)$/.exec(line);
    if (!cur || !kv) continue;
    let v = (kv[2] as string).trim();
    const q = /^"(.*)"$/.exec(v);
    if (q) v = (q[1] as string).replace(/\\\\/g, '\\');
    const key = kv[1] as string;
    cur.raw[key] = v;
    if (key === 'Icon') cur.icon = v;
    else if (key === 'IconGrey') cur.iconGrey = v;
    else if (key === 'Xaf') cur.xaf = v;
    else if (key === 'XafConstruction') cur.xafConstruction = v;
  }
  return out;
}

function loadArtIni(file: string): Map<string, ArtEntry> {
  return parseArtIni(fs.readFileSync(file, 'latin1'));
}

/** File name of an art path ("icons\\HK_LightInf.tga" -> "HK_LightInf.tga"). */
const baseName = (p: string): string => p.split(/[\\/]/).pop() as string;

export { parseArtIni, loadArtIni, baseName };
