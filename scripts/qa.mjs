#!/usr/bin/env node
// Usage: node qa.mjs <film-dir> [--step 0.05]
// Steps through the film (every frame, at most `step` s apart) and measures every visible object.
// Reports overlaps and touches, text outside the safe area, anything over the face, the brand in the
// opening scene, and writes build/auto-sfx.json: a sound for every word, number change, move and landing.
// Writes build/qa.md, build/qa.json, build/qa/flagged.png and build/qa/transitions.png.
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { args, filmDir, SKILL } from "./_util.mjs";
import { collisions, unsafe, overFace, brandShown, soundEvents, autoSfx, runsOf } from "../lib/qa.mjs";

const Motion = createRequire(import.meta.url)(join(SKILL, "engine", "motion.js"));

// Runs in the page: every visible text block, image and card, with its box clipped to what shows.
export function collect() {
  const W = innerWidth, H = innerHeight;
  window.__qaEls ??= {};
  const idOf = (el) => {
    if (el.__qa) return el.__qa;
    const p = [];
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      let s = e.tagName.toLowerCase();
      if (e.id) { p.unshift(`${s}#${e.id}`); break; }
      const same = [...e.parentElement.children].filter((x) => x.tagName === e.tagName);
      if (same.length > 1) s += `:nth-of-type(${same.indexOf(e) + 1})`;
      if (e.classList.length) s += `.${[...e.classList].join(".")}`;
      p.unshift(s);
    }
    el.__qa = p.join(">");
    window.__qaEls[el.__qa] = el;
    return el.__qa;
  };
  const opacity = (el) => {
    let op = 1;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.visibility === "hidden" || cs.display === "none") return 0;
      op *= +cs.opacity;
    }
    return op;
  };
  const inline = (el) => /^inline/.test(getComputedStyle(el).display);
  const blockOf = (el) => { let e = el; while (e && e !== document.body && inline(e)) e = e.parentElement; return e; };
  // lines of one paragraph count as one object: a parent whose children all hold text
  const textBlockOf = (el) => {
    const b = blockOf(el), par = b.parentElement;
    if (par && par !== document.body && !par.classList.contains("scene") && par.children.length > 1 && [...par.children].every((c) => c.textContent.trim())) return par;
    return b;
  };
  const grp = (el) => { const g = el.closest("[data-qa-group]"); return g ? idOf(g) : null; };
  const anc = (el) => { const a = []; for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) a.push(idOf(e)); return a; };
  const clip = (r, el) => {
    let [x0, y0, x1, y1] = [r.left, r.top, r.right, r.bottom];
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.overflow !== "visible" || cs.overflowX !== "visible" || cs.overflowY !== "visible") {
        const c = e.getBoundingClientRect();
        x0 = Math.max(x0, c.left); y0 = Math.max(y0, c.top); x1 = Math.min(x1, c.right); y1 = Math.min(y1, c.bottom);
      }
    }
    x0 = Math.max(x0, 0); y0 = Math.max(y0, 0); x1 = Math.min(x1, W); y1 = Math.min(y1, H);
    return x1 - x0 > 1 && y1 - y0 > 1 ? [x0, y0, x1, y1] : null;
  };
  const union = (rs) => {
    const x0 = Math.min(...rs.map((r) => r[0])), y0 = Math.min(...rs.map((r) => r[1]));
    const x1 = Math.max(...rs.map((r) => r[2])), y1 = Math.max(...rs.map((r) => r[3]));
    return [x0, y0, x1 - x0, y1 - y0];
  };
  const objs = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode()); ) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest("script,style,[data-qa-ignore]")) continue;
    const op = opacity(el);
    if (op < 0.05) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    // the line box is taller than the letters: trim it to the ink, measured with the same font
    const cs = getComputedStyle(el);
    const ctx = (window.__qaCtx ??= document.createElement("canvas").getContext("2d"));
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = ctx.measureText(n.textContent.trim());
    const sy = (el.getBoundingClientRect().height / el.offsetHeight) || 1; // scale from transforms
    const trimTop = Math.max(0, m.fontBoundingBoxAscent - m.actualBoundingBoxAscent) * sy;
    const trimBot = Math.max(0, m.fontBoundingBoxDescent - m.actualBoundingBoxDescent) * sy;
    const rs = [...range.getClientRects()]
      .map((r) => clip({ left: r.left, right: r.right, top: r.top + trimTop, bottom: Math.max(r.top + trimTop + 1, r.bottom - trimBot) }, el))
      .filter(Boolean);
    if (!rs.length) continue;
    const blk = textBlockOf(el);
    const id = idOf(blk);
    const o = objs.get(id) ?? { id, kind: "text", text: "", rects: [], anc: anc(blk), group: grp(blk), quiet: !!blk.closest('[data-sfx="off"]'), op: 0, ok: !!blk.closest("[data-overlap-ok]"), brand: !!blk.closest("[data-brand]") };
    o.text += (o.text ? " " : "") + n.textContent.trim();
    o.rects.push(...rs);
    o.op = Math.max(o.op, op);
    objs.set(id, o);
  }
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest("script,style,[data-qa-ignore]")) continue;
    const media = ["IMG", "VIDEO", "CANVAS"].includes(el.tagName) || (el.tagName === "svg" && !el.closest("[data-qa-ignore]"));
    const cs = getComputedStyle(el);
    const card = cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.backgroundImage !== "none" || cs.boxShadow !== "none";
    if (!media && !card) continue;
    const op = opacity(el);
    if (op < 0.05) continue;
    const r = clip(el.getBoundingClientRect(), el);
    if (!r) continue;
    const box = [r[0], r[1], r[2] - r[0], r[3] - r[1]];
    if (box[2] * box[3] > 0.6 * W * H) continue; // a background, not an object
    const id = idOf(el);
    const own = objs.get(id);
    if (own) { own.rects.push(r); continue; } // text on its own pill or card: one object
    let glassBad = null;
    if (el.hasAttribute("data-glass"))
      for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
        const ps = getComputedStyle(e);
        if (ps.filter !== "none" || +ps.opacity < 1 || ps.clipPath !== "none") { glassBad = idOf(e); break; }
      }
    objs.set(id, { id, kind: media ? "media" : "card", glassBad, text: "", rects: [r], anc: anc(el), group: grp(el), quiet: !!el.closest('[data-sfx="off"]'), op, ok: !!el.closest("[data-overlap-ok]"), brand: !!el.closest("[data-brand]") });
  }
  return [...objs.values()].map(({ rects, ...o }) => ({ ...o, box: union(rects).map((v) => Math.round(v * 10) / 10) }));
}

