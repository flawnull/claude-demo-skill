// The launch film for this repo, made with the skill itself (node ../../scripts/film.mjs .).
// Every number on screen is real: the voice take's own waveform, the 210 sounds in sfx/index.json,
// and critic scores from a real 2:18 film before and after its re-render pass.
const M = Motion;
const palette = {
  bg: "#14161f", card: "#1e2130", line: "#2e3347", ink: "#f1ede4", muted: "#8d93a8",
  accent: "#ff8a3d", // a recording light
  bad: "#e5484d",
};
for (const [k, v] of Object.entries(palette)) document.documentElement.style.setProperty(`--${k}`, v);

const FPS = 30, SPB = 0.5, LEAD = 0.5;
const BREATH = { pain: 0.9, reveal: 0.7, how: 0.8, checks: 0.9, free: 0.8, close: 2.2 };
const PLAN = Object.keys(BREATH).map((id) => [id, Math.ceil((VOICE[id].dur + LEAD + BREATH[id]) / SPB)]);
const BEATS = Object.fromEntries(PLAN);
const START = {};
PLAN.reduce((b, [id, n]) => ((START[id] = b), b + n), 0);

/** Scene time of a spoken word (as whisper heard it). */
const T = (line, word, after = 0) => LEAD + M.wordTime(VOICE[line].words, word, after);
const pop = (t, t0, preset = "pop") => M.springUnit(t - t0, { preset });
/** Exit: a short sprung lift that settles in frame while it fades, so the ease-out is visible. */
function out(el, t, t0) {
  if (!el || t < t0) return;
  const fn = (tt) => M.move(tt, t0, 0, -140, { preset: "snap" });
  M.set(el, { y: fn(t), opacity: 1 - M.progress(t, t0 + 0.08, t0 + 0.4), mb: [0, M.vel(fn, t)] });
}
/** Anticipate, spring in on the word, blur only while travelling. */
function enter(el, t, t0, { dy = 60, dx = 0 } = {}) {
  if (!el) return;
  const fn = (tt) => M.move(tt, t0, 0, 1, { preset: "pop" });
  const u = fn(t), v = M.vel(fn, t);
  M.set(el, { x: (1 - u) * dx, y: (1 - u) * dy, opacity: M.clamp((t - t0) * 6), mb: [v * dx, v * dy] });
}
/** A slow push so holds never sit dead. */
function drift(p, amount = 0.04, origin = "8% 40%") {
  // starts once the first word has landed, so the opening move reads as its own sprung landing
  const u = M.ease.inOutQuad(M.progress(p.t, LEAD + 0.6, BEATS[p.root.id] * SPB));
  p.root.style.transformOrigin = origin;
  p.root.style.transform = `scale(${1 + amount * u})`;
}

