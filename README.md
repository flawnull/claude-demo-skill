# /demo: product videos from Claude Code

A Claude Code skill that turns a short brief into a finished product video: script, one-take voiceover, real footage of your app, motion graphics, music, sound effects and captions. Everything runs on your machine with free tools.

[![The launch film for this repo, made with /demo](media/preview.gif)](media/demo.mp4)

▶ [Watch the 48 s launch film](media/demo.mp4). It was made with this skill; the source is in [`examples/launch`](examples/launch).

## Why

AI-made demo videos all look the same: slides, a robot voice, music from a toy ad, text that fades in from nowhere. This skill holds the film to the rules a motion designer works by, and it checks its own output before you see it.

- **Cuts on the beat.** Scenes are measured in beats. Every cut and hit lands on a whole frame of the music's grid, and the build reports how far off it is (`off-beat: 0 ms`).
- **A voice that acts, not reads.** Each line gets a direction (hushed, lifted, firm, warm) and the words to stress, voiced by one warm narrator. Pace and loudness are checked line against line, so it never drifts. Pop-ins land on the spoken word.
- **Your real app.** Footage comes from Playwright driving your actual product, with a visible cursor and timed frames. Waits are cut out and labelled "Sped up 32×". No fake UI.
- **Real physics.** Closed-form springs, anticipation, squash, 3-frame staggers and motion blur only while something travels. Each frame is a pure function of time, so every render is identical.
- **A critic that re-renders.** Every scene is scored out of 10 for dead frames, motion that misses its cue, and moves that feel linear. Anything under 8 gets fixed and rendered again.
- **Layout QA.** Every frame is checked 33 ms apart for overlapping text, safe-area misses and faces covered by cards. Any problem fails the build.
- **Sound on every move.** 210 recorded CC0 sounds are placed automatically, one per card, number change, move and landing, ducked under the voice. There's no synthesized beeping.
- **Style lint.** It flags frosted glass, glows, gradient washes, lorem ipsum, round placeholder numbers and colours outside the palette before anything renders.

## Install

```sh
git clone https://github.com/flawnull/claude-demo-skill ~/.claude/skills/demo
cd ~/.claude/skills/demo && ./setup.sh
```

`setup.sh` installs:
- the Node packages and headless Chromium;
- ffmpeg and whisper.cpp, through Homebrew;
- OpenCV, for face-safe layouts;
- the Qwen3-TTS voice, which needs Apple Silicon. Use `./setup.sh --no-voice` to skip it and bring your own narration.

Then, in Claude Code:

```
/demo a 45 s launch film for my CLI that finds broken links. Real terminal footage, confident tone.
```

Claude asks at most three questions, then writes the script and voices it. It records your app, builds the film, renders it, runs the critic and QA until everything passes, and hands you an MP4.

## What a run looks like

```
lint: clean
beats: 16 cuts and hits, 15.00 frames per beat, off-beat: 0 ms
- PASS quote 9.8/10   live 95%, onsets on cue 2/2, sprung moves 2/2
- FAIL notice 7.5/10  2 of 4 moves feel linear (no ease-out or spring)
- PASS attach 8.8/10  ...
layout: 62 problems in build/qa.md (look at build/qa/flagged.png)
next pass: fix notice, then run film.mjs --scene notice
```

It fixes the failing scenes, re-renders only those, and stops when every scene is at 8 or above, the layout check is clean and the cuts are on the beat.

## What's inside

| Path | What it does |
|---|---|
| `SKILL.md` | The instructions Claude follows: brief, script, voice, footage, motion, sound, checks |
| `engine/motion.js` | Frame engine: springs, `move` with anticipation, kinetic type, captions, clear glass, beat grid |
| `scripts/film.mjs` | One command: lint, capture, beat check, critic, layout QA, stitch |
| `scripts/voice.mjs` | Directed narration: per-line direction and stress, pace check, `--only`, `--tempo` |
| `lib/record.mjs` | Real web footage: cursor, eased moves, timed frames that never drift |
| `scripts/name-check.mjs` | Checks a made-up product name against the App Store and GitHub |
| `sfx/` | 210 recorded sounds, all CC0, indexed by kind and length |
| `examples/launch/` | The film at the top of this page |

## Requirements

- Node 20 or newer, and ffmpeg.
- macOS on Apple Silicon for the bundled voice. Other systems can do everything else: record your own narration, or use `--provider elevenlabs` with your own key.
- About 3 GB of disk for the voice model, downloaded on first use.

## Tests

```sh
npm test
```

244 tests. The pipeline tests run against real Chromium and ffmpeg, not mocks.

## Credits and licence

Code: MIT. Sounds: CC0, with sources in `sfx/index.json` and `sfx/CREDITS.md`. Music in the example: "Down to Business" (CC0, OpenGameArt). Font in the example: Archivo (SIL Open Font License, `examples/launch/assets/fonts/OFL.txt`). The example's footage is the open-source [Watchtower](https://github.com/oyuk5/main_hackathon) dashboard.
