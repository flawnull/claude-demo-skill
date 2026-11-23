#!/usr/bin/env node
// Usage: node beats.mjs <film-dir>   Reports how far every cut, SFX and hit lands from the beat grid.
import { args, filmDir, readMeta } from "./_util.mjs";
import { beatReport } from "../lib/beats.mjs";

export function beatCheck(dir, maxMs = 1) {
  const r = beatReport(readMeta(dir));
  const off = r.items.filter((x) => x.ms > maxMs);
  for (const x of off) console.log(`  off-beat ${x.ms} ms: ${x.kind} ${x.id} at ${x.t.toFixed(3)} s (beat ${x.beat})`);
  console.log(`beats: ${r.items.length} cuts and hits, ${r.framesPerBeat.toFixed(2)} frames per beat, off-beat: ${r.max} ms`);
  if (!Number.isInteger(Math.round(r.framesPerBeat * 1000) / 1000)) console.log("  note: the beat is not a whole number of frames; pick a BPM from Motion.frameExactBpms(fps)");
  return { ...r, ok: off.length === 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(beatCheck(filmDir(args())).ok ? 0 : 1);
}
