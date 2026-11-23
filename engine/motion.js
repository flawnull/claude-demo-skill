/*
 * motion.js: the frame engine. Every value on screen is a pure function of time.
 * Loaded as a classic <script> in the film page (sets globalThis.Motion) and
 * imported by the Node scripts and tests (module.exports).
 *
 * No CSS transitions, no requestAnimationFrame, no clocks, no unseeded random.
 */
(function (root) {
  "use strict";

  // the film's frame length; film() sets it, helpers use it for 3-frame staggers and motion blur
  let FRAME = 1 / 30;

  // ---------- numbers ----------
  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  const progress = (t, t0, t1) => (t1 === t0 ? (t >= t1 ? 1 : 0) : clamp((t - t0) / (t1 - t0)));

  // ---------- easing (closed form, p in [0,1]) ----------
  const ease = {
    linear: (p) => p,
    inQuad: (p) => p * p,
    outQuad: (p) => 1 - (1 - p) * (1 - p),
    inOutQuad: (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
    inCubic: (p) => p * p * p,
    outCubic: (p) => 1 - Math.pow(1 - p, 3),
    inOutCubic: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    outQuart: (p) => 1 - Math.pow(1 - p, 4),
    inExpo: (p) => (p === 0 ? 0 : Math.pow(2, 10 * p - 10)),
    outExpo: (p) => (p === 1 ? 1 : 1 - Math.pow(2, -10 * p)),
    inOutExpo: (p) =>
      p === 0 ? 0 : p === 1 ? 1 : p < 0.5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2,
    outBack: (p) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
    },
    inBack: (p) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return c3 * p * p * p - c1 * p * p;
    },
  };

  /** Value between `from` and `to` over [t0, t1] with an easing. Clamped outside. */
  function tween(t, t0, t1, from, to, easing = ease.outCubic) {
    const fn = typeof easing === "string" ? ease[easing] : easing;
    return lerp(from, to, fn(progress(t, t0, t1)));
  }

  // ---------- closed-form damped spring ----------
  const SPRINGS = {
    snap: { stiffness: 420, damping: 30 }, // zeta ~0.73: fast, tiny overshoot
    pop: { stiffness: 320, damping: 16 }, // zeta ~0.45: visible bounce
    wobble: { stiffness: 260, damping: 8 }, // zeta ~0.25: cartoon jelly
    gentle: { stiffness: 120, damping: 22 }, // zeta ~1.0: no overshoot
  };

  function springParams(opts = {}) {
    const preset = typeof opts.preset === "string" ? SPRINGS[opts.preset] : null;
    const stiffness = opts.stiffness ?? preset?.stiffness ?? SPRINGS.snap.stiffness;
    const damping = opts.damping ?? preset?.damping ?? SPRINGS.snap.damping;
    const mass = opts.mass ?? 1;
    const w0 = Math.sqrt(stiffness / mass);
    const zeta = damping / (2 * Math.sqrt(stiffness * mass));
    return { w0, zeta, v0: opts.velocity ?? 0 };
  }

  /**
   * Normalised spring position at time t seconds after release: 0 at t<=0, settles at 1.
   * Solves m x'' + c x' + k (x - 1) = 0 with x(0)=0, x'(0)=v0 exactly; no integration.
   */
  function springUnit(t, opts = {}) {
    if (t <= 0) return 0;
    const { w0, zeta, v0 } = springParams(opts);
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      const env = Math.exp(-zeta * w0 * t);
      return 1 + env * (-Math.cos(wd * t) + ((v0 - zeta * w0) / wd) * Math.sin(wd * t));
    }
    if (zeta === 1) {
      return 1 + Math.exp(-w0 * t) * (-1 + (v0 - w0) * t);
    }
    const s = Math.sqrt(zeta * zeta - 1);
    const r1 = -w0 * (zeta - s);
    const r2 = -w0 * (zeta + s);
    const c2 = (v0 + r1) / (r2 - r1);
    const c1 = -1 - c2;
    return 1 + c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
  }

  /** Spring from `from` to `to`, released at time `start`. */
  function spring(t, start, from, to, opts = {}) {
    return lerp(from, to, springUnit(t - start, opts));
  }

  /** Velocity of the normalised spring (units per second), by central difference. */
  function springVelocity(t, opts = {}) {
    const h = 1e-4;
    return (springUnit(t + h, opts) - springUnit(t - h, opts)) / (2 * h);
  }

  /** Velocity of any pure function of time (units per second), by central difference. */
  function vel(fn, t, h = 1e-3) {
    return (fn(t + h) - fn(t - h)) / (2 * h);
  }

  /**
   * A move with anticipation: pulls back by `pull` of the distance for `pullTime` s, then springs to `to`.
   * Every object pulls back before it moves (rule 3).
   */
  function move(t, start, from, to, { pull = 0.12, pullTime = 3 * FRAME, ...spring } = {}) {
    if (t <= start) return from;
    const back = from - (to - from) * pull;
    if (t < start + pullTime) return lerp(from, back, ease.inOutQuad((t - start) / pullTime));
    return lerp(back, to, springUnit(t - start - pullTime, spring));
  }

  /** Seconds until the spring stays within `tolerance` of its target. */
  function springSettle(opts = {}, tolerance = 0.001) {
    const { w0, zeta } = springParams(opts);
    const rate = zeta < 1 ? zeta * w0 : w0 * (zeta - Math.sqrt(Math.max(0, zeta * zeta - 1)));
    return Math.log(2 / tolerance) / rate;
  }

  /**
   * Squash and stretch from a velocity: stretch along the motion, keep area.
   * Returns { sx, sy } where sx * sy === 1.
   */
  function squash(velocity, amount = 0.0006, max = 0.35) {
    const s = 1 + clamp(Math.abs(velocity) * amount, 0, max);
    return { sx: 1 / s, sy: s };
  }

  // ---------- beat grid ----------
  function beats({ bpm, fps, offset = 0 }) {
    if (!(bpm > 0) || !(fps > 0)) throw new Error("beats: bpm and fps must be positive");
    const spb = 60 / bpm;
    const time = (n) => offset + n * spb;
    const frame = (n) => Math.round(time(n) * fps);
    const nearest = (t) => Math.round((t - offset) / spb);
    const snap = (t) => time(nearest(t));
    /** Signed ms between a time and its nearest beat. */
    const offBeatMs = (t) => (t - snap(t)) * 1000;
    return { bpm, fps, offset, spb, framesPerBeat: spb * fps, time, frame, nearest, snap, offBeatMs };
  }

  /** BPMs near `around` whose beat lands on a whole frame at `fps`. */
  function frameExactBpms(fps, around = 120, span = 30) {
    const out = [];
    for (let f = 1; f <= fps * 4; f++) {
      const bpm = (60 * fps) / f;
      if (Math.abs(bpm - around) <= span) out.push(bpm);
    }
    return out.sort((a, b) => Math.abs(a - around) - Math.abs(b - around));
  }

  // ---------- seeded random ----------
  function rng(seed = 1) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- timeline ----------
  /**
   * Lay scenes end to end on the beat grid. A scene is { id, beats, overlap? }.
   * `overlap` (beats) lets the next scene start before this one ends, for transitions.
   */
  function layout(scenes, grid) {
    let beat = 0;
    return scenes.map((s) => {
      if (!(s.beats > 0)) throw new Error(`scene ${s.id}: beats must be positive`);
      const startBeat = beat - (s.overlapIn ?? 0);
      const endBeat = beat + s.beats;
      beat = endBeat;
      return { ...s, startBeat, endBeat, start: grid.time(startBeat), end: grid.time(endBeat) };
    });
  }

  /** Scenes active at time t (start <= t < end + tail). */
  function activeScenes(laid, t) {
    return laid.filter((s) => t >= s.start && t < s.end + (s.tail ?? 0));
  }

  // ---------- captions ----------
  /** Group words into caption lines of at most `max` words, split at gaps > `gap` s. */
  function captionGroups(words, max = 3, gap = 0.45) {
    const groups = [];
    let cur = [];
    for (const w of words) {
      const prev = cur[cur.length - 1];
      if (cur.length && (cur.length >= max || w.start - prev.end > gap || /[.?!,]$/.test(prev.w))) {
        groups.push(cur);
        cur = [];
      }
      cur.push(w);
    }
    if (cur.length) groups.push(cur);
    return groups.map((g) => ({ words: g, start: g[0].start, end: g[g.length - 1].end }));
  }

  /** The caption group on screen at t, with the index of the word being spoken. */
  function captionAt(groups, t, hold = 0.25) {
    // the newest line wins: a line that has started replaces the one still holding
    for (const g of [...groups].reverse()) {
      if (t >= g.start && t < g.end + hold) {
        let i = -1;
        g.words.forEach((w, k) => { if (t >= w.start) i = k; });
        return { group: g, active: i };
      }
    }
    return null;
  }

  /** Start time of the first spoken word matching `word` (case and punctuation ignored). */
  function wordTime(words, word, after = 0) {
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9']/g, "");
    const hit = words.find((w) => w.start >= after && norm(w.w) === norm(word));
    if (!hit) throw new Error(`wordTime: "${word}" is not in the voice track`);
    return hit.start;
  }

  /** Move a voice line's word timings to its place on the film timeline. */
  function shiftWords(words, at) {
    return words.map((w) => ({ ...w, start: w.start + at, end: w.end + at }));
  }

  /**
   * Directional blur (SVG stdDeviation x, y) for a velocity in px/s: a quarter of the distance moved
   * per frame, capped at 8 px, and none below 1 px. Enough to smear a fast move, never a smudge.
   */
  function motionBlurStd(vx, vy, frame = FRAME, max = 8) {
    const b = (v) => { const s = Math.min(max, Math.abs(v) * frame * 0.25); return s < 1 ? 0 : s; };
    return [b(vx), b(vy)];
  }

  // ---------- DOM helpers (browser only) ----------
  /** Write a transform and friends in one call. Every property is explicit, every frame. */
  function set(el, s) {
    if (!el) return;
    const tf = [];
    if (s.x != null || s.y != null) tf.push(`translate(${s.x ?? 0}px, ${s.y ?? 0}px)`);
    if (s.rot != null) tf.push(`rotate(${s.rot}deg)`);
    if (s.scale != null) tf.push(`scale(${s.scale})`);
    if (s.sx != null || s.sy != null) tf.push(`scale(${s.sx ?? 1}, ${s.sy ?? 1})`);
    el.style.transform = tf.join(" ");
    if (s.opacity != null) el.style.opacity = String(s.opacity);
    if (s.blur != null || s.mb != null) {
      const f = [];
      if (s.mb) {
        const [bx, by] = motionBlurStd(s.mb[0], s.mb[1]);
        if (bx > 0 || by > 0) f.push(`url(#${blurFilter(el, bx, by)})`);
      }
      if (s.blur > 0.01) f.push(`blur(${s.blur}px)`);
      el.style.filter = f.length ? f.join(" ") : "none";
    }
    if (s.clip != null) el.style.clipPath = s.clip;
    if (s.color != null) el.style.color = s.color;
    if (s.bg != null) el.style.background = s.bg;
    if (s.text != null) el.textContent = s.text;
  }

  let glassCount = 0;
  /**
   * Clear liquid glass, no blur: whatever is underneath shows straight through and bends at the edges.
   * An SVG displacement map (neutral in the middle, pushing inward near the edges) runs as the
   * backdrop-filter, with saturate(180%), a 5% white tint and a 1 px highlight on the top edge.
   * Put busy detail underneath and slide the glass over it. Never put filter, opacity or clip-path
   * on the glass's parent: that breaks the backdrop (qa.mjs reports it).
   */
  function glass(el, { depth = 36, edge = 0.22, tint = 0.05, radius } = {}) {
    if (!el) return;
    const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
    const key = `${w}x${h}:${depth}:${edge}`;
    if (el.__glassKey !== key) {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const g = c.getContext("2d");
      const img = g.createImageData(w, h);
      const band = Math.max(1, edge * Math.min(w, h));
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          // each edge pulls along its own normal and fades out smoothly: no seams, round at the corners
          const fall = (d) => (d >= band ? 0 : (1 - d / band) ** 2);
          const dx = fall(x) - fall(w - 1 - x), dy = fall(y) - fall(h - 1 - y);
          const i = (y * w + x) * 4;
          img.data[i] = 128 + dx * 127;
          img.data[i + 1] = 128 + dy * 127;
          img.data[i + 2] = 128;
          img.data[i + 3] = 255;
        }
      g.putImageData(img, 0, 0);
      let defs = document.getElementById("motion-glass-defs");
      if (!defs) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", "0"); svg.setAttribute("height", "0");
        svg.setAttribute("data-qa-ignore", "");
        svg.style.position = "absolute";
        defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        defs.id = "motion-glass-defs";
        svg.appendChild(defs);
        document.body.appendChild(svg);
      }
      el.__glassId ??= `glass${++glassCount}`;
      document.getElementById(el.__glassId)?.remove();
      const NS = "http://www.w3.org/2000/svg";
      const f = document.createElementNS(NS, "filter");
      f.id = el.__glassId;
      Object.entries({ x: 0, y: 0, width: w, height: h, filterUnits: "userSpaceOnUse", primitiveUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB" }).forEach(([k, v]) => f.setAttribute(k, v));
      const im = document.createElementNS(NS, "feImage");
      Object.entries({ x: 0, y: 0, width: w, height: h, preserveAspectRatio: "none", result: "map", href: c.toDataURL() }).forEach(([k, v]) => im.setAttribute(k, v));
      const dm = document.createElementNS(NS, "feDisplacementMap");
      Object.entries({ in: "SourceGraphic", in2: "map", scale: depth, xChannelSelector: "R", yChannelSelector: "G" }).forEach(([k, v]) => dm.setAttribute(k, v));
      f.append(im, dm);
      defs.appendChild(f);
      el.__glassKey = key;
    }
    el.setAttribute("data-glass", "");
    Object.assign(el.style, {
      backdropFilter: `url(#${el.__glassId}) saturate(180%)`,
      background: `rgba(255,255,255,${tint})`,
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.55), inset 0 0 0 1px rgba(255,255,255,0.08)",
      ...(radius != null ? { borderRadius: `${radius}px` } : {}),
    });
  }

  let mbCount = 0;
  /** One SVG blur filter per element, its stdDeviation set each frame. Returns the filter id. */
  function blurFilter(el, bx, by) {
    if (!el.__mbId) {
      let defs = document.getElementById("motion-blur-defs");
      if (!defs) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("width", "0");
        svg.setAttribute("height", "0");
        svg.setAttribute("data-qa-ignore", "");
        svg.style.position = "absolute";
        defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        defs.id = "motion-blur-defs";
        svg.appendChild(defs);
        document.body.appendChild(svg);
      }
      const f = document.createElementNS("http://www.w3.org/2000/svg", "filter");
      el.__mbId = `mb${++mbCount}`;
      f.id = el.__mbId;
      f.setAttribute("x", "-50%"); f.setAttribute("y", "-50%");
      f.setAttribute("width", "200%"); f.setAttribute("height", "200%");
      const g = document.createElementNS("http://www.w3.org/2000/svg", "feGaussianBlur");
      f.appendChild(g);
      defs.appendChild(f);
      el.__mbNode = g;
    }
    el.__mbNode.setAttribute("stdDeviation", `${bx.toFixed(2)} ${by.toFixed(2)}`);
    return el.__mbId;
  }

  /** Split an element's text into word spans once. Returns the spans. */
  function splitWords(el) {
    if (el.dataset.split) return [...el.querySelectorAll(":scope > .w")];
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = "";
    words.forEach((w, i) => {
      const s = document.createElement("span");
      s.className = "w";
      s.textContent = w;
      s.style.display = "inline-block";
      el.appendChild(s);
      if (i < words.length - 1) el.appendChild(document.createTextNode(" "));
    });
    el.dataset.split = "1";
    return [...el.querySelectorAll(":scope > .w")];
  }

  /** Start times for n objects, 3 frames apart by default: things that start together look generated. */
  function staggerTimes(n, start = 0, stagger = 3 * FRAME) {
    return Array.from({ length: n }, (_, i) => start + i * stagger);
  }

  /**
   * Kinetic type: each word anticipates (dips), then springs up, stretched along the move,
   * with motion blur along the move. Words start 3 frames apart unless `times` gives each one.
   */
  function kinetic(spans, t, { start = 0, stagger, times, rise = 60, preset = "pop", blur = 0, fade = 4 * FRAME } = {}) {
    spans.forEach((s, i) => {
      const t0 = times ? times[i] : staggerTimes(spans.length, start, stagger)[i];
      const u = (tt) => move(tt, t0, 0, 1, { preset });
      const p = u(t);
      const v = vel(u, t) * rise; // px per second, upward
      const { sx, sy } = squash(v, 0.0009, 0.25);
      set(s, {
        y: (1 - p) * rise,
        sx: t > t0 ? sx : 1,
        sy: t > t0 ? sy : 1,
        opacity: clamp((t - t0) / fade),
        blur: blur ? (1 - clamp(p * 1.4)) * blur : null,
        mb: [0, v],
      });
    });
  }

  /**
   * Image sequence (for example a Blender render): show frame n of `pattern` at time t.
   * pattern uses #### for the frame number: "assets/3d/box_####.png".
   */
  function sequence(img, pattern, t, { fps = 30, start = 0, frames, loop = false } = {}) {
    if (!img) return;
    let n = Math.floor((t - start) * fps);
    if (frames) n = loop ? ((n % frames) + frames) % frames : Math.max(0, Math.min(frames - 1, n));
    const src = pattern.replace(/#+/, (h) => String(Math.max(0, n) + 1).padStart(h.length, "0"));
    if (img.getAttribute("src") !== src) img.setAttribute("src", src);
  }

  /** Face box (normalised x, y, w, h) at time t from samples [{ t, box }], linearly interpolated. */
  function faceAt(faces, t) {
    if (!faces || !faces.length) return null;
    if (t <= faces[0].t) return faces[0].box;
    for (let i = 1; i < faces.length; i++) {
      const a = faces[i - 1], b = faces[i];
      if (t <= b.t) {
        if (!a.box || !b.box) return a.box ?? b.box;
        const p = (t - a.t) / (b.t - a.t);
        return a.box.map((v, k) => lerp(v, b.box[k], p));
      }
    }
    return faces[faces.length - 1].box;
  }

  // ---------- film ----------
  /**
   * Build a film. Returns { renderFrame, meta } and, in a browser, installs
   * window.renderFrame and window.FILM for the capture script.
   */
  function film(def) {
    const fps = def.fps ?? 30;
    FRAME = 1 / fps;
    const grid = beats({ bpm: def.bpm, fps, offset: def.offset ?? 0 });
    const laid = layout(def.scenes, grid);
    const duration = def.duration ?? laid[laid.length - 1].end + (def.endHold ?? 0);
    const doc = typeof document !== "undefined" ? document : null;
    const els = new Map();
    const el = (sel) => {
      if (!doc) return null;
      if (!els.has(sel)) els.set(sel, doc.querySelector(sel));
      return els.get(sel);
    };
    const at = (v) => (typeof v === "object" && v !== null && "beat" in v ? grid.time(v.beat) : v);

    const sfx = (def.audio?.sfx ?? []).map((s) => ({ ...s, at: at(s.at) }));
    const voice = (def.audio?.voice ?? []).map((v) => ({ ...v, at: at(v.at) }));
    const hits = (def.hits ?? []).map(at);
    // word cues: pop-ins timed to a spoken word, not to the beat
    const cues = (def.cues ?? []).map((c) => (typeof c === "object" && c !== null && "at" in c ? { ...c, at: at(c.at) } : { at: at(c) }));
    // every caption word that appears is a cue too
    (def.captions?.words ?? []).forEach((w) => cues.push({ at: w.start, why: `caption "${w.w}"` }));
    if (def.captions?.words) captionGroups(def.captions.words, def.captions.max ?? 3).forEach((g) => cues.push({ at: g.end + 0.25, why: "caption leaves" }));
    const meta = {
      fps,
      width: def.width ?? 1920,
      height: def.height ?? 1080,
      duration,
      bpm: grid.bpm,
      offset: grid.offset,
      palette: def.palette ?? null,
      transparent: !!def.transparent,
      scenes: laid.map(({ id, start, end, startBeat, endBeat }) => ({ id, start, end, startBeat, endBeat })),
      audio: { music: def.audio?.music ?? null, voice, sfx, under: def.audio?.under ?? null },
      hits,
      cues,
      brand: def.brand ?? null, // names or words that must not show in the opening scene
      safe: def.safe ?? null, // margins text must stay inside, e.g. { top: 0.1, bottom: 0.2, right: 0.15, left: 0.05 }
      faces: def.faces ?? null, // [{ t, box: [x, y, w, h] }] normalised, from scripts/faces.mjs
      autoSfx: def.audio?.auto !== false,
    };

    function renderFrame(t) {
      for (const s of laid) {
        const root = el(s.el ?? `#${s.id}`);
        const on = t >= s.start && t < s.end + (s.tail ?? 0);
        if (root) root.style.visibility = on ? "visible" : "hidden";
        if (!on) continue;
        const local = t - s.start;
        s.render?.({
          t: local,
          T: t,
          dur: s.end - s.start,
          beat: local / grid.spb,
          root,
          $: (q) => root?.querySelector(q),
          $$: (q) => (root ? [...root.querySelectorAll(q)] : []),
          spb: grid.spb,
          // a beat (scene-local) as seconds
          b: (n) => n * grid.spb + (s.startBeat * grid.spb + grid.offset - s.start),
        });
      }
      def.always?.({ t, grid });
      if (def.captions && doc) renderCaptions(def.captions, t);
      return true;
    }

    let groups = null;
    function renderCaptions(c, t) {
      const box = el(c.el ?? "#captions");
      if (box && !box.hasAttribute("data-sfx")) box.setAttribute("data-sfx", "off"); // subtitles follow the voice: no sound per word
      if (!box) return;
      groups ??= captionGroups(c.words, c.max ?? 3);
      const cur = captionAt(groups, t);
      if (!cur) { box.style.visibility = "hidden"; return; }
      box.style.visibility = "visible";
      if (box.dataset.group !== String(cur.group.start)) {
        box.textContent = "";
        cur.group.words.forEach((w) => {
          const s = doc.createElement("span");
          s.className = "cw";
          s.textContent = w.w;
          s.style.display = "inline-block";
          s.style.marginRight = "0.25em";
          box.appendChild(s);
        });
        box.dataset.group = String(cur.group.start);
      }
      [...box.children].forEach((s, i) => {
        const w = cur.group.words[i];
        const p = springUnit(t - w.start, { preset: "pop" });
        set(s, {
          y: (1 - p) * 24,
          scale: 0.85 + 0.15 * p,
          opacity: t >= w.start ? clamp(p * 3) : 0.0,
          color: i === cur.active ? c.activeColor ?? null : c.color ?? null,
        });
      });
    }

    if (typeof window !== "undefined") {
      window.renderFrame = renderFrame;
      window.FILM = meta;
    }
    return { renderFrame, meta, grid, layout: laid };
  }

  const Motion = {
    clamp, lerp, progress, ease, tween,
    SPRINGS, springUnit, spring, springVelocity, springSettle, squash,
    beats, frameExactBpms, rng, layout, activeScenes,
    captionGroups, captionAt, wordTime, shiftWords, sequence, faceAt, vel, move, motionBlurStd, staggerTimes, glass,
    set, splitWords, kinetic, film,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Motion;
  root.Motion = Motion;
})(typeof globalThis !== "undefined" ? globalThis : this);
