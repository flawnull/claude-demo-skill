import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** --key value and --flag parsing; bare words land in _. */
export function args(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) out[k] = true;
      else { out[k] = v; i++; }
    } else out._.push(a);
  }
  return out;
}

export function filmDir(a) {
  const d = resolve(a._[0] ?? ".");
  if (!existsSync(join(d, "index.html"))) throw new Error(`${d} has no index.html: run scripts/new.mjs first`);
  return d;
}

export function readMeta(dir) {
  const p = join(dir, "build", "film.json");
  if (!existsSync(p)) throw new Error(`no ${p}: run scripts/capture.mjs first`);
  return JSON.parse(readFileSync(p, "utf8"));
}

export function sfxIndex() {
  const p = join(SKILL, "sfx", "index.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : [];
}

export const abs = (dir, p) => (isAbsolute(p) ? p : join(dir, p));

export function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { encoding: opts.encoding ?? "utf8", maxBuffer: 1 << 30, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${(r.stderr || "").toString().slice(-800)}`);
  return r.stdout;
}
