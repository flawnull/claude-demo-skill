// Against the real system: headless Chromium and ffmpeg recording a real page.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { record, withCursor } from "../lib/record.mjs";

const duration = (f) => Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).stdout.toString());
const PAGE = `data:text/html,<body style="margin:0;background:%23202838"><button id="b" style="margin:200px;font-size:30px">Save</button></body>`;

describe("web footage recorder", () => {
  let browser, out, result, clicked;
  before(async () => {
    const dir = mkdtempSync(join(tmpdir(), "rec-"));
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
    await withCursor(ctx);
    const page = await ctx.newPage();
    await page.goto(PAGE);
    await page.evaluate(() => { window.clicks = 0; document.getElementById("b").onclick = () => window.clicks++; });
    out = join(dir, "clip");
    const rec = await record(page, out);
    await rec.glide(page.locator("#b"), { click: true });
    rec.mark("clicked");
    await new Promise((r) => setTimeout(r, 1500)); // the page sits still: a screencast would stop writing frames here
    await page.evaluate(() => { const t = Date.now(); while (Date.now() - t < 1500); }); // a busy page: no screenshots for 1.5 s
    rec.mark("idle-done");
    result = await rec.stop();
    clicked = await page.evaluate(() => window.clicks);
  });
  after(() => browser?.close());

  test("writes a webm at the requested path", () => assert.ok(existsSync(`${out}.webm`)));
  test("the video lasts as long as the wall clock, idle wait included", () => assert.ok(Math.abs(duration(result.video) - result.marks["idle-done"]) < 0.6, `${duration(result.video)} vs ${result.marks["idle-done"]}`));
  test("marks are seconds since recording started, in order", () => assert.ok(result.marks.clicked > 0 && result.marks["idle-done"] - result.marks.clicked >= 2.9));
  test("glide with click really clicks the element", () => assert.equal(clicked, 1));
  test("captures enough frames per second for smooth UI", () => assert.ok(result.fps >= 8, `${result.fps} fps`));
  test("cleans up its screenshot folder", () => assert.ok(!readdirSync(join(out, "..")).some((f) => f.endsWith("-shots"))));
});
