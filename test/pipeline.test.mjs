// Against the real system: headless Chromium, ffmpeg and the frame critic on a tiny film.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { capture } from "../scripts/capture.mjs";
import { critic } from "../scripts/critic.mjs";
import { stitch } from "../scripts/stitch.mjs";

const SKILL = join(import.meta.dirname, "..");

function tinyFilm(dir, body) {
  mkdirSync(join(dir, "engine"), { recursive: true });
  mkdirSync(join(dir, "assets", "ref"), { recursive: true });
  copyFileSync(join(SKILL, "engine", "motion.js"), join(dir, "engine", "motion.js"));
  writeFileSync(join(dir, "assets", "ref", "dot.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="20" fill="#c8f169"/></svg>');
  writeFileSync(join(dir, "index.html"), `<!doctype html><html><body style="margin:0;width:320px;height:180px;background:#101418;overflow:hidden">
<section id="live" style="position:absolute;inset:0;visibility:hidden"><img id="ball" src="assets/ref/dot.svg" style="position:absolute;left:20px;top:70px"></section>
<section id="dead" style="position:absolute;inset:0;visibility:hidden"><p style="color:#eee;font:20px sans-serif;margin:70px 20px">Still</p></section>
<script src="engine/motion.js"></script><script>
const palette = { bg: "#101418", ink: "#eeeeee", accent: "#c8f169", bad: "#ff4d3d" };
${body}
</script></body></html>`);
}

describe("end-to-end render", () => {
  let dir;
  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "film-"));
    tinyFilm(dir, `Motion.film({ fps: 30, width: 320, height: 180, bpm: 120, palette,
      scenes: [
        { id: "live", beats: 2, render(p) {
          const b = n => p.b(n);
          const x = Motion.spring(p.t, b(0), 0, 220, { preset: "pop" }) - Motion.spring(p.t, b(1), 0, 220, { preset: "pop" });
          Motion.set(p.$("#ball"), { x });
        } },
        { id: "dead", beats: 2 },
      ],
      audio: { sfx: [{ name: "pop", at: { beat: 1 } }] } });`);
    await capture(dir, { workers: 2 });
  });

  test("every frame of the film is captured", () => assert.equal(readdirSync(join(dir, "build", "frames")).length, 60));
  test("the same time renders the same pixels", async () => {
    const a = readdirSync(join(dir, "build", "frames"))[5];
    const before = spawnSync("shasum", [join(dir, "build", "frames", a)]).stdout.toString().split(" ")[0];
    await capture(dir, { scenes: ["live"], workers: 1 });
    const after = spawnSync("shasum", [join(dir, "build", "frames", a)]).stdout.toString().split(" ")[0];
    assert.equal(after, before);
  });
  test("the critic passes the moving scene and fails the still one", () => {
    const scored = critic(dir);
    const byId = Object.fromEntries(scored.map((s) => [s.id, s]));
    assert.ok(byId.live.pass, `live scored ${byId.live.score}: ${byId.live.notes}`);
    assert.equal(byId.dead.pass, false);
    assert.ok(existsSync(join(dir, "build", "critic", "dead.png")));
  });
  test("stitching makes an MP4 of the film's length with sound", () => {
    const out = stitch(dir, "renders/t.mp4");
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", out]).stdout.toString();
    const j = JSON.parse(probe);
    assert.ok(Math.abs(+j.format.duration - 2) < 0.1, j.format.duration);
    assert.deepEqual(j.streams.map((s) => s.codec_type).sort(), ["audio", "video"]);
  });
  test("on-camera mode lays transparent frames over the filmed video and keeps its sound", async () => {
    const cam = mkdtempSync(join(tmpdir(), "film-"));
    tinyFilm(cam, `Motion.film({ fps: 30, width: 320, height: 180, bpm: 120, palette, transparent: true,
      scenes: [{ id: "live", beats: 4, render(p) { Motion.set(p.$("#ball"), { x: Motion.spring(p.t, 0, 0, 200, { preset: "pop" }) }); } }],
      audio: { under: { src: "me.mp4" } } });`);
    writeFileSync(join(cam, "index.html"), readFileSync(join(cam, "index.html"), "utf8").replace("background:#101418", "background:transparent"));
    spawnSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=30:duration=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
      "-shortest", "-pix_fmt", "yuv420p", join(cam, "me.mp4")]);
    await capture(cam, { workers: 1 });
    const out = stitch(cam, "renders/cam.mp4");
    const streams = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "json", out]).stdout.toString()).streams;
    assert.deepEqual(streams.map((x) => x.codec_type).sort(), ["audio", "video"]);
    // the filmed video shows through: its colour bars are saturated, an opaque film frame is not
    const stats = spawnSync("ffmpeg", ["-i", out, "-vf", "signalstats,metadata=print:key=lavfi.signalstats.SATAVG", "-frames:v", "1", "-f", "null", "-"]).stderr.toString();
    const sat = +/SATAVG=([\d.]+)/.exec(stats)[1];
    assert.ok(sat > 20, `SATAVG ${sat}`);
  });
  test("a film that breaks a style rule is not rendered", async () => {
    const bad = mkdtempSync(join(tmpdir(), "film-"));
    tinyFilm(bad, `setTimeout(() => {}, 1); Motion.film({ bpm: 120, palette, scenes: [{ id: "live", beats: 1, render(p) { Motion.springUnit(p.t); } }] });`);
    await assert.rejects(capture(bad), /realtime/);
  });
});

