// Writers for the map-level WC3 files we generate. Versions are deliberately the
// pre-2.0 ones (w3i 31, w3e 11, doo 8/11) that the vast majority of maps use and
// the 3.0 client still loads. Layouts follow
// https://github.com/ChiefOfGxBxL/WC3MapSpecification (Info/0-33.md, Terrain/12.md
// with the v11 differences it lists, Doodads/8_11.md, Units/8_11.md) and the
// mdx-m3-viewer readers, which round-trip real v31/v25 files byte-exactly
// (see test/wc3-formats.test.ts).

import { BinaryWriter } from './binary.ts';

const CELL = 128; // world units per terrain cell

// ---------------------------------------------------------------- w3i ----

// w3i format targets, from real maps: 1.31.1 classic writes v28 / editor 6072 / build 1.31.1.12164;
// the 1.32+ editor writes v31 / 6108 / 1.32.3.14883. Reforged loads both.
export type W3iVersion = 28 | 31;
const W3I_TARGETS: Record<W3iVersion, { editor: number; build: number[] }> = {
  28: { editor: 6072, build: [1, 31, 1, 12164] },
  31: { editor: 6108, build: [1, 32, 3, 14883] },
};

/** Map boundary cells: left, right, bottom, top. */
export type Boundary = [number, number, number, number];

export interface W3iPlayer {
  id: number;
  /** 1 human, 2 computer, 3 neutral, 4 rescuable */
  type: number;
  /** 1 human, 2 orc, 3 undead, 4 night elf */
  race?: number;
  name?: string;
  x?: number;
  y?: number;
  fixed?: boolean;
}

export interface W3iForce {
  flags?: number;
  playerMask: number;
  name?: string;
}

export interface W3iInfo {
  version?: W3iVersion;
  saves?: number;
  name?: string;
  author?: string;
  description?: string;
  recommendedPlayers?: string;
  /** playable+boundary cells (the w3e has width+1 corners) */
  width: number;
  height: number;
  boundary?: Boundary;
  flags?: number;
  tileset?: string;
  campaignBackground?: number;
  loadingScreenModel?: string;
  loadingText?: string;
  loadingTitle?: string;
  loadingSubtitle?: string;
  prologueText?: string;
  prologueTitle?: string;
  prologueSubtitle?: string;
  players?: W3iPlayer[];
  forces?: W3iForce[];
}

