#!/usr/bin/env node
// Usage:
//   node voice.mjs <film-dir> lines.json [--voice Ryan|clone:me.wav] [--provider local|elevenlabs]
//     lines.json: [{ "id": "hook", "text": "..." }, ...]
//   node voice.mjs <film-dir> --transcribe assets/me.mp4     (on-camera mode: word timings of a filmed take)
// Writes assets/vo/<id>.wav, assets/vo/<id>.words.json and voice.js (window.VOICE) for the film page.
// One voice, one style, one take: the whole script is generated in a single pass and cut into lines,
// so delivery never changes between lines. --per-line generates each line separately (not recommended).
// --tempo 1.15 speeds the take up without changing pitch; --reuse-take re-cuts the existing take.wav.
// Default provider is free and local (Qwen3-TTS via tools/say, whisper word timings). Run setup.sh once.
// ElevenLabs runs only when asked for and ELEVENLABS_API_KEY is set.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { SKILL } from "./_util.mjs";
import { args, filmDir, abs, run } from "./_util.mjs";
import { splitTake } from "../lib/voice.mjs";

const TOOLS = process.env.DEMO_TOOLS ?? join(SKILL, "tools");
const a = args();
const dir = filmDir(a);
const vo = join(dir, "assets", "vo");
mkdirSync(vo, { recursive: true });
const duration = (p) => +(+run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p])).toFixed(3);

function whisperWords(wav) {
  run(join(TOOLS, "words"), [wav]);
  return JSON.parse(readFileSync(wav.replace(/\.[^.]+$/, ".words.json"), "utf8"));
}

async function eleven(text, out, voiceId) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not set: use the free local provider instead");
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
  });
  if (!r.ok) throw new Error(`elevenlabs: HTTP ${r.status} ${await r.text()}`);
  const j = await r.json();
  const mp3 = out.replace(/\.wav$/, ".mp3");
  writeFileSync(mp3, Buffer.from(j.audio_base64, "base64"));
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", mp3, "-ar", "48000", out]);
  return charsToWords(j.alignment);
}

/** ElevenLabs gives character timings; join them into words. */
export function charsToWords(al) {
  const words = [];
  let cur = null;
  al.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) { if (cur) words.push(cur); cur = null; return; }
    if (!cur) cur = { w: "", start: al.character_start_times_seconds[i], end: 0 };
    cur.w += ch;
    cur.end = al.character_end_times_seconds[i];
  });
  if (cur) words.push(cur);
  return words;
}

const voice = existsSync(join(dir, "voice.json")) ? JSON.parse(readFileSync(join(dir, "voice.json"), "utf8")) : {};
if (a.transcribe) {
  const src = abs(dir, a.transcribe);
  const wav = join(vo, `${basename(src).replace(/\.[^.]+$/, "")}.wav`);
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-vn", "-ac", "1", "-ar", "48000", wav]);
  const words = whisperWords(wav);
  voice.take = { src: a.transcribe, dur: duration(src), words };
  console.log(`voice: ${words.length} words timed from ${a.transcribe}`);
} else {
  const lines = JSON.parse(readFileSync(abs(dir, a._[1] ?? "lines.json"), "utf8"));
  const style = a.style ?? "Confident, focused founder voice. Steady pace, clear and direct, quietly energetic.";
  const speak = async (text, out) => {
    if (a.provider === "elevenlabs") return eleven(text, out, a.voice ?? "21m00Tcm4TlvDq8ikWAM");
    run(join(TOOLS, "say"), [text, out, a.voice ?? "Ryan"], { env: { ...process.env, SAY_STYLE: style } });
    return whisperWords(out);
  };
  if (a["per-line"]) {
    for (const l of lines) {
      const out = join(vo, `${l.id}.wav`);
      const words = await speak(l.text, out);
      voice[l.id] = { src: `assets/vo/${l.id}.wav`, dur: duration(out), text: l.text, words };
      console.log(`  ${l.id}: ${voice[l.id].dur} s, ${words.length} words`);
    }
  } else {
    // the whole script in one take, then cut at the pauses between lines
    const takeWav = join(vo, "take.wav");
    let words;
    if (a["reuse-take"] && existsSync(takeWav)) words = whisperWords(takeWav);
    else words = await speak(lines.map((l) => l.text.trim()).join(" "), takeWav);
    // --tempo 1.15 speeds the whole take without changing pitch (TTS often reads slower than a person)
    if (a.tempo && +a.tempo !== 1) {
      const fast = join(vo, "take-fast.wav");
      run("ffmpeg", ["-y", "-loglevel", "error", "-i", takeWav, "-af", `atempo=${+a.tempo}`, "-ar", "48000", fast]);
      run("mv", [fast, takeWav]);
      words = whisperWords(takeWav);
    }
    const parts = splitTake(lines.map((l) => l.text), words, duration(takeWav));
    lines.forEach((l, k) => {
      const out = join(vo, `${l.id}.wav`);
      const { from, to } = parts[k];
      run("ffmpeg", ["-y", "-loglevel", "error", "-i", takeWav, "-af", `atrim=${from}:${to},asetpts=PTS-STARTPTS,afade=t=in:d=0.01,afade=t=out:st=${Math.max(0, to - from - 0.03)}:d=0.03`, "-ar", "48000", out]);
      voice[l.id] = { src: `assets/vo/${l.id}.wav`, dur: duration(out), text: l.text, words: parts[k].words };
      console.log(`  ${l.id}: ${voice[l.id].dur} s, ${parts[k].words.length} words, cut from the one take at ${from} s`);
    });
  }
}
writeFileSync(join(dir, "voice.json"), JSON.stringify(voice, null, 1));
writeFileSync(join(dir, "voice.js"), `// generated by voice.mjs: line durations and word timings\nwindow.VOICE = ${JSON.stringify(voice)};\n`);
console.log("voice: wrote voice.js");