describe("layout QA on a real page", () => {
  let res;
  before(async () => {
    const { qa } = await import("../scripts/qa.mjs");
    const dir = mkdtempSync(join(tmpdir(), "film-"));
    mkdirSync(join(dir, "engine"), { recursive: true });
    copyFileSync(join(SKILL, "engine", "motion.js"), join(dir, "engine", "motion.js"));
    writeFileSync(join(dir, "index.html"), `<!doctype html><html><body style="margin:0;width:320px;height:180px;background:#101418;overflow:hidden">
<section id="a" style="position:absolute;inset:0;visibility:hidden">
  <div id="ball" style="position:absolute;left:20px;top:60px;width:40px;height:40px;background:#c8f169"></div>
  <p id="label" style="position:absolute;left:200px;top:60px;margin:0;color:#eee;font:20px sans-serif">Acme</p>
  <p id="low" style="position:absolute;left:40px;top:166px;margin:0;color:#eee;font:12px sans-serif">low</p>
  <p id="fly" style="position:absolute;left:0;top:1px;margin:0;color:#eee;font:10px sans-serif">fly</p>
  <div id="fade" style="position:absolute;left:250px;top:10px;opacity:0.9"><div id="pane" style="width:40px;height:30px"></div></div>
  <p id="hi" style="position:absolute;left:120px;top:104px;margin:0;color:#eee;font:40px/1 sans-serif">ace</p>
  <p id="lo" style="position:absolute;left:120px;top:134px;margin:0;color:#eee;font:40px/1 sans-serif">ace</p>
</section>
<div id="captions" style="position:absolute;left:180px;top:20px;color:#eee;font:12px sans-serif"></div>
<section id="b" style="position:absolute;inset:0;visibility:hidden"><p id="outro" style="position:absolute;left:40px;top:60px;margin:0;color:#eee;font:20px sans-serif">Acme</p></section>
<script src="engine/motion.js"></script><script>
Motion.film({ fps: 30, width: 320, height: 180, bpm: 120, brand: ["acme"], palette: { bg: "#101418", accent: "#c8f169", bad: "#ff4d3d" },
  scenes: [{ id: "a", beats: 2, render(p) {
    Motion.set(p.$("#ball"), { x: Motion.spring(p.t, 0.1, 0, 200, { preset: "snap" }) });
    Motion.set(p.$("#fly"), { x: -40 + p.t * 600 });
    Motion.glass(p.$("#pane"));
  } }, { id: "b", beats: 2 }],
  captions: { words: [{ w: "one", start: 0.1, end: 0.3 }, { w: "two", start: 0.5, end: 0.7 }, { w: "three", start: 0.9, end: 1.1 }] } });
</script></body></html>`);
    res = await qa(dir);
    res.dir = dir;
    await capture(dir, { workers: 2, skipLint: true });
    res.mp4 = stitch(dir, "renders/q.mp4");
  });
  test("an element moving through another is reported as an overlap", () => {
    assert.ok(res.problems.some((p) => p.type === "overlap" && p.key.includes("ball") && p.key.includes("label")));
  });
  test("text resting in the margin is reported", () => assert.ok(res.problems.some((p) => p.type === "safe" && p.key.includes("low"))));
  test("the brand name in the opening scene is reported", () => assert.ok(res.problems.some((p) => p.type === "brand")));
  test("sounds are placed for the words that appear and the move", () => {
    const kinds = new Set(JSON.parse(readFileSync(join(res.dir, "build", "auto-sfx.json"), "utf8")).map((s) => s.auto));
    assert.ok(kinds.has("text") && kinds.has("move"), [...kinds].join(","));
  });
  test("text sweeping through the margin while it moves is not a safe-area problem", () => {
    assert.ok(!res.problems.some((p) => p.type === "safe" && p.key.includes("fly")));
  });
  test("the brand may appear after the opening scene", () => assert.ok(!res.problems.some((p) => p.key.includes("outro"))));
  test("lines whose letters don't touch are not reported, even when their line boxes overlap", () => {
    assert.ok(!res.problems.some((p) => p.key.includes("#hi") && p.key.includes("#lo")), res.problems.map((p) => p.key).join("; "));
  });
  test("the automatic sounds are mixed into the film", () => {
    const streams = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "json", res.mp4]).stdout.toString()).streams;
    assert.ok(streams.some((x) => x.codec_type === "audio"));
  });
  test("glass whose parent fades is reported, because the backdrop breaks", () => {
    assert.ok(res.problems.some((p) => p.type === "glass" && p.key.includes("fade")));
  });
  test("the subtitle line gets no sounds", () => {
    const auto = JSON.parse(readFileSync(join(res.dir, "build", "auto-sfx.json"), "utf8"));
    assert.ok(!auto.some((s) => s.id.includes("captions")), auto.map((s) => s.id).join(", "));
  });
  test("a contact sheet of the flagged frames is written", () => assert.ok(existsSync(join(res.dir, "build", "qa", "flagged.png"))));
});

