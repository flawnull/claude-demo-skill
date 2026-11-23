// Real web footage for a film: a visible cursor, eased mouse moves, and a screenshot loop that keeps
// each frame's real timestamp. Playwright's own screencast stops writing frames while a page sits
// still, so marks taken from the wall clock drift; this recorder does not.
//
//   const rec = await record(page, "footage/attach");      // starts grabbing frames
//   await rec.glide(page.getByRole("button", { name: "Save" }), { click: true });
//   rec.mark("saved");                                       // seconds since the start
//   const { video, marks } = await rec.stop();               // footage/attach.webm + marks
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { spawnSync } from "node:child_process";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A white arrow cursor and a click ring, drawn into the page: the real pointer never shows in captures. */
export const CURSOR = () => {
  const add = () => {
    const c = document.createElement("div");
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M3 2 L3 20 L8 15 L12 24 L15 22.6 L11 14 L18 14 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: 2147483647, pointerEvents: "none", transform: "translate(-100px,-100px)" });
    document.documentElement.appendChild(c);
    addEventListener("mousemove", (e) => (c.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`), true);
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      Object.assign(r.style, { position: "fixed", left: `${e.clientX - 18}px`, top: `${e.clientY - 18}px`, width: "36px", height: "36px", borderRadius: "50%", border: "3px solid rgba(255,255,255,.85)", zIndex: 2147483646, pointerEvents: "none" });
      document.documentElement.appendChild(r);
      r.animate([{ transform: "scale(.4)", opacity: 1 }, { transform: "scale(1.4)", opacity: 0 }], { duration: 450, easing: "ease-out" }).onfinish = () => r.remove();
    }, true);
  };
  if (document.documentElement) add(); else addEventListener("DOMContentLoaded", add);
};

/** Add the cursor to every page of a browser context. Call before page.goto. */
export const withCursor = (ctx) => ctx.addInitScript(CURSOR);

/** Start recording `page` into `<out>.webm`. */
export async function record(page, out, { quality = 88 } = {}) {
  const t0 = Date.now();
  const dir = join(dirname(out), `.${basename(out)}-shots`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const shots = [], marks = {};
  let on = true, mx = 0, my = 0;
  const vp = page.viewportSize() ?? { width: 1600, height: 1000 };
  mx = vp.width / 2; my = vp.height / 2;
  const loop = (async () => {
    while (on) {
      const at = (Date.now() - t0) / 1000;
      const buf = await page.screenshot({ type: "jpeg", quality }).catch(() => null);
      if (buf) { const f = `s_${String(shots.length).padStart(5, "0")}.jpg`; writeFileSync(join(dir, f), buf); shots.push({ f, at }); }
    }
  })();
  return {
    mark(name) { marks[name] = +((Date.now() - t0) / 1000).toFixed(2); return marks[name]; },
    /** Move the cursor to a locator on an ease-in-out path, and click if asked. */
    async glide(loc, { click = false, dx = 0.5, dy = 0.5, steps = 28 } = {}) {
      const b = await loc.boundingBox();
      if (!b) throw new Error("glide: the element is not on screen");
      const x = b.x + b.width * dx, y = b.y + b.height * dy;
      for (let i = 1; i <= steps; i++) {
        const u = i / steps, e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        await page.mouse.move(mx + (x - mx) * e, my + (y - my) * e);
        await sleep(14);
      }
      mx = x; my = y;
      if (click) { await sleep(120); await page.mouse.down(); await sleep(60); await page.mouse.up(); }
    },
    async stop() {
      // the clip ends when stop() is called, not when the last (possibly stalled) screenshot returns
      const end = (Date.now() - t0) / 1000;
      on = false;
      await loop;
      while (shots.length > 1 && shots.at(-1).at >= end) shots.pop();
      if (!shots.length) throw new Error("record: no frames were captured");
      const list = shots.map((s, i) => `file '${join(dir, s.f)}'\nduration ${((shots[i + 1]?.at ?? end) - (i ? s.at : 0)).toFixed(3)}`).join("\n");
      writeFileSync(join(dir, "list.txt"), `${list}\nfile '${join(dir, shots.at(-1).f)}'\n`);
      const video = `${out}.webm`;
      const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"), "-vf", "fps=30,format=yuv420p", "-t", end.toFixed(3), "-c:v", "libvpx-vp9", "-b:v", "6M", "-deadline", "realtime", "-cpu-used", "8", video]);
      if (r.status) throw new Error(r.stderr.toString());
      rmSync(dir, { recursive: true, force: true });
      return { video, marks, fps: +(shots.length / end).toFixed(1) };
    },
  };
}