function writeW3i(o: W3iInfo): Buffer {
  const w = new BinaryWriter();
  const version = o.version || 28;
  const target = W3I_TARGETS[version];
  if (!target) throw new Error(`unsupported w3i version ${version}`);
  const width = o.width;
  const height = o.height;
  const bounds = o.boundary || [6, 6, 4, 8]; // left, right, bottom, top boundary cells (WE default)
  const left = -width * CELL / 2 + bounds[0] * CELL;
  const right = width * CELL / 2 - bounds[1] * CELL;
  const bottom = -height * CELL / 2 + bounds[2] * CELL;
  const top = height * CELL / 2 - bounds[3] * CELL;
  // The editor stores camera bounds inset from the playable area (512 x, 256 y).
  const cx1 = left + 512, cx2 = right - 512, cy1 = bottom + 256, cy2 = top - 256;

  w.int32(version); // format version
  w.int32(o.saves || 1);
  w.int32(target.editor);
  target.build.forEach((v) => w.int32(v)); // game version the map was "saved" with
  w.cstring(o.name || 'Map');
  w.cstring(o.author || '');
  w.cstring(o.description || '');
  w.cstring(o.recommendedPlayers || '1');
  // camera bounds: bottom-left, top-right, top-left, bottom-right
  [cx1, cy1, cx2, cy2, cx1, cy2, cx2, cy1].forEach((v) => w.float32(v));
  bounds.forEach((v) => w.int32(v)); // camera bounds complements
  w.int32(width - bounds[0] - bounds[1]); // playable width
  w.int32(height - bounds[2] - bounds[3]); // playable height
  w.uint32(o.flags != null ? o.flags : 0x0020 | 0x0040 | 0x0800 | 0x1000 | 0x4000 | 0x8000);
  w.chars(o.tileset || 'B');
  // Campaign loading-screen background index; -1 = none. Under investigation (2026-10-07):
  // maps with -1 crash when loaded via ChangeLevel/campaign; a real campaign map uses 57.
  w.int32(o.campaignBackground != null ? o.campaignBackground : -1);
  w.cstring(o.loadingScreenModel || '');
  w.cstring(o.loadingText || '');
  w.cstring(o.loadingTitle || '');
  w.cstring(o.loadingSubtitle || '');
  w.int32(0); // game data set
  w.cstring(''); // prologue screen model
  w.cstring(o.prologueText || '');
  w.cstring(o.prologueTitle || '');
  w.cstring(o.prologueSubtitle || '');
  w.int32(0); // terrain fog type
  w.float32(3000).float32(5000); // fog z start / end
  w.float32(0.5); // fog density
  w.uint8(0).uint8(0).uint8(0).uint8(255); // fog colour RGBA
  w.int32(0); // global weather id (0 = none)
  w.cstring(''); // custom sound environment
  w.chars('\0'); // custom light environment tileset
  w.uint8(255).uint8(255).uint8(255).uint8(255); // water tint RGBA
  w.uint32(0); // script language: 0 = JASS
  // Supported graphics modes bitmask (1 = SD, 2 = HD), value of real 1.32+ maps.
  // (First suspected for the 3.0 browser crash; the bisect showed the real cause was the
  // missing war3mapMap.blp, see src/wc3/map.ts. Kept at the editor's value anyway.)
  if (version >= 31) {
    w.uint32(3);
    w.uint32(2); // game data version, value written by the 1.32+ editor (observed in real maps)
  }

  const players = o.players || [];
  w.int32(players.length);
  for (const p of players) {
    w.int32(p.id);
    w.int32(p.type);
    w.int32(p.race || 1);
    w.int32(p.fixed === false ? 0 : 1);
    w.cstring(p.name || `Player ${p.id + 1}`);
    w.float32(p.x || 0).float32(p.y || 0);
    w.uint32(0).uint32(0); // ally low/high priority masks
    if (version >= 31) w.uint32(0).uint32(0); // v31: enemy low/high priority masks
  }
  const forces = o.forces || [];
  w.int32(forces.length);
  for (const f of forces) {
    w.uint32(f.flags || 0);
    w.uint32(f.playerMask >>> 0);
    w.cstring(f.name || '');
  }
  w.int32(0); // upgrade availability changes
  w.int32(0); // tech availability changes
  w.int32(0); // random unit tables
  w.int32(0); // random item tables
  return w.toBuffer();
}

// ---------------------------------------------------------------- w3e ----

/** One terrain corner of the w3e grid. */
export interface Corner {
  texture?: number;
  height?: number;
  waterHeight?: number;
  layer?: number;
  cliff?: number;
  variation?: number;
  cliffVariation?: number;
  water?: boolean;
  ramp?: boolean;
  blight?: boolean;
  /** boundary via the 0x4000 bit of the water height (what the editor writes) */
  boundary?: boolean;
  /** the 0x80 flag bit; the editor does not use it for boundaries */
  boundaryFlag?: boolean;
}

export interface Terrain {
  /** main tileset char, e.g. 'B' */
  tileset: string;
  /** up to 16 ground tile ids, e.g. ['Bdsr','Bflr'] */
  ground: string[];
  /** cliff tile ids, e.g. ['CBde'] */
  cliffs: string[];
  width: number;
  height: number;
  /** called for every corner (0..width, 0..height); y=0 is the bottom row */
  corner: (x: number, y: number) => Corner | null | undefined;
}