// static markup built once from real data
(function build() {
  const bars = document.querySelector("#pain .robot .bars");
  for (let i = 0; i < 18; i++) bars.appendChild(document.createElement("i"));
  const wave = document.querySelector("#how .wave");
  const peaks = window.PEAKS.filter((_, i) => i % 9 === 0).slice(0, 96); // the take itself, every 360 ms
  peaks.forEach((v) => { const i = document.createElement("i"); i.dataset.v = v; wave.appendChild(i); });
  const s1 = document.querySelector("#how .s1 .body");
  ["“Every AI demo video looks the same.”", "“So we built demo.”", "“Give it a brief.”", "“Then it checks its own work.”"].forEach((l) => { const p = document.createElement("p"); p.textContent = l; s1.appendChild(p); });
  const grid = document.querySelector("#how .grid");
  for (let i = 0; i <= 8; i++) { const l = document.createElement("i"); l.style.left = `${i * 39}px`; l.dataset.qaIgnore = ""; grid.appendChild(l); }
  [[0, 3], [3, 5], [5, 8]].forEach(([a, b], k) => { const c = document.createElement("b"); c.dataset.overlapOk = ""; c.style.left = `${a * 39 + 3}px`; c.style.width = `${(b - a) * 39 - 6}px`; c.dataset.k = k; grid.appendChild(c); });
  const table = document.querySelector("#checks .table");
  // a real critic pass: four scenes under 8/10, re-rendered (notice 7.5 to 9.7, reveal 3.6 to 9.7, quote 5.9 to 9.8, close 5.1 to 8.2)
  [["notice", 7.5, 9.7], ["reveal", 3.6, 9.7], ["quote", 5.9, 9.8], ["close", 5.1, 8.2], ["attach", 8.8, 8.8]].forEach(([n, a, b]) => {
    const r = document.createElement("div"); r.className = "row";
    r.innerHTML = `<span class="n">${n}</span><span class="s" data-a="${a}" data-b="${b}">${a.toFixed(1)}</span><span class="v"></span>`;
    table.appendChild(r);
  });
  const bank = document.querySelector("#free .bank");
  const maxD = Math.max(...window.SOUNDS.map((s) => Math.min(s.d, 3)));
  window.SOUNDS.forEach((s) => { const i = document.createElement("i"); i.dataset.h = Math.max(0.06, Math.min(s.d, 3) / maxD); bank.appendChild(i); });
})();

