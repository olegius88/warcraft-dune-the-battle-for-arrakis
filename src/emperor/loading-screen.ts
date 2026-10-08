// The loading screen of a single map (w3i loading screen model, src/emperor/build-contest.ts): a model
// with one picture plane, as the community LoadingScreen.mdx / FullScreen.blp pair does (hiveworkshop
// "loadingscreen and fullscreen": the model names the picture). The loading glue draws the model in
// its own screen units without a camera: the plane spans x 0..0.8, y 0..0.6 (y up) at z 0, as in the
// loading screen model of github.com/Code-Fixxers/teve_final_fixxed (convertedTextures/hdLoadingScreen/
// loadingScreen.mdl). The picture is a frame of an Emperor movie (config CONTEST.loading).

import { writeMdx } from '../wc3/mdx.ts';
import type { MdxModel } from '../wc3/mdx.ts';
import { writeBlpJpeg } from '../wc3/blp.ts';
import type { RgbaImage } from '../wc3/blp.ts';
import { CONTEST } from '../config/contest.ts';

/** The model and its picture by archive path, for `img` (any size; stretched over the plane). */
function loadingScreen(img: RgbaImage): Record<string, Buffer> {
  const L = CONTEST.loading;
  const [w, h] = L.screen;
  const ext = { radius: Math.hypot(w, h) / 2, min: [0, 0, 0] as [number, number, number], max: [w, h, 0] as [number, number, number] };
  const model: MdxModel = {
    name: 'LoadingScreen',
    extent: ext,
    sequences: [{ name: 'Birth', start: 1000, end: 2000, nonLooping: true, extent: ext }],
    textures: [{ path: L.picture }],
    // unshaded, two sided, unfogged: a lit picture
    materials: [{ layers: [{ filterMode: 0, flags: 0x1 | 0x10 | 0x20, textureId: 0 }] }],
    geosets: [{
      // bottom left, bottom right, top right, top left; the picture's top row at y = h
      vertices: [0, 0, 0, w, 0, 0, w, h, 0, 0, h, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
      uvs: [0, 1, 1, 1, 1, 0, 0, 0],
      faces: [0, 1, 2, 0, 2, 3],
      bones: [0], materialId: 0, extent: ext, sequenceExtents: [ext],
    }],
    geosetAnimations: [],
    bones: [{ name: 'LoadingScreenBone', parentId: -1 }],
    pivots: [[0, 0, 0]],
  };
  const side = L.textureSize;
  // stretch to the power-of-two picture
  const tex = new Uint8Array(side * side * 4);
  for (let y = 0; y < side; y++) for (let xx = 0; xx < side; xx++) {
    const sx = Math.min(img.width - 1, Math.floor(xx * img.width / side)), sy = Math.min(img.height - 1, Math.floor(y * img.height / side));
    tex.set(img.rgba.subarray((sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4), (y * side + xx) * 4);
  }
  return { [L.model]: writeMdx(model), [L.picture]: writeBlpJpeg({ width: side, height: side, rgba: tex }, L.quality) };
}

export { loadingScreen };
