import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { beatReport } from "../lib/beats.mjs";
const M = createRequire(import.meta.url)("../engine/motion.js");

describe("beat grid", () => {
  const g = M.beats({ bpm: 120, fps: 30 });
  test("120 BPM at 30 fps puts a beat every 15 frames", () => {
    assert.equal(g.framesPerBeat, 15);
    assert.equal(g.frame(4), 60);
  });
  test("an offset moves the whole grid", () => assert.equal(M.beats({ bpm: 120, fps: 30, offset: 0.1 }).time(1), 0.6));
  test("snap moves a time to its nearest beat", () => assert.equal(g.snap(1.1), 1));
  test("off-beat distance is signed milliseconds", () => {
    assert.ok(Math.abs(g.offBeatMs(1.02) - 20) < 1e-9);
    assert.ok(Math.abs(g.offBeatMs(0.98) + 20) < 1e-9);
  });
  test("a zero or missing tempo is refused", () => assert.throws(() => M.beats({ bpm: 0, fps: 30 })));
  test("frame-exact tempos put each beat on a whole frame", () => {
    for (const bpm of M.frameExactBpms(30, 120)) assert.ok(Number.isInteger(Math.round(((60 * 30) / bpm) * 1e6) / 1e6), String(bpm));
    assert.equal(M.frameExactBpms(30, 120)[0], 120);
  });
});

describe("scenes measured in beats", () => {
  const g = M.beats({ bpm: 120, fps: 30 });
  test("scenes are laid end to end so every cut is on a beat", () => {
    const laid = M.layout([{ id: "a", beats: 4 }, { id: "b", beats: 8 }], g);
    assert.deepEqual(laid.map((s) => [s.start, s.end]), [[0, 2], [2, 6]]);
  });
  test("an overlap starts the next scene early for a transition", () => {
    const laid = M.layout([{ id: "a", beats: 4 }, { id: "b", beats: 4, overlapIn: 1 }], g);
    assert.equal(laid[1].start, 1.5);
    assert.deepEqual(M.activeScenes(laid, 1.7).map((s) => s.id), ["a", "b"]);
  });
  test("a scene with no length is refused", () => assert.throws(() => M.layout([{ id: "x", beats: 0 }], g), /beats/));
  test("word cues are kept as times for the critic", () => {
    const f = M.film({ bpm: 120, scenes: [{ id: "a", beats: 4 }], cues: [1.37, { at: { beat: 1 }, why: "break" }] });
    assert.deepEqual(f.meta.cues.map((c) => c.at), [1.37, 0.5]);
  });
  test("caption words and caption exits become cues", () => {
    const f = M.film({ bpm: 120, scenes: [{ id: "a", beats: 4 }], captions: { words: [{ w: "hi", start: 0.7, end: 0.9 }] } });
    assert.deepEqual(f.meta.cues.map((c) => c.at), [0.7, 1.15]); // the word, then the caption leaving
  });
  test("film() turns beat positions of sounds and hits into seconds", () => {
    const f = M.film({ bpm: 120, scenes: [{ id: "a", beats: 4 }], audio: { sfx: [{ name: "pop", at: { beat: 2 } }] }, hits: [{ beat: 1 }] });
    assert.equal(f.meta.audio.sfx[0].at, 1);
    assert.deepEqual(f.meta.hits, [0.5]);
    assert.equal(f.meta.duration, 2);
  });
});

describe("beat lock report", () => {
  const meta = (extra) => ({ fps: 30, bpm: 120, offset: 0, scenes: [{ id: "a", start: 0, end: 2 }, { id: "b", start: 2, end: 4 }], audio: { sfx: [] }, hits: [], ...extra });
  test("cuts and hits on the grid report 0 ms off-beat", () => {
    const r = beatReport(meta({ audio: { sfx: [{ name: "pop", at: 1 }] }, hits: [3] }));
    assert.equal(r.max, 0);
  });
  test("a sound 100 ms late is reported as 100 ms off-beat", () => {
    assert.equal(beatReport(meta({ audio: { sfx: [{ name: "pop", at: 1.1 }] } })).max, 100);
  });
  test("a sound timed to a spoken word is not held to the beat", () => {
    assert.equal(beatReport(meta({ audio: { sfx: [{ name: "pop", at: 1.37, word: true }] } })).max, 0);
  });
  test("a cut on a half beat is off-beat even though hits may use half beats", () => {
    const m = meta({ scenes: [{ id: "a", start: 0, end: 1.2 }, { id: "b", start: 1.2, end: 4 }] });
    assert.equal(beatReport(m).items.find((x) => x.kind === "cut").ms, 200);
    assert.equal(beatReport(meta({ fps: 60, hits: [1.25] })).max, 0);
  });
});

describe("captions and word timing", () => {
  const words = [
    { w: "Find", start: 0, end: 0.3 }, { w: "every", start: 0.35, end: 0.6 }, { w: "page.", start: 0.65, end: 1 },
    { w: "Then", start: 2, end: 2.2 }, { w: "move", start: 2.25, end: 2.5 },
  ];
  test("caption lines break at sentence ends and long pauses", () => {
    assert.deepEqual(M.captionGroups(words).map((g) => g.words.map((w) => w.w).join(" ")), ["Find every page.", "Then move"]);
  });
  test("a sentence end breaks the caption line even without a pause", () => {
    const quick = [{ w: "Done.", start: 0, end: 0.3 }, { w: "Next", start: 0.35, end: 0.6 }];
    assert.equal(M.captionGroups(quick).length, 2);
  });
  test("a caption line holds at most the given number of words", () => {
    assert.ok(M.captionGroups(words, 2).every((g) => g.words.length <= 2));
  });
  test("the spoken word is the active one", () => {
    const at = M.captionAt(M.captionGroups(words), 0.4);
    assert.equal(at.group.words[at.active].w, "every");
  });
  test("a new caption line replaces the previous one as soon as it starts", () => {
    const tight = [{ w: "One.", start: 0, end: 0.5 }, { w: "Two", start: 0.6, end: 0.9 }];
    assert.equal(M.captionAt(M.captionGroups(tight), 0.65).group.words[0].w, "Two");
  });
  test("no caption shows in a pause", () => assert.equal(M.captionAt(M.captionGroups(words), 1.6), null));
  test("a pop-in can be timed to a spoken word", () => assert.equal(M.wordTime(words, "move"), 2.25));
  test("asking for a word that was never said fails loudly", () => assert.throws(() => M.wordTime(words, "pricing"), /not in the voice/));
  test("word timings move with their voice line", () => assert.equal(M.shiftWords(words, 10)[0].start, 10));
});
