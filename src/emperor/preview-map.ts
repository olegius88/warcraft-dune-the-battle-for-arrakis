// Build a WC3 preview map from one Emperor map folder: converted terrain, a footman group at the
// player's base point and markers (wisps) on every GameElements point, so the conversion can be
// checked in-game. Usage: node src/emperor/preview-map.ts "<map folder substring>" [out.w3x]

import fs from 'node:fs';
import path from 'node:path';
import { readArchive } from './rfh.ts';
import { readMeta } from './mapxbf.ts';
import type { GamePoint } from './mapxbf.ts';
import { buildTerrain } from './terrain.ts';
import { buildMap } from '../wc3/map.ts';
import { real } from '../wc3/jass.ts';
import { UNIT } from '../config/wc3.ts';
import { DEFAULT_FACING, TIME_OF_DAY } from '../config/runtime.ts';
import { PREVIEW_FOOTMEN, PREVIEW_CAMERA_DISTANCE, PREVIEW_START_DELAY } from '../config/hub.ts';

import { MAPS_DIR, PREVIEW_OUT, gameData } from '../config/paths.ts';

/** Extract (once) the files of map folders whose name contains `needle`; returns folder paths. */
function ensureMap(needle: string): string[] {
  const found = fs.existsSync(MAPS_DIR) ? fs.readdirSync(MAPS_DIR).filter((d) => d.includes(needle)) : [];
  if (found.length) return found.map((d) => path.join(MAPS_DIR, d));
  for (const arch of ['MAPS0001', 'MAPS0002']) {
    for (const { name, data } of readArchive(gameData(arch), (n) => n.includes(needle) && /\/(test\.xbf|map\.inf)$/i.test(n))) {
      const p = path.join(MAPS_DIR, name);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, data);
    }
  }
  return fs.readdirSync(MAPS_DIR).filter((d) => d.includes(needle)).map((d) => path.join(MAPS_DIR, d));
}

export interface MapPreview {
  buffer: Buffer;
  title: string;
  /** WC3 cells */
  size: [number, number];
  points: number;
}

function previewMap(folder: string): MapPreview {
  const meta = readMeta(path.join(folder, 'test.xbf'));
  const t = buildTerrain(meta);
  const [mapW, mapH] = meta.mapSize as [number, number]; // buildTerrain has checked it
  const ge = meta.gameElements || {};
  const pts: Array<{ name: string; p: GamePoint }> = [];
  for (const [g, subs] of Object.entries(ge)) for (const [s, list] of Object.entries(subs)) for (const p of list) pts.push({ name: `${g}/${s}`, p });
  const base = (ge.Base && (ge.Base.Primary || [])[0]) || pts[0]?.p || { x: mapW * 16, y: mapH * 16 };
  const [bx, by] = t.toWorld(base.x, base.y);
  const lines = pts.map(({ name, p }) => {
    const [x, y] = t.toWorld(p.x, p.y);
    return `    call CreateUnit( Player(PLAYER_NEUTRAL_PASSIVE), '${UNIT.marker}', ${real(x)}, ${real(y)}, 0.0 ) // ${name}`;
  });
  const title = path.basename(folder);
  const m = buildMap({
    name: title, description: 'Emperor terrain preview', width: t.width, height: t.height, boundary: t.boundary,
    tileset: t.tileset, ground: t.ground, cliffs: t.cliffs, corner: t.corner, pathing: t.pathing, minimapColor: t.minimapColor,
    players: [{ id: 0, control: 'user', race: 'human', team: 0, x: bx, y: by, name: 'Atreides' }],
    functions: `function PreviewInit takes nothing returns nothing
    call CreateNUnitsAtLoc( ${PREVIEW_FOOTMEN}, '${UNIT.fallback}', Player(0), Location(${real(bx)}, ${real(by)}), ${real(DEFAULT_FACING)} )
${lines.join('\n')}
    call FogEnableOff()
    call FogMaskEnableOff()
    call SetTimeOfDay( ${real(TIME_OF_DAY)} )
    call SuspendTimeOfDay( true )
    call SetCameraField( CAMERA_FIELD_TARGET_DISTANCE, ${real(PREVIEW_CAMERA_DISTANCE)}, 0.0 )
    call SetCameraPosition( ${real(bx)}, ${real(by)} )
endfunction`,
    init: `    call TimerStart( CreateTimer(), ${real(PREVIEW_START_DELAY)}, false, function PreviewInit )`,
  });
  return { buffer: m.buffer, title, size: [t.width, t.height], points: pts.length };
}

if (import.meta.main) {
  const needle = process.argv[2] || '#T11 ';
  const out = process.argv[3] || PREVIEW_OUT;
  const folders = ensureMap(needle);
  if (!folders.length) throw new Error(`no map folder matching ${needle}`);
  const r = previewMap(folders[0] as string);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, r.buffer);
  console.log('preview', r.title, r.size.join('x'), 'points', r.points, '->', out);
}

export { ensureMap, previewMap };
