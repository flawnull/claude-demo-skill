#!/usr/bin/env node
// Usage: node sfx-index.mjs   Rebuilds sfx/index.json from the files in sfx/ (keeps licence data).
import { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join, parse } from "node:path";
import { SKILL, run } from "./_util.mjs";
import { categorize } from "../lib/sfx.mjs";

export function buildIndex() {
  const dir = join(SKILL, "sfx");
  const p = join(dir, "index.json");
  const old = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : [];
  const byFile = new Map(old.map((e) => [e.file, e]));
  const index = readdirSync(dir).filter((n) => /\.(mp3|wav|ogg|flac)$/.test(n)).sort().map((file) => {
    const prev = byFile.get(file) ?? {};
    let duration = 0;
    try { duration = +(+run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(dir, file)])).toFixed(3); } catch { /* unreadable */ }
    if (!(duration >= 0.03)) {
      unlinkSync(join(dir, file)); // empty or broken after trimming: drop it
      console.log(`  dropped ${file}: empty or unreadable`);
      return null;
    }
    const name = parse(file).name;
    return { name, category: prev.category ?? categorize(name), duration, file, license: prev.license ?? "unknown", source: prev.source ?? "", title: prev.title ?? name };
  }).filter(Boolean);
  writeFileSync(p, JSON.stringify(index, null, 1) + "\n");
  return index;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const index = buildIndex();
  const counts = {};
  index.forEach((e) => (counts[e.category] = (counts[e.category] ?? 0) + 1));
  console.log(`sfx: ${index.length} sounds`, counts);
}