export async function qa(dir, { step = 0.05 } = {}) {
  const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  const url = pathToFileURL(join(dir, "index.html")).href;
  const out = join(dir, "build", "qa");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  try {
    const probe = await browser.newPage();
    await probe.goto(url);
    await probe.waitForFunction(() => window.FILM && window.renderFrame);
    const meta = await probe.evaluate(() => window.FILM);
    await probe.close();
    const page = await browser.newPage({ viewport: { width: meta.width, height: meta.height } });
    await page.goto(url);
    await page.waitForFunction(() => window.FILM && window.renderFrame);
    await page.evaluate(() => document.fonts.ready);
    const dt = Math.min(step, 1 / meta.fps);
    const n = Math.floor(meta.duration / dt);
    const frames = [];
    for (let i = 0; i < n; i++) {
      const t = Math.round(i * dt * 1e6) / 1e6;
      const objects = await page.evaluate(async ([t, src]) => {
        await window.renderFrame(t);
        await Promise.all([...document.images].filter((im) => !im.complete).map((im) => im.decode().catch(() => {})));
        return new Function(`return (${src})()`)();
      }, [t, collect.toString()]);
      frames.push({ t, objects });
    }

    // findings, per frame
    const safe = meta.safe ?? (meta.height > meta.width ? "instagram-reel" : "title-safe");
    const first = meta.scenes[0];
    const hits = [];
    let prevBoxes = new Map();
    for (const f of frames) {
      const boxes = new Map(f.objects.map((o) => [o.id, o.box]));
      // safe area applies to objects at rest: an exit may sweep through the margins
      const before = prevBoxes;
      const still = (o) => { const p = before.get(o.id); return p && p.every((v, k) => Math.abs(v - o.box[k]) < 1.5); };
      prevBoxes = boxes;
      const live = f.objects.filter((o) => o.op >= 0.35); // fading and dimmed objects are mid-transition or backdrop
      for (const c of collisions(live)) hits.push({ key: `${c.kind}: ${c.a} / ${c.b}`, type: c.kind, t: f.t, ids: [c.a, c.b] });
      const inCut = meta.scenes.some((sc) => f.t >= sc.end - 0.4 && f.t < sc.end + 0.2);
      if (!inCut) for (const u of unsafe(live.filter(still), safe, meta.width, meta.height)) hits.push({ key: `outside safe area: ${u.id} "${u.text.slice(0, 30)}"`, type: "safe", t: f.t, ids: [u.id] });
      const face = meta.faces ? Motion.faceAt(meta.faces, f.t) : null;
      for (const o of overFace(f.objects, face, meta.width, meta.height)) hits.push({ key: `over the face: ${o.id}`, type: "face", t: f.t, ids: [o.id] });
      for (const o of f.objects) if (o.glassBad) hits.push({ key: `glass breaks: its parent ${o.glassBad} has filter, opacity or clip-path`, type: "glass", t: f.t, ids: [o.id, o.glassBad] });
      if (f.t < first.end) for (const id of brandShown(f.objects, meta.brand)) hits.push({ key: `brand in the opening scene: ${id}`, type: "brand", t: f.t, ids: [id] });
    }
    const runs = runsOf(hits, meta.fps);

    // sounds for every word, number, move and landing
    const events = soundEvents(frames, { height: meta.height });
    const auto = meta.autoSfx ? autoSfx(events, meta.audio?.sfx ?? []) : [];
    writeFileSync(join(dir, "build", "auto-sfx.json"), JSON.stringify(auto, null, 1));

    // look: flagged frames with their boxes drawn, and every cut stepped at 0.05 s
    const shoot = async (t, ids, file) => {
      await page.evaluate(async ([t, ids]) => {
        await window.renderFrame(t);
        document.querySelectorAll(".__qa_box").forEach((b) => b.remove());
        for (const id of ids) {
          const el = window.__qaEls?.[id];
          if (!el) continue;
          const r = el.getBoundingClientRect();
          const b = document.createElement("div");
          b.className = "__qa_box";
          Object.assign(b.style, { position: "fixed", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, outline: "4px solid #ff00ff", zIndex: 99999, pointerEvents: "none" });
          document.body.appendChild(b);
        }
      }, [t, ids]);
      await page.screenshot({ path: file });
      await page.evaluate(() => document.querySelectorAll(".__qa_box").forEach((b) => b.remove()));
    };
    const flaggedFiles = [];
    for (const [k, r] of runs.slice(0, 16).entries()) {
      const f = join(out, `flag_${String(k).padStart(2, "0")}.png`);
      await shoot(r.first / meta.fps, r.ids, f);
      flaggedFiles.push(f);
    }
    const transFiles = [];
    for (const s of meta.scenes.slice(1)) {
      for (let k = -4; k <= 6; k++) {
        const t = Math.max(0, s.start + k * 0.05);
        const f = join(out, `cut_${s.id}_${String(k + 4).padStart(2, "0")}.png`);
        await shoot(t, [], f);
        transFiles.push(f);
      }
    }
    tile(flaggedFiles, join(out, "flagged.png"), 4);
    tile(transFiles, join(out, "transitions.png"), 11);

    const counts = {};
    runs.forEach((r) => (counts[r.type] = (counts[r.type] ?? 0) + 1));
    const evCounts = {};
    auto.forEach((e) => (evCounts[e.auto] = (evCounts[e.auto] ?? 0) + 1));
    const md = [
      "# Layout QA",
      "",
      `Checked ${frames.length} frames, ${Math.round(dt * 1000)} ms apart. Safe area: ${typeof safe === "string" ? safe : JSON.stringify(safe)}.`,
      "",
      runs.length ? `Problems: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}` : "No overlaps, touches, safe-area, face or brand problems.",
      ...runs.map((r) => `- f${r.first} to f${r.last} (${(r.first / meta.fps).toFixed(2)} s): ${r.key}`),
      "",
      `Auto sounds: ${auto.length} (${Object.entries(evCounts).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}) in build/auto-sfx.json`,
      "",
      `Frames checked: ${out}/transitions.png (every cut, -0.2 s to +0.3 s)${flaggedFiles.length ? `, flagged: ${out}/flagged.png` : ""}`,
    ].join("\n");
    writeFileSync(join(dir, "build", "qa.md"), md + "\n");
    writeFileSync(join(dir, "build", "qa.json"), JSON.stringify({ problems: runs, auto: evCounts, frames: frames.length }, null, 1));
    console.log(md);
    return { problems: runs, auto };
  } finally {
    await browser.close();
  }
}

function tile(files, outFile, cols) {
  if (!files.length) return;
  const rows = Math.ceil(files.length / cols);
  const inputs = files.flatMap((f) => ["-i", f]);
  const scale = files.map((_, k) => `[${k}:v]scale=320:-2[i${k}]`).join(";");
  const layout = files.map((_, k) => `${(k % cols) ? Array.from({ length: k % cols }, (_, c) => `w${c}`).join("+") : "0"}_${Math.floor(k / cols) ? Array.from({ length: Math.floor(k / cols) }, (_, r) => `h${r * cols}`).join("+") : "0"}`).join("|");
  const stack = files.length > 1 ? `${files.map((_, k) => `[i${k}]`).join("")}xstack=inputs=${files.length}:layout=${layout}:fill=black` : "[i0]null";
  spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...inputs, "-filter_complex", `${scale};${stack}`, "-frames:v", "1", outFile]);
  void rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = args();
  qa(filmDir(a), { step: +(a.step ?? 0.05) })
    .then((r) => process.exit(r.problems.length ? 2 : 0))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
