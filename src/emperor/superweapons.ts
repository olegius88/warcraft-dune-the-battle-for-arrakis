// Palace super weapons from Rules.txt: the objects flagged DeathHand / HawkWeapon / BeamWeapon (Cost 0,
// PrimaryBuilding = the house palace, BuildTime = the charge time). Their Resource list names the
// bullet of the strike (DeathHandBomb, Hawk_B, Beserk_B: Damage, BlastRadius in world units of 32 per
// tile, DamageFriendly); the Death Hand leaves its ExplosionType DeathHandSplat ("Radioactive
// fallout": Size in tiles, Lifespan in ticks) that damages with DeathHandSplat_B. [General]
// HawkStrikeDuration / LightningDuration: how long a hit unit is affected. What the effects are
// (cncnz.com, Atreides / Ordos structures): Hawk Strike makes enemy units flee uncontrollably,
// Chaos Lightning makes units go berserk, firing on friends and foes.

import type { Rules, RulesObject } from './rules.ts';
import { EMPEROR_TILE } from '../config/scale.ts';

export type SuperweaponKind = 'deathHand' | 'hawk' | 'beam';

export interface Superweapon {
  /** Emperor object name of the charge (HKDeathHand...) */
  name: string;
  kind: SuperweaponKind;
  palace: string;
  /** BuildTime of the charge, ticks */
  chargeTicks: number;
  damage: number;
  radiusTiles: number;
  /** DamageFriendly (default true: the Death Hand bomb does not say) */
  friendly: boolean;
  /** ticks a hit unit flees (hawk) or is berserk (beam); 0 for the Death Hand */
  effectTicks: number;
  fallout?: { damage: number; sizeTiles: number; lifespanTicks: number; friendly: boolean };
}

const KIND_FLAG: ReadonlyArray<readonly [SuperweaponKind, string]> = [['deathHand', 'DeathHand'], ['hawk', 'HawkWeapon'], ['beam', 'BeamWeapon']];

/** the super weapon kind of a Rules.txt object, null for everything else */
function superweaponKind(o: RulesObject): SuperweaponKind | null {
  return KIND_FLAG.find(([, flag]) => /^true$/i.test((o.raw[flag] ?? '').split('//')[0]?.trim() ?? ''))?.[0] ?? null;
}

function superweapons(rules: Rules): Superweapon[] {
  const raw = (name: string): Record<string, string> | undefined => {
    const s = rules.sections.get(name.toLowerCase());
    return s ? Object.fromEntries(s.entries.map(([k, v]) => [k, v.split('//')[0]?.trim() ?? ''])) : undefined;
  };
  const num = (v: string | undefined): number => { const n = parseFloat(v ?? ''); return Number.isFinite(n) ? n : 0; };
  const bool = (v: string | undefined, d: boolean): boolean => (v === undefined || v === '' ? d : /^true$/i.test(v));
  const out: Superweapon[] = [];
  for (const o of rules.objects.values()) {
    const kind = superweaponKind(o);
    if (!kind) continue;
    const bullets = (o.raw.Resource ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const bulletName = bullets.find((b) => raw(b)?.Damage !== undefined);
    const b = bulletName ? raw(bulletName) : undefined;
    if (!b) continue;
    const w: Superweapon = {
      name: o.name, kind, palace: o.primaryBuilding[0] ?? '', chargeTicks: o.buildTime,
      damage: num(b.Damage), radiusTiles: num(b.BlastRadius) / EMPEROR_TILE, friendly: bool(b.DamageFriendly, true),
      effectTicks: kind === 'hawk' ? num(rules.general.HawkStrikeDuration) : kind === 'beam' ? num(rules.general.LightningDuration) : 0,
    };
    const splatName = (o.raw.ExplosionType ?? '').split('//')[0]?.trim();
    const splat = splatName ? raw(splatName) : undefined;
    const splatBullet = splatName ? raw(`${splatName}_B`) : undefined;
    if (splat && splatBullet) {
      w.fallout = { damage: num(splatBullet.Damage), sizeTiles: num(splat.Size), lifespanTicks: num(splat.Lifespan), friendly: bool(splatBullet.DamageFriendly, true) };
    }
    out.push(w);
  }
  return out;
}

export { superweapons, superweaponKind };
