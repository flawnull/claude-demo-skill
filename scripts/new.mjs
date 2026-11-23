#!/usr/bin/env node
// Usage: node new.mjs <dir> [--aspect 16:9|9:16|1:1|4:5] [--fps 30] [--bpm 120]
// Copies the film template and the engine into a new project.
import { cpSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { args, SKILL } from "./_util.mjs";
import { viewport } from "../lib/frames.mjs";

const a = args();
const dir = resolve(a._[0] ?? "film");
if (existsSync(join(dir, "index.html"))) { console.error(`${dir} already has a film`); process.exit(1); }
const fps = +(a.fps ?? 30), bpm = +(a.bpm ?? 120);
const { width, height } = viewport(a.aspect ?? "16:9");
const Motion = createRequire(import.meta.url)("../engine/motion.js");
const fpb = (60 * fps) / bpm;
mkdirSync(dir, { recursive: true });
cpSync(join(SKILL, "template"), dir, { recursive: true });
mkdirSync(join(dir, "engine"), { recursive: true });
cpSync(join(SKILL, "engine", "motion.js"), join(dir, "engine", "motion.js"));
for (const f of ["film.js", "index.html"]) {
  const p = join(dir, f);
  writeFileSync(p, readFileSync(p, "utf8").replaceAll("__FPS__", fps).replaceAll("__BPM__", bpm).replaceAll("__W__", width).replaceAll("__H__", height));
}
console.log(`new film: ${dir} (${width}x${height}, ${fps} fps, ${bpm} BPM)`);
if (!Number.isInteger(Math.round(fpb * 1000) / 1000)) console.log(`note: ${bpm} BPM is ${fpb.toFixed(2)} frames per beat. Frame-exact choices: ${Motion.frameExactBpms(fps, bpm).slice(0, 4).join(", ")}`);
console.log("next: put real screenshots or brand files in assets/ref/, then edit film.js");
