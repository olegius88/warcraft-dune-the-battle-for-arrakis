// Emperor units/buildings (rules.js) -> Warcraft III custom object data (war3map.w3u) built on
// stock WC3 models, plus the combat table (war3mapMisc.txt DamageBonus*) derived from Emperor
// warheads. Version 1 uses stand-in models (decision 2026-10-07); XBF conversion is a later track.
//
// Scaling (Emperor -> WC3): HP /2, bullet damage /2, reload ticks /25 = seconds, range tiles *128,
// speed (game coords per tick) *40, view range tiles *128, build time ticks /25 = seconds.
// TODO(power): Emperor power (windtraps vs consumers) is not modelled; buildings work unpowered.
// Veterancy: Rules.txt levels are applied at run time by mission.js (EmpVetData / EmpOnKill).

import { writeObjects, idAllocator } from '../wc3/objects.ts';

// Emperor armour -> WC3 defense type ('udty').
const ARMOUR = {
  None: 'none', BPV: 'small', Light: 'small', Medium: 'medium', Heavy: 'large', Concrete: 'fort', Walls: 'fort',
  Building: 'fort', CY: 'fort', Harvester: 'normal', Invulnerable: 'divine', Aircraft: 'hero',
};
const WC3_ARMOUR = ['small', 'medium', 'large', 'fort', 'normal', 'hero', 'divine', 'none'];
// Only attack types without side effects (magic/spells interact with spell immunity).
const WC3_ATTACK = ['normal', 'pierce', 'siege', 'chaos', 'hero'];

const RACE = { Atreides: 'human', Harkonnen: 'orc', Ordos: 'undead' };

// Stock model choice: [match(o) -> boolean, base unit id, scale]
const UNIT_BASES = [
  [(o) => /worm/i.test(o.name), 'ucry', 2.5],
  [(o) => /Carryall|EITS|DropShip|Frigate|Scavenger|INFlyer/i.test(o.name), 'nzep', 1.0],
  [(o) => o.canFly || /Orni|Gunship|ADP|NIAP/i.test(o.name), 'hgyr', 1.1],
  [(o) => /^Harvester$|FakeHarvester/.test(o.name), 'ngir', 1.2],
  [(o) => /^MCV$/.test(o.name), 'umtw', 1.3],
  [(o) => /Yak/i.test(o.name), 'okod', 0.9],
  [(o) => /Civ|Slave|Scientist|Advisor/i.test(o.name), 'nvil', 1.0],
  [(o) => /Engineer|Scout/i.test(o.name), 'hpea', 1.0],
  [(o) => /Saboteur|Infiltrator|Fremen|WormRider/i.test(o.name), 'nass', 1.0],
  [(o) => /Contaminator/i.test(o.name), 'nzom', 1.0],
  [(o) => /General|Duke/i.test(o.name), 'hcth', 1.1],
  [(o) => /Mortar/i.test(o.name), 'hmtm', 1.0],
  [(o) => /Trooper|Flamer|AATrooper|Chemical/i.test(o.name), 'ohun', 1.0],
  [(o) => o.infantry, 'hrif', 1.0],
  [(o) => /InkVine|Minotaurus|Kobra|Missile|Projector/i.test(o.name), 'ocat', 1.1],
  [(o) => o.armour === 'Heavy', 'hmtt', 1.2],
  [(o) => o.armour === 'Medium', 'hmtt', 0.9],
  [() => true, 'ncgb', 1.3],
];

// Buildings: [regex on name, {human, orc, undead, neutral}, scale]
const BUILDING_BASES = [
  [/ConYard/i, { human: 'htow', orc: 'ogre', undead: 'unpl', neutral: 'htow' }, 1.0],
  [/Windtrap/i, { human: 'hhou', orc: 'otrb', undead: 'uzig', neutral: 'hhou' }, 1.0],
  [/Barracks/i, { human: 'hbar', orc: 'obar', undead: 'usep', neutral: 'hbar' }, 1.0],
  [/Factory/i, { human: 'harm', orc: 'obea', undead: 'uslh', neutral: 'harm' }, 1.0],
  [/Refinery/i, { human: 'hlum', orc: 'ofor', undead: 'ugrv', neutral: 'hlum' }, 1.0],
  [/Outpost/i, { human: 'hars', orc: 'osld', undead: 'utod', neutral: 'hars' }, 0.9],
  [/Starport|Hanger|Helipad/i, { human: 'hgra', orc: 'ovln', undead: 'ubon', neutral: 'hgra' }, 1.0],
  [/Palace/i, { human: 'hcas', orc: 'ofrt', undead: 'unp2', neutral: 'hcas' }, 1.0],
  [/Rocket|Pop|Flame|Turret|Pillbox|Gun/i, { human: 'hgtw', orc: 'owtw', undead: 'uzg1', neutral: 'hgtw' }, 1.0],
  [/Wall/i, { human: 'hwtw', orc: 'hwtw', undead: 'hwtw', neutral: 'hwtw' }, 0.5],
  [/.*/, { human: 'hvlt', orc: 'ovln', undead: 'utom', neutral: 'nmrk' }, 1.0],
];

