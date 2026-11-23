// voice.mjs end to end with real ffmpeg. The TTS and whisper are fakes (DEMO_TOOLS): the fake voice is
// 6 s of noise per call and the fake transcriber spaces the words evenly. The real Qwen3-TTS is not run here.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const SKILL = join(import.meta.dirname, "..");
const dur = (f) => Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).stdout.toString());
const voice = (dir, tools, extra) => {
  const r = spawnSync("node", [join(SKILL, "scripts", "voice.mjs"), dir, "lines.json", ...extra], { env: { ...process.env, DEMO_TOOLS: tools }, encoding: "utf8" });
  if (r.status) throw new Error(r.stderr);
  return r.stdout;
};

describe("voice speed-up (--tempo)", () => {
  let dir, tools, calls;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "tempo-"));
    tools = join(dir, "fake-tools");
    mkdirSync(tools);
    calls = join(dir, "say-calls");
    writeFileSync(join(tools, "say"), `#!/bin/sh\necho x >> "${calls}"\nffmpeg -loglevel error -y -f lavfi -i "anoisesrc=d=6:a=0.1" -ar 48000 -ac 1 "$2"\n`);
    // six words spread over the file's length, the last one ending just before the end
    writeFileSync(join(tools, "words"), `#!/bin/sh\nd=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$1")\npython3 -c "
import json,sys; d=float(sys.argv[1]); ws='One two three. Four five six.'.split(); s=d/len(ws)
json.dump([{'w':w,'start':round(i*s,3),'end':round(i*s+s*0.8,3)} for i,w in enumerate(ws)], open(sys.argv[2],'w'))" "$d" "\${1%.*}.words.json"\n`);
    chmodSync(join(tools, "say"), 0o755);
    chmodSync(join(tools, "words"), 0o755);
    writeFileSync(join(dir, "index.html"), "<!doctype html>");
    writeFileSync(join(dir, "lines.json"), JSON.stringify([{ id: "a", text: "One two three." }, { id: "b", text: "Four five six." }]));
  });

  test("keeps the voice as generated in take-raw.wav", () => {
    voice(dir, tools, ["--tempo", "1.2"]);
    assert.ok(existsSync(join(dir, "assets", "vo", "take-raw.wav")));
    assert.ok(Math.abs(dur(join(dir, "assets", "vo", "take-raw.wav")) - 6) < 0.1);
  });
  test("the take the film uses is shorter by the tempo", () => assert.ok(Math.abs(dur(join(dir, "assets", "vo", "take.wav")) - 5) < 0.1));
  test("re-cutting at the same tempo does not speed it up twice", () => {
    voice(dir, tools, ["--reuse-take", "--tempo", "1.2"]);
    assert.ok(Math.abs(dur(join(dir, "assets", "vo", "take.wav")) - 5) < 0.1);
  });
  test("re-cutting at another tempo starts from the raw take", () => {
    voice(dir, tools, ["--reuse-take", "--tempo", "1.5"]);
    assert.ok(Math.abs(dur(join(dir, "assets", "vo", "take.wav")) - 4) < 0.1);
  });
  test("re-cutting never calls the voice model again", () => assert.equal(readFileSync(calls, "utf8").trim().split("\n").length, 1));
  test("no tempo gives back the raw take's length", () => {
    voice(dir, tools, ["--reuse-take"]);
    assert.ok(Math.abs(dur(join(dir, "assets", "vo", "take.wav")) - 6) < 0.1);
  });
  test("each line is cut from the sped-up take", () => {
    voice(dir, tools, ["--reuse-take", "--tempo", "1.2"]);
    const v = JSON.parse(readFileSync(join(dir, "voice.json"), "utf8"));
    assert.ok(Math.abs(v.a.dur + v.b.dur - 5) < 0.15, `${v.a.dur} + ${v.b.dur}`);
  });
});
