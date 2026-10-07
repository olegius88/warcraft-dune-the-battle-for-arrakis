// Mentat / character speech for mission messages.
// DATA\Sounds\sounds.txt maps a message key (the same keys as [MissionMessages] in the string
// tables, e.g. HHKKillKill) to a dialog id with a language suffix (YK-G004E); the audio itself is
// the entry YK-G004 of DATA\DIALOG\DIALOG.BAG (or SFX\AUDIO.BAG). Sections: Debriefing,
// MIssionMessages, CampaignMap, Briefing, UnitBriefing, IngameMessages, WasteText.
import fs from 'node:fs';
import path from 'node:path';
import { readBag, toFile, duration } from './bag.ts';
import type { Bag, BagEntry } from './bag.ts';
import { IMPORT_DIR } from '../config/wc3.ts';

export interface SpeechLine {
  id: string;
  /** archive path inside the map */
  path: string;
  data: Buffer;
  seconds: number;
}

export interface Speech {
  /** message key -> the line, or null when the key has no speech / the file is missing */
  forKey(key: string | undefined): SpeechLine | null;
  sections(): Array<string | null>;
}

function loadSpeech(gameDir: string): Speech | null {
  const table = path.join(gameDir, 'DATA', 'Sounds', 'sounds.txt');
  const bags = [path.join(gameDir, 'DATA', 'DIALOG', 'DIALOG.BAG'), path.join(gameDir, 'DATA', 'SFX', 'AUDIO.BAG')]
    .filter((f) => fs.existsSync(f)).map(readBag);
  if (!fs.existsSync(table) || !bags.length) return null;
  const byKey = new Map<string, { id: string; section: string | null }>(); // message key (lower case)
  let section: string | null = null;
  for (const line of fs.readFileSync(table, 'latin1').split(/\r?\n/)) {
    const [key, id] = line.split('\t').map((s) => (s || '').trim());
    if (!key) continue;
    if (key === '[END]') { section = null; continue; }
    if (!id) { section = key; continue; }
    if (!byKey.has(key.toLowerCase())) byKey.set(key.toLowerCase(), { id, section });
  }
  const entries = new Map<string, { bag: Bag; e: BagEntry }>();
  for (const bag of bags) for (const e of bag.entries) if (!entries.has(e.name.toLowerCase())) entries.set(e.name.toLowerCase(), { bag, e });
  const cache = new Map<string, SpeechLine | null>();
  return {
    forKey(key) {
      const m = key && byKey.get(String(key).toLowerCase());
      if (!m) return null;
      const id = m.id.replace(/E$/i, '');
      const cached = cache.get(id);
      if (cached !== undefined) return cached;
      const hit = entries.get(id.toLowerCase()) || entries.get(m.id.toLowerCase());
      let r: SpeechLine | null = null;
      if (hit) {
        const f = toFile(hit.bag, hit.e);
        r = { id, path: `${IMPORT_DIR.speech}${id}.${f.ext}`, data: f.data, seconds: duration(hit.bag, hit.e) };
      }
      cache.set(id, r);
      return r;
    },
    sections: () => [...new Set([...byKey.values()].map((v) => v.section))],
  };
}

export { loadSpeech };
