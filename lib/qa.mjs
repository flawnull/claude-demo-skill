// Layout QA: pure checks over the boxes the page reports for each sampled frame.
// An object is { id, kind: "text" | "media" | "card", text, box: [x, y, w, h], anc: [ancestor ids], ok: bool }.

/** Gap between two boxes in px: negative when they overlap, 0 when they touch. */
export function gap(a, b) {
  const [ax, ay, aw, ah] = a, [bx, by, bw, bh] = b;
  const gx = Math.max(bx - (ax + aw), ax - (bx + bw));
  const gy = Math.max(by - (ay + ah), ay - (by + bh));
  return Math.max(gx, gy);
}

/** One object inside the other (text on its own card), or parts of one thing ([data-qa-group]), is not a collision. */
export const related = (a, b) => a.anc.includes(b.id) || b.anc.includes(a.id) || (a.group != null && a.group === b.group);

/** Pairs of objects that overlap or come closer than `touch` px. */
export function collisions(objects, { touch = 2 } = {}) {
  const out = [];
  for (let i = 0; i < objects.length; i++)
    for (let j = i + 1; j < objects.length; j++) {
      const a = objects[i], b = objects[j];
      if (a.ok || b.ok || related(a, b)) continue;
      const g = gap(a.box, b.box);
      if (g < touch) out.push({ a: a.id, b: b.id, gap: Math.round(g * 10) / 10, kind: g < 0 ? "overlap" : "touch" });
    }
  return out;
}

/** Social-video margins where the platform draws its buttons and caption (rule 5). */
export const SAFE = {
  "instagram-reel": { top: 0.1, bottom: 0.2, right: 0.15, left: 0.05 },
  "tiktok": { top: 0.1, bottom: 0.2, right: 0.15, left: 0.05 },
  "youtube-short": { top: 0.1, bottom: 0.2, right: 0.15, left: 0.05 },
  "title-safe": { top: 0.05, bottom: 0.05, right: 0.05, left: 0.05 },
};

/** Text that leaves the safe area. */
export function unsafe(objects, safe, width, height) {
  const m = typeof safe === "string" ? SAFE[safe] : safe;
  if (!m) return [];
  const L = m.left * width, T = m.top * height, R = width - m.right * width, B = height - m.bottom * height;
  return objects
    .filter((o) => o.kind === "text" && !o.ok)
    .filter((o) => { const [x, y, w, h] = o.box; return x < L - 0.5 || y < T - 0.5 || x + w > R + 0.5 || y + h > B + 0.5; })
    .map((o) => ({ id: o.id, text: o.text }));
}

/** Anything drawn over the face (normalised box, padded by `pad` of its size). */
export function overFace(objects, face, width, height, pad = 0.08) {
  if (!face) return [];
  const [fx, fy, fw, fh] = face;
  const box = [(fx - fw * pad) * width, (fy - fh * pad) * height, fw * (1 + 2 * pad) * width, fh * (1 + 2 * pad) * height];
  return objects.filter((o) => !o.ok && gap(o.box, box) < 0).map((o) => ({ id: o.id, text: o.text }));
}

/** Brand words visible on screen (rule 2: the opening is the viewer's problem, not the logo). */
export function brandShown(objects, brand) {
  const words = (Array.isArray(brand) ? brand : brand ? [brand] : []).map((b) => b.toLowerCase());
  return objects.filter((o) => o.brand || (o.text && words.some((w) => o.text.toLowerCase().includes(w)))).map((o) => o.id);
}

/**
 * Sound events from frame-to-frame changes (rule 6): a text appears, a number changes,
 * something starts to move or lands. frames: [{ t, objects }].
 */
