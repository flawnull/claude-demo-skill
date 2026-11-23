// Frame critic core: pure functions over per-frame change measurements.
// A frame's change is the fraction of pixels that differ from the previous frame.

export const DEFAULTS = {
  live: 0.0004, // a frame is live when at least this fraction of pixels changed
  holdSeconds: 0.5, // a still run up to this long is a deliberate hold, not dead
  quiet: 2, // still frames needed before motion counts as a new onset
  sustain: 3, // live frames out of the next 4 for motion to count as a move, not a one-frame blip
  onsetFloor: 0.002, // an onset changes at least this fraction of the picture
  tolerance: 2, // frames between an onset and a cue that still count as aligned
  pass: 8,
};

/** Which scene owns each frame: the active scene that started last. */
export function sceneOfFrames(meta, frameCount) {
  const owner = new Array(frameCount).fill(null);
  for (let i = 0; i < frameCount; i++) {
    const t = i / meta.fps;
    let best = null;
    for (const s of meta.scenes) if (t >= s.start - 1e-9 && t < s.end - 1e-9 && (!best || s.start > best.start)) best = s;
    owner[i] = best ? best.id : null;
  }
  return owner;
}

/** Runs of consecutive frames where pred(i) holds, as [first, last] inclusive. */
export function runs(indices, pred) {
  const out = [];
  let start = null;
  indices.forEach((i, k) => {
    if (pred(i)) { if (start === null) start = i; }
    else if (start !== null) { out.push([start, indices[k - 1]]); start = null; }
  });
  if (start !== null) out.push([start, indices[indices.length - 1]]);
  return out;
}

/** Frames where motion starts after stillness (the first frame always counts). */
export function onsets(change, opts = DEFAULTS) {
  const o = { ...DEFAULTS, ...opts };
  const out = [];
  for (let i = 0; i < change.length; i++) {
    if (change[i] < o.onsetFloor) continue;
    const before = change.slice(Math.max(0, i - o.quiet), i);
    const ahead = change.slice(i, i + 4).filter((c) => c >= o.live).length;
    if (ahead < Math.min(o.sustain, change.length - i)) continue;
    if (i === 0 || before.every((c) => c < o.live)) out.push(i);
  }
  return out;
}

/** Cue frames: scene starts, sound effects, beat hits and word cues. */
export function cueFrames(meta) {
  const f = (t) => Math.round(t * meta.fps);
  const cues = new Set();
  meta.scenes.forEach((s) => cues.add(f(s.start)));
  // cue: false marks a sound whose start is not a motion moment (a riser builds to its end)
  (meta.audio?.sfx ?? []).filter((s) => s.cue !== false).forEach((s) => cues.add(f(s.at)));
  (meta.hits ?? []).forEach((t) => cues.add(f(t)));
  (meta.cues ?? []).forEach((c) => cues.add(f(c.at)));
  return [...cues].sort((a, b) => a - b);
}

/** An eased or sprung move peaks early and decays; a linear slide stays flat. */
export function feelsSprung(values) {
  if (values.length < 4) return true;
  let peak = 0, at = 0;
  values.forEach((v, i) => { if (v > peak) { peak = v; at = i; } });
  const tailN = Math.max(1, Math.floor(values.length / 4));
  const tail = values.slice(-tailN).reduce((a, b) => a + b, 0) / tailN;
  return at / values.length <= 0.5 && tail <= 0.6 * peak;
}