function warheadVector(w) {
  // average Emperor percentages per WC3 armour class
  const sums = Object.fromEntries(WC3_ARMOUR.map((a) => [a, []]));
  for (const [em, wc] of Object.entries(ARMOUR)) if (w.vs[em] != null) sums[wc].push(w.vs[em]);
  return WC3_ARMOUR.map((a) => (sums[a].length ? sums[a].reduce((x, y) => x + y, 0) / sums[a].length : 100) / 100);
}

/** k-means (k = 5) of warhead vectors -> WC3 attack type per warhead + DamageBonus table rows. */
function combatTable(warheads) {
  const names = [...warheads.keys()].sort();
  const vecs = names.map((n) => warheadVector(warheads.get(n)));
  const k = Math.min(WC3_ATTACK.length, vecs.length);
  let cent = vecs.slice(0, k).map((v) => v.slice());
  // deterministic init: spread by index
  cent = Array.from({ length: k }, (_, i) => vecs[Math.floor((i * vecs.length) / k)].slice());
  let assign = new Array(vecs.length).fill(0);
  for (let it = 0; it < 50; it++) {
    assign = vecs.map((v) => cent.map((c) => c.reduce((s, x, j) => s + (x - v[j]) ** 2, 0)).reduce((bi, d, i, a) => (d < a[bi] ? i : bi), 0));
    cent = cent.map((c, i) => {
      const mem = vecs.filter((_, j) => assign[j] === i);
      return mem.length ? c.map((_, j) => mem.reduce((s, v) => s + v[j], 0) / mem.length) : c;
    });
  }
  const attackOf = new Map(names.map((n, i) => [n, WC3_ATTACK[assign[i]]]));
  const misc = ['[Misc]'];
  cent.forEach((c, i) => {
    const key = WC3_ATTACK[i][0].toUpperCase() + WC3_ATTACK[i].slice(1);
    misc.push(`DamageBonus${key}=${c.map((x) => x.toFixed(2)).join(',')}`);
  });
  return { attackOf, misc: misc.join('\r\n') + '\r\n' };
}

const str = (field, value) => ({ field, type: 'string', value: String(value) });
const int = (field, value) => ({ field, type: 'int', value: Math.round(value) });
const unreal = (field, value) => ({ field, type: 'unreal', value });
const real = (field, value) => ({ field, type: 'real', value });

/**
 * @param {{objects: Map}} rules  from loadRules
 * @param {(name:string)=>string} displayName  localised name lookup (falls back to the id)
 */
