// The single contest map (src/emperor/build-contest.ts): "Beyond Warcraft III", wc3-forge.quest,
// single-player maps of about 15 minutes, any Warcraft III version (here 1.31.1).

import type { HouseCode } from './houses.ts';

export const CONTEST = {
  /** the house whose first game the map is (Emperor's first house button) */
  house: 'AT' as HouseCode,
  /** JPEG quality of the movie frames in the map (campaign: MOVIE_JPEG_QUALITY 95, ~3 MB a second) */
  movieQuality: 70,
  title: 'Emperor: Битва за Дюну',
  file: (h: HouseCode): string => `EmperorDune_${h}.w3x`,
} as const;
