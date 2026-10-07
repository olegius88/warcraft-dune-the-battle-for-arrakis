// Terrain height of an Emperor map from its own mesh: a map's test.xbf is an XBF scene of 480
// chunks (8x8 tiles each, identity transforms) whose vertices are the terrain surface (y up; x =
// tile column * 32, z = -tile row * 32; checked on #T9 and #A1 2026-10-07: sand ~0, rock ~80-125).
// Chunk edges hang "skirts" down to y = -500, which are not the surface and are skipped.
// The surface triangles are rasterized at the tile corners: heights[(row) * (W + 1) + col].

import type { XbfScene } from './xbf.ts';
import { allNodes } from './xbf.ts';

const SKIRT = -499;

/** Corner heights (Emperor units) of a W x H tile map; corners no triangle covers take the nearest covered value. */
function heightsFromScene(scene: XbfScene, W: number, H: number, tile = 32): Float64Array {
  const cols = W + 1, rows = H + 1;
  const out = new Float64Array(cols * rows).fill(Number.NaN);
  for (const n of allNodes(scene.nodes)) {
    for (const f of n.faces) {
      const v = f.vertices.map((i) => n.vertices[i]?.position);
      if (v.some((p) => !p || (p[1] as number) <= SKIRT)) continue;
      const [a, b, c] = v as unknown as [number[], number[], number[]];
      // plane coordinates: column = x / tile, row = -z / tile
      const ax = (a[0] as number) / tile, ay = -(a[2] as number) / tile;
      const bx = (b[0] as number) / tile, by = -(b[2] as number) / tile;
      const cx = (c[0] as number) / tile, cy = -(c[2] as number) / tile;
      const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(det) < 1e-9) continue;
      const x0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx) - 1e-6)), x1 = Math.min(W, Math.floor(Math.max(ax, bx, cx) + 1e-6));
      const y0 = Math.max(0, Math.ceil(Math.min(ay, by, cy) - 1e-6)), y1 = Math.min(H, Math.floor(Math.max(ay, by, cy) + 1e-6));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det;
        const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
        out[y * cols + x] = l1 * (a[1] as number) + l2 * (b[1] as number) + l3 * (c[1] as number);
      }
    }
  }
  // fill uncovered corners from their covered neighbours (repeat until done)
  for (let pass = 0; pass < cols + rows; pass++) {
    let missing = 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (!Number.isNaN(out[y * cols + x] as number)) continue;
      let s = 0, k = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const h = out[ny * cols + nx] as number;
        if (!Number.isNaN(h)) { s += h; k++; }
      }
      if (k) out[y * cols + x] = s / k; else missing++;
    }
    if (!missing) break;
  }
  return out.map((h) => (Number.isNaN(h) ? 0 : h));
}

export { heightsFromScene };
