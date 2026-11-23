import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { stitchArgs } from "../lib/audio.mjs";
import { framesFor, viewport, frameName, frameCount } from "../lib/frames.mjs";
import { categorize, resolveName, slug } from "../lib/sfx.mjs";

const base = { fps: 30, width: 1920, height: 1080, duration: 10, audio: {} };
const build = (audio) => stitchArgs({ ...base, audio }, { frames: "f_%05d.png", out: "o.mp4", resolve: (s) => `/abs/${s}` });
const graph = (args) => args[args.indexOf("-filter_complex") + 1];

describe("stitching and the audio mix", () => {
  test("frames alone make a silent video", () => {
    const a = build({});
    assert.ok(a.includes("-an"));
    assert.ok(!graph(a).includes("[a]"));
  });
  test("a sound effect starts at its time in milliseconds", () => {
    assert.match(graph(build({ sfx: [{ name: "pop", at: 1.25 }] })), /adelay=1250:all=1/);
  });
  test("a piece of a long sound can be cut out and placed", () => {
    const g = graph(build({ sfx: [{ name: "riser", at: 2, start: 7, duration: 3 }] }));
    assert.match(g, /atrim=7:10,asetpts=PTS-STARTPTS,afade=t=out:st=2.92:d=0.08,adelay=2000/);
  });
  test("sound effects are found through the resolver", () => {
    assert.ok(build({ sfx: [{ name: "pop", at: 0 }] }).includes("/abs/pop"));
  });
  test("a sound used many times is read from disk once", () => {
    const a = build({ sfx: [{ name: "tick", at: 0.1 }, { name: "tick", at: 0.2 }, { name: "tick", at: 0.3 }] });
    assert.equal(a.filter((x) => x === "/abs/tick").length, 1);
    assert.match(graph(a), /asplit=3/);
  });
  test("sound effects duck under the voice so the voice stays on top", () => {
    assert.match(graph(build({ voice: [{ src: "a.wav", at: 0 }], sfx: [{ name: "pop", at: 1 }] })), /\[fx\]\[sc2\]sidechaincompress/);
  });
  test("sound effects without a voice are not ducked", () => {
    assert.ok(!graph(build({ sfx: [{ name: "pop", at: 1 }] })).includes("sidechaincompress"));
  });
  test("each voice line starts at its own time", () => {
    const g = graph(build({ voice: [{ src: "a.wav", at: 0.5 }, { src: "b.wav", at: 4 }] }));
    assert.match(g, /adelay=500:all=1/);
    assert.match(g, /adelay=4000:all=1/);
  });
  test("music ducks under the voice", () => {
    assert.match(graph(build({ music: { src: "m.mp3" }, voice: [{ src: "a.wav", at: 0 }] })), /sidechaincompress/);
  });
  test("music without a voice is not ducked", () => {
    assert.doesNotMatch(graph(build({ music: { src: "m.mp3" } })), /sidechaincompress/);
  });
  test("music fades out at the end of the film", () => {
    assert.match(graph(build({ music: { src: "m.mp3", fadeOut: 2 } })), /afade=t=out:st=8:d=2/);
  });
  test("the final mix is normalised to -16 LUFS", () => assert.match(graph(build({ sfx: [{ name: "pop", at: 0 }] })), /loudnorm=I=-16/));
  test("the video is cut to the film's length", () => {
    const a = build({});
    assert.equal(a[a.indexOf("-t") + 1], "10");
  });
  test("on-camera mode lays the frames over the filmed video and keeps its sound", () => {
    const g = graph(build({ under: { src: "me.mp4" } }));
    assert.match(g, /\[bg\]\[0:v\]overlay/);
    assert.match(g, /\[1:a\]aresample/);
  });
});

describe("frames to capture", () => {
  const meta = { fps: 30, duration: 4, scenes: [{ id: "a", start: 0, end: 2 }, { id: "b", start: 2, end: 4 }] };
  test("a full render captures every frame", () => assert.equal(framesFor(meta).length, frameCount(meta)));
  test("re-rendering a scene captures only its frames", () => {
    const f = framesFor(meta, ["b"]);
    assert.equal(f[0], 60);
    assert.equal(f.length, 60);
  });
  test("re-rendering the first scene stops where the next one starts", () => {
    const f = framesFor(meta, ["a"]);
    assert.equal(f.length, 60);
    assert.equal(f[f.length - 1], 59);
  });
  test("an unknown scene name is refused with the real names", () => assert.throws(() => framesFor(meta, ["x"]), /scenes: a, b/));
  test("frame files sort in order", () => assert.equal(frameName(7), "f_00007.png"));
});

describe("aspect ratios", () => {
  test("16:9 is 1920 by 1080", () => assert.deepEqual(viewport("16:9"), { width: 1920, height: 1080 }));
  test("9:16 is 1080 by 1920", () => assert.deepEqual(viewport("9:16"), { width: 1080, height: 1920 }));
  test("1:1 is 1080 square", () => assert.deepEqual(viewport("1:1"), { width: 1080, height: 1080 }));
  test("4:5 is 1080 by 1350", () => assert.deepEqual(viewport("4:5"), { width: 1080, height: 1350 }));
  test("an exact size can be given", () => assert.deepEqual(viewport("640x360"), { width: 640, height: 360 }));
  test("an unknown ratio is refused", () => assert.throws(() => viewport("3:2"), /unknown aspect/));
});

describe("sound effect library", () => {
  const index = [
    { name: "whoosh-short", category: "whoosh", duration: 0.5 },
    { name: "whoosh", category: "whoosh", duration: 0.6 },
    { name: "pop", category: "pop", duration: 0.7 },
  ];
  test("a sound is found by its exact name", () => assert.equal(resolveName(index, "whoosh").name, "whoosh"));
  test("a sound is found by the start of its name", () => assert.equal(resolveName(index, "whoosh-s").name, "whoosh-short"));
  test("a category gives its shortest sound", () => assert.equal(resolveName([{ name: "a", category: "impact", duration: 2 }, { name: "b", category: "impact", duration: 1 }], "impact").name, "b"));
  test("an unknown sound gives nothing", () => assert.equal(resolveName(index, "kazoo"), null));
  test("titles are sorted into categories", () => {
    assert.equal(categorize("Deep Whoosh #1"), "whoosh");
    assert.equal(categorize("mouse click 2"), "click");
    assert.equal(categorize("bass impact"), "impact");
    assert.equal(categorize("Rising tension riser"), "riser");
    assert.equal(categorize("weird noise"), "misc");
    assert.equal(categorize("maximize_002"), "transition");
    assert.equal(categorize("bfh1_metal_hit_05"), "impact");
    assert.equal(categorize("phaserUp3"), "scifi");
    assert.equal(categorize("spring_08"), "cartoon");
  });
  test("file names are safe", () => assert.equal(slug("Swosh / swoosh — air!"), "swosh-swoosh-air"));
});