M.film({
  fps: FPS, width: 1920, height: 1080, bpm: 120, offset: 0,
  palette,
  brand: ["/demo"],
  scenes: [
    {
      id: "pain", beats: BEATS.pain,
      render(p) {
        drift(p, 0.04);
        const words = M.splitWords(p.$("h1"));
        M.kinetic(words, p.t, { times: words.map((_, i) => LEAD + VOICE.pain.words[i].start), rise: 60, preset: "snap" });
        const items = p.$$(".item");
        [T("pain", "Slides,"), T("pain", "robot"), T("pain", "music")].forEach((t0, i) => {
          enter(items[i], p.t, t0 - 0.05, { dy: 120 });
          // grey, same as every other one: then struck out together on "ad."
          M.set(items[i].querySelector(".x"), { sx: M.clamp(pop(p.t, T("pain", "ad.") + i * (3 / FPS), "snap")) });
        });
        // the robot's voice: flat, evenly spaced bars
        p.$$(".robot .bars i").forEach((b, i) => M.set(b, { sy: 0.5 + 0.35 * Math.sin(p.t * 9 + i * 1.3) * M.clamp((p.t - T("pain", "robot")) * 2) }));
        // exit: all of it drops on the last beat
        [p.$("h1"), ...items].forEach((el, k) => out(el, p.t, p.b(BEATS.pain - 1.5) + k * (3 / FPS)));
      },
    },
    {
      id: "reveal", beats: BEATS.reveal,
      render(p) {
        drift(p, 0.05);
        const tD = T("reveal", "demo.");
        const cmd = p.$(".cmd");
        // typed, one key per frame-triple, landing the last key on "demo"
        const keys = "/demo";
        const t0 = T("reveal", "So"), gap = (tD - t0) / (keys.length - 1);
        const n = p.t < t0 ? 0 : Math.min(keys.length, Math.floor((p.t - t0) / gap) + 1);
        cmd.firstChild.textContent = keys.slice(0, n);
        const kick = pop(p.t, t0 + Math.max(0, n - 1) * gap, "snap");
        M.set(p.$(".caret"), { sx: 0.6 + 0.4 * kick });
        M.set(p.$(".caret"), { opacity: (Math.floor(p.t / SPB) % 2 === 0 || p.t < tD + 0.3) ? 1 : 0 });
        enter(cmd, p.t, 0, { dy: 80 }); // the caret lands on the cut
        M.kinetic(M.splitWords(p.$(".sub")), p.t, { times: M.splitWords(p.$(".sub")).map((_, i) => T("reveal", "A") + i * (3 / FPS) * 1.4), rise: 40, preset: "snap" });
        // exit: the command slides up and out as the stations rise
        [cmd, p.$(".sub")].forEach((el, k) => out(el, p.t, p.b(BEATS.reveal - 1.5) + k * (3 / FPS)));
      },
    },
    {
      id: "how", beats: BEATS.how,
      render(p) {
        const st = p.$$(".st");
        const cue = [T("how", "script,"), T("how", "acts"), T("how", "records"), T("how", "lands")];
        st.forEach((s, i) => enter(s, p.t, T("how", "Give") + i * (3 / FPS), { dy: 90 }));
        // the rail fills station by station, on the words
        const k = cue.reduce((acc, c, i) => acc + M.clamp(pop(p.t, c, "snap")) * 0.25, 0);
        M.set(p.$(".fill"), { sx: Math.max(0.001, k) });
        // script lines write in
        p.$$(".s1 p").forEach((l, i) => enter(l, p.t, cue[0] + i * 0.18, { dy: 24 }));
        // the real waveform plays across as it is voiced
        p.$$(".wave i").forEach((b, i, all) => {
          const on = M.clamp((p.t - cue[1]) * 30 - i * 0.6);
          b.style.height = `${Math.max(3, +b.dataset.v * 250 * on)}px`;
          M.set(b, { opacity: on > 0 ? 1 : 0.2 });
        });
        // the real app: a recorded attach, playing
        const img = p.$(".s3 .frame img");
        M.sequence(img, "assets/footage/f_####.jpg", Math.max(0, p.t - cue[2] + 0.3), { fps: 15, frames: 81 });
        const z = 1.9 + 0.4 * M.ease.inOutQuad(M.progress(p.t, cue[2], p.b(BEATS.how)));
        const sc = (312 / 1600) * z;
        M.set(img, { scale: sc, x: Math.min(0, 156 - 1200 * sc), y: Math.min(0, 180 - 60 * sc) });
        // cuts snap onto the beat lines
        p.$$(".grid b").forEach((c, i) => {
          const t0 = cue[3] + 0.1 + i * 0.25;
          const fn = (tt) => M.move(tt, t0, 0, 1, { preset: "snap" });
          M.set(c, { x: (1 - fn(p.t)) * 22 * (i % 2 ? -1 : 1), opacity: M.clamp((p.t - t0) * 8), mb: [M.vel(fn, p.t) * 22, 0] });
        });
        [...st, p.$(".rail"), p.$(".fill")].forEach((el, k) => out(el, p.t, p.b(BEATS.how - 1.5) + Math.min(k, 3) * (3 / FPS)));
      },
    },
    {
      id: "checks", beats: BEATS.checks,
      render(p) {
        drift(p, 0.03);
        const rows = p.$$(".row");
        const tIn = T("checks", "checks"), tRe = T("checks", "rendered");
        rows.forEach((r, i) => {
          enter(r, p.t, tIn + i * (3 / FPS), { dy: 40 });
          const s = r.querySelector(".s"), v = r.querySelector(".v");
          const a = +s.dataset.a, b = +s.dataset.b;
          const k = M.clamp(M.springUnit(p.t - tRe - i * 0.12, { preset: "gentle" }));
          const val = a + (b - a) * k;
          s.textContent = val.toFixed(1);
          const pass = val >= 8;
          M.set(s, { color: pass ? palette.ink : palette.bad });
          v.textContent = pass ? (a < 8 ? "re-rendered" : "pass") : "under 8";
          M.set(v, { color: pass ? palette.muted : palette.bad });
        });
        // layout: two cards drift into each other, and the build fails on "overlap"
        const tO = T("checks", "overlap");
        enter(p.$(".lay"), p.t, T("checks", "Any", 4), { dy: 80 });
        const slide = M.springUnit(p.t - (tO - 0.5), { preset: "gentle" });
        M.set(p.$(".b1"), { y: slide * 140 });
        const ring = p.$(".ring");
        Object.assign(ring.style, { left: "48px", top: "238px", width: "444px", height: "86px" });
        const r = pop(p.t, tO + 0.25, "pop");
        M.set(ring, { scale: p.t > tO + 0.25 ? 1.3 - 0.3 * r : 0, opacity: M.clamp((p.t - tO - 0.25) * 8) });
        enter(p.$(".verdict"), p.t, T("checks", "fails"), { dy: 30 });
        [".table", ".lay", ".verdict"].forEach((sel, i) => out(p.$(sel), p.t, p.b(BEATS.checks - 1.5) + i * (3 / FPS)));
      },
    },
    {
      id: "free", beats: BEATS.free,
      render(p) {
        drift(p, 0.04, "10% 60%");
        const t0 = LEAD;
        const k = M.clamp(M.springUnit(p.t - t0, { preset: "gentle" }));
        M.set(p.$(".num"), { text: String(Math.round(210 * k)) });
        enter(p.$(".num"), p.t, t0 - 0.1);
        enter(p.$(".lab"), p.t, T("free", "recorded"), { dy: 30 });
        // the real library: one bar per sound, height = its length
        p.$$(".bank i").forEach((b, i) => {
          const u = pop(p.t, t0 + i * 0.006, "snap");
          M.set(b, { sy: Math.max(0, u) * +b.dataset.h, bg: p.t > t0 + i * 0.006 + 0.15 ? palette.line : palette.accent });
        });
        const tF = T("free", "free,");
        const c = pop(p.t, tF, "pop");
        const { sx, sy } = M.squash(M.springVelocity(p.t - tF, { preset: "pop" }) * 300, 0.001, 0.3);
        M.set(p.$(".cost"), { scale: p.t >= tF ? c : 0, sx, sy, rot: (1 - c) * -8, opacity: M.clamp((p.t - tF) * 8) });
        [".num", ".lab", ".cost", ".bank"].forEach((sel, i) => out(p.$(sel), p.t, p.b(BEATS.free - 1.5) + i * (3 / FPS)));
      },
    },
    {
      id: "close", beats: BEATS.close,
      render(p) {
        drift(p, 0.05);
        enter(p.$(".cmd"), p.t, T("close", "This"), { dy: 120 });
        enter(p.$(".made"), p.t, T("close", "made"), { dy: 30 });
        enter(p.$(".url"), p.t, T("close", "GitHub."), { dy: 40 });
      },
    },
  ],
  audio: {
    music: { src: "assets/music.mp3", start: 0.025, volume: 0.17, fadeOut: 2.5 }, // "Down to Business", OpenGameArt, CC0 (opengameart.org/content/down-to-business-day-25); 120 BPM
    voice: PLAN.map(([id]) => ({ src: VOICE[id].src, at: START[id] * SPB + LEAD })),
    sfx: [
      { name: "whoosh", at: { beat: START.reveal - 1 }, volume: 0.3 },
      { name: "whoosh-short", at: { beat: START.how - 1 }, volume: 0.3 },
      { name: "whoosh", at: { beat: START.checks - 1 }, volume: 0.25 },
      { name: "whoosh-short", at: { beat: START.free - 1 }, volume: 0.3 },
      { name: "impact-bass-1", at: START.free * SPB + T("free", "free,") + 0.05, volume: 0.4, word: true },
      { name: "whoosh", at: { beat: START.close - 1 }, volume: 0.25 },
    ],
  },
  hits: [{ beat: START.reveal - 1 }, { beat: START.how - 1 }, { beat: START.free - 1 }],
  cues: ["pain", "reveal", "close"].flatMap((id) => VOICE[id].words.map((w) => ({ at: START[id] * SPB + LEAD + w.start, why: `${id} "${w.w}"` }))),
  captions: {
    words: PLAN.filter(([id]) => !["pain", "reveal", "close"].includes(id)).flatMap(([id]) => M.shiftWords(VOICE[id].words, START[id] * SPB + LEAD)),
    activeColor: palette.ink,
  },
});
