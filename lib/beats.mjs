// Beat lock check: how far each cut and hit lands from the beat grid, after frame rounding.
import { createRequire } from "node:module";
const Motion = createRequire(import.meta.url)("../engine/motion.js");

/** subdivision 2 lets hits land on half beats (eighth notes); cuts must land on whole beats. */
export function beatReport(meta, subdivision = meta.subdivision ?? 2) {
  const grid = Motion.beats({ bpm: meta.bpm, fps: meta.fps, offset: meta.offset ?? 0 });
  const fine = Motion.beats({ bpm: meta.bpm * subdivision, fps: meta.fps, offset: meta.offset ?? 0 });
  const onFrame = (t) => Math.round(t * meta.fps) / meta.fps; // what the video actually shows
  const items = [
    ...meta.scenes.slice(1).map((s) => ({ kind: "cut", id: s.id, t: s.start })),
    // a sound marked word: true follows the voice, not the beat
    ...(meta.audio?.sfx ?? []).filter((s) => !s.word).map((s) => ({ kind: "sfx", id: s.name ?? s.src, t: s.at })),
    ...(meta.hits ?? []).map((t, i) => ({ kind: "hit", id: `hit${i + 1}`, t })),
  ].map((x) => {
    const g = x.kind === "cut" ? grid : fine;
    return { ...x, beat: Math.round(g.nearest(x.t) / (x.kind === "cut" ? 1 : subdivision) * 100) / 100, ms: Math.round(Math.abs(onFrame(x.t) - g.snap(onFrame(x.t))) * 10000) / 10 };
  });
  const max = items.reduce((m, x) => Math.max(m, x.ms), 0);
  return { framesPerBeat: grid.framesPerBeat, max, items };
}
