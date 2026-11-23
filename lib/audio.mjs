// Builds the ffmpeg command that stitches frames and mixes voice, music and sound effects.

const ms = (t) => Math.max(0, Math.round(t * 1000));

/**
 * @param meta    film metadata (fps, width, height, duration, audio)
 * @param o.frames  frame pattern, e.g. build/frames/f_%05d.png
 * @param o.out     output MP4 path
 * @param o.resolve (src) => absolute path for an audio file or SFX name
 */
export function stitchArgs(meta, o) {
  const { fps, duration } = meta;
  const audio = meta.audio ?? {};
  const args = ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", o.frames];
  const filters = [];
  let next = 1;

  // video: frames alone, or frames laid over a filmed video (on-camera mode)
  const under = audio.under ?? null;
  let underIndex = null;
  if (under) {
    underIndex = next++;
    args.push("-i", o.resolve(under.src ?? under));
    filters.push(
      `[${underIndex}:v]scale=${meta.width}:${meta.height}:force_original_aspect_ratio=increase,crop=${meta.width}:${meta.height},fps=${fps}[bg]`,
      `[bg][0:v]overlay=0:0:format=auto,format=yuv420p[v]`,
    );
  } else {
    filters.push(`[0:v]format=yuv420p[v]`);
  }

  // voice bus: narration lines, plus the filmed audio in on-camera mode
  const vox = [];
  if (under && under.audio !== false) {
    filters.push(`[${underIndex}:a]aresample=48000,volume=${under.volume ?? 1}[u0]`);
    vox.push("[u0]");
  }
  (audio.voice ?? []).forEach((v, k) => {
    const i = next++;
    args.push("-i", o.resolve(v.src));
    filters.push(`[${i}:a]aresample=48000,adelay=${ms(v.at)}:all=1,volume=${v.volume ?? 1}[v${k}]`);
    vox.push(`[v${k}]`);
  });

  const bus = [];
  if (vox.length) {
    filters.push(`${vox.join("")}amix=inputs=${vox.length}:normalize=0:duration=longest[vox]`);
  }

  // music bed, ducked under the voice
  const m = audio.music;
  if (m) {
    const i = next++;
    if (m.loop) args.push("-stream_loop", "-1");
    if (m.start) args.push("-ss", String(m.start));
    args.push("-i", o.resolve(m.src));
    const fade = m.fadeOut ?? 1.5;
    filters.push(
      `[${i}:a]aresample=48000,atrim=0:${duration},volume=${m.volume ?? 0.16},afade=t=in:d=${m.fadeIn ?? 0.2},afade=t=out:st=${Math.max(0, duration - fade)}:d=${fade}[mus]`,
    );
    if (vox.length && m.duck !== false) {
      filters.push(`[vox]asplit=2[vox][sc]`, `[mus][sc]sidechaincompress=threshold=0.04:ratio=5:attack=15:release=350[mus]`);
    }
    bus.push("[mus]");
  }
  if (vox.length) bus.push("[vox]");

  // sound effects at their onsets: one input per file, split for every use, so hundreds of sounds stay cheap
  const sfx = audio.sfx ?? [];
  const files = new Map(); // resolved path -> { input, uses: [k] }
  sfx.forEach((s, k) => {
    const path = o.resolve(s.src ?? s.name);
    if (!files.has(path)) {
      files.set(path, { input: next++, uses: [] });
      args.push("-i", path);
    }
    files.get(path).uses.push(k);
  });
  for (const { input, uses } of files.values()) {
    const outs = uses.map((k) => `[x${k}]`).join("");
    filters.push(`[${input}:a]aresample=48000${uses.length > 1 ? `,asplit=${uses.length}` : ""}${outs}`);
  }
  const sfxOut = [];
  sfx.forEach((s, k) => {
    // start/duration cut a piece out of a long sound (for example the end of a riser)
    const cut = s.start || s.duration ? `atrim=${s.start ?? 0}${s.duration ? `:${(s.start ?? 0) + s.duration}` : ""},asetpts=PTS-STARTPTS,` : "";
    const fade = s.duration ? `afade=t=out:st=${Math.max(0, s.duration - 0.08)}:d=0.08,` : "";
    filters.push(`[x${k}]${cut}${fade}adelay=${ms(s.at)}:all=1,volume=${s.volume ?? 0.5}[s${k}]`);
    sfxOut.push(`[s${k}]`);
  });
  if (sfxOut.length) {
    filters.push(`${sfxOut.join("")}amix=inputs=${sfxOut.length}:normalize=0:duration=longest[fx]`);
    // the voice stays on top: sound effects duck under it too, more gently than music
    if (vox.length && audio.duckSfx !== false) {
      filters.push(`[vox]asplit=2[vox][sc2]`, `[fx][sc2]sidechaincompress=threshold=0.05:ratio=3:attack=10:release=250[fx]`);
    }
    bus.push("[fx]");
  }

  if (bus.length) {
    filters.push(
      `${bus.join("")}amix=inputs=${bus.length}:normalize=0:duration=longest,atrim=0:${duration},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]`,
    );
  }

  args.push("-filter_complex", filters.join(";"), "-map", "[v]");
  if (bus.length) args.push("-map", "[a]", "-c:a", "aac", "-b:a", "256k");
  else args.push("-an");
  args.push("-c:v", "libx264", "-preset", "medium", "-crf", String(o.crf ?? 16), "-r", String(fps), "-t", String(duration), "-movflags", "+faststart", o.out);
  return args;
}