/** Score every scene out of 10 and say why. */
export function scoreScenes(meta, change, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const owner = sceneOfFrames(meta, change.length);
  const hold = Math.round(o.holdSeconds * meta.fps);
  const allOnsets = onsets(change, o);
  const cues = cueFrames(meta);
  const near = (list, f) => list.some((c) => Math.abs(c - f) <= o.tolerance);

  return meta.scenes.map((s) => {
    const frames = owner.map((id, i) => (id === s.id ? i : -1)).filter((i) => i >= 0);
    const n = frames.length;
    if (!n) return { id: s.id, score: 0, frames: [0, 0], pass: false, notes: ["scene has no frames"] };
    const isLive = (i) => change[i] >= o.live;
    const live = frames.filter(isLive).length;
    const still = runs(frames, (i) => !isLive(i));
    const dead = still.filter(([a, b]) => b - a + 1 > hold);
    const excess = dead.reduce((sum, [a, b]) => sum + (b - a + 1 - hold), 0);

    const motion = 5 * (live / n);
    const deadPenalty = Math.min(3, (3 * excess) / n);

    const sceneOnsets = allOnsets.filter((i) => owner[i] === s.id);
    const sceneCues = cues.filter((c) => owner[c] === s.id);
    const onsetHit = sceneOnsets.filter((i) => near(sceneCues, i)).length;
    // a cue counts when something moves on it (a cut, a landing, a stagger)
    const movedNear = (c) => frames.some((i) => Math.abs(i - c) <= o.tolerance && isLive(i));
    const cueHit = sceneCues.filter(movedNear).length;
    const align =
      3 * (0.5 * (sceneOnsets.length ? onsetHit / sceneOnsets.length : 1) + 0.5 * (sceneCues.length ? cueHit / sceneCues.length : 1));

    // each onset's move, up to the next onset or one second; exits into the cut may ease in
    const last = frames[n - 1];
    const moves = sceneOnsets
      .map((on, k) => {
        let end = on;
        while (end + 1 <= last && isLive(end + 1)) end++; // the move ends when the picture stops
        return [on, Math.min((sceneOnsets[k + 1] ?? Infinity) - 1, on + meta.fps - 1, end)];
      })
      .filter(([a, b]) => b - a + 1 >= 4 && b < last - 2);
    const sprung = moves.filter(([a, b]) => feelsSprung(change.slice(a, b + 1))).length;
    const springScore = moves.length ? 2 * (sprung / moves.length) : 2;

    const score = Math.round(Math.max(0, Math.min(10, motion + align + springScore - deadPenalty)) * 10) / 10;
    const notes = [];
    for (const [a, b] of dead) notes.push(`${b - a + 1} dead frames (f${a} to f${b}): nothing moves`);
    const offCue = sceneOnsets.filter((i) => !near(sceneCues, i));
    if (offCue.length) notes.push(`motion starts off cue at f${offCue.slice(0, 6).join(", f")}`);
    const silentCues = sceneCues.filter((c) => !movedNear(c));
    if (silentCues.length) notes.push(`cue with no motion at f${silentCues.slice(0, 6).join(", f")}`);
    if (moves.length > sprung) notes.push(`${moves.length - sprung} of ${moves.length} moves feel linear (no ease-out or spring)`);
    return {
      id: s.id,
      score,
      pass: score >= o.pass,
      frames: [frames[0], frames[n - 1]],
      parts: {
        motion: round(motion), deadPenalty: round(deadPenalty), align: round(align), spring: round(springScore),
      },
      live: round(live / n),
      dead,
      onsets: { total: sceneOnsets.length, onCue: onsetHit },
      cues: { total: sceneCues.length, moved: cueHit },
      moves: { total: moves.length, sprung },
      notes,
    };
  });
}

const round = (v) => Math.round(v * 100) / 100;

/** The report Claude reads after each pass. */
export function report(scored, pass = DEFAULTS.pass) {
  const lines = [`# Frame critic`, ``];
  for (const s of scored) {
    const head = `${s.pass ? "PASS" : "FAIL"} ${s.id} ${s.score}/10 (f${s.frames[0]} to f${s.frames[1]})`;
    lines.push(`- ${head}: live ${Math.round((s.live ?? 0) * 100)}%, onsets on cue ${s.onsets?.onCue ?? 0}/${s.onsets?.total ?? 0}, cues that moved ${s.cues?.moved ?? 0}/${s.cues?.total ?? 0}, sprung moves ${s.moves?.sprung ?? 0}/${s.moves?.total ?? 0}`);
    for (const n of s.notes) lines.push(`  - ${n}`);
  }
  const failing = scored.filter((s) => !s.pass).map((s) => s.id);
  lines.push(``, failing.length ? `Re-render: ${failing.join(", ")} (below ${pass}/10)` : `All scenes at or above ${pass}/10.`);
  return lines.join("\n");
}
