#!/usr/bin/env node
// Usage: node sfx-import.mjs <folder> --license CC0 --source <url> [--prefix kenney] [--every 1] [--match regex] [--max 3]
// Adds the sounds in a folder to the library: trimmed, faded, normalised to -18 LUFS, indexed with licence and source.
// Only add sounds whose licence allows commercial use without NonCommercial, ShareAlike or NoDerivatives terms.
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, parse } from "node:path";
import { args, SKILL, run } from "./_util.mjs";
import { categorize, slug } from "../lib/sfx.mjs";
import { buildIndex } from "./sfx-index.mjs";

const a = args();
const from = a._[0];
if (!from || !a.license || !a.source) { console.error("usage: sfx-import.mjs <folder> --license CC0 --source <url> [--prefix p] [--every n] [--match re] [--max s]"); process.exit(1); }
if (/\b(nc|sa|nd)\b/i.test(String(a.license))) { console.error(`refusing licence ${a.license}: NonCommercial, ShareAlike and NoDerivatives sounds are not allowed`); process.exit(1); }
const max = +(a.max ?? 3), every = +(a.every ?? 1), match = a.match ? new RegExp(a.match, "i") : null;
const files = [];
const walk = (d) => readdirSync(d).sort().forEach((n) => { const p = join(d, n); if (n === "__MACOSX" || n.startsWith("._")) return; statSync(p).isDirectory() ? walk(p) : /\.(ogg|wav|mp3|flac)$/i.test(n) && files.push(p); });
walk(from);
const dir = join(SKILL, "sfx");
const indexPath = join(dir, "index.json");
const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : [];
let added = 0;
files.filter((f) => !match || match.test(parse(f).name)).filter((_, i) => i % every === 0).forEach((f) => {
  const stem = parse(f).name;
  const category = categorize(stem);
  let name = `${category}-${a.prefix ? `${a.prefix}-` : ""}${slug(stem)}`;
  if (index.some((e) => e.name === name)) return;
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", f, "-af",
    `silenceremove=start_periods=1:start_threshold=-50dB,atrim=0:${max},areverse,silenceremove=start_periods=1:start_threshold=-55dB,areverse,afade=t=out:st=${Math.max(0, max - 0.05)}:d=0.05,loudnorm=I=-18:TP=-2,aresample=48000`,
    "-ac", "2", "-b:a", "192k", join(dir, `${name}.mp3`)]);
  index.push({ name, category, duration: 0, file: `${name}.mp3`, license: a.license, source: a.source, title: stem });
  added++;
});
writeFileSync(indexPath, JSON.stringify(index, null, 1) + "\n");
buildIndex();
console.log(`sfx-import: added ${added} from ${from}`);
