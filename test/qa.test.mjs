import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { gap, collisions, unsafe, overFace, brandShown, soundEvents, autoSfx, runsOf, SAFE } from "../lib/qa.mjs";

const obj = (id, box, extra = {}) => ({ id, kind: "text", text: id, box, anc: [], ...extra });

describe("elements must not overlap or touch", () => {
  test("two boxes apart have a positive gap", () => assert.equal(gap([0, 0, 10, 10], [20, 0, 10, 10]), 10));
  test("boxes that share an edge touch", () => assert.equal(gap([0, 0, 10, 10], [10, 0, 10, 10]), 0));
  test("overlapping boxes have a negative gap", () => assert.ok(gap([0, 0, 10, 10], [5, 5, 10, 10]) < 0));
  test("an overlap between two elements is reported", () => {
    const c = collisions([obj("a", [0, 0, 100, 50]), obj("b", [80, 10, 100, 50])]);
    assert.equal(c[0].kind, "overlap");
  });
  test("elements closer than the touch distance are reported as touching", () => {
    assert.equal(collisions([obj("a", [0, 0, 100, 50]), obj("b", [101, 0, 100, 50])])[0].kind, "touch");
  });
  test("elements with room between them pass", () => assert.equal(collisions([obj("a", [0, 0, 100, 50]), obj("b", [140, 0, 100, 50])]).length, 0));
  test("text on its own card is not a collision", () => {
    assert.equal(collisions([obj("card", [0, 0, 300, 200], { kind: "card" }), obj("t", [20, 20, 100, 30], { anc: ["card"] })]).length, 0);
  });
  test("parts of one thing marked as a group may touch each other", () => {
    assert.equal(collisions([obj("l", [0, 0, 100, 10], { group: "line" }), obj("r", [100, 0, 100, 10], { group: "line" })]).length, 0);
  });
  test("parts of different groups still collide", () => {
    assert.equal(collisions([obj("l", [0, 0, 100, 10], { group: "a" }), obj("r", [100, 0, 100, 10], { group: "b" })]).length, 1);
  });
  test("an element marked overlap-ok is skipped", () => {
    assert.equal(collisions([obj("a", [0, 0, 100, 50], { ok: true }), obj("b", [10, 10, 100, 50])]).length, 0);
  });
});

describe("text stays out of the platform's buttons and caption", () => {
  const reel = SAFE["instagram-reel"];
  test("vertical social video keeps the top 10%, bottom 20% and right 15% clear", () => {
    assert.deepEqual([reel.top, reel.bottom, reel.right], [0.1, 0.2, 0.15]);
  });
  test("text in the bottom 20% is reported", () => assert.equal(unsafe([obj("cap", [100, 1600, 400, 80])], "instagram-reel", 1080, 1920).length, 1));
  test("text in the right 15% is reported", () => assert.equal(unsafe([obj("side", [900, 800, 100, 80])], "instagram-reel", 1080, 1920).length, 1));
  test("text in the top 10% is reported", () => assert.equal(unsafe([obj("top", [100, 100, 400, 80])], "instagram-reel", 1080, 1920).length, 1));
  test("text inside the safe area passes", () => assert.equal(unsafe([obj("ok", [100, 800, 400, 80])], "instagram-reel", 1080, 1920).length, 0));
  test("images may bleed into the margins", () => {
    assert.equal(unsafe([obj("img", [0, 0, 1080, 1920], { kind: "media" })], "instagram-reel", 1080, 1920).length, 0);
  });
});

describe("nothing covers the face", () => {
  const face = [0.4, 0.2, 0.2, 0.2];
  test("a card over the face is reported", () => assert.equal(overFace([obj("c", [450, 450, 200, 200])], face, 1080, 1920).length, 1));
  test("a card beside the face passes", () => assert.equal(overFace([obj("c", [50, 1200, 200, 200])], face, 1080, 1920).length, 0));
  test("the face box is padded so text can't graze it", () => {
    const justOutside = [0.4 * 1080 - 60, 400, 50, 50]; // ends 10 px left of the raw box
    assert.equal(overFace([obj("c", justOutside)], face, 1080, 1920).length, 1);
  });
  test("no face found means nothing to protect", () => assert.equal(overFace([obj("c", [0, 0, 10, 10])], null, 1080, 1920).length, 0));
});

describe("the opening is the viewer's problem, not the logo", () => {
  test("the brand name on screen is found, in any case", () => assert.deepEqual(brandShown([obj("h1", [0, 0, 1, 1], { text: "Meet ACME" })], ["Acme"]), ["h1"]));
  test("an element marked data-brand is found without text", () => assert.equal(brandShown([obj("logo", [0, 0, 1, 1], { text: "", brand: true })], []).length, 1));
  test("the pain point without the brand passes", () => assert.equal(brandShown([obj("h1", [0, 0, 1, 1], { text: "Your apps break on 31 Jan" })], ["Acme"]).length, 0));
});

