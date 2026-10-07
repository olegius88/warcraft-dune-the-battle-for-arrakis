// Intro maps of the campaign (src/jass/intro/functions.j): small maps that only show movies, the
// way Emperor shows them before a campaign: the generic intro (button "Вступление": Legals,
// IntroPrologue, IntroAnimation, the Landsraad council) and per house the house selection movie and
// Phase0a before the house's start mission.

import { buildMap } from '../wc3/map.ts';
import { str, real } from '../wc3/jass.ts';
import { renderFile } from '../wc3/template.ts';
import { jassFile } from '../config/paths.ts';
import { TERRAIN } from '../config/wc3.ts';
import { INTRO_MAP } from '../config/campaign.ts';
import { DEBUG_REPORT_DIR } from '../config/runtime.ts';
import { moviePlayer } from './movie-player.ts';
import type { PlayerMovies } from './movie-player.ts';

export interface IntroOptions {
  name: string;
  /** movies in order (names of MOVIES.TXT); those without frames are skipped by the player */
  movies: string[];
  player?: PlayerMovies;
  /** map file of the campaign to go to afterwards; none: back to the campaign screen */
  next?: string;
  /** report file name (autotest builds) */
  report?: string;
}

function buildIntro(o: IntroOptions): { buffer: Buffer; script: string } {
  const player = moviePlayer(o.player, `${DEBUG_REPORT_DIR}\\${o.name}_Movies.pld`);
  const functions = renderFile(jassFile('intro/functions'), {
    movieFunctions: player.functions,
    movieAdds: o.movies.length ? `    call EmpMovieAdd(${str(o.movies.join(';'))})` : '',
    next: o.next ?? '',
    autoReport: o.report ? `${DEBUG_REPORT_DIR}\\${o.report}` : '',
  });
  const m = buildMap({
    name: o.name, description: '', width: INTRO_MAP.size, height: INTRO_MAP.size,
    tileset: TERRAIN.tileset, ground: [...TERRAIN.hubGround], cliffs: [TERRAIN.cliff], corner: () => ({}),
    players: [{ id: 0, control: 'user', race: 'human', team: 0, x: 0, y: 0 }],
    globals: player.globals, functions,
    init: `    call TimerStart( CreateTimer(), ${real(INTRO_MAP.startDelay)}, false, function EmpIntroStart )`,
  });
  return { buffer: m.buffer, script: m.script };
}

export { buildIntro };
