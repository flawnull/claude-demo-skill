#!/usr/bin/env node
// Usage: node stitch.mjs <film-dir> [--out renders/film.mp4]
// Joins build/frames into an MP4 and mixes voice, music (ducked) and sound effects at -16 LUFS.
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { args, filmDir, readMeta, sfxIndex, abs, run, SKILL } from "./_util.mjs";
import { stitchArgs } from "../lib/audio.mjs";
import { resolveName } from "../lib/sfx.mjs";

export function stitch(dir, out) {
  const meta = readMeta(dir);
  // sounds placed by qa.mjs: every word, number change, move and landing (rule: a sound on everything that appears)
  const autoFile = join(dir, "build", "auto-sfx.json");
  if (meta.autoSfx && existsSync(autoFile)) {
    const auto = JSON.parse(readFileSync(autoFile, "utf8"));
    meta.audio = { ...meta.audio, sfx: [...(meta.audio?.sfx ?? []), ...auto] };
    console.log(`stitch: ${auto.length} auto sounds`);
  }
  out = abs(dir, out ?? join("renders", `${basename(dir)}.mp4`));
  mkdirSync(dirname(out), { recursive: true });
  const index = sfxIndex();
  const resolve = (src) => {
    const p = abs(dir, src);
    if (existsSync(p)) return p;
    const hit = resolveName(index, src);
    if (hit) return join(SKILL, "sfx", hit.file);
    throw new Error(`audio "${src}" is neither a file in ${dir} nor a sound in the SFX index`);
  };
  run("ffmpeg", stitchArgs(meta, { frames: join(dir, "build", "frames", "f_%05d.png"), out, resolve }));
  console.log(`stitch: ${out}`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = args();
  try { stitch(filmDir(a), a.out); } catch (e) { console.error(e.message); process.exit(1); }
}
