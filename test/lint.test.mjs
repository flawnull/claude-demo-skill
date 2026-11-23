import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { lint } from "../lib/lint.mjs";

const ok = `const palette = { bg: "#111111", ink: "#eeeeee", accent: "#c8f169", bad: "#ff4d3d" };
h1 { font: 700 80px/1 "Avenir Next", sans-serif; } code { font-family: Menlo, monospace; }
M.kinetic(M.splitWords(h), t, {}); M.springUnit(t); img.src = "assets/ref/screen.png";`;
const rules = (text, refs = ["screen.png"]) => lint([{ path: "film.js", text }], refs).map((f) => f.rule);

describe("style rules", () => {
  test("a film that follows every rule is clean", () => assert.deepEqual(rules(ok), []));
  test("CSS transitions are banned", () => assert.ok(rules(ok + "\n.a { transition: all .3s ease; }").includes("css-transition")));
  test("transition sub-properties are banned too", () => assert.ok(rules(ok + "\n.a { transition-duration: 1s }").includes("css-transition")));
  test("a banned word inside a comment is fine", () => {
    assert.deepEqual(rules(ok + "\n// never call setTimeout here; transition: none"), []);
    assert.deepEqual(rules(ok + "\n/* Math.random() is banned */"), []);
  });
  test("CSS keyframe animations are banned", () => assert.ok(rules(ok + "\n@keyframes spin {}").includes("css-animation")));
  test("real-time clocks are banned", () => {
    for (const c of ["requestAnimationFrame(f)", "setTimeout(f, 1)", "Date.now()", "performance.now()"]) assert.ok(rules(ok + "\n" + c).includes("realtime"), c);
  });
  test("unseeded random is banned", () => assert.ok(rules(ok + "\nMath.random()").includes("random")));
  test("the Web Animations API is banned", () => assert.ok(rules(ok + "\nel.animate([], 1)").includes("web-animations")));
  test("loading from the network is banned", () => assert.ok(rules(ok + '\n<img src="https://x.com/a.png">').includes("network")));
  test("a film without a palette is refused", () => assert.ok(rules(ok.replace(/const palette.*;/, "")).includes("palette")));
  test("a palette without a colour that means bad news is refused", () => {
    assert.ok(rules(ok.replace(', bad: "#ff4d3d"', "")).includes("palette"));
  });
  test("a palette without an accent is refused", () => assert.ok(rules(ok.replace('accent: "#c8f169", ', "")).includes("palette")));
  test("two fonts are allowed", () => assert.ok(!rules(ok).includes("fonts")));
  test("a third font is refused", () => assert.ok(rules(ok + '\np { font-family: "Georgia", serif; }').includes("fonts")));
  test("fallback fonts in a list do not count as extra fonts", () => {
    assert.ok(!rules(ok + '\nb { font-family: "Avenir Next", "Helvetica Neue", sans-serif; }').includes("fonts"));
  });
  test("a linear tween is flagged as robotic motion", () => assert.ok(rules(ok + '\nM.tween(t, 0, 1, 0, 100, "linear")').includes("linear-motion")));
  test("a film without reference assets is refused", () => assert.ok(rules(ok, []).includes("reference-assets")));
  test("reference assets that never appear on screen are refused", () => assert.ok(rules(ok, ["logo.svg"]).includes("reference-assets")));
  test("centered text on a gradient is flagged", () => {
    assert.ok(rules(ok + "\nbody { background: linear-gradient(#000,#fff); text-align: center; }").includes("centered-gradient"));
  });
  test("a film with no spring motion is refused", () => assert.ok(rules(ok.replace("M.springUnit(t);", "").replace("M.kinetic(M.splitWords(h), t, {});", "")).includes("physics")));
  test("rule breaks are errors, taste checks are warnings", () => {
    const f = lint([{ path: "a.js", text: ok + "\nsetTimeout(f)" }], ["screen.png"]);
    assert.equal(f.find((x) => x.rule === "realtime").level, "error");
    const g = lint([{ path: "a.js", text: ok + "\nbody{background:radial-gradient(#000,#fff);text-align:center}" }], ["screen.png"]);
    assert.equal(g.find((x) => x.rule === "centered-gradient").level, "warning");
  });
  test("each finding points at its file and line", () => {
    const f = lint([{ path: "film.js", text: ok + "\n\nsetTimeout(f)" }], ["screen.png"]).find((x) => x.rule === "realtime");
    assert.equal(f.file, "film.js");
    assert.equal(f.line, 5);
  });
});

describe("AI-slop looks are flagged", () => {
  test("lorem ipsum blocks the render", () => assert.ok(rules(ok + "\n<p>Lorem ipsum dolor</p>").includes("lorem")));
  test("sounds made in code block the render", () => assert.ok(rules(ok + "\nconst a = new AudioContext();").includes("synth-sound")));
  test("frosted blur glass is flagged", () => assert.ok(rules(ok + "\n.card { backdrop-filter: blur(20px); }").includes("frosted-glass")));
  test("clear glass without blur is not flagged as frosted", () => assert.ok(!rules(ok + "\n.card { backdrop-filter: url(#g) saturate(180%); }").includes("frosted-glass")));
  test("a gradient wash is flagged", () => assert.ok(rules(ok + "\nbody { background: linear-gradient(#111111, #222222); }").includes("gradient")));
  test("a donut chart is flagged", () => assert.ok(rules(ok + '\n<div class="donut"></div>').includes("plain-chart")));
  test("a donut drawn with conic-gradient is flagged", () => assert.ok(rules(ok + "\n.d { background: conic-gradient(#c8f169 0 40%, #111111 0); }").includes("plain-chart")));
  test("a donut drawn with an SVG dash ring is flagged", () => assert.ok(rules(ok + '\n<circle r="40" stroke-dasharray="120 300"></circle>').includes("plain-chart")));
  test("round placeholder numbers are flagged", () => {
    for (const t of ["99%", "10K+", "$1,000"]) assert.ok(rules(ok + `\n<b>${t}</b>`).includes("vanity-stat"), t);
  });
  test("a specific real number is not flagged", () => assert.ok(!rules(ok + "\n<b>$1,284.29</b><b>847.12</b>").includes("vanity-stat")));
  test("a colour outside the palette blocks the render", () => assert.ok(rules(ok + "\nh2 { color: #7b3fe4; }").includes("off-palette")));
  test("palette colours, greys and tints of palette colours are allowed", () => {
    assert.ok(!rules(ok + "\nh2 { color: #ff4d3d; border-color: #2a2a2a; background: rgba(200, 241, 105, 0.2); }").includes("off-palette"));
  });
  test("an id selector that looks like a hex colour is not a colour", () => assert.ok(!rules(ok + "\n#bad { left: 0; }").includes("off-palette")));
  test("a coloured shadow is flagged as glow", () => assert.ok(rules(ok + "\nh1 { text-shadow: 0 0 30px var(--accent); }").includes("glow")));
  test("a neutral shadow is fine", () => assert.ok(!rules(ok + "\n.c { box-shadow: 0 40px 90px rgba(0, 0, 0, 0.45); }").includes("glow")));
});
