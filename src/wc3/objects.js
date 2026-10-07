'use strict';
// Object data writer (war3map.w3u/.w3t/.w3b/.w3h = plain, .w3a/.w3d/.w3q = with levels), format v2.
// Layout: https://github.com/ChiefOfGxBxL/WC3MapSpecification/blob/master/Objects/2.md
// Field ids and value types come from Units\UnitMetaData.slk (and AbilityMetaData.slk): int/bool
// fields are type 0, real 1, unreal 2, everything list/string-like 3.

const { BinaryWriter } = require('./binary');

const TYPE = { int: 0, real: 1, unreal: 2, string: 3 };

/**
 * @param {object[]} objects [{ base: 'hfoo', id: 'h000' | null, mods: [{ field: 'uhpm', type: 'int', value: 500, level?: 1, column?: 0 }] }]
 *   id null/undefined = modify the original object (original table).
 * @param {boolean} withLevels true for abilities/doodads/upgrades.
 */
function writeObjects(objects, withLevels = false) {
  const w = new BinaryWriter();
  w.int32(2);
  for (const custom of [false, true]) {
    const list = objects.filter((o) => Boolean(o.id) === custom);
    w.int32(list.length);
    for (const o of list) {
      w.chars(o.base);
      w.chars(custom ? o.id : '\0\0\0\0');
      w.int32(o.mods.length);
      for (const m of o.mods) {
        if (m.field.length !== 4) throw new Error(`bad field id ${m.field}`);
        const t = TYPE[m.type];
        if (t === undefined) throw new Error(`bad type ${m.type} for ${m.field}`);
        w.chars(m.field);
        w.int32(t);
        if (withLevels) { w.int32(m.level || 0); w.int32(m.column || 0); }
        if (t === 0) w.int32(Math.round(m.value));
        else if (t === 3) w.cstring(m.value);
        else w.float32(m.value);
        w.int32(0); // end of modification
      }
    }
  }
  return w.toBuffer();
}

/** Allocates consecutive custom ids like 'h000', 'h001' ... with a given first letter. */
function idAllocator() {
  const next = {};
  const digits = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return (prefix) => {
    const n = next[prefix] = (next[prefix] || 0) + 1;
    const v = n - 1;
    return prefix + digits[Math.floor(v / 1296) % 36] + digits[Math.floor(v / 36) % 36] + digits[v % 36];
  };
}

module.exports = { writeObjects, idAllocator, TYPE };
