// PhaseRules.txt (CAMPAIGN0001): how the campaign moves through its phases and tech levels.
//   [Phase N]       Battles b / Captured c / MaxBattles m: the phase is over after b battles with at
//                   least c captures, or after m battles; JumpToChoice1 x: the next phase (10/11 =
//                   story missions); JumpPoint 1: over only when an enemy jump point is captured;
//                   Warning w / Lose l: battles without a captured territory before a warning / the
//                   campaign is lost.
//   [Tech Level N]  Phase p: tech level N when phase p begins; Captured c: tech level N after the c-th
//                   capture of the phase named by the closest "Phase" entry above.

import fs from 'node:fs';

export interface PhaseRule {
  battles: number;
  captured: number;
  maxBattles: number;
  jumpToChoice1: number;
  jumpPoint: boolean;
  warning: number;
  lose: number;
}

export interface TechRule {
  level: number;
  /** tech level reached when this phase begins */
  phase?: number;
  /** ... or after this many captures in `inPhase` */
  captured?: number;
  inPhase: number;
}

export interface PhaseRules {
  phases: Map<number, PhaseRule>;
  tech: TechRule[];
}

function parsePhaseRules(text: string): PhaseRules {
  const phases = new Map<number, PhaseRule>();
  const tech: TechRule[] = [];
  let phase: PhaseRule | null = null;
  let level: TechRule | null = null;
  let lastPhase = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    let m = /^\[Phase (\d+)\]$/i.exec(line);
    if (m) {
      phase = { battles: 0, captured: 0, maxBattles: 0, jumpToChoice1: -1, jumpPoint: false, warning: 0, lose: 0 };
      phases.set(Number(m[1]), phase);
      level = null;
      continue;
    }
    m = /^\[Tech Level (\d+)\]$/i.exec(line);
    if (m) {
      level = { level: Number(m[1]), inPhase: lastPhase };
      tech.push(level);
      phase = null;
      continue;
    }
    m = /^(\w+)\s+(-?\d+)$/.exec(line);
    if (!m) throw new Error(`PhaseRules.txt: cannot read "${line}"`);
    const [key, value] = [m[1] as string, Number(m[2])];
    if (phase) {
      if (key === 'Battles') phase.battles = value;
      else if (key === 'Captured') phase.captured = value;
      else if (key === 'MaxBattles') phase.maxBattles = value;
      else if (key === 'JumpToChoice1') phase.jumpToChoice1 = value;
      else if (key === 'JumpPoint') phase.jumpPoint = value !== 0;
      else if (key === 'Warning') phase.warning = value;
      else if (key === 'Lose') phase.lose = value;
      else throw new Error(`PhaseRules.txt: unknown phase key ${key}`);
    } else if (level) {
      if (key === 'Phase') { level.phase = value; lastPhase = value; level.inPhase = value; } else if (key === 'Captured') level.captured = value;
      else throw new Error(`PhaseRules.txt: unknown tech key ${key}`);
    }
  }
  return { phases, tech };
}

function loadPhaseRules(file: string): PhaseRules {
  return parsePhaseRules(fs.readFileSync(file, 'latin1'));
}

export { parsePhaseRules, loadPhaseRules };
