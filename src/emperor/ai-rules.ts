// ai.ini (AI0001): the values of Emperor's skirmish / campaign AI that the territory battle AI uses.
//   [UnitConstructionRatios] Foot / Tank / Air / Special: share of the units the AI builds (%)
//   [Strategy] PercentageOfUnitsForDefence: share of the AI's units kept at its base;
//              MinMoneyToConstructBuildings: credits it keeps before it (re)builds;
//              ChanceOfRetreating: campaign, % chance that an attack wave falls back instead of
//              fighting to the end. ([Strategy] appears twice; the first value of a key wins.)

import fs from 'node:fs';
import { parseSections } from './rules.ts';

export interface AiRules {
  foot: number;
  tank: number;
  defencePercent: number;
  minMoneyToBuild: number;
  retreatChance: number;
}

function parseAiRules(text: string): AiRules {
  const { sections } = parseSections(text);
  const get = (sec: string, key: string, d: number): number => {
    const e = sections.get(sec.toLowerCase())?.entries.find(([k]) => k === key);
    const n = e ? parseFloat(e[1]) : Number.NaN;
    return Number.isFinite(n) ? n : d;
  };
  return {
    foot: get('UnitConstructionRatios', 'Foot', 50),
    tank: get('UnitConstructionRatios', 'Tank', 50),
    defencePercent: get('Strategy', 'PercentageOfUnitsForDefence', 0),
    minMoneyToBuild: get('Strategy', 'MinMoneyToConstructBuildings', 0),
    retreatChance: get('Strategy', 'ChanceOfRetreating', 0),
  };
}

function loadAiRules(file: string): AiRules {
  return parseAiRules(fs.readFileSync(file, 'latin1'));
}

export { parseAiRules, loadAiRules };
