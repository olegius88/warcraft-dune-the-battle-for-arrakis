// Types for gifenc 1.0.3 (ships no declarations). Written from its README (API section); only the
// part of the API this project uses. CommonJS package: under ESM only the default import works.
declare module 'gifenc' {
  export type Palette = number[][];
  export type ColorFormat = 'rgb565' | 'rgb444' | 'rgba4444';

  export interface QuantizeOptions {
    format?: ColorFormat;
    oneBitAlpha?: boolean | number;
    clearAlpha?: boolean;
    clearAlphaThreshold?: number;
    clearAlphaColor?: number;
  }

  export interface FrameOptions {
    palette?: Palette;
    first?: boolean;
    transparent?: boolean;
    transparentIndex?: number;
    /** frame delay in milliseconds */
    delay?: number;
    /** -1 once, 0 forever, n repetitions */
    repeat?: number;
    dispose?: number;
  }

  export interface Encoder {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: FrameOptions): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    writeHeader(): void;
    reset(): void;
  }

  export interface GifEnc {
    GIFEncoder(opts?: { auto?: boolean; initialCapacity?: number }): Encoder;
    quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: QuantizeOptions): Palette;
    applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: ColorFormat): Uint8Array;
  }

  const gifenc: GifEnc;
  export default gifenc;
}
