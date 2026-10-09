// Game.exe 1.09 AI script tactics (tactic type 1): the STRATEGY files of the AI_DATA folders 1..8,
// SubHouse and CrossTech, with objectsets.txt first (loaded by 0x43c420, which wants 217 of them;
// parsed by 0x445900, keywords at 0x5f5324). A strategy has a DESCRIPTION (name, frequency = the
// priority the proactive picker rolls, 0x45b5f0; mintech / maxtech; house; losses; reactive), TEAMs
// (an objectset, min / max units), TARGETs (enemybase, threat, an objectset...), STAGING points
// (relative to a target: front / lflank / rflank / rear, near / medium / far) and STEPs of SEND (who,
// destination, route, encounter, endstate), WAIT (ticks) and GOTO (value: a step index).
// The battle AI runs them (src/jass/battle/ai-scripts.j).

import fs from 'node:fs';
import path from 'node:path';

export interface ObjectSet {
  name: string;
  objects: string[];
}

export interface ScriptTeam {
  name: string;
  teamtype: string;
  min: number;
  max: number;
}

export interface ScriptTarget {
  name: string;
  type: string;
}

export interface ScriptStaging {
  name: string;
  relative: string;
  type: string;
  distance: string;
}

export type ScriptAction =
  | { kind: 'send'; who: string; destination: string; route: string; encounter: string; endstate: string }
  | { kind: 'wait'; ticks: number }
  | { kind: 'goto'; step: number };

export interface Strategy {
  file: string;
  name: string;
  frequency: number;
  mintech: number;
  maxtech: number;
  /** lower case; 'all' for any house */
  house: string;
  losses: number;
  reactive: boolean;
  teams: ScriptTeam[];
  targets: ScriptTarget[];
  staging: ScriptStaging[];
  /** each step: its actions, done together */
  steps: ScriptAction[][];
}

/** Folders of the AI_DATA resource Game.exe loads (0x43c420: names starting with '1'..'8', SubHouse,
 * CrossTech). */
export const AI_SCRIPT_FOLDERS = ['1', '2', '3', '4', '5', '6', '7', '8', 'SubHouse', 'CrossTech'] as const;

const clean = (line: string): string => (line.split('//')[0] ?? '').trim();

/** objectsets.txt: OBJECTSET Name= / Object= ... ENDOBJECTSET (Formation= is the formation's). */
function parseObjectSets(text: string): ObjectSet[] {
  const sets: ObjectSet[] = [];
  let cur: ObjectSet | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = clean(raw);
    if (!line) continue;
    if (/^OBJECTSET$/i.test(line)) cur = { name: '', objects: [] };
    else if (/^ENDOBJECTSET$/i.test(line)) { if (cur) sets.push(cur); cur = null; } else if (cur) {
      const m = /^(\w+)\s*=\s*(.*)$/.exec(line);
      if (m?.[1]?.toLowerCase() === 'name') cur.name = (m[2] ?? '').trim();
      else if (m?.[1]?.toLowerCase() === 'object') cur.objects.push((m[2] ?? '').trim());
    }
  }
  return sets;
}

/** One file's STRATEGY blocks. */
function parseStrategies(text: string, file: string): Strategy[] {
  const out: Strategy[] = [];
  let s: Strategy | null = null;
  let block = '';
  let item: Record<string, string> = {};
  let step: ScriptAction[] | null = null;
  const words = (line: string): [string, string] => {
    const eq = /^(\w+)\s*=\s*(.*)$/.exec(line);
    if (eq) return [(eq[1] ?? '').toLowerCase(), (eq[2] ?? '').trim()];
    const sp = /^(\S+)\s+(.*)$/.exec(line);
    return sp ? [(sp[1] ?? '').toLowerCase(), (sp[2] ?? '').trim()] : [line.toLowerCase(), ''];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = clean(raw);
    if (!line) continue;
    const up = line.toUpperCase();
    if (up === 'STRATEGY') { s = { file, name: '', frequency: 0, mintech: 0, maxtech: 0, house: 'all', losses: 100, reactive: false, teams: [], targets: [], staging: [], steps: [] }; continue; }
    if (!s) continue;
    if (up === 'ENDSTRATEGY') { out.push(s); s = null; continue; }
    if (up === 'STEP') { step = []; continue; }
    if (up === 'ENDSTEP') { if (step) s.steps.push(step); step = null; continue; }
    if (['DESCRIPTION', 'TEAM', 'TARGET', 'STAGING', 'SEND', 'WAIT', 'GOTO', 'MONITOR', 'RUN', 'TAUNT'].includes(up)) { block = up; item = {}; continue; }
    if (up.startsWith('END') && up.slice(3) === block) {
      if (block === 'DESCRIPTION') {
        s.name = item.name ?? ''; s.frequency = Number(item.frequency) || 0; s.mintech = Number(item.mintech) || 0; s.maxtech = Number(item.maxtech) || 0;
        s.house = (item.house ?? 'all').toLowerCase(); s.losses = Number(item.losses) || 100; s.reactive = item.reactive === '1';
      } else if (block === 'TEAM') s.teams.push({ name: (item.name ?? '').toLowerCase(), teamtype: (item.teamtype ?? '').toLowerCase(), min: Number(item.minunits) || 0, max: Number(item.maxunits) || 0 });
      else if (block === 'TARGET') s.targets.push({ name: (item.name ?? '').toLowerCase(), type: (item.targettype ?? '').toLowerCase() });
      else if (block === 'STAGING') s.staging.push({ name: (item.name ?? '').toLowerCase(), relative: (item.relative ?? '').toLowerCase(), type: (item.stagingtype ?? '').toLowerCase(), distance: (item.distance ?? '').toLowerCase() });
      else if (block === 'SEND' && step) step.push({ kind: 'send', who: (item.who ?? '').toLowerCase(), destination: (item.destination ?? '').toLowerCase(), route: (item.route ?? '').toLowerCase(), encounter: (item.encounter ?? '').toLowerCase(), endstate: (item.endstate ?? '').toLowerCase() });
      else if (block === 'WAIT' && step) step.push({ kind: 'wait', ticks: Number(item.ticks) || 0 });
      else if (block === 'GOTO' && step) step.push({ kind: 'goto', step: Number(item.value) || 0 });
      block = '';
      continue;
    }
    if (block) {
      const [k, v] = words(line);
      item[k] = v;
    }
  }
  return out;
}