describe("clear glass renders in the headless browser", () => {
  test("the detail under the glass bends at its edges and stays sharp in the middle", async () => {
    const { chromium } = await import("playwright");
    const dir = mkdtempSync(join(tmpdir(), "glass-"));
    copyFileSync(join(SKILL, "engine", "motion.js"), join(dir, "motion.js"));
    writeFileSync(join(dir, "index.html"), `<!doctype html><html><body style="margin:0;width:400px;height:200px;background:#101418">
<div style="position:absolute;inset:0;background-image:repeating-linear-gradient(90deg,#ff4d3d 0 3px,transparent 3px 20px)"></div>
<div id="g" style="position:absolute;left:100px;top:50px;width:200px;height:100px"></div>
<script src="motion.js"></script></body></html>`);
    const b = await chromium.launch({ args: ["--allow-file-access-from-files"] });
    try {
      const p = await b.newPage({ viewport: { width: 400, height: 200 } });
      await p.goto("file://" + join(dir, "index.html"));
      const off = await p.screenshot({ path: join(dir, "off.png") });
      await p.evaluate(() => Motion.glass(document.getElementById("g")));
      await p.screenshot({ path: join(dir, "on.png") });
      const diff = (x, y, w, h) => {
        const r = spawnSync("ffmpeg", ["-i", join(dir, "off.png"), "-i", join(dir, "on.png"), "-filter_complex", `[0][1]blend=all_mode=difference,crop=${w}:${h}:${x}:${y},signalstats,metadata=print:key=lavfi.signalstats.YAVG`, "-f", "null", "-"]).stderr.toString();
        return +/YAVG=([\d.]+)/.exec(r)[1];
      };
      const edge = diff(100, 60, 12, 80), middle = diff(170, 80, 60, 40);
      // the middle only takes the 5% tint; the edge is bent, so it changes far more
      assert.ok(edge > 2 * middle, `edge changed by ${edge}, middle by ${middle}`);
      void off;
    } finally {
      await b.close();
    }
  });
});
