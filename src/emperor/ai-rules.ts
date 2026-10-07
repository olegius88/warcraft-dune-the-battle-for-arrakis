// ai.ini (AI0001): the values of Emperor's skirmish / campaign AI that the territory battle AI uses
// (src/jass/battle/forces.j, ai.j). ([Strategy] appears twice in the shipped file; the first value
// of a key wins.)
//   [BuildingConstructionRatios] Core / Defence / Manufacturing / Resource: share of the buildings (%)
//   [UnitConstructionRatios] Foot / Tank / Air / Special: share of the units the AI builds (%)
//   [PositionAlgorithmRatiosExits] / [...NoExits] weights of a building site, for buildings that
//              release units (exits) and the others: Aligned, DistanceFromCentre, FurtherFromEdge,
//              OuterPerimeter, Perpendicular, Random, WithinExistingBounds, Rotation
//   [Strategy] scouting, defence, attack waves, turrets, money limits, tactic timers (ticks)

import fs from 'node:fs';
import { parseSections } from './rules.ts';

export interface PositionWeights {
  aligned: number;
  distanceFromCentre: number;
  furtherFromEdge: number;
  outerPerimeter: number;
  perpendicular: number;
  random: number;
  withinExistingBounds: number;
  rotation: number;
}

export interface AiRules {
  foot: number;
  tank: number;
  defencePercent: number;
  minMoneyToBuild: number;
  retreatChance: number;
  /** [BuildingConstructionRatios] in % */
  buildRatios: { core: number; defence: number; manufacturing: number; resource: number };
  positionExits: PositionWeights;
  positionNoExits: PositionWeights;
  /** [Strategy] */
  unitsBeforeScout: number;
  scoutTeams: number;
  defenceWanderTiles: number;
  buildsDefences: boolean;
  /** % change to the frequency of large attacks */
  largeAttackModifier: number;
  minTurretGapTiles: number;
  maxTurretsLowTech: number;
  maxRefineries: number;
  firstTechTurrets: number;
  minMoneyWalls: number;
  minMoneyMaintenance: number;
  ticksDefendHarvester: number;
  ticksDefendCY: number;
  firstTechDefendCY: number;
  ticksSeesIntoShroud: number;
  ticksAbandonForming: number;
}

function parseAiRules(text: string): AiRules {
  const { sections } = parseSections(text);
  const get = (sec: string, key: string, d: number): number => {
    const e = sections.get(sec.toLowerCase())?.entries.find(([k]) => k === key);
    const n = e ? parseFloat(e[1]) : Number.NaN;
    return Number.isFinite(n) ? n : d;
  };
  const position = (sec: string): PositionWeights => ({
    aligned: get(sec, 'Aligned', 0), distanceFromCentre: get(sec, 'DistanceFromCentre', 0), furtherFromEdge: get(sec, 'FurtherFromEdge', 0),
    outerPerimeter: get(sec, 'OuterPerimeter', 0), perpendicular: get(sec, 'Perpendicular', 0), random: get(sec, 'Random', 0),
    withinExistingBounds: get(sec, 'WithinExistingBounds', 0), rotation: get(sec, 'Rotation', 0),
  });
  const s = (key: string, d: number): number => get('Strategy', key, d);
  return {
    foot: get('UnitConstructionRatios', 'Foot', 50),
    tank: get('UnitConstructionRatios', 'Tank', 50),
    defencePercent: s('PercentageOfUnitsForDefence', 0),
    minMoneyToBuild: s('MinMoneyToConstructBuildings', 0),
    retreatChance: s('ChanceOfRetreating', 0),
    buildRatios: {
      core: get('BuildingConstructionRatios', 'Core', 25), defence: get('BuildingConstructionRatios', 'Defence', 25),
      manufacturing: get('BuildingConstructionRatios', 'Manufacturing', 25), resource: get('BuildingConstructionRatios', 'Resource', 25),
    },
    positionExits: position('PositionAlgorithmRatiosExits'),
    positionNoExits: position('PositionAlgorithmRatiosNoExits'),
    unitsBeforeScout: s('UnitsToBuildBeforeCreatingScoutTactic', 3),
    scoutTeams: s('NumberOfScoutTeams', 0),
    defenceWanderTiles: s('DefenceTacticWanderDistance', 0),
    buildsDefences: s('AiBuildsDefences', 0) !== 0,
    largeAttackModifier: s('LargeAttackModifier', 100),
    minTurretGapTiles: s('MinimumGapBetweenTurrets', 0),
    maxTurretsLowTech: s('MaxTurretsAtLowTech', 0),
    maxRefineries: s('MaxRefineries', 1),
    firstTechTurrets: s('FirstTechLevelToBuildTurrets', 0),
    minMoneyWalls: s('MinMoneyToStartBuildingWalls', 0),
    minMoneyMaintenance: s('MinMoneyToBuildMaintenanceBuildings', 0),
    ticksDefendHarvester: s('TicksBeforeDefendHarvesterTactic', 0),
    ticksDefendCY: s('TicksBeforeDefendCYTactic', 0),
    firstTechDefendCY: s('FirstTechLevelForDefendCYTactic', 0),
    ticksSeesIntoShroud: s('TicksUntilAISeesIntoShroud', 0),
    ticksAbandonForming: s('TicksUntilAbandonForming', 0),
  };
}

function loadAiRules(file: string): AiRules {
  return parseAiRules(fs.readFileSync(file, 'latin1'));
}

export { parseAiRules, loadAiRules };
