// Frame bookkeeping for capture and re-render.
export const frameCount = (meta) => Math.round(meta.duration * meta.fps);

/** Frame indices to (re)capture: all, or only the named scenes. */
export function framesFor(meta, sceneIds) {
  const total = frameCount(meta);
  if (!sceneIds || !sceneIds.length) return [...Array(total).keys()];
  const out = new Set();
  for (const id of sceneIds) {
    const s = meta.scenes.find((x) => x.id === id);
    if (!s) throw new Error(`no scene named "${id}" (scenes: ${meta.scenes.map((x) => x.id).join(", ")})`);
    const a = Math.max(0, Math.floor(s.start * meta.fps));
    const b = Math.min(total, Math.ceil(s.end * meta.fps));
    for (let i = a; i < b; i++) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

export const frameName = (i) => `f_${String(i).padStart(5, "0")}.png`;

/** Viewport for an aspect ratio name or WxH. */
export function viewport(aspect = "16:9", long = 1920) {
  const m = /^(\d+)x(\d+)$/.exec(aspect);
  if (m) return { width: +m[1], height: +m[2] };
  const short = Math.round((long * 9) / 16);
  const map = { "16:9": [long, short], "9:16": [short, long], "1:1": [short, short], "4:5": [short, Math.round((short * 5) / 4)] };
  if (!map[aspect]) throw new Error(`unknown aspect "${aspect}" (use 16:9, 9:16, 1:1, 4:5 or WxH)`);
  const [width, height] = map[aspect];
  return { width: width - (width % 2), height: height - (height % 2) };
}
