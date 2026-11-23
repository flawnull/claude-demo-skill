// The film. Every scene's render(p) sets every style from p.t (seconds into the scene).
// p.b(n) is beat n of this scene in seconds. Scenes are measured in beats, so every cut lands on the grid.
const M = Motion;
const palette = { bg: "#101418", ink: "#f2efe8", accent: "#c8f169", bad: "#ff5a4e", card: "#1c232b", muted: "#8a96a3" };
for (const [k, v] of Object.entries(palette)) document.documentElement.style.setProperty(`--${k}`, v);

M.film({
  fps: __FPS__, width: __W__, height: __H__, bpm: __BPM__, offset: 0,
  palette,
  brand: [], // product and company names: QA fails if one shows in the opening scene (open on the viewer's pain)
  scenes: [
    {
      id: "hook", beats: 4,
      render(p) {
        M.kinetic(M.splitWords(p.$("h1")), p.t, { start: p.b(0), stagger: p.spb / 4, rise: 80, preset: "pop" });
        // the bar snaps in on beat 2 and stretches while it travels
        const s = M.springUnit(p.t - p.b(2), { preset: "snap" });
        const v = M.springVelocity(p.t - p.b(2), { preset: "snap" });
        M.set(p.$(".bar"), { sx: Math.max(0, s), sy: M.squash(v * 400, 0.001, 0.6).sy });
        // exit: the headline leaves upward as the next scene's window rises (the cause of the cut)
        M.set(p.$("h1"), { y: M.tween(p.t, p.b(3.5), p.b(4), 0, -300, "inCubic") });
      },
    },
    {
      id: "product", beats: 8,
      render(p) {
        const up = M.springUnit(p.t, { preset: "pop" });
        const { sx, sy } = M.squash(M.springVelocity(p.t, { preset: "pop" }) * 600, 0.0004, 0.2);
        const push = M.tween(p.t, p.b(1), p.b(7), 1, 1.12, "inOutCubic"); // a slow push keeps the hold alive
        const through = M.tween(p.t, p.b(7), p.b(8), 1, 3.5, "inExpo"); // exit: zoom through the window
        M.set(p.$(".win"), { y: (1 - up) * 900, sx: sx * push * through, sy: sy * push * through, opacity: 1 - M.progress(p.t, p.b(7.6), p.b(8)) });
        const tag = M.springUnit(p.t - p.b(3), { preset: "wobble" });
        M.set(p.$(".tag"), { scale: Math.max(0, tag), rot: (1 - tag) * -12, opacity: M.clamp(tag * 3) });
      },
    },
    {
      id: "proof", beats: 6,
      render(p) {
        const n = M.springUnit(p.t - p.b(0.5), { preset: "gentle" });
        M.set(p.$(".num"), { text: Math.round(n * 1240).toLocaleString("en"), y: (1 - M.springUnit(p.t, { preset: "snap" })) * 120 });
        M.set(p.$(".label"), { opacity: M.tween(p.t, p.b(1), p.b(1.5), 0, 1), y: M.tween(p.t, p.b(1), p.b(1.5), 20, 0) });
        const heights = [0.35, 0.5, 0.42, 0.7, 1];
        p.$$(".bars i").forEach((bar, i) => {
          bar.style.height = `${heights[i] * 100}%`;
          M.set(bar, { sy: Math.max(0, M.springUnit(p.t - p.b(2 + i * 0.5), { preset: "pop" })) });
        });
      },
    },
    {
      id: "close", beats: 6,
      render(p) {
        const w = M.ease.outExpo(M.progress(p.t, p.b(0), p.b(0.75)));
        M.set(p.$(".name"), { clip: `inset(0 ${100 - w * 100}% 0 0)`, scale: M.tween(p.t, p.b(0), p.b(6), 1, 1.04, "linear") });
        const c = M.springUnit(p.t - p.b(1.5), { preset: "snap" });
        M.set(p.$(".cta"), { opacity: M.clamp(c * 2), y: (1 - c) * 30 });
      },
    },
  ],
  // Sounds by index name (sfx/index.json) or by file path. `at` is seconds or { beat }.
  audio: {
    music: null, // { src: "assets/music.mp3", volume: 0.16 }
    voice: [], // { src: VOICE.hook.src, at: { beat: 0 } }
    sfx: [
      { name: "whoosh-short", at: { beat: 4 }, volume: 0.5 },
      { name: "pop", at: { beat: 7 }, volume: 0.4 },
      { name: "whoosh", at: { beat: 11 }, volume: 0.5 },
      { name: "click-soft", at: { beat: 14 }, volume: 0.5 },
      { name: "impact-bass-1", at: { beat: 18 }, volume: 0.6 },
    ],
  },
  hits: [{ beat: 2 }, { beat: 11 }],
  // captions: { words: M.shiftWords(VOICE.hook.words, 0), activeColor: palette.accent },
});
