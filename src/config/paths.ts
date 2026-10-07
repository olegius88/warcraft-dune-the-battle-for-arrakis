// File system locations: the user's Emperor install, extracted data, build outputs, tools.
// Every path the code uses is built from these.

import path from 'node:path';

/** Repository root. */
export const PROJECT_ROOT = path.join(import.meta.dirname, '..', '..');

/** Emperor install used when EMPEROR_DIR is not set. */
export const DEFAULT_GAME_DIR = 'G:\\Games\\Emperor';
/** The user's Emperor: Battle for Dune install (env EMPEROR_DIR overrides). */
export const GAME_DIR = process.env.EMPEROR_DIR || DEFAULT_GAME_DIR;
/** Holds the mission script token table. */
export const GAME_EXE = path.join(GAME_DIR, 'Game.exe');
/** A file inside the game's DATA folder, e.g. gameData('DIALOG', 'DIALOG.BAG'). */
export const gameData = (...parts: string[]): string => path.join(GAME_DIR, 'DATA', ...parts);

/** Extracted, never distributed game data (in .gitignore). */
export const DATA_DIR = path.join(PROJECT_ROOT, 'data');
/** Archive contents (CAMPAIGN/MISSIONS/STRINGS/...) unpacked by extract.ts. */
export const RAW_DIR = path.join(DATA_DIR, 'emperor', 'raw');
/** Loose DATA files copied next to the archives (localised strings, dialog tables). */
export const LOOSE_DIR = path.join(RAW_DIR, 'loose');
export const LOCAL_STRINGS_DIR = path.join(LOOSE_DIR, 'strings');
/** Map folders unpacked on demand from MAPS0001/0002. */
export const MAPS_DIR = path.join(DATA_DIR, 'emperor', 'maps');
/** Decompiled mission scripts (decompile-all.ts). */
export const SCRIPTS_DIR = path.join(DATA_DIR, 'emperor', 'scripts');
/** common.j / blizzard.j of the 1.31.1 client, for pjass. */
export const WC3_JASS_DIR = path.join(DATA_DIR, 'wc3');
export const COMMON_J = path.join(WC3_JASS_DIR, 'common.j');
export const BLIZZARD_J = path.join(WC3_JASS_DIR, 'blizzard.j');

/** Build outputs (in .gitignore). */
export const BUILD_DIR = path.join(PROJECT_ROOT, 'build');
export const CAMPAIGN_OUT = path.join(BUILD_DIR, 'campaign', 'EmperorDune.w3n');
export const MISSIONS_OUT_DIR = path.join(BUILD_DIR, 'missions');
export const PREVIEW_OUT = path.join(BUILD_DIR, 'preview', 'Preview.w3x');
export const SMOKE_OUT_DIR = path.join(BUILD_DIR, 'smoke');
export const HOP_OUT = path.join(BUILD_DIR, 'test', 'Hop.w3x');
/** Scripts written for pjass checks (overwritten on every run). */
export const PJASS_OUT_DIR = path.join(BUILD_DIR, 'pjass');
export const FIRST_FAILURE_J = path.join(BUILD_DIR, 'first-failure.j');

/** JASS syntax checker (BSD-2). */
export const PJASS_EXE = path.join(PROJECT_ROOT, 'tools', 'bin', 'pjass.exe');
