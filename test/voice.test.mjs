import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { lineEnds, splitTake } from "../lib/voice.mjs";

const take = (text, gapAfter = {}) => {
  let t = 0;
  return text.split(" ").map((w, i) => { const s = t; t += 0.3; const o = { w, start: s, end: s + 0.25 }; t += gapAfter[i] ?? 0; return o; });
};

describe("one voice, one take, cut into lines", () => {
  test("each line ends on its own last word", () => {
    const words = take("Your apps break. One command answers it.");
    assert.deepEqual(lineEnds(["Your apps break.", "One command answers it."], words), [2, 6]);
  });
  test("a number read out as words still finds the right boundary", () => {
    const words = take("On the thirty-first of January apps break. One command answers it.");
    assert.deepEqual(lineEnds(["On the 31st of January apps break.", "One command answers it."], words), [6, 10]);
  });
  test("the cut sits halfway through the pause between lines", () => {
    const words = take("Apps break. One command.", { 1: 0.4 });
    const [a, b] = splitTake(["Apps break.", "One command."], words, 2);
    assert.ok(Math.abs(a.to - (words[1].end + words[2].start) / 2) < 1e-9);
    assert.equal(b.from, a.to);
  });
  test("word times are re-timed to the start of their line", () => {
    const words = take("Apps break. One command.");
    const [, b] = splitTake(["Apps break.", "One command."], words, 2);
    assert.ok(Math.abs(b.words[0].start - (words[2].start - b.from)) < 1e-9);
    assert.ok(b.words[0].start >= 0);
  });
  test("the last line runs to the end of the take", () => {
    const parts = splitTake(["Apps break.", "One command."], take("Apps break. One command."), 3.5);
    assert.equal(parts[1].to, 3.5);
  });
  test("every word lands in exactly one line", () => {
    const words = take("A b c. D e. F g h.");
    const parts = splitTake(["A b c.", "D e.", "F g h."], words, 4);
    assert.equal(parts.reduce((n, p) => n + p.words.length, 0), words.length);
  });
});
