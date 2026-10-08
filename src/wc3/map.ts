// Assemble a playable .w3x from a high-level map description.

import * as F from './formats.ts';
import { MpqWriter } from './mpq.ts';
import { buildScript } from './jass.ts';
import { writeBlpPaletted } from './blp.ts';
import { STORED_UNCOMPRESSED } from '../config/wc3.ts';

import type { Rgb } from './blp.ts';
import type { ScriptPlayer } from './jass.ts';

const PLAYER_TYPE = { user: 1, computer: 2, neutral: 3, rescuable: 4 } as const;
const PLAYER_RACE = { human: 1, orc: 2, undead: 3, nightelf: 4 } as const;

export interface MapSpec {
  name: string;
  author?: string;
  description?: string;
  /** cells (multiple of 32 is what the editor offers) */
  width: number;
  height: number;
  boundary?: F.Boundary;
  tileset: string;
  ground: string[];
  cliffs: string[];
  corner: F.Terrain['corner'];
  pathing?: ((px: number, py: number) => number) | null;
  /** minimap colour of a cell (cellY=0 bottom); default: colour of the corner's ground slot */
  minimapColor?: ((cellX: number, cellY: number) => Rgb) | null;
  players: ScriptPlayer[];
  /** JASS fragments */
  globals?: string;
  functions?: string;
  init?: string;
  tilesetDnc?: string;
  ambientDay?: string;
  ambientNight?: string;
  loadingTitle?: string;
  loadingSubtitle?: string;
  loadingText?: string;
  campaignBackground?: number;
  /** w3i loading screen model (an imported picture model, src/emperor/loading-screen.ts) */
  loadingScreenModel?: string;
  strings?: Map<number, string> | Record<number, string>;
  /** extra archive files (path -> data) */
  imports?: Record<string, Buffer>;
}

export interface BuiltMap {
  buffer: Buffer;
  script: string;
}

function buildMap(m: MapSpec): BuiltMap {
  const players = m.players;
  const teams = [...new Set(players.map((p) => p.team))];
  // The map's texts go to war3map.wts and the w3i / config() refer to them as TRIGSTR_nnn, like the
  // editor's: written inline, a long briefing crashed the 1.31.1 client while loading the map
  // (AT_A07, 2026-10-08; regression test in test/wc3-map.test.ts).
  const strings = new Map<number, string>(m.strings instanceof Map ? m.strings : Object.entries(m.strings || {}).map(([k, v]): [number, string] => [Number(k), v]));
  let nextString = Math.max(0, ...strings.keys()) + 1;
  const trig = (text: string): string => {
    if (!text) return '';
    const id = nextString++;
    strings.set(id, text);
    return `TRIGSTR_${String(id).padStart(3, '0')}`;
  };
  const name = trig(m.name);
  const description = trig(m.description || '');
  const w3i = F.writeW3i({
    name,
    author: trig(m.author || 'warcraft-dune'),
    description,
    width: m.width,
    height: m.height,
    boundary: m.boundary,
    tileset: m.tileset,
    loadingTitle: m.loadingTitle ? trig(m.loadingTitle) : name,
    loadingSubtitle: trig(m.loadingSubtitle || ''),
    campaignBackground: m.campaignBackground,
    ...(m.loadingScreenModel ? { loadingScreenModel: m.loadingScreenModel } : {}),
    loadingText: trig(m.loadingText || ''),
    players: players.map((p) => ({
      id: p.id, type: PLAYER_TYPE[p.control], race: PLAYER_RACE[p.race || 'human'], name: p.name, x: p.x, y: p.y, fixed: true,
    })),
    forces: teams.map((t) => {
      const members = players.filter((p) => p.team === t);
      return {
        flags: 0x1 | 0x2, // allied, allied victory
        playerMask: members.reduce((mask, p) => mask | (1 << p.id), 0),
        // the lobby shows force names: one player's force is named after them (test "a force of one
        // named player"; "Force N" over every side looked unfinished in the contest map's lobby)
        name: members.length === 1 && members[0]?.name ? members[0].name : `Force ${t + 1}`,
      };
    }),
  });
  const script = buildScript({
    name, description, width: m.width, height: m.height, boundary: m.boundary,
    players, globals: m.globals, functions: m.functions, init: m.init, tilesetDnc: m.tilesetDnc,
    ambientDay: m.ambientDay, ambientNight: m.ambientNight,
  });

  const mpq = new MpqWriter();
  mpq.add('war3map.w3i', w3i);
  mpq.add('war3map.w3e', F.writeW3e({ tileset: m.tileset, ground: m.ground, cliffs: m.cliffs, width: m.width, height: m.height, corner: m.corner }));
  mpq.add('war3map.wpm', F.writeWpm(m.width, m.height, m.pathing));
  mpq.add('war3map.shd', F.writeShd(m.width, m.height));
  mpq.add('war3map.doo', F.writeDoodadsEmpty());
  mpq.add('war3mapUnits.doo', F.writeUnitsDooEmpty());
  mpq.add('war3map.mmp', F.writeMmpEmpty());
  // Mandatory in practice: without a minimap the 3.0 client crashes (0xC0000005) on load
  // and in the map browser. Regression test: test/wc3-map.test.ts.
  mpq.add('war3mapMap.blp', buildMinimap(m));
  mpq.add('war3map.j', script);
  // Standard auxiliary files every editor-saved map has. Written empty: the client has crashed on
  // missing "optional" files before (minimap), so we do not rely on them being optional.
  mpq.add('war3map.wts', F.writeWts(strings));
  mpq.add('war3map.w3r', F.writeRegionsEmpty());
  mpq.add('war3map.w3c', F.writeCamerasEmpty());
  mpq.add('war3map.w3s', F.writeSoundsEmpty());
  mpq.add('war3map.imp', F.writeImpEmpty());
  for (const ext of ['w3u', 'w3t', 'w3b', 'w3d', 'w3a', 'w3h', 'w3q'] as const) {
    if (!(m.imports && m.imports[`war3map.${ext}`])) mpq.add(`war3map.${ext}`, F.writeObjectsEmpty());
  }
  for (const [path, data] of Object.entries(m.imports || {})) {
    mpq.add(path, data, { compress: !STORED_UNCOMPRESSED.test(path) });
  }
  return { buffer: mpq.toBuffer(), script };
}