/** Terrain v11. */
function writeW3e(t: Terrain): Buffer {
  if (t.ground.length > 16) throw new Error('w3e v11 supports at most 16 ground tiles');
  const w = new BinaryWriter(64 + (t.width + 1) * (t.height + 1) * 7);
  w.chars('W3E!');
  w.int32(11);
  w.chars(t.tileset);
  w.int32(1); // custom tileset list
  w.int32(t.ground.length);
  t.ground.forEach((id) => w.chars(id));
  w.int32(t.cliffs.length);
  t.cliffs.forEach((id) => w.chars(id));
  w.int32(t.width + 1);
  w.int32(t.height + 1);
  w.float32(-t.width * CELL / 2);
  w.float32(-t.height * CELL / 2);
  for (let y = 0; y <= t.height; y++) {
    for (let x = 0; x <= t.width; x++) {
      const c: Corner = t.corner(x, y) || {};
      const groundHeight = Math.round((c.height || 0) * 512 + 8192); // fine height, 512 per layer
      const waterHeight = Math.round((c.waterHeight != null ? c.waterHeight : -1) * 512 + 8192);
      w.int16(groundHeight);
      w.int16((waterHeight & 0x3FFF) | (c.boundary ? 0x4000 : 0));
      let flags = (c.texture || 0) & 0x0F;
      if (c.ramp) flags |= 0x10;
      if (c.blight) flags |= 0x20;
      if (c.water) flags |= 0x40;
      if (c.boundaryFlag) flags |= 0x80; // the editor marks boundary via the 0x4000 bit above
      w.uint8(flags);
      w.uint8(((c.cliffVariation || 0) << 5) | ((c.variation || 0) & 0x1F));
      w.uint8((((c.cliff != null ? c.cliff : 15) & 0x0F) << 4) | ((c.layer != null ? c.layer : 2) & 0x0F));
    }
  }
  return w.toBuffer();
}

// ---------------------------------------------------------------- wpm ----

// Pathing flags (one byte per 32x32 pathing cell, 4x4 per terrain cell).
const PATH = { NO_WALK: 0x02, NO_FLY: 0x04, NO_BUILD: 0x08, BLIGHT: 0x20, NO_WATER: 0x40, UNKNOWN: 0x80 };

/** flagAt: pathing byte for pathing cell (py=0 bottom) */
function writeWpm(width: number, height: number, flagAt?: ((px: number, py: number) => number) | null): Buffer {
  const pw = width * 4;
  const ph = height * 4;
  const w = new BinaryWriter(16 + pw * ph);
  w.chars('MP3W');
  w.int32(0);
  w.int32(pw);
  w.int32(ph);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) w.uint8(flagAt ? flagAt(x, y) : PATH.NO_WATER);
  }
  return w.toBuffer();
}

/** Static shadow map: 4x4 bytes per cell, 0 = no shadow. */
function writeShd(width: number, height: number): Buffer {
  return Buffer.alloc(width * 4 * height * 4);
}

// ---------------------------------------------------------- doo / units ----

function writeDoodadsEmpty() {
  const w = new BinaryWriter();
  w.chars('W3do').int32(8).int32(11).int32(0); // doodads
  w.int32(0).int32(0); // special doodads: version 0, count 0
  return w.toBuffer();
}

function writeUnitsDooEmpty() {
  return new BinaryWriter().chars('W3do').int32(8).int32(11).int32(0).toBuffer();
}

/** Object data (w3u/w3t/w3b/w3d/w3a/w3h/w3q) v2 with no original and no custom objects. */
function writeObjectsEmpty() {
  return new BinaryWriter().int32(2).int32(0).int32(0).toBuffer();
}

/** Regions war3map.w3r: version 5, none. Cameras war3map.w3c: version 0, none. Sounds w3s: version 1, none. */
function writeRegionsEmpty() { return new BinaryWriter().int32(5).int32(0).toBuffer(); }
function writeCamerasEmpty() { return new BinaryWriter().int32(0).int32(0).toBuffer(); }
function writeSoundsEmpty() { return new BinaryWriter().int32(1).int32(0).toBuffer(); }

/** Import list (war3map.imp / war3campaign.imp): version 1, no entries. */
function writeImpEmpty() {
  return new BinaryWriter().int32(1).int32(0).toBuffer();
}

/** Minimap icons: version 0, no icons. */
function writeMmpEmpty() {
  return new BinaryWriter().int32(0).int32(0).toBuffer();
}

