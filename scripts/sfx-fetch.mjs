#!/usr/bin/env node
// Usage: node sfx-fetch.mjs "<search>" [--n 5] [--max 4] [--category whoosh]
// Adds CC0 sounds from Openverse (no account). Each is trimmed, faded and normalised, then indexed.
import { writeFileSync, readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { args, SKILL, run } from "./_util.mjs";
import { categorize, slug } from "../lib/sfx.mjs";
import { buildIndex } from "./sfx-index.mjs";

const a = args();
const q = a._.join(" ");
if (!q) { console.error('usage: sfx-fetch.mjs "<search>" [--n 5] [--max 4]'); process.exit(1); }
const n = +(a.n ?? 5), max = +(a.max ?? 4);
const api = `https://api.openverse.org/v1/audio/?q=${encodeURIComponent(q)}&license=cc0&page_size=40`;
// curl, not fetch: Openverse answered Node's fetch with 401 where curl got 200. Retries on 429.
let body = null;
for (let attempt = 0; attempt < 4 && !body; attempt++) {
  const r = spawnSync("curl", ["-s", "-w", "\n%{http_code}", api], { encoding: "utf8" });
  const code = +r.stdout.slice(r.stdout.lastIndexOf("\n") + 1);
  if (code === 200) body = JSON.parse(r.stdout.slice(0, r.stdout.lastIndexOf("\n")));
  else if (code === 429) { console.error("openverse: rate limited, waiting 60 s"); spawnSync("sleep", ["60"]); }
  else { console.error(`openverse: HTTP ${code}`); process.exit(1); }
}
if (!body) { console.error("openverse: still rate limited, try later"); process.exit(1); }
const results = body.results.filter((r) => r.duration && r.duration <= max * 1000 && r.duration >= 80 && r.url);
const dir = join(SKILL, "sfx");
const indexPath = join(dir, "index.json");
const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : [];
const known = new Set(index.map((e) => e.source));
const tmp = mkdtempSync(join(tmpdir(), "sfx-"));
let added = 0;
try {
  for (const r of results) {
    if (added >= n) break;
    if (known.has(r.foreign_landing_url)) continue;
    const category = a.category ?? categorize(`${r.title} ${q}`);
    let name = `${category}-${slug(r.title)}`;
    while (index.some((e) => e.name === name)) name += "-2";
    const raw = join(tmp, "raw");
    if (spawnSync("curl", ["-sfL", "-o", raw, r.url]).status !== 0) continue;
    try {
      run("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-af",
        `silenceremove=start_periods=1:start_threshold=-50dB,atrim=0:${max},areverse,silenceremove=start_periods=1:start_threshold=-55dB,areverse,afade=t=out:st=${Math.max(0, max - 0.08)}:d=0.08,loudnorm=I=-18:TP=-2,aresample=48000`,
        "-ac", "2", "-b:a", "192k", join(dir, `${name}.mp3`)]);
    } catch { continue; }
    index.push({ name, category, duration: 0, file: `${name}.mp3`, license: "CC0", source: r.foreign_landing_url, title: r.title, creator: r.creator ?? "" });
    known.add(r.foreign_landing_url);
    added++;
    console.log(`  + ${name}  (${r.title}, ${r.creator ?? "unknown"}, CC0)`);
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
writeFileSync(indexPath, JSON.stringify(index, null, 1) + "\n");
buildIndex();
console.log(`sfx-fetch: added ${added} for "${q}"`);
