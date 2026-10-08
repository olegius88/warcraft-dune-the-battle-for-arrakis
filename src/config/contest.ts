// The single contest map (src/emperor/build-contest.ts): "Beyond Warcraft III", wc3-forge.quest,
// single-player maps of about 15 minutes, any Warcraft III version (here 1.31.1).

import type { HouseCode } from './houses.ts';

export const CONTEST = {
  /** the house whose first game the map is (Emperor's first house button) */
  house: 'AT' as HouseCode,
  /** JPEG quality of the movie frames in the map (campaign: MOVIE_JPEG_QUALITY 95, ~3 MB a second) */
  movieQuality: 70,
  title: 'Emperor: Битва за Дюну',
  /** the map list description (the contest asks for the game version) */
  /** the house after "за" (accusative) */
  houseFor: { AT: 'Атрейдесов', HK: 'Харконненов', OR: 'Ордосов' } as Readonly<Record<HouseCode, string>>,
  description: (house: string): string => `Первая игра за ${house} из Emperor: Battle for Dune (Westwood, 2001), перенесённая на движок Warcraft III: ролики, брифинг Ментата, модели, музыка и речь оригинала. Версия: Warcraft III 1.31.1. Около 15 минут.`,
  file: (h: HouseCode): string => `EmperorDune_${h}.w3x`,
  /** the map list preview (war3mapPreview.tga): a frame of `movie` at `at` s, cropped square to `size`,
   * the house logo (Textures/<house>logo.tga) `logo` px in the bottom right corner */
  preview: { movie: 'I00_F03E', at: 22, size: 256, logo: 96, margin: 8 },
  /** the loading screen model (src/emperor/loading-screen.ts): a frame of `movie` at `at` s on a plane
   * of `screen` glue units (the whole 4:3 loading screen); the picture a `textureSize` JPEG BLP of
   * `quality` */
  loading: {
    movie: 'I00_F03E', at: 5, model: 'Emperor\\Loading\\LoadingScreen.mdx', picture: 'Emperor\\Loading\\FullScreen.blp',
    screen: [0.8, 0.6], textureSize: 1024, quality: 90,
  },
} as const;
