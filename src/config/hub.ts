// Look of the Arrakis hub map (src/emperor/hub.ts): map size, territory graph layout, markers,
// labels, connection lines, camera.

import type { HouseCode } from './houses.ts';

/** Hub map size in cells; territory markers lie within +-MARKER_SPAN world units. */
export const HUB_WIDTH = 96;
export const HUB_HEIGHT = 96;
export const MARKER_SPAN = 40 * 128;
/** Boundary of the hub map (cells from the edge): left/right, bottom, top. */
export const HUB_BOUNDARY_SIDE = 6;
export const HUB_BOUNDARY_BOTTOM = 4;
export const HUB_BOUNDARY_TOP = 8;
/** Sparse rough-dirt dots on the sand: corner (x, y) gets them when (x*7 + y*3) % N == 0. */
export const HUB_DIRT_EVERY = 13;
export const HUB_MINIMAP_COLOR: readonly [number, number, number] = [214, 170, 104];

/** Spring layout of the territory graph in [-1, 1]^2: corner of each house's territories. */
export const LAYOUT_ANCHOR: Readonly<Record<HouseCode, readonly [number, number]>> = { AT: [0.85, 0.75], HK: [-0.85, 0.75], OR: [0, -0.9] };
export const LAYOUT = {
  /** golden-angle spread of the initial positions */
  spreadAngle: 2.399,
  /** each ring of distance from the capital pulls 22 % towards the centre, scattered by 0.08 */
  ringPull: 0.22,
  ringScatter: 0.08,
  iterations: 400,
  minDistance: 0.02,
  repulsion: 0.012,
  springLength: 0.3,
  springStrength: 0.08,
  maxStep: 0.05,
} as const;

/** Territory labels (text tags): size, offset from the marker, height. */
export const LABEL_SIZE = 0.022;
export const LABEL_OFFSET_X = -200;
export const LABEL_OFFSET_Y = -220;
export const LABEL_HEIGHT = 16;
/** Connection lines: lightning type, height and colour (r, g, b, a). */
export const LINK_LIGHTNING = 'LEAS';
export const LINK_HEIGHT = 40;
export const LINK_COLOR: readonly [number, number, number, number] = [1.0, 0.85, 0.5, 0.45];

/** Messages stay on screen this long. */
export const HUB_MESSAGE_SECONDS = 20;
/** Camera: distance; start position = capital position * NUM / DEN (towards the map centre). */
export const HUB_CAMERA_DISTANCE = 4200;
export const CAMERA_TOWARDS_CAPITAL_NUM = 2;
export const CAMERA_TOWARDS_CAPITAL_DEN = 3;
/** The hub starts its logic this long after map init. */
export const HUB_START_DELAY = 0.1;

/** Terrain preview map (preview-map.ts): footmen at the base, camera distance, start delay. */
export const PREVIEW_FOOTMEN = 6;
export const PREVIEW_CAMERA_DISTANCE = 3200;
export const PREVIEW_START_DELAY = 0.1;
