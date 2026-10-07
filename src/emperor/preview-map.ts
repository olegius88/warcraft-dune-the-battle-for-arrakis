// Build a WC3 preview map from one Emperor map folder: converted terrain, a footman group at the
// player's base point and markers (wisps) on every GameElements point, so the conversion can be
// checked in-game. Usage: node src/emperor/preview-map.js "<map folder substring>" [out.w3x]

import fs from 'node:fs';
import path from 'node:path';
import { readArchive } from './rfh.ts';
import { readMeta } from './mapxbf.ts';
import { buildTerrain } from './terrain.ts';
import { buildMap } from '../wc3/map.ts';
import { real } from '../wc3/jass.ts';

const GAME = process.env.EMPEROR_DIR || 'G:\\Games\\Emperor';
const MAPS_DIR = path.join(import.meta.dirname, '..', '..', 'data', 'emperor', 'maps');

/** Extract (once) the files of map folders whose name contains `needle`; returns folder paths. */
function ensureMap(needle) {
  const found = fs.existsSync(MAPS_DIR) ? fs.readdirSync(MAPS_DIR).filter((d) => d.includes(needle)) : [];
  if (found.length) return found.map((d) => path.join(MAPS_DIR, d));
  for (const arch of ['MAPS0001', 'MAPS0002']) {
    for (const { name, data } of readArchive(path.join(GAME, 'DATA', arch), (n) => n.includes(needle) && /\/(test\.xbf|map\.inf)$/i.test(n))) {
      const p = path.join(MAPS_DIR, name);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, data);
    }
  }
  return fs.readdirSync(MAPS_DIR).filter((d) => d.includes(needle)).map((d) => path.join(MAPS_DIR, d));
}

function previewMap(folder) {
  const meta = readMeta(path.join(folder, 'test.xbf'));
  const t = buildTerrain(meta);
  const ge = meta.gameElements || {};
  const pts = [];
  for (const [g, subs] of Object.entries(ge)) for (const [s, list] of Object.entries(subs)) for (const p of list) pts.push({ name: `${g}/${s}`, p });
  const base = (ge.Base && (ge.Base.Primary || [])[0]) || pts[0]?.p || { x: meta.mapSize[0] * 16, y: meta.mapSize[1] * 16 };
  const [bx, by] = t.toWorld(base.x, base.y);
  const lines = pts.map(({ name, p }) => {
    const [x, y] = t.toWorld(p.x, p.y);
    return `    call CreateUnit( Player(PLAYER_NEUTRAL_PASSIVE), 'ewsp', ${real(x)}, ${real(y)}, 0.0 ) // ${name}`;
  });
  const title = path.basename(folder);
  const m = buildMap({
    name: title, description: 'Emperor terrain preview', width: t.width, height: t.height, boundary: t.boundary,
    tileset: t.tileset, ground: t.ground, cliffs: t.cliffs, corner: t.corner, pathing: t.pathing, minimapColor: t.minimapColor,
    players: [{ id: 0, control: 'user', race: 'human', team: 0, x: bx, y: by, name: 'Atreides' }],
    functions: `function PreviewInit takes nothing returns nothing
    call CreateNUnitsAtLoc( 6, 'hfoo', Player(0), Location(${real(bx)}, ${real(by)}), 270.0 )
${lines.join('\n')}
    call FogEnableOff()
    call FogMaskEnableOff()
    call SetTimeOfDay( 12.0 )
    call SuspendTimeOfDay( true )
    call SetCameraField( CAMERA_FIELD_TARGET_DISTANCE, 3200.0, 0.0 )
    call SetCameraPosition( ${real(bx)}, ${real(by)} )
endfunction`,
    init: '    call TimerStart( CreateTimer(), 0.1, false, function PreviewInit )',
  });
  return { buffer: m.buffer, title, size: [t.width, t.height], points: pts.length };
}

if (import.meta.main) {
  const needle = process.argv[2] || '#T11 ';
  const out = process.argv[3] || path.join(import.meta.dirname, '..', '..', 'build', 'preview', 'Preview.w3x');
  const folders = ensureMap(needle);
  if (!folders.length) throw new Error(`no map folder matching ${needle}`);
  const r = previewMap(folders[0]);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, r.buffer);
  console.log('preview', r.title, r.size.join('x'), 'points', r.points, '->', out);
}

export { ensureMap, previewMap };
