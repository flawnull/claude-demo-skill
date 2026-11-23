#!/usr/bin/env node
// Usage: node capture.mjs <film-dir> [--scene a,b] [--workers 4]
// Paints every frame with renderFrame(i / fps) in headless Chromium and saves PNGs to build/frames.
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { args, filmDir, SKILL } from "./_util.mjs";
import { lintFilm } from "./lint.mjs";
import { framesFor, frameName } from "../lib/frames.mjs";

/** A film keeps its own copy of the engine. Say when it is older than the skill's, or update it. */
export function checkEngine(dir, update = false) {
  const mine = join(dir, "engine", "motion.js"), skill = join(SKILL, "engine", "motion.js");
  if (!existsSync(mine)) return "missing";
  if (readFileSync(mine, "utf8") === readFileSync(skill, "utf8")) return "current";
  if (update) { copyFileSync(skill, mine); return "updated"; }
  console.log("note: this film's engine/motion.js differs from the skill's; run with --update-engine to take the new one");
  return "stale";
}

export async function capture(dir, { scenes, workers = 4, skipLint = false, updateEngine = false } = {}) {
  if (checkEngine(dir, updateEngine) === "updated") console.log("engine: updated from the skill");
  if (!skipLint) {
    const errors = lintFilm(dir).filter((x) => x.level === "error");
    if (errors.length) throw new Error(`lint errors, not rendering:\n${errors.map((e) => `  ${e.rule}${e.file ? ` ${e.file}:${e.line}` : ""}: ${e.msg}`).join("\n")}`);
  }
  const out = join(dir, "build", "frames");
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ["--allow-file-access-from-files", "--font-render-hinting=none"] });
  const url = pathToFileURL(join(dir, "index.html")).href;
  try {
    const probe = await browser.newPage();
    await probe.goto(url);
    await probe.waitForFunction(() => window.FILM && window.renderFrame);
    const meta = await probe.evaluate(() => window.FILM);
    await probe.close();
    writeFileSync(join(dir, "build", "film.json"), JSON.stringify(meta, null, 2));
    const list = framesFor(meta, scenes);
    const t0 = Date.now();
    let done = 0;
    const chunks = Array.from({ length: workers }, (_, w) => list.filter((_, k) => k % workers === w));
    await Promise.all(
      chunks.map(async (frames) => {
        const page = await browser.newPage({ viewport: { width: meta.width, height: meta.height }, deviceScaleFactor: 1 });
        await page.goto(url);
        await page.waitForFunction(() => window.FILM && window.renderFrame);
        await page.evaluate(() => document.fonts.ready);
        for (const i of frames) {
          await page.evaluate(async (t) => {
            await window.renderFrame(t);
            await Promise.all([...document.images].filter((im) => !im.complete).map((im) => im.decode().catch(() => {})));
          }, i / meta.fps);
          await page.screenshot({ path: join(out, frameName(i)), omitBackground: meta.transparent });
          if (++done % 150 === 0) process.stdout.write(`  ${done}/${list.length} frames\n`);
        }
        await page.close();
      }),
    );
    console.log(`capture: ${list.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${out}`);
    return meta;
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = args();
  capture(filmDir(a), { scenes: a.scene ? String(a.scene).split(",") : null, workers: +(a.workers ?? 4), updateEngine: !!a["update-engine"] }).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
