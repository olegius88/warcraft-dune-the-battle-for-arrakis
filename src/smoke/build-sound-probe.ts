// Sound probe map (src/jass/smoke/sound-probe.j): opens and plays movie sounds of growing length from
// the Warcraft III folder (the WAVs fmv.ts wrote, and MP3s of the same movies made here).
// Usage: node src/smoke/build-sound-probe.ts, then (idle-gated)
//        pwsh tools/run-wc3-classic.ps1 -Map build\test\SoundProbe.w3x -Seconds 60

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildMap } from '../wc3/map.ts';
import { renderFile } from '../wc3/template.ts';
import { str } from '../wc3/jass.ts';
import { BUILD_DIR, WC3_DIR, gameData, jassFile } from '../config/paths.ts';
import { MOVIE_PATH } from '../config/movies.ts';

// growing WAV sizes: H01_F00E 27.6 MB (played), I00_F01E 19.4, I00_F02E 35.8, A08_F00E 42.8
const movies = ['I00_F01E', 'H01_F00E', 'I00_F02E', 'A08_F00E'];
const files: string[] = [];
for (const m of movies) {
  files.push(MOVIE_PATH.sound(m));
  const mp3 = MOVIE_PATH.sound(m).replace(/\.wav$/, '.mp3');
  const local = path.join(WC3_DIR, ...mp3.split('\\'));
  if (!fs.existsSync(local)) execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', gameData('MOVIES', `${m}.BIK`), '-vn', '-c:a', 'libmp3lame', '-b:a', '320k', local]);
  files.push(mp3);
}
const out = path.join(BUILD_DIR, 'test', 'SoundProbe.w3x');
const m = buildMap({
  name: 'Sound Probe', width: 32, height: 32, tileset: 'B', ground: ['Bdsr'], cliffs: ['CBde'], corner: () => ({}),
  players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
  globals: '    string array udg_log\n    integer udg_n = 0\n    integer udg_i = 0\n    trigger udg_t = null',
  functions: renderFile(jassFile('smoke/sound-probe'), { report: 'DuneSmoke\\sound.pld', calls: files.map((f) => `    call SoundProbeOne(${str(f)})`).join('\n') }),
  // a trigger thread (a timer's may not wait): TriggerSleepAction between the sounds
  init: '    set udg_t = CreateTrigger()\n    call TriggerAddAction(udg_t, function SoundProbeRun)\n    call TriggerRegisterTimerEvent(udg_t, 2.0, false)',
});
fs.writeFileSync(out, m.buffer);
console.log('sound probe ->', out, files.join(', '));
