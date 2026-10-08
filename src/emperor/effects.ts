// Emperor effects -> WC3 effect models. Rules.txt names them: an object's ExplosionType (when it dies),
// a bullet's ExplosionType (where it hits), a turret's TurretMuzzleFlash (where it fires). ArtIni.txt
// [<effect>] Xaf names the XBF (Explosion/<Xaf>.xbf, bullets/), which model.ts converts like a unit:
// glow textures (! @) additive and self-lit, texture sequences (%) flipped over the animation, bones
// scaled, the one animation as Death (config/models.ts EFFECT_*). The runtime plays them with
// DestroyEffect(AddSpecialEffect(...)) (mission effects.j).

import type { Rules } from './rules.ts';
import type { ArtEntry } from './artini.ts';
import { baseName } from './artini.ts';
import { readArchive, readIndex } from './rfh.ts';
import { readXbf, readAnimations } from './xbf.ts';
import { xbfToMdx } from './model.ts';
import type { TextureRef } from './model.ts';
import { convertTextures } from './models.ts';
import { writeMdx, FILTER } from '../wc3/mdx.ts';
import { gameData } from '../config/paths.ts';
import { MODEL_PATH, EFFECT_SEQUENCES, EFFECT_ADDITIVE, EFFECT_FLIPBOOK, EFFECT_FOLDERS, EFFECT_HIDDEN_NODE, EFFECT_FADE } from '../config/models.ts';

export interface EffectUse {
  /** object -> effect when it dies (ExplosionType) */
  death: Map<string, string>;
  /** object -> effect where its bullet hits (the first turret's bullet ExplosionType) */
  hit: Map<string, string>;
  /** object -> effect where it fires (the first turret's TurretMuzzleFlash) */
  muzzle: Map<string, string>;
}

export interface EffectSet {
  /** effect name (lower case) -> model path for AddSpecialEffect */
  model: Map<string, string>;
  /** archive path -> MDX / BLP */
  files: Record<string, Buffer>;
  /** effects that could not be converted, with the reason */
  failed: Map<string, string>;
}

const value = (v: string | undefined): string => (v ?? '').split('//')[0]?.trim() ?? '';

/** Which effect every object shows (Rules.txt). */
function effectUse(rules: Rules): EffectUse {
  const raw = (name: string): Record<string, string> => Object.fromEntries(rules.sections.get(name.toLowerCase())?.entries ?? []);
  const use: EffectUse = { death: new Map(), hit: new Map(), muzzle: new Map() };
  for (const o of rules.objects.values()) {
    const death = value(o.raw.ExplosionType);
    if (death) use.death.set(o.name, death);
    const t = o.turrets.find((x) => x.bullet && x.bullet.damage > 0) ?? o.turrets[0];
    if (!t) continue;
    const muzzle = value(raw(t.name).TurretMuzzleFlash);
    if (muzzle) use.muzzle.set(o.name, muzzle);
    const hit = t.bullet ? value(raw(t.bullet.name).ExplosionType) : '';
    if (hit) use.hit.set(o.name, hit);
  }
  return use;
}

/** Convert the effects named (those ArtIni.txt gives an Xaf whose XBF is in EFFECT_FOLDERS). */
function buildEffects(names: Iterable<string>, art: Map<string, ArtEntry>, archive = gameData('3DDATA0001')): EffectSet {
  const set: EffectSet = { model: new Map(), files: {}, failed: new Map() };
  const index = readIndex(archive + '.RFH').map((e) => e.name);
  const inFolders = new Map(index.filter((n) => EFFECT_FOLDERS.some((f) => n.toLowerCase().startsWith(f))).map((n) => [baseName(n).toLowerCase(), n]));
  const textureNames = index.filter((n) => /^textures\//i.test(n)).map((n) => baseName(n));
  // the frames of a texture sequence: "!%boom0.tga" -> !%boom0 .. !%boom10 in order
  const flipbook = (raw: string): string[] | null => {
    const m = EFFECT_FLIPBOOK.exec(raw);
    if (!m) return null;
    const prefix = (m[1] as string).toLowerCase();
    const frames = textureNames.map((t) => [t, EFFECT_FLIPBOOK.exec(t)] as const)
      .filter(([, x]) => x && (x[1] as string).toLowerCase() === prefix)
      .sort((a, b) => Number((a[1] as RegExpExecArray)[2]) - Number((b[1] as RegExpExecArray)[2])).map(([t]) => t);
    return frames.length > 1 ? frames : null;
  };
  const wanted = new Map<string, string>(); // effect -> archive file
  for (const n of new Set([...names].map((x) => x.toLowerCase()))) {
    const e = art.get(n);
    if (!e?.xaf) { set.failed.set(n, 'not in ArtIni.txt'); continue; }
    const file = inFolders.get(`${e.xaf.replace(/\.(xaf|xbf)$/i, '')}.xbf`.toLowerCase());
    if (file) wanted.set(n, file);
    else set.failed.set(n, `no model file for Xaf ${e.xaf}`);
  }
  const files = new Set(wanted.values());
  const xbf = new Map<string, Buffer>();
  for (const f of readArchive(archive, (n) => files.has(n))) xbf.set(f.name, f.data);
  const textureFiles = new Set<string>();
  for (const [n, file] of wanted) {
    const key = `FX_${baseName(file).replace(/\.xbf$/i, '')}`;
    try {
      const data = xbf.get(file) as Buffer;
      const ref = (tex: string): TextureRef => { textureFiles.add(tex.toLowerCase()); return { path: MODEL_PATH.texture(tex), alpha: true, teamColour: false }; };
      const { model } = xbfToMdx(key, readXbf(data), readAnimations(data), ref, {
        sequences: EFFECT_SEQUENCES, scaling: true, flipbook, hiddenNode: EFFECT_HIDDEN_NODE, fade: EFFECT_FADE,
        blend: (raw) => (EFFECT_ADDITIVE(raw) ? FILTER.additive : FILTER.blend),
      });
      // TODO(models): effects drawn only by FXData particles (the hits: mghit, MissileHit, SniperHit,
      // ShellHit, DevImpact, DeviateHit, BloodSplat; the sparks of the explosions) are not converted:
      // the XBF's FXData block (particle emitters at its # helper nodes) is not read. Risk: no hit effects.
      if (!model.geosets.length) { set.failed.set(n, `${file}: only FXData particles (not converted)`); continue; }
      if (!model.sequences.some((s) => s.name === EFFECT_SEQUENCES[0]?.[1])) { set.failed.set(n, `${file}: no animation`); continue; }
      set.files[MODEL_PATH.model(key)] = writeMdx(model);
      set.model.set(n, MODEL_PATH.modelField(key));
    } catch (e) {
      set.failed.set(n, `${file}: ${(e as Error).message}`);
    }
  }
  Object.assign(set.files, convertTextures(archive, textureFiles));
  return set;
}

export { effectUse, buildEffects };
