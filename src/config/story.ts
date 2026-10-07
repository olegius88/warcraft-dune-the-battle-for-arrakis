// Story missions of each house: which Emperor script runs on which map. Derived from the script
// and map names of MISSIONS0001 / MAPS0001 (see src/emperor/README.md).

import type { HouseCode } from './houses.ts';

/** [script name, map folder prefix], e.g. ['ATStart', '#U1 '] */
export type StoryRef = [string, string];

export interface HouseStory {
  tutorial: StoryRef;
  start: StoryRef;
  heighliner: StoryRef;
  homeDefence: StoryRef;
  civilWar?: StoryRef;
  /** enemy house code -> assault on its homeworld */
  homeAttack: Partial<Record<HouseCode, StoryRef>>;
  end: StoryRef;
}

export const STORY: Readonly<Record<HouseCode, HouseStory>> = {
  AT: {
    tutorial: ['ATTutorial', '#X1 '], start: ['ATStart', '#U1 '], heighliner: ['Atreides Heighliner Mission', '#H1 '],
    homeDefence: ['DAT Save The Duke', '#D1 '],
    homeAttack: { HK: ['Harkonnen homeworld assault_AT', '#A3 '], OR: ['Ordos homeworld assault _Atreides', '#A2 '] },
    end: ['ATENDMission', '#E1 '],
  },
  HK: {
    tutorial: ['ATTutorial', '#X1 '], start: ['HKStart', '#U3 '], heighliner: ['HHK Heighliner Mission', '#H3 '],
    homeDefence: ['HHK Civil War Defence Mission', '#V1 '], civilWar: ['HHK Civil War Attack Mission', '#C1 '],
    homeAttack: { AT: ['T36 Atreides Homeworld Assault', '#A1 '], OR: ['Ordos homeworld assault', '#A2 '] },
    end: ['HKENDMission', '#E1 '],
  },
  OR: {
    tutorial: ['ATTutorial', '#X1 '], start: ['ORStart', '#U2 '], heighliner: ['Ordos Heighliner Mission', '#H2 '],
    homeDefence: ['Ordos Homeworld Defense', '#D2 '],
    homeAttack: { AT: ['T36 Atreides Homeworld Assault_OR', '#A1 '], HK: ['Harkonnen homeworld assault_OR', '#A3 '] },
    end: ['ORENDMission', '#E1 '],
  },
};

/** Map folder prefix of territory n's battle map. */
export const territoryMapPrefix = (n: number): string => `#T${n} `;
/** Script of the tutorial (standalone, own campaign button). */
export const TUTORIAL_SCRIPT = 'ATTutorial';
export const TUTORIAL_MAP = '#X1 ';
