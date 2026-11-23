#!/usr/bin/env node
// Usage: node critic.mjs <film-dir> [--pass 8]
// Measures motion between consecutive frames, scores each scene out of 10, writes
// build/critic.md, build/critic.json and one contact sheet per scene in build/critic/.
import { mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { args, filmDir, readMeta } from "./_util.mjs";
import { scoreScenes, report } from "../lib/critic.mjs";
import { frameCount, frameName } from "../lib/frames.mjs";

/** Fraction of pixels (at 480 px wide, greyscale) that changed by more than 2 levels from the previous frame. */
export function measure(dir, meta) {
  const w = 480, h = Math.round((480 * meta.height) / meta.width / 2) * 2;
  const r = spawnSync("ffmpeg", ["-loglevel", "error", "-framerate", String(meta.fps), "-i", join(dir, "build", "frames", "f_%05d.png"),
    "-vf", `scale=${w}:${h}:flags=area,format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
  const buf = r.stdout, size = w * h, n = Math.floor(buf.length / size);
  const change = new Array(n).fill(0);
  change[0] = 1; // the first frame is a cut from black
  for (let f = 1; f < n; f++) {
    let c = 0;
    const a = (f - 1) * size, b = f * size;
    for (let p = 0; p < size; p++) if (Math.abs(buf[a + p] - buf[b + p]) > 2) c++;
    change[f] = c / size;
  }
  return change;
}

export function critic(dir, pass = 8) {
  const meta = readMeta(dir);
  const total = frameCount(meta);
  const have = readdirSync(join(dir, "build", "frames")).filter((n) => n.endsWith(".png")).length;
  if (have < total) throw new Error(`only ${have} of ${total} frames on disk: capture the whole film first`);
  const change = measure(dir, meta).slice(0, total);
  const scored = scoreScenes(meta, change, { pass });
  const sheets = join(dir, "build", "critic");
  rmSync(sheets, { recursive: true, force: true });
  mkdirSync(sheets, { recursive: true });
  for (const s of scored) {
    const [a, b] = s.frames;
    const picks = Array.from({ length: 8 }, (_, k) => Math.round(a + ((b - a) * k) / 7));
    const inputs = picks.flatMap((i) => ["-i", join(dir, "build", "frames", frameName(i))]);
    spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...inputs, "-filter_complex",
      `${picks.map((_, k) => `[${k}:v]scale=480:-2[i${k}]`).join(";")};${picks.map((_, k) => `[i${k}]`).join("")}xstack=inputs=8:layout=0_0|w0_0|w0+w1_0|w0+w1+w2_0|0_h0|w0_h0|w0+w1_h0|w0+w1+w2_h0`,
      "-frames:v", "1", join(sheets, `${s.id}.png`)]);
  }
  const md = report(scored, pass);
  writeFileSync(join(dir, "build", "critic.md"), md + "\n");
  writeFileSync(join(dir, "build", "critic.json"), JSON.stringify({ pass, scenes: scored }, null, 2));
  console.log(md);
  console.log(`\ncontact sheets: ${sheets}`);
  return scored;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = args();
  try {
    const s = critic(filmDir(a), +(a.pass ?? 8));
    process.exit(s.every((x) => x.pass) ? 0 : 2);
  } catch (e) { console.error(e.message); process.exit(1); }
}
