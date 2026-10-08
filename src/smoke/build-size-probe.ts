// Size probe: does the 1.31.1 client load a single-player map with this many MB of imports? The
// converted frames of the given movies (G:\Games\Warcraft III\Emperor\Movies) go into the map; the
// map writes CustomMapData\DuneSmoke\size.pld once its script runs and shows the last frame.
// Usage: node src/smoke/build-size-probe.ts A00_F00E A01_F00E, then
//        pwsh tools/run-wc3-classic.ps1 -Map build\test\SizeProbe.w3x -Seconds 40 -Capture <png>

import fs from 'node:fs';
import path from 'node:path';
import { buildMap } from '../wc3/map.ts';
import { BUILD_DIR, WC3_DIR } from '../config/paths.ts';
import { MOVIE_PATH } from '../config/movies.ts';

const movies = process.argv.slice(2);
const imports: Record<string, Buffer> = {};
let last = '';
for (const m of movies) {
  const dir = path.join(WC3_DIR, 'Emperor', 'Movies', m);
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.blp')).sort()) {
    const p = MOVIE_PATH.frame(m, Number(f.replace('.blp', '')));
    imports[p] = fs.readFileSync(path.join(dir, f));
    last = p;
  }
}
const mb = Object.values(imports).reduce((s, b) => s + b.length, 0) / 1024 / 1024;
const out = path.join(BUILD_DIR, 'test', 'SizeProbe.w3x');
const m = buildMap({
  name: 'Size Probe', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }, { id: 1, control: 'computer', race: 'human', team: 1, x: 800, y: 800 }],
  imports,
  globals: '',
  functions: `function SizeProbeRun takes nothing returns nothing
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload("loaded ${Math.round(mb)} MB")
    call PreloadGenEnd("DuneSmoke\\\\size.pld")
    call DisplayTimedTextToPlayer(Player(0), 0.0, 0.0, 30.0, "loaded ${Math.round(mb)} MB")
    call SetCineFilterTexture(${JSON.stringify(last.replace(/\\/g, '\\\\'))})
    call SetCineFilterStartColor(255, 255, 255, 255)
    call SetCineFilterEndColor(255, 255, 255, 255)
    call SetCineFilterDuration(0.0)
    call DisplayCineFilter(true)
endfunction`,
  init: '    call TimerStart(CreateTimer(), 1.0, false, function SizeProbeRun)',
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, m.buffer);
console.log(`size probe -> ${out}: ${Math.round(mb)} MB of imports, map ${Math.round(m.buffer.length / 1024 / 1024)} MB`);
