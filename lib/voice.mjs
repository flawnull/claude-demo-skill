// One voice, one take: the whole script is spoken in a single generation, then cut into lines,
// so every line has the same voice, pace and energy.

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const tokens = (text) => text.split(/\s+/).map(norm).filter(Boolean);

/**
 * Where each line ends in the take. lines: [text]; words: [{ w, start, end }] for the whole take.
 * Returns the index of the last word of each line. Word counts can differ (TTS reads "31st" as
 * "thirty-first"), so each boundary snaps to the matching last word near where it should be.
 */
export function lineEnds(lines, words, reach = 5) {
  const total = lines.reduce((n, l) => n + tokens(l).length, 0);
  const scale = words.length / Math.max(1, total);
  const ends = [];
  let seen = 0, from = 0;
  lines.forEach((l, k) => {
    const t = tokens(l);
    seen += t.length;
    if (k === lines.length - 1) return ends.push(words.length - 1);
    const guess = Math.round(seen * scale) - 1;
    const last = t[t.length - 1];
    let best = null;
    for (let d = 0; d <= reach && best == null; d++)
      for (const i of [guess - d, guess + d])
        if (i >= from && i < words.length - 1 && norm(words[i].w) === last) { best = i; break; }
    if (best == null) best = Math.max(from, Math.min(words.length - 2, guess));
    ends.push(best);
    from = best + 1;
  });
  return ends;
}

/**
 * Cut points between lines: halfway through the pause after each line's last word.
 * Returns [{ from, to, words }] with words re-timed to the start of each piece.
 */
export function splitTake(lines, words, duration) {
  const ends = lineEnds(lines, words);
  const cuts = ends.slice(0, -1).map((e) => (words[e].end + words[e + 1].start) / 2);
  const bounds = [0, ...cuts, duration];
  let first = 0;
  return lines.map((_, k) => {
    const from = bounds[k], to = bounds[k + 1];
    const ws = words.slice(first, ends[k] + 1).map((w) => ({ ...w, start: +(w.start - from).toFixed(3), end: +(w.end - from).toFixed(3) }));
    first = ends[k] + 1;
    return { from: +from.toFixed(3), to: +to.toFixed(3), words: ws };
  });
}
