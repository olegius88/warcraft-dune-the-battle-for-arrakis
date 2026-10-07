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
import { SPEECH_BRIEFING_SECTION, SPEECH_DEBRIEFING_SECTION, DEBRIEF_WIN_SUFFIXES, DEBRIEF_LOSE_SUFFIXES } from '../config/runtime.ts';

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
  /** spoken briefing of a mission script (sounds.txt section Briefing), lines in order */
  briefing(script: string): SpeechLine[];
  /** spoken debriefing (section Debriefing): <script>win, else <script>debrief; <script>lose */
  debrief(script: string, win: boolean): SpeechLine[];
  sections(): Array<string | null>;
}

function loadSpeech(gameDir: string): Speech | null {
  const table = path.join(gameDir, 'DATA', 'Sounds', 'sounds.txt');
  const bags = [path.join(gameDir, 'DATA', 'DIALOG', 'DIALOG.BAG'), path.join(gameDir, 'DATA', 'SFX', 'AUDIO.BAG')]
    .filter((f) => fs.existsSync(f)).map(readBag);
  if (!fs.existsSync(table) || !bags.length) return null;
  const byKey = new Map<string, { id: string; section: string | null }>(); // message key (lower case)
  const all: Array<{ key: string; id: string; section: string | null }> = []; // every entry, in order
  let section: string | null = null;
  for (const line of fs.readFileSync(table, 'latin1').split(/\r?\n/)) {
    const [key, id] = line.split('\t').map((s) => (s || '').trim());
    if (!key) continue;
    if (key === '[END]') { section = null; continue; }
    if (!id) { section = key; continue; }
    if (!byKey.has(key.toLowerCase())) byKey.set(key.toLowerCase(), { id, section });
    all.push({ key: key.toLowerCase(), id, section });
  }
  const entries = new Map<string, { bag: Bag; e: BagEntry }>();
  for (const bag of bags) for (const e of bag.entries) if (!entries.has(e.name.toLowerCase())) entries.set(e.name.toLowerCase(), { bag, e });
  const cache = new Map<string, SpeechLine | null>();
  return {
    forKey(key) {
      const m = key && byKey.get(String(key).toLowerCase());
      return m ? lineFor(m.id) : null;
    },
    briefing: (script) => all.filter((e) => e.section === SPEECH_BRIEFING_SECTION && e.key === script.toLowerCase())
      .map((e) => lineFor(e.id)).filter((l): l is SpeechLine => l !== null),
    debrief: (script, win) => {
      const s = script.toLowerCase();
      const keys = win ? DEBRIEF_WIN_SUFFIXES.map((x) => s + x) : DEBRIEF_LOSE_SUFFIXES.map((x) => s + x);
      for (const k of keys) {
        const lines = all.filter((e) => e.section === SPEECH_DEBRIEFING_SECTION && e.key === k)
          .map((e) => lineFor(e.id)).filter((l): l is SpeechLine => l !== null);
        if (lines.length) return lines;
      }
      return [];
    },
    sections: () => [...new Set([...byKey.values()].map((v) => v.section))],
  };

  /** sounds.txt id (with language suffix) -> the line, cached; null when the file is missing */
  function lineFor(rawId: string): SpeechLine | null {
    const id = rawId.replace(/E$/i, '');
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    const hit = entries.get(id.toLowerCase()) || entries.get(rawId.toLowerCase());
    let r: SpeechLine | null = null;
    if (hit) {
      const f = toFile(hit.bag, hit.e);
      r = { id, path: `${IMPORT_DIR.speech}${id}.${f.ext}`, data: f.data, seconds: duration(hit.bag, hit.e) };
    }
    cache.set(id, r);
    return r;
  }
}

export { loadSpeech };
