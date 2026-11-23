#!/usr/bin/env node
// Usage: node film.mjs <film-dir> [--scene a,b] [--out renders/x.mp4] [--pass 8] [--update-engine]
// One pass: lint, capture (all or the named scenes), beat check, critic, layout QA (+ auto sounds), stitch.
import { args, filmDir } from "./_util.mjs";
import { capture } from "./capture.mjs";
import { beatCheck } from "./beats.mjs";
import { critic } from "./critic.mjs";
import { stitch } from "./stitch.mjs";
import { qa } from "./qa.mjs";

const a = args();
try {
  const dir = filmDir(a);
  await capture(dir, { scenes: a.scene ? String(a.scene).split(",") : null, workers: +(a.workers ?? 4), updateEngine: !!a["update-engine"] });
  const b = beatCheck(dir);
  const scored = critic(dir, +(a.pass ?? 8));
  const q = await qa(dir, { step: 0.05 });
  const out = stitch(dir, a.out);
  const failing = scored.filter((s) => !s.pass).map((s) => s.id);
  console.log(`\nfilm: ${out}`);
  console.log(failing.length ? `next pass: fix ${failing.join(", ")}, then run film.mjs --scene ${failing.join(",")}` : "every scene passes");
  if (q.problems.length) console.log(`layout: ${q.problems.length} problems in build/qa.md (look at build/qa/flagged.png)`);
  process.exit(failing.length || !b.ok || q.problems.length ? 2 : 0);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