describe("a sound on everything that appears or moves", () => {
  const frames = (list) => list.map(([t, objects]) => ({ t, objects }));
  test("a word appearing gets a sound", () => {
    const e = soundEvents(frames([[0, []], [0.033, [obj("w", [0, 0, 50, 20])]]]));
    assert.deepEqual(e.map((x) => [x.kind, x.t]), [["text", 0.033]]);
  });
  test("every digit change of a counter ticks", () => {
    const n = (t, v) => [t, [obj("n", [0, 0, 50, 20], { text: v })]];
    const e = soundEvents(frames([n(0, "1"), n(0.1, "2"), n(0.2, "3")]));
    assert.equal(e.filter((x) => x.kind === "tick").length, 2);
  });
  test("ticks closer than the minimum gap are thinned so they don't turn to noise", () => {
    const n = (t, v) => [t, [obj("n", [0, 0, 50, 20], { text: String(v) })]];
    const e = soundEvents(frames([n(0, 1), n(0.01, 2), n(0.02, 3), n(0.1, 4)]));
    assert.equal(e.filter((x) => x.kind === "tick").length, 2);
  });
  test("text that changes without digits does not tick", () => {
    const e = soundEvents(frames([[0, [obj("w", [0, 0, 5, 5], { text: "a" })]], [0.1, [obj("w", [0, 0, 5, 5], { text: "b" })]]]));
    assert.equal(e.filter((x) => x.kind === "tick").length, 0);
  });
  test("an object starting to move gets a whoosh and its landing gets a hit", () => {
    const at = (t, x) => [t, [obj("c", [x, 0, 100, 100], { kind: "card" })]];
    const e = soundEvents(frames([at(0, 0), at(0.05, 0), at(0.1, 200), at(0.15, 400), at(0.2, 400), at(0.4, 400)]));
    assert.deepEqual(e.filter((x) => x.kind !== "card").map((x) => [x.kind, x.t]), [["move", 0.1], ["land", 0.2]]);
  });
  test("text growing word by word is not a move", () => {
    const at = (t, w) => [t, [obj("cap", [100, 900, w, 50])]];
    const e = soundEvents(frames([at(0, 60), at(0.1, 200), at(0.2, 380), at(0.3, 520)]));
    assert.equal(e.filter((x) => x.kind === "move").length, 0);
  });
  test("a pop in scale is not a move", () => {
    const at = (t, s) => [t, [obj("c", [500 - 50 * s, 500 - 50 * s, 100 * s, 100 * s], { kind: "card" })]];
    const e = soundEvents(frames([at(0, 0.2), at(0.05, 0.8), at(0.1, 1.3), at(0.15, 1)]));
    assert.equal(e.filter((x) => x.kind === "move").length, 0);
  });
  test("words appearing close together get one sound, not one each", () => {
    const e = soundEvents(frames([[0, [obj("a", [0, 0, 5, 5])]], [0.1, [obj("a", [0, 0, 5, 5]), obj("b", [10, 0, 5, 5])]], [0.2, [obj("a", [0, 0, 5, 5]), obj("b", [10, 0, 5, 5]), obj("c", [20, 0, 5, 5])]]]));
    assert.equal(e.filter((x) => x.kind === "text").length, 1);
  });
  test("subtitles marked silent get no sounds", () => {
    const e = soundEvents(frames([[0, []], [0.1, [obj("cap", [0, 0, 50, 20], { quiet: true })]]]));
    assert.equal(e.length, 0);
  });
  test("a slow drift is not a move", () => {
    const at = (t, x) => [t, [obj("c", [x, 0, 100, 100], { kind: "card" })]];
    const e = soundEvents(frames([at(0, 0), at(0.1, 1), at(0.2, 2)]), { height: 1080 });
    assert.equal(e.filter((x) => x.kind === "move").length, 0);
  });
  test("an object that leaves and comes back sounds again", () => {
    const e = soundEvents(frames([[0, [obj("w", [0, 0, 5, 5])]], [0.3, []], [0.6, [obj("w", [0, 0, 5, 5])]]]));
    assert.equal(e.filter((x) => x.kind === "text").length, 2);
  });
  test("an auto sound next to a hand-placed one is dropped", () => {
    const s = autoSfx([{ kind: "text", t: 1, size: 0 }, { kind: "text", t: 2, size: 0 }], [{ at: 1.02 }]);
    assert.deepEqual(s.map((x) => x.at), [2]);
  });
  test("auto sounds rotate through several takes", () => {
    const s = autoSfx([0, 1, 2].map((t) => ({ kind: "text", t, size: 0 })));
    assert.equal(new Set(s.map((x) => x.name)).size, 3);
  });
  test("bigger objects get louder sounds", () => {
    const [small, big] = autoSfx([{ kind: "card", t: 0, size: 0 }, { kind: "card", t: 1, size: 1 }]);
    assert.ok(big.volume > small.volume);
  });
  test("auto sounds are not held to the beat or expected to start motion", () => {
    const [s] = autoSfx([{ kind: "text", t: 0, size: 0 }]);
    assert.equal(s.word, true);
    assert.equal(s.cue, false);
  });
});

describe("problems are grouped into runs of frames", () => {
  test("the same problem on neighbouring frames is one run", () => {
    const r = runsOf([0, 1, 2, 3].map((f) => ({ key: "a/b", t: f / 30 })), 30);
    assert.deepEqual(r.map((x) => [x.first, x.last]), [[0, 3]]);
  });
  test("the same problem coming back later is a second run", () => {
    const r = runsOf([0, 1, 20].map((f) => ({ key: "a/b", t: f / 30 })), 30);
    assert.equal(r.length, 2);
  });
});
