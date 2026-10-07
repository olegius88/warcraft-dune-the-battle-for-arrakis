// Frames <prefix>000.png, <prefix>001.png, ... (run-wc3-classic.ps1 -FramesPrefix) -> animated GIF.
// Usage: node tools/make-gif.js <framesPrefix> <out.gif> [width=800] [delayMs=700]
// Box-filter downscale + per-frame 256-colour palette (gifenc). No ffmpeg needed.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
// gifenc is CommonJS without detectable named exports: under ESM only the default import works
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;

function downscale(png, width) {
  const scale = png.width / width;
  const w = Math.min(width, png.width);
  const h = Math.max(1, Math.round(png.height / scale));
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * scale), y1 = Math.max(y0 + 1, Math.floor((y + 1) * scale));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * scale), x1 = Math.max(x0 + 1, Math.floor((x + 1) * scale));
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = y0; sy < y1 && sy < png.height; sy++) {
        for (let sx = x0; sx < x1 && sx < png.width; sx++) {
          const i = (sy * png.width + sx) * 4;
          r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; n++;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return { w, h, data: out };
}

function makeGif(prefix, out, width = 800, delay = 700) {
  const dir = path.dirname(prefix);
  const base = path.basename(prefix);
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(base) && /^\d+\.png$/.test(f.slice(base.length))).sort();
  if (!files.length) throw new Error(`no frames ${prefix}*.png`);
  const gif = GIFEncoder();
  let size = null;
  for (const f of files) {
    const png = PNG.sync.read(fs.readFileSync(path.join(dir, f)));
    const { w, h, data } = downscale(png, width);
    if (size && (size[0] !== w || size[1] !== h)) continue; // window resized mid-run: skip odd frames
    size = [w, h];
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay, repeat: 0 });
  }
  gif.finish();
  fs.writeFileSync(out, gif.bytes());
  return files.length;
}

if (import.meta.main) {
  const [dir, out, width, delay] = process.argv.slice(2);
  const n = makeGif(dir, out, Number(width) || 800, Number(delay) || 700);
  console.log(`${out}: ${n} frames`);
}

export { makeGif };
