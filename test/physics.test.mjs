import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const M = createRequire(import.meta.url)("../engine/motion.js");

describe("springs are closed form: position comes from time alone", () => {
  test("a spring sits at its start before release", () => {
    assert.equal(M.springUnit(0), 0);
    assert.equal(M.springUnit(-1), 0);
  });
  test("every preset settles on its target", () => {
    for (const preset of Object.keys(M.SPRINGS)) assert.ok(Math.abs(M.springUnit(5, { preset }) - 1) < 1e-3, preset);
  });
  test("an underdamped spring overshoots its target", () => {
    const peak = Math.max(...Array.from({ length: 200 }, (_, i) => M.springUnit(i / 200, { preset: "pop" })));
    assert.ok(peak > 1.05, `peak ${peak}`);
  });
  test("a critically damped spring never overshoots", () => {
    const k = 100, c = 20; // zeta exactly 1
    for (let i = 0; i < 300; i++) assert.ok(M.springUnit(i / 100, { stiffness: k, damping: c }) <= 1 + 1e-9);
  });
  test("an overdamped spring rises without overshoot", () => {
    let prev = 0;
    for (let i = 1; i < 300; i++) {
      const x = M.springUnit(i / 100, { stiffness: 100, damping: 40 });
      assert.ok(x >= prev - 1e-12 && x <= 1 + 1e-9);
      prev = x;
    }
  });
  test("the same time always gives the same value", () => {
    assert.equal(M.springUnit(0.37, { preset: "wobble" }), M.springUnit(0.37, { preset: "wobble" }));
  });
  for (const [regime, k, c] of [["underdamped", 320, 16], ["critically damped", 100, 20], ["overdamped", 100, 40]]) {
    test(`the ${regime} closed form matches a fine numerical simulation`, () => {
      let x = 0, v = 0;
      const dt = 1e-5;
      for (let t = 0; t < 0.3; t += dt) { const a = -k * (x - 1) - c * v; v += a * dt; x += v * dt; }
      assert.ok(Math.abs(x - M.springUnit(0.3, { stiffness: k, damping: c })) < 1e-3);
    });
  }
  test("initial velocity throws the spring forward early", () => {
    assert.ok(M.springUnit(0.02, { velocity: 20 }) > M.springUnit(0.02));
  });
  test("spring() maps the unit curve onto from and to", () => {
    assert.equal(M.spring(1, 2, 10, 20), 10);
    assert.ok(Math.abs(M.spring(10, 2, 10, 20) - 20) < 1e-6);
  });
  test("settle time predicts when the spring stops moving", () => {
    const opts = { preset: "pop" };
    const t = M.springSettle(opts);
    for (let i = 0; i < 50; i++) assert.ok(Math.abs(M.springUnit(t + i / 50, opts) - 1) < 0.002);
  });
});

describe("squash and stretch keeps volume", () => {
  test("stretch along the motion is matched by squash across it", () => {
    const { sx, sy } = M.squash(500);
    assert.ok(sy > 1 && sx < 1);
    assert.ok(Math.abs(sx * sy - 1) < 1e-12);
  });
  test("a still object is not deformed", () => assert.deepEqual(M.squash(0), { sx: 1, sy: 1 }));
  test("deformation is capped", () => assert.ok(M.squash(1e9, 0.001, 0.3).sy <= 1.3 + 1e-12));
});

describe("easing curves", () => {
  test("every curve starts at 0 and ends at 1", () => {
    for (const [name, f] of Object.entries(M.ease)) {
      assert.ok(Math.abs(f(0)) < 1e-9, name);
      assert.ok(Math.abs(f(1) - 1) < 1e-9, name);
    }
  });
  test("ease-out moves faster at the start than ease-in", () => assert.ok(M.ease.outCubic(0.2) > M.ease.inCubic(0.2)));
  test("tween holds its end values outside its window", () => {
    assert.equal(M.tween(-1, 0, 1, 5, 9), 5);
    assert.equal(M.tween(3, 0, 1, 5, 9), 9);
  });
  test("tween accepts an easing by name", () => assert.equal(M.tween(0.5, 0, 1, 0, 1, "linear"), 0.5));
});

describe("seeded random", () => {
  test("the same seed gives the same sequence", () => {
    const a = M.rng(42), b = M.rng(42);
    for (let i = 0; i < 10; i++) assert.equal(a(), b());
  });
  test("different seeds give different sequences", () => assert.notEqual(M.rng(1)(), M.rng(2)()));
});

describe("moves anticipate, then spring", () => {
  test("an object pulls back against its direction before it moves", () => {
    const early = M.move(0.05, 0, 0, 100, { pull: 0.1, pullTime: 0.1 });
    assert.ok(early < 0, String(early));
  });
  test("the pull back is the given share of the distance", () => {
    assert.ok(Math.abs(M.move(0.1, 0, 0, 100, { pull: 0.1, pullTime: 0.1 }) + 10) < 1e-9);
  });
  test("an object waits at its start until its time", () => assert.equal(M.move(-1, 0, 5, 9), 5));
  test("a move settles on its target", () => assert.ok(Math.abs(M.move(5, 0, 0, 100) - 100) < 0.1));
  test("velocity of a pure function is measured from time alone", () => assert.ok(Math.abs(M.vel((t) => 3 * t, 2) - 3) < 1e-9));
});

describe("directional motion blur", () => {
  test("blur follows the direction of the move", () => {
    const [bx, by] = M.motionBlurStd(0, 600, 1 / 30);
    assert.equal(bx, 0);
    assert.equal(by, 5);
  });
  test("blur is a quarter of the distance moved in one frame", () => assert.equal(M.motionBlurStd(480, 0, 1 / 30)[0], 4));
  test("blur is capped at 8 px so fast moves never smudge", () => assert.equal(M.motionBlurStd(1e6, 0, 1 / 30)[0], 8));
  test("slow moves get no blur at all", () => assert.equal(M.motionBlurStd(100, 0, 1 / 30)[0], 0));
});

describe("face boxes over time", () => {
  const faces = [{ t: 0, box: [0.4, 0.2, 0.2, 0.3] }, { t: 1, box: [0.6, 0.2, 0.2, 0.3] }];
  test("the face box is interpolated between samples", () => assert.ok(Math.abs(M.faceAt(faces, 0.5)[0] - 0.5) < 1e-9));
  test("before the first sample the first box holds", () => assert.equal(M.faceAt(faces, -1)[0], 0.4));
  test("no samples means no face", () => assert.equal(M.faceAt([], 0), null));
});

describe("objects start apart, not together", () => {
  test("by default objects start 3 frames apart", () => {
    const t = M.staggerTimes(3, 1);
    assert.ok(Math.abs(t[1] - t[0] - 3 / 30) < 1e-9 && Math.abs(t[2] - t[1] - 3 / 30) < 1e-9);
  });
  test("the first object starts at the given time", () => assert.equal(M.staggerTimes(2, 1.5)[0], 1.5));
});