/** Every strategy of the AI_DATA folders under rawDir, and objectsets.txt. */
function loadAiScripts(rawDir: string): { sets: ObjectSet[]; strategies: Strategy[] } {
  const sets = parseObjectSets(fs.readFileSync(path.join(rawDir, 'objectsets.txt'), 'latin1'));
  const strategies: Strategy[] = [];
  for (const folder of AI_SCRIPT_FOLDERS) {
    const dir = path.join(rawDir, folder);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.txt')).sort()) {
      strategies.push(...parseStrategies(fs.readFileSync(path.join(dir, f), 'latin1'), `${folder}/${f}`));
    }
  }
  return { sets, strategies };
}

export { parseObjectSets, parseStrategies, loadAiScripts };

/** A strategy as numbers for the battle AI (ai-scripts.j EmpScrD): frequency, mintech, maxtech, house
 * (-1 all), losses, teams (n; set, min, max), targets (n; kind, set), staging (n; target, side, tiles),
 * steps (n; actions (n; kind, a, b, c, d)). Sets: index into `sets`, or C.AI_SCRIPT.builtinTeam;
 * target kinds C.AI_SCRIPT.target*; a send: 1, who (team or -1 all), destination (0 target, 1 staging,
 * 2 home), its index, 1 attack-moving / 0 moving; a wait: 2, ticks; a goto: 3, step. */
function encodeStrategy(s: Strategy, setIndex: (name: string) => number, opts: {
  houseId: (house: string) => number; builtinTeam: Readonly<Record<string, number>>;
  target: { base: number; threat: number; any: number; harvester: number; set: number }; sides: Readonly<Record<string, number>>; tiles: Readonly<Record<string, number>>;
}): number[] {
  const out = [s.frequency, s.mintech, s.maxtech, s.house === 'all' ? -1 : opts.houseId(s.house), s.losses];
  out.push(s.teams.length, ...s.teams.flatMap((t) => [opts.builtinTeam[t.teamtype] ?? setIndex(t.teamtype), t.min, t.max]));
  const kind = (type: string): [number, number] => {
    if (type === 'enemybase') return [opts.target.base, 0];
    if (type === 'threat' || type === 'basethreat') return [opts.target.threat, 0];
    if (type === 'any' || type === 'worth') return [opts.target.any, 0];
    if (type === 'harvester') return [opts.target.harvester, 0];
    const k = setIndex(type);
    return k >= 0 ? [opts.target.set, k] : [opts.target.base, 0];
  };
  out.push(s.targets.length, ...s.targets.flatMap((t) => kind(t.type)));
  const targetIndex = (name: string): number => Math.max(0, s.targets.findIndex((t) => t.name === name));
  out.push(s.staging.length, ...s.staging.flatMap((st) => [targetIndex(st.relative), opts.sides[st.type] ?? 0, opts.tiles[st.distance] ?? opts.tiles.medium ?? 0]));
  const dest = (name: string): [number, number] => {
    const t = s.targets.findIndex((x) => x.name === name);
    if (t >= 0) return [0, t];
    const st = s.staging.findIndex((x) => x.name === name);
    if (st >= 0) return [1, st];
    return [2, 0];
  };
  out.push(s.steps.length);
  for (const step of s.steps) {
    out.push(step.length);
    for (const a of step) {
      if (a.kind === 'send') out.push(1, a.who === 'all' ? -1 : s.teams.findIndex((t) => t.name === a.who), ...dest(a.destination), a.encounter === 'avoid' ? 0 : 1);
      else if (a.kind === 'wait') out.push(2, a.ticks, 0, 0, 0);
      else out.push(3, a.step, 0, 0, 0);
    }
  }
  return out;
}

export { encodeStrategy };
