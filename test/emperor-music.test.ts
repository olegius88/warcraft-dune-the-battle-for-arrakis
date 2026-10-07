// Music playlists (src/emperor/music.ts) and their JASS in mission maps. Needs the user's game.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { loadMusic } from '../src/emperor/music.ts';
import { loadAll } from '../src/emperor/build-mission.ts';
import { readMeta } from '../src/emperor/mapxbf.ts';
import { ensureMap } from '../src/emperor/preview-map.ts';
import { buildMission } from '../src/emperor/mission.ts';
import { gameData, RAW_DIR } from '../src/config/paths.ts';
import { MUSIC_IMPORT_DIR } from '../src/config/music.ts';

const opts = { skip: fs.existsSync(gameData('MUSIC', 'MUSIC.BAG')) && fs.existsSync(path.join(RAW_DIR, 'Rules.txt')) ? false : 'Emperor music/data not available' };

test('each house has a battle playlist of its numbered tracks and a hub track', opts, () => {
  const music = loadMusic();
  assert.ok(music);
  for (const h of ['AT', 'HK', 'OR'] as const) {
    const battle = music.battle(h);
    assert.strictEqual(battle.length, 12, `${h}: 12 battle tracks`);
    assert.ok(battle.every((p) => p.startsWith(`${MUSIC_IMPORT_DIR}(${h}`) && p.endsWith('.mp3')));
    assert.deepStrictEqual(music.hub(h), [`${MUSIC_IMPORT_DIR}${h}_Map1.mp3`]);
  }
});

test('a mission with a playlist starts it; without one the script has no music calls', opts, () => {
  const all = loadAll();
  const meta = readMeta(path.join(ensureMap('#H3 ')[0] as string, 'test.xbf'));
  const base = { scripts: [], meta, ...all, name: 'music', playerHouse: 'Harkonnen' as const, kind: 'story' as const, hubMap: 'HK_Hub.w3x' };
  const withMusic = buildMission({ ...base, music: ['a\\one.mp3', 'a\\two.mp3'] });
  assert.ok(withMusic.script.includes('call PlayMusic("a\\\\one.mp3;a\\\\two.mp3")'));
  const without = buildMission(base);
  assert.ok(!without.script.includes('PlayMusic'));
});