function buildUnitData(rules, displayName = (n) => n) {
  const nextId = idAllocator();
  const warheads = new Map();
  for (const o of rules.objects.values()) for (const t of o.turrets) if (t.bullet && t.bullet.warhead) warheads.set(t.bullet.warhead.name, t.bullet.warhead);
  const combat = combatTable(warheads);

  const rawcode = new Map(); // Emperor name -> WC3 id
  const objects = [];
  const all = [...rules.objects.values()];
  for (const o of all) rawcode.set(o.name, nextId('x'));

  for (const o of all) {
    const race = RACE[o.house] || 'neutral';
    let base, scale;
    if (o.category === 'Building') {
      const b = BUILDING_BASES.find(([re]) => re.test(o.name));
      base = b[1][race] || b[1].neutral; scale = b[2];
    } else {
      const b = UNIT_BASES.find(([m]) => m(o));
      base = b[1]; scale = b[2];
    }
    const mods = [
      str('unam', displayName(o.name)),
      int('uhpm', Math.max(10, o.health / 2)),
      str('udty', ARMOUR[o.armour] || 'normal'),
      int('udef', o.category === 'Building' ? 2 : 0),
      int('ugol', o.cost), int('ulum', 0), int('ufoo', 0), int('ufma', 0),
      int('ubld', Math.max(1, (o.buildTime || 25) / 25)),
      int('usid', Math.max(1, o.viewRange) * 128), int('usin', Math.max(1, o.viewRange) * 96),
      str('urac', race === 'neutral' ? 'other' : race),
      real('usca', scale), real('ussc', scale),
    ];
    if (o.category !== 'Building' && o.speed > 0) mods.push(int('umvs', Math.min(522, Math.max(60, o.speed * 40))));
    const weapon = o.turrets.find((t) => t.bullet && t.bullet.damage > 0);
    if (weapon) {
      const b = weapon.bullet;
      mods.push(int('uaen', 1));
      mods.push(int('ua1b', Math.max(1, b.damage / 2)), int('ua1d', 1), int('ua1s', 1));
      mods.push(int('ua1r', Math.max(1, b.range) * 128), unreal('uacq', Math.max(b.range, o.viewRange) * 128));
      mods.push(unreal('ua1c', Math.max(0.2, weapon.reload / 25)));
      mods.push(str('ua1t', combat.attackOf.get(b.warhead && b.warhead.name) || 'normal'));
      mods.push(str('ua1g', b.antiAircraft ? 'air' : 'ground,structure,debris,item,ward'));
    } else if (o.category !== 'Building' || /Wall/i.test(o.name)) {
      mods.push(int('uaen', 0));
    }
    objects.push({ base, id: rawcode.get(o.name), mods, emperor: o });
  }

  // ---- economy / construction objects (ids fixed so the runtime can refer to them) ----
  const HARVEST_ABILITY = 'A000'; // Ahar with Emperor capacity (700 credits per load)
  const ids = { harvestAbility: HARVEST_ABILITY, spiceField: 'xS00', builders: {}, mcvBuilders: {} };
  const abilities = [{ base: 'Ahar', id: HARVEST_ABILITY, mods: [
    { field: 'Har3', type: 'int', value: 700, level: 1, column: 3 },
    { field: 'Har2', type: 'int', value: 0, level: 1, column: 2 },
    { field: 'anam', type: 'string', value: 'Сбор специи' },
  ] }];
  // Spice field = gold mine (amount set at spawn by the runtime)
  objects.push({ base: 'ngol', id: ids.spiceField, mods: [str('unam', 'Поле специи'), real('usca', 0.6), real('ussc', 0.6),
    int('uclr', 255), int('uclg', 140), int('uclb', 40)], emperor: null });

  // Territory marker of the Arrakis hub map: invulnerable, unarmed, house-coloured tower.
  ids.territoryMarker = 'xM00';
  objects.push({ base: 'hgtw', id: ids.territoryMarker, mods: [str('unam', 'Территория'), str('uabi', 'Avul'), int('uaen', 0),
    real('usca', 0.7), real('ussc', 0.7), str('upgr', ''), str('ures', '')], emperor: null });

  const houseOf = (o) => (/^(AT|HK|OR)/.exec(o.name) || [])[1] || null;
  const houseBuildings = (h) => all.filter((b) => b.category === 'Building' && b.cost > 0 && houseOf(b) === h && /ConYard/.test(b.primaryBuilding.join(',')));
  const ownVariant = (list, h) => list.find((n) => n.startsWith(h)) || list[0];

  for (const h of ['AT', 'HK', 'OR']) {
    // Builder spawned by a finished construction yard; builds the house's buildings.
    const builderId = `xB${h === 'AT' ? 'A' : h === 'HK' ? 'H' : 'O'}0`;
    ids.builders[h] = builderId;
    objects.push({ base: 'hpea', id: builderId, mods: [str('unam', 'Строитель'), str('uabi', 'AHbu'),
      str('ubui', houseBuildings(h).map((b) => rawcode.get(b.name)).join(',')), int('uaen', 0), int('ugol', 0), int('ufoo', 0),
      str('urac', RACE[{ AT: 'Atreides', HK: 'Harkonnen', OR: 'Ordos' }[h]])], emperor: null });
  }

  for (const obj of objects) {
    const o = obj.emperor;
    if (!o) continue;
    const h = houseOf(o);
    // Strip stock-unit behaviour we do not want (peasant training, upgrades, spells).
    obj.mods.push(str('upgr', ''), str('ures', ''));
    if (o.category === 'Building') {
      // Production: units whose PrimaryBuilding names this building.
      const trains = all.filter((u) => u.category === 'Unit' && u.cost > 0 && u.primaryBuilding.includes(o.name)).map((u) => rawcode.get(u.name));
      obj.mods.push(str('utra', trains.join(',')));
      const abil = [];
      if (/Refinery/i.test(o.name)) abil.push('Argd');
      obj.mods.push(str('uabi', abil.join(',')));
    } else if (o.harvester || /Harvester/.test(o.name)) {
      obj.mods.push(str('uabi', HARVEST_ABILITY));
    } else if (/^MCV$/.test(o.name)) {
      // MCV builds (and is consumed by) a construction yard: runtime removes it on construct start.
      obj.mods.push(str('uabi', 'AHbu'), str('ubui', ['ATConYard', 'HKConYard', 'ORConYard'].map((n) => rawcode.get(n)).join(',')));
    } else {
      obj.mods.push(str('uabi', ''));
    }
    // Requirements: the own-house variant of the SecondaryBuilding (Emperor accepts any house's).
    if (o.secondaryBuilding.length && h) {
      const req = ownVariant(o.secondaryBuilding, h);
      if (rawcode.has(req)) obj.mods.push(str('ureq', rawcode.get(req)));
    }
  }
  return {
    objects, rawcode, ids, misc: combat.misc,
    w3u: writeObjects(objects.map(({ base, id, mods }) => ({ base, id, mods }))),
    w3a: writeObjects(abilities, true),
  };
}

export { buildUnitData, ARMOUR, combatTable };