export function soundEvents(frames, { height = 1080, moveSpeed = 0.18, minGap = { text: 0.25, tick: 0.05, move: 0.2, land: 0.2, card: 0.15 } } = {}) {
  const events = [];
  const last = {};
  const seen = new Map(); // id -> { text, cx, cy, moving, t }
  const fast = moveSpeed * height; // px per second that counts as moving
  const push = (kind, t, o, extra = {}) => {
    if (last[kind] != null && t - last[kind] < minGap[kind]) return;
    last[kind] = t;
    const [, , w, h] = o.box;
    events.push({ kind, t: Math.round(t * 1000) / 1000, id: o.id, size: Math.min(1, (w * h) / (height * height * 0.25)), ...extra });
  };
  for (const f of frames) {
    const now = new Set();
    for (const o of f.objects) {
      if (o.quiet) continue; // [data-sfx="off"]: subtitles and anything else that should stay silent
      now.add(o.id);
      const [x, y, w, h] = o.box;
      const prev = seen.get(o.id);
      if (!prev) {
        push(o.kind === "text" ? "text" : "card", f.t, o);
        seen.set(o.id, { text: o.text, box: o.box, moving: false, t: f.t });
        continue;
      }
      if (o.kind === "text" && /\d/.test(o.text) && o.text !== prev.text) push("tick", f.t, o);
      const dt = f.t - prev.t || 1e-6;
      // a move shifts both edges the same way; text growing word by word, or a pop in scale, is not a move
      const shift = (a0, a1, b0, b1) => { const d0 = a1 - a0, d1 = b1 - b0; return Math.sign(d0) === Math.sign(d1) ? Math.min(Math.abs(d0), Math.abs(d1)) : 0; };
      const [px, py, pw, ph] = prev.box;
      const speed = Math.hypot(shift(px, x, px + pw, x + w), shift(py, y, py + ph, y + h)) / dt;
      const moving = speed > fast;
      if (moving && !prev.moving) push("move", f.t, o);
      if (!moving && prev.moving) push("land", f.t, o);
      seen.set(o.id, { text: o.text, box: o.box, moving, t: f.t });
    }
    for (const id of [...seen.keys()]) if (!now.has(id)) seen.delete(id); // gone: it may appear again
  }
  return events;
}

/** Which library sound plays each kind of event, how loud, rotating through a few takes. */
export const SOUND_FOR = {
  // recorded foley, kept low and dull: a soft tap, not a UI chirp
  text: { names: ["impact-bfh-bfh1-rock-hit-01", "impact-bfh-bfh1-hit-04", "impact-cc0-wooden-03"], volume: 0.09 },
  tick: { names: ["click-kenney-tick-004", "click-kenney-back-002", "click-kenney-back-004", "click-kenney-toggle-004"], volume: 0.1 },
  card: { names: ["impact-bfh-bfh1-hit-08", "impact-bfh-bfh1-hit-10", "impact-cc0-wooden-01"], volume: 0.14 },
  move: { names: ["whoosh-swish-3", "whoosh-swish-7", "whoosh-swish-9", "whoosh-swish-1", "whoosh-swish-8"], volume: 0.16 },
  land: { names: ["impact-bfh-bfh1-hit-06", "impact-bfh-bfh1-wood-hit-02", "impact-bfh-bfh1-hit-02"], volume: 0.13 },
};

/** Turn events into sfx entries, skipping any within `near` s of a sound the film placed by hand. */
export function autoSfx(events, manual = [], { near = 0.06, table = SOUND_FOR } = {}) {
  const count = {};
  return events
    .filter((e) => !manual.some((m) => Math.abs(m.at - e.t) < near))
    .map((e) => {
      const spec = table[e.kind];
      const k = (count[e.kind] = (count[e.kind] ?? 0) + 1);
      return { name: spec.names[k % spec.names.length], at: e.t, id: e.id, volume: Math.round(spec.volume * (0.7 + 0.6 * e.size) * 1000) / 1000, auto: e.kind, word: true, cue: false };
    });
}

/** Group per-frame findings into runs: "f12 to f20: a overlaps b". hits: [{ key, t, ... }]. */
export function runsOf(hits, fps) {
  const byKey = new Map();
  for (const h of hits) {
    const f = Math.round(h.t * fps);
    const list = byKey.get(h.key) ?? [];
    const r = list[list.length - 1];
    if (r && f - r.last <= 2) r.last = f;
    else list.push({ ...h, first: f, last: f });
    byKey.set(h.key, list);
  }
  return [...byKey.values()].flat().sort((a, b) => a.first - b.first);
}
