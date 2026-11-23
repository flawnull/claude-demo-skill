import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { scoreScenes, onsets, feelsSprung, sceneOfFrames, report } from "../lib/critic.mjs";

const meta = (scenes, extra = {}) => ({ fps: 30, scenes, audio: { sfx: [] }, hits: [], ...extra });
const one = meta([{ id: "s", start: 0, end: 2 }]);
// a sprung move: big change that decays over `len` frames
const move = (len, peak = 0.05) => Array.from({ length: len }, (_, i) => peak * Math.exp(-i / (len / 4)));
const still = (len) => new Array(len).fill(0);
const linear = (len, v = 0.02) => new Array(len).fill(v);

describe("the critic finds dead frames", () => {
  test("a scene where nothing moves fails", () => {
    const [s] = scoreScenes(one, still(60));
    assert.equal(s.pass, false);
    assert.ok(s.score < 3, String(s.score));
  });
  test("it names the dead run with its first and last frame", () => {
    const [s] = scoreScenes(one, [...move(10), ...still(50)]);
    assert.ok(s.notes.some((n) => n.includes("dead frames (f10 to f59)")), s.notes.join("|"));
  });
  test("a short still hold after a landing is allowed", () => {
    const [s] = scoreScenes(one, [...move(25), ...still(10), ...move(25)]);
    assert.equal(s.dead.length, 0);
  });
  test("a still run longer than the hold allowance costs points", () => {
    const short = scoreScenes(one, [...move(25), ...still(10), ...move(25)])[0].score;
    const long = scoreScenes(one, [...move(15), ...still(40), ...move(5)])[0].score;
    assert.ok(long < short);
  });
});

describe("the critic checks motion against cues", () => {
  test("motion that starts on a sound effect counts as on cue", () => {
    const m = meta([{ id: "s", start: 0, end: 2 }], { audio: { sfx: [{ at: 1 }] } });
    const [s] = scoreScenes(m, [...move(20), ...still(10), ...move(30)]);
    assert.equal(s.onsets.onCue, s.onsets.total);
  });
  test("motion that starts away from any cue is reported", () => {
    const [s] = scoreScenes(one, [...move(20), ...still(16), ...move(24)]);
    assert.ok(s.notes.some((n) => n.includes("off cue at f36")), s.notes.join("|"));
  });
  test("a riser marked cue: false is not expected to start motion", () => {
    const m = meta([{ id: "s", start: 0, end: 2 }], { audio: { sfx: [{ at: 1.5, cue: false }] } });
    const [s] = scoreScenes(m, [...move(30), ...still(30)]);
    assert.equal(s.cues.total, 1);
  });
  test("motion that starts on a spoken word counts as on cue", () => {
    const m = meta([{ id: "s", start: 0, end: 2 }], { cues: [{ at: 37 / 30 }] });
    const [s] = scoreScenes(m, [...move(20), ...still(17), ...move(23)]);
    assert.equal(s.onsets.onCue, s.onsets.total);
  });
  test("a sound effect over a still picture is reported", () => {
    const m = meta([{ id: "s", start: 0, end: 2 }], { audio: { sfx: [{ at: 1.5 }] } });
    const [s] = scoreScenes(m, [...move(30), ...still(30)]);
    assert.ok(s.notes.some((n) => n.includes("cue with no motion at f45")), s.notes.join("|"));
  });
  test("an onset is motion after stillness, not every change in a running move", () => {
    assert.deepEqual(onsets([0.05, 0.001, 0.05, 0.05, 0, 0, 0.05, 0.05, 0.05]), [0, 6]);
  });
  test("a one-frame blip is not an onset", () => {
    assert.deepEqual(onsets([0, 0, 0.004, 0, 0, 0, 0]), []);
  });
});

describe("the critic judges spring feel", () => {
  test("a move that peaks early and decays feels sprung", () => assert.equal(feelsSprung(move(20)), true));
  test("a constant-speed slide feels linear", () => assert.equal(feelsSprung(linear(20)), false));
  test("linear moves lower the score and are named", () => {
    const m = meta([{ id: "s", start: 0, end: 2 }], { audio: { sfx: [{ at: 1 }] } });
    const sprung = scoreScenes(m, [...move(20), ...still(10), ...move(20), ...still(10)])[0];
    const flat = scoreScenes(m, [...linear(20), ...still(10), ...linear(20), ...still(10)])[0];
    assert.ok(flat.score < sprung.score);
    assert.ok(flat.notes.some((n) => n.includes("feel linear")));
  });
  test("an exit that speeds into the cut is not judged as linear", () => {
    const [s] = scoreScenes(one, [...move(30), ...still(10), ...linear(20)]);
    assert.equal(s.moves.total, 1);
  });
});

describe("scoring and the report", () => {
  test("a lively, on-cue, sprung scene passes at 8 or more", () => {
    const m = meta([{ id: "s", start: 0, end: 2 }], { audio: { sfx: [{ at: 1 }] } });
    const [s] = scoreScenes(m, [...move(30), ...move(30)].map((v, i) => (i === 30 ? 0.05 : v)));
    assert.ok(s.pass, `${s.score} ${s.notes}`);
  });
  test("each frame belongs to the scene that started last", () => {
    const m = meta([{ id: "a", start: 0, end: 1 }, { id: "b", start: 0.5, end: 2 }]);
    const owner = sceneOfFrames(m, 60);
    assert.equal(owner[10], "a");
    assert.equal(owner[20], "b");
  });
  test("scores stay between 0 and 10", () => {
    for (const c of [still(60), move(60, 1), linear(60, 1)]) {
      const [s] = scoreScenes(one, c);
      assert.ok(s.score >= 0 && s.score <= 10);
    }
  });
  test("the report lists failing scenes to re-render", () => {
    const m = meta([{ id: "intro", start: 0, end: 1 }, { id: "end", start: 1, end: 2 }], { audio: { sfx: [{ at: 1 }] } });
    const r = report(scoreScenes(m, [...still(30), ...move(30)]));
    assert.match(r, /FAIL intro/);
    assert.match(r, /Re-render: intro/);
    assert.doesNotMatch(r, /Re-render:.*end/);
  });
  test("a stricter pass mark fails scenes that passed before", () => {
    const m = meta([{ id: "s", start: 0, end: 2 }], { audio: { sfx: [{ at: 1 }] } });
    const c = [...move(30), ...still(14), ...move(16)];
    assert.equal(scoreScenes(m, c, { pass: 10 })[0].pass, false);
  });
});