// ---------------------------------------------------------------- wts ----

function writeWts(strings: Map<number, string> | Record<number, string>): Buffer {
  const entries = strings instanceof Map ? [...strings.entries()] : Object.entries(strings);
  let out = '﻿';
  for (const [id, text] of entries) out += `STRING ${id}\r\n{\r\n${text}\r\n}\r\n\r\n`;
  return Buffer.from(out, 'utf8');
}

// ---------------------------------------------------------------- w3f ----

/**
 * Campaign info, format v1 (as written by the 1.x editors; v1 and v2 campaigns load in 3.0).
 * Layout from War3Net CampaignInfo.cs and mdx-m3-viewer w3f/file.ts, verified by parsing
 * real campaigns.
 */
export interface CampaignMapEntry {
  file: string;
  chapter?: string;
  title?: string;
  visible?: boolean;
  /** false: only in the order list, no button on the campaign screen */
  button?: boolean;
}

export interface CampaignInfo {
  name: string;
  campaignVersion?: number;
  editorVersion?: number;
  difficulty?: string;
  author?: string;
  description?: string;
  flags?: number;
  backgroundScreen?: number;
  backgroundPath?: string;
  minimapPath?: string;
  ambientSound?: number;
  ambientPath?: string;
  race?: number;
  maps: CampaignMapEntry[];
}

function writeW3f(c: CampaignInfo): Buffer {
  const w = new BinaryWriter();
  w.int32(1); // format version
  w.int32(c.campaignVersion || 1);
  w.int32(c.editorVersion || W3I_TARGETS[28].editor); // 1.31.1 editor; Reforged reads it too
  w.cstring(c.name);
  w.cstring(c.difficulty || '');
  w.cstring(c.author || '');
  w.cstring(c.description || '');
  w.int32(c.flags != null ? c.flags : 0); // 1 variable difficulty, 2 requires expansion, 4 use map minimap
  w.int32(c.backgroundScreen != null ? c.backgroundScreen : 1);
  w.cstring(c.backgroundPath || '');
  w.cstring(c.minimapPath != null ? c.minimapPath : 'UI\\Widgets\\Glues\\Minimap-CustomCampaign-Human');
  w.int32(c.ambientSound != null ? c.ambientSound : 1);
  w.cstring(c.ambientPath || '');
  w.int32(0); // terrain fog style
  w.float32(3000).float32(5000).float32(0.5); // fog start, end, density
  w.uint8(0).uint8(0).uint8(0).uint8(255); // fog colour
  w.int32(c.race != null ? c.race : 0); // cursor/UI race
  // Buttons: maps marked buttonless (button === false) only go to the order list — campaigns with
  // ~200 maps keep their campaign screen to the few entry buttons.
  const buttons = c.maps.filter((m) => m.button !== false);
  w.int32(buttons.length);
  for (const m of buttons) {
    w.int32(m.visible === false ? 0 : 1);
    w.cstring(m.chapter || '');
    w.cstring(m.title || '');
    w.cstring(m.file);
  }
  w.int32(c.maps.length);
  for (const m of c.maps) {
    w.cstring('');
    w.cstring(m.file);
  }
  return w.toBuffer();
}

/** 512-byte HM3W block that precedes the MPQ in classic maps (optional for w3i >= 28). */
function hm3wHeader(name: string, flags: number, maxPlayers: number): Buffer {
  const b = Buffer.alloc(512);
  b.write('HM3W', 0, 'latin1');
  const w = new BinaryWriter();
  w.int32(0).cstring(name).int32(flags).int32(maxPlayers);
  w.toBuffer().copy(b, 4);
  return b;
}

export {
  CELL, PATH,
  writeW3i, writeW3e, writeWpm, writeShd, writeDoodadsEmpty, writeUnitsDooEmpty, writeMmpEmpty, writeWts, writeW3f,
  writeObjectsEmpty, writeImpEmpty, writeRegionsEmpty, writeCamerasEmpty, writeSoundsEmpty,
  hm3wHeader,
};
