// JASS runtime implementing the Emperor mission API (EF_<Name>) for translated scripts.
// Signatures are generated from the Game.exe token table (same rules as translate.ts), bodies
// come from src/jass/runtime/api/<Name>.j; anything not implemented gets a safe stub (0 / null) marked TODO.
//
// Model: an Emperor "side" is an integer 0..11 mapped to Player(side); side 0 is the human
// player, side 1 the main enemy house (GetEnemySide), CreateSide() hands out 2..11, the neutral
// side is 12 -> Player(PLAYER_NEUTRAL_PASSIVE). Points come from the map's GameElements tree.
// One Emperor tick = 1/25 s (TODO(tick-rate)).

import { RETURN_OVERRIDE, SYNTAX_TOKENS } from './translate.ts';
import type { TokenTable } from './tok.ts';
import fs from 'node:fs';
import path from 'node:path';
import { real } from '../wc3/jass.ts';
import { renderFile } from '../wc3/template.ts';
import { jassFile, RUNTIME_API_DIR } from '../config/paths.ts';
import * as RT from '../config/runtime.ts';
import { TICKS_PER_SECOND, WC3_UNITS_PER_TILE } from '../config/scale.ts';
import { EFFECT, ITEM, ABILITY, ART_ABILITY } from '../config/wc3.ts';

const FACING = real(RT.DEFAULT_FACING);
const TPS = real(TICKS_PER_SECOND);

type JassType = 'integer' | 'location' | 'unit' | 'nothing';
const RET_J: Record<number, JassType> = { 0: 'integer', 1: 'location', 2: 'unit', 8: 'nothing' };
const ARG_J = (code: number): JassType => (code === 1 ? 'location' : code === 2 ? 'unit' : 'integer');
const DEFAULT: Record<JassType, string> = { integer: 'return 0', location: 'return null', unit: 'return null', nothing: '' };

/** JASS pieces of the Emperor API runtime for one map. */
export interface Runtime {
  /** globals block lines */
  globals: string;
  /** helper functions (before the EF_ functions) */
  helpers: string;
  /** EF_<name> for every function of the token table */
  functions: string;
  /** API functions that only got a stub */
  stubbed: string[];
}

/** Values the runtime JASS files (src/jass/runtime) refer to. */
const SCOPE = { RT, FACING, TPS, EFFECT, ITEM, ABILITY, ART_ABILITY, WC3_UNITS_PER_TILE, airstrikeTicks: RT.AIRSTRIKE_SECONDS * TICKS_PER_SECOND };

/** globals block lines (src/jass/runtime/globals.j) */
const headerGlobals = (): string => renderFile(jassFile('runtime/globals'), SCOPE);
/** helper functions placed before the EF_ functions (src/jass/runtime/helpers.j) */
const helpers = (): string => renderFile(jassFile('runtime/helpers'), SCOPE);

let apiCache: Map<string, string> | null = null;
/**
 * Bodies of the EF_ functions: src/jass/runtime/api/<Name>.j, parameters a1..aN in declaration
 * order. The files hold the body indented as inside a function; the first indent is dropped here
 * because buildRuntime puts it in front of the body.
 */
function apiBodies(): Map<string, string> {
  if (apiCache) return apiCache;
  apiCache = new Map();
  for (const f of fs.readdirSync(RUNTIME_API_DIR).sort()) {
    if (!f.endsWith('.j')) continue;
    apiCache.set(f.slice(0, -2), renderFile(path.join(RUNTIME_API_DIR, f), SCOPE).replace(/^ {4}/, ''));
  }
  return apiCache;
}

/** Build the runtime: globals block lines and functions text for the given token table. */
function buildRuntime(table: TokenTable, { deployMap = {} }: { deployMap?: Record<string, string> } = {}): Runtime {
  const fns: string[] = [];
  // MCV/ConYard deploy table (generated): returns the construction yard type for an MCV type.
  const deploy = Object.entries(deployMap).map(([from, to]) => `    if t == '${from}' then\n        return '${to}'\n    endif`).join('\n');
  fns.push(`function EmpDeployType takes integer t returns integer\n${deploy}\n    return 0\nendfunction`);
  // and back (ObjectUndeploy): construction yard -> MCV
  const undeploy = Object.entries(deployMap).map(([from, to]) => `    if t == '${to}' then\n        return '${from}'\n    endif`).join('\n');
  fns.push(`function EmpUndeployType takes integer t returns integer\n${undeploy}\n    return 0\nendfunction`);
  const stubbed: string[] = [];
  for (const e of table) {
    if (e.kind !== 0 || SYNTAX_TOKENS.has(e.name)) continue;
    const n = Math.min(e.argCount, 10);
    const params = Array.from({ length: n }, (_, i) => `${ARG_J(e.argTypes[i] ?? 0)} a${i + 1}`);
    const ret: JassType = RET_J[RETURN_OVERRIDE[e.name] ?? e.returnType] || 'integer';
    let body = apiBodies().get(e.name);
    if (body == null) { stubbed.push(e.name); if (ret === 'nothing') body = `// TODO(runtime): ${e.name} not implemented`; else body = `// TODO(runtime): ${e.name} not implemented\n    ${DEFAULT[ret]}`; }
    if (ret === 'nothing' && /^\s*return\s+\S/.test(body)) body = body.replace(/^\s*return\s+/, 'call ');
    fns.push(`function EF_${e.name} takes ${params.length ? params.join(', ') : 'nothing'} returns ${ret}\n    ${body}\nendfunction`);
  }
  return { globals: headerGlobals(), helpers: helpers(), functions: fns.join('\n\n'), stubbed };
}

export { buildRuntime, apiBodies };
