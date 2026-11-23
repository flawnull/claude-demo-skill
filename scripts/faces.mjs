#!/usr/bin/env node
// Usage: node faces.mjs <film-dir> <video> [--fps 5]
// On-camera mode: finds the speaker's face over time and writes faces.json and faces.js (window.FACES).
// Set `faces: FACES` in film.js; qa.mjs then fails any frame where something covers the face.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { args, filmDir, abs, run, SKILL } from "./_util.mjs";

const a = args();
const dir = filmDir(a);
const video = abs(dir, a._[1]);
const py = process.env.DEMO_CV_PYTHON ?? join(SKILL, "cv-venv", "bin", "python3");
if (!existsSync(py)) {
  console.error(`OpenCV not found. Install it (free): run ./setup.sh (it makes cv-venv/ with opencv-python-headless<5)`);
  process.exit(1);
}
const out = join(dir, "faces.json");
process.stdout.write(run(py, [join(SKILL, "py", "faces.py"), video, out, "--fps", String(a.fps ?? 5)]));
writeFileSync(join(dir, "faces.js"), `window.FACES = ${readFileSync(out, "utf8")};\n`);
console.log(`faces.js written: add <script src="faces.js"></script> and faces: FACES to film.js`);
