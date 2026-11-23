// voice.mjs directed mode with real ffmpeg. The TTS and whisper are fakes (DEMO_TOOLS): the fake voice logs
// the style it was asked for and writes noise whose length is set per line; the real Qwen3-TTS is not run here.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const SKILL = join(import.meta.dirname, "..");
const run = (dir, tools, extra = []) => {
  const r = spawnSync("node", [join(SKILL, "scripts", "voice.mjs"), dir, "lines.json", ...extra], { env: { ...process.env, DEMO_TOOLS: tools }, encoding: "utf8" });
  if (r.status) throw new Error(r.stderr);
  return r.stdout;
};

describe("directed voice: each section acted on its own", () => {
  let dir, tools, log, out1, out2;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "directed-"));
    tools = join(dir, "fake-tools");
    mkdirSync(tools);
    log = join(dir, "say.log");
    // "slow" in the text makes a long file, so that line's pace is off from the others
    writeFileSync(join(tools, "say"), `#!/bin/sh\nprintf '%s|%s|%s\\n' "$1" "$3" "$SAY_STYLE" >> "${log}"\nd=2; case "$1" in *slow*) d=6;; esac\nffmpeg -loglevel error -y -f lavfi -i "anoisesrc=d=$d:a=0.1" -ar 48000 -ac 1 "$2"\n`);
    writeFileSync(join(tools, "words"), `#!/bin/sh\nd=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$1")\npython3 -c "
import json,sys; d=float(sys.argv[1]); ws=['a','b','c','d']; s=d/len(ws)
json.dump([{'w':w,'start':round(i*s,3),'end':round(i*s+s*0.8,3)} for i,w in enumerate(ws)], open(sys.argv[2],'w'))" "$d" "\${1%.*}.words.json"\n`);
    chmodSync(join(tools, "say"), 0o755);
    chmodSync(join(tools, "words"), 0o755);
    writeFileSync(join(dir, "index.html"), "<!doctype html>");
    writeFileSync(join(dir, "lines.json"), JSON.stringify([
      { id: "hook", text: "Your apps break now.", direction: "Hushed, like a secret.", stress: ["break"] },
      { id: "fix", text: "One command fixes it.", direction: "Bright lift.", stress: ["One command", "fixes"] },
      { id: "end", text: "This one is slow.", direction: "Warm." },
    ]));
    out1 = run(dir, tools, ["--style", "Base style."]);
    out2 = run(dir, tools, ["--style", "Base style.", "--only", "fix"]);
  });
  const calls = () => readFileSync(log, "utf8").trim().split("\n").map((l) => l.split("|"));

  test("acts each line in its own call", () => assert.deepEqual(calls().slice(0, 3).map((c) => c[0]), ["Your apps break now.", "One command fixes it.", "This one is slow."]));
  test("every line keeps the base style", () => calls().forEach((c) => assert.ok(c[2].startsWith("Base style."), c[2])));
  test("a line's direction is added to the style", () => assert.match(calls()[0][2], /Hushed, like a secret\./));
  test("stressed words are named in the style", () => assert.match(calls()[1][2], /emphasis on "One command", "fixes"/));
  test("a direction never leaks into the next line", () => assert.doesNotMatch(calls()[2][2], /Bright lift|Hushed/));
  test("every line uses the same voice", () => assert.equal(new Set(calls().map((c) => c[1])).size, 1));
  test("--only regenerates just the named line", () => {
    assert.equal(calls().length, 4);
    assert.equal(calls()[3][0], "One command fixes it.");
  });
  test("lines not named in --only keep their audio", () => assert.match(out2, /hook: .*\(kept\)/));
  test("flags a line whose pace is far from the others", () => assert.match(out1, /pace: end is -\d+% off the others/));
  test("does not flag lines at the shared pace", () => assert.doesNotMatch(out1, /pace: (hook|fix)/));
  test("writes each line's direction and stress into voice.json", () => {
    const v = JSON.parse(readFileSync(join(dir, "voice.json"), "utf8"));
    assert.equal(v.hook.direction, "Hushed, like a secret.");
    assert.deepEqual(v.fix.stress, ["One command", "fixes"]);
  });
});
