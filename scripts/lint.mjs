#!/usr/bin/env node
// Usage: node lint.mjs <film-dir>   Checks the style rules. Exit 1 on any error.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { args, filmDir } from "./_util.mjs";
import { lint } from "../lib/lint.mjs";

export function lintFilm(dir) {
  const files = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      if (["build", "renders", "node_modules", "assets"].includes(n)) continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(html|js|css|mjs)$/.test(n)) files.push({ path: relative(dir, p), text: readFileSync(p, "utf8") });
    }
  };
  walk(dir);
  const refDir = join(dir, "assets", "ref");
  const refs = existsSync(refDir) ? readdirSync(refDir).filter((n) => !n.startsWith(".")) : [];
  return lint(files, refs);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = filmDir(args());
  const f = lintFilm(dir);
  for (const x of f) console.log(`${x.level} ${x.rule}${x.file ? ` ${x.file}:${x.line}` : ""}: ${x.msg}`);
  const errors = f.filter((x) => x.level === "error").length;
  console.log(errors ? `lint: ${errors} error(s)` : "lint: clean");
  process.exit(errors ? 1 : 0);
}