// Fallback minimap colours per ground-tile slot when the map gives no minimapColor().
const DEFAULT_COLORS: Rgb[] = [[214, 170, 104], [180, 130, 80], [120, 100, 80], [150, 120, 90], [90, 80, 70], [200, 150, 60],
  [230, 190, 120], [160, 110, 60], [110, 90, 70], [70, 60, 50], [220, 120, 40], [190, 90, 30], [140, 140, 140], [100, 100, 100], [60, 60, 60], [30, 30, 30]];

/**
 * 256x256 minimap covering the whole map. m.minimapColor(cellX, cellY) (cellY=0 bottom)
 * may return [r,g,b]; otherwise the colour of the corner's ground texture slot is used.
 */
function buildMinimap(m: MapSpec): Buffer {
  const size = 256;
  return writeBlpPaletted(size, size, (px, py) => {
    const cx = Math.min(m.width - 1, Math.floor((px * m.width) / size));
    const cy = Math.min(m.height - 1, Math.floor(((size - 1 - py) * m.height) / size));
    if (m.minimapColor) return m.minimapColor(cx, cy);
    const c = m.corner(cx, cy) || {};
    return DEFAULT_COLORS[(c.texture || 0) & 15] as Rgb;
  });
}

export type ObjectExt = 'w3u' | 'w3t' | 'w3b' | 'w3d' | 'w3a' | 'w3h' | 'w3q';

export interface CampaignSpec extends F.CampaignInfo {
  maps: Array<F.CampaignMapEntry & { buffer: Buffer }>;
  strings?: Map<number, string> | Record<number, string>;
  objects?: Partial<Record<ObjectExt, Buffer>>;
  imports?: Record<string, Buffer>;
}

function buildCampaign(c: CampaignSpec): Buffer {
  const mpq = new MpqWriter();
  mpq.add('war3campaign.w3f', F.writeW3f(c));
  // Campaign-level strings, imports and object data, written even when empty: real campaigns
  // always carry them (see docs in src/wc3/README.md), and their absence is suspected of
  // making 1.31 skip the campaign and 3.0 crash when starting a mission.
  mpq.add('war3campaign.wts', F.writeWts(c.strings || {}));
  mpq.add('war3campaign.imp', F.writeImpEmpty());
  for (const ext of ['w3u', 'w3t', 'w3b', 'w3d', 'w3a', 'w3h', 'w3q'] as const) {
    mpq.add(`war3campaign.${ext}`, (c.objects && c.objects[ext]) || F.writeObjectsEmpty());
  }
  for (const m of c.maps) mpq.add(m.file, m.buffer, { compress: false }); // embedded maps are stored plainly
  for (const [path, data] of Object.entries(c.imports || {})) mpq.add(path, data, { compress: !STORED_UNCOMPRESSED.test(path) });
  return mpq.toBuffer();
}

export { buildMap, buildCampaign };
