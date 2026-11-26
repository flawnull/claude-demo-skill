---
name: demo
description: One skill for every product video. Use for /demo, "make a demo video", "launch film", "promo", "pitch video", "motion graphics", "hackathon video", "walkthrough", "explainer", "on-camera video" or "cards around my face". It takes a short brief and hands over a finished MP4 with motion, captions, sound effects, voice and music. It uses its own frame engine (renderFrame(t), Playwright, ffmpeg), a beat grid, 210 recorded sounds, automatic sound on every word and move, a frame critic that re-renders every scene below 8/10, and a layout QA that fails any overlap, safe-area or face collision. Free, local tools only.
---

# /demo

The user gives a brief (or a path, a URL or a goal) and gets a finished MP4. Do all the work. Ask only what can't be found. Every tool here is free and local; never ask the user to pay for a service.

Skill folder: `~/.claude/skills/demo` (written `$D` below). Run scripts as `node $D/scripts/<name>.mjs`.

The rules below are guidance and hard-won lessons, not a cage. Invent when it serves the film, and say why you broke a rule. Before writing the script, look at two or three videos the user or team admires and note what they show in the first ten seconds, where people appear, and how the product enters.

## 0. Judged videos (hackathons, pitches, competitions): win first

Judges score what they can see in under a minute, and the video can only show what exists. Before any film work:
1. **Real limits.** Read the submission form, not only the brief. (A brief said 3:00; the form capped videos at 2:30.)
2. **Every criterion has visible evidence**: a screen, a log line, a report or a file a judge finds in under a minute. Hidden quality scores as missing. (A project had 449 tests and ran about 10 checks per read, but its log said only "all checks passed", and a judge marked testing as weak.)
3. **Every capability the brief names is used and shown.** If it says "use a model to learn, check and repair", all three must be on screen.
4. **Evaluation results are committed**, not git-ignored. Every number in the film points to a file.
If any fail and there is time, tell the user what to fix in the product before filming. That buys more points than any edit.

## 1. The brief

Fill this in from the request, the project and memory. Ask once, in one AskUserQuestion call with at most 3 questions, only for what's missing and decisive:

```
TYPE:        launch film for <product>   | walkthrough | on-camera
LENGTH:      40 s, 16:9                  (16:9, 9:16, 1:1, 4:5; check the real platform limit)
STYLE:       minimal + kinetic type      (or: cartoon + kinetic type, editorial, data, calm)
PALETTE:     bg, accent (the brand), bad (means bad news: money leaving, a deadline), + ink/muted
FONTS:       two, kept for the whole film
OPENING:     the viewer's pain (a number, a word, a moment); the product name comes later
REFERENCES:  real screenshots, logo, product images, brand files   (required)
VOICE:       AI narrator (free, local) | my cloned voice | none (music + captions)
MUSIC:       a CC0 track and its BPM
ENDING:      what the last 2 s show (name + one action)
HUMANS:      what the team films: the problem in the real world, someone using it in person, a face-cam
TRANSITIONS: may invent one for this film, e.g. a "zoom through the output", a "tile becomes the window"
```

"Premium", "modern" or "clean" are not a style. Turn them into the palette and two fonts above; never fill the gap with gradients, glow and glass cards.

Pick the mode:
- **Motion film** (default for launch, promo, pitch, explainer): sections 2 to 7.
- **Walkthrough** of a web app with real clicks: real footage (section 3b) recorded with `lib/record.mjs`, then voice and sound as in sections 4 and 5. Footage can also sit inside a motion film as a reference asset.
- **On-camera**: section 8.

**Aim for the strongest shape: problem, people, product.** The films that win usually show all three:
1. The problem in the real world: the place, the person, the moment it hurts, filmed for real (a phone is enough).
2. People using it: someone working through the real use case in person, and the presenter's face in a corner box over the screen recording, talking while they click.
3. The product: clean, readable footage or rebuilt screens.

You can't film people, so split the work. You write the script, a shot list for the team (`humans.md`: each shot with where, who, what happens, length, framing, and the scene it belongs to; doable in 30 minutes) and build everything else. The team films the real-world shots and records the demo with the camera on (QuickTime, OBS or Loom). Lay the face-cam over the footage in a corner, about a fifth of the frame wide, rounded, with a margin, and keep it clear of the UI that matters (QA's face check helps). A back-end or technical product still has a human story: who suffers when it fails, and who sees the fix. A teammate can play that person; say so if it's staged. Never drop the human shots because the pipeline makes motion easier.

## 2. Script, voice, characters, beats

Order matters: script, then voice, then animation. Never animate first and fit the voice in later.

1. **Arc:** pain, then characters, then reveal, then twist, then one call to action.
   - **Pain:** one thing the viewer already feels, slammed onto the screen in the first second ("You're paying for stuff you forgot." $133.00).
   - **Characters:** every problem gets a face that does one thing to the viewer, with one verb: steals, eats, bites, sleeps. A cost, a habit, a bug or a deadline all work ("a gym you went to twice" is a kettlebell in a sweatband with a $50/mo tag). Never a chart, a bullet list or plain text for a problem.
   - **Reveal:** the product, at about the midpoint, not before.
   - **Twist:** an ending that changes the whole video. Then one free key: "comment a word".
2. **Characters table** in `script.md`: problem, character, verb, what it does on screen, the word it lands on. Build them from simple shapes in the palette (HTML or SVG), with eyes, squash and stretch on every action, and one verb animated. Use 3D only if asked (section 9).
3. **Numbers react.** A number is a physical event: it gets eaten, stolen, cracked or grows, with a character doing it ("Fees ate" a coin with a bite out of it, then "-$164"). A counter ticks every digit and lands with a bigger hit.
4. **Product names:** a made-up product needs a short name nobody uses. Run `node $D/scripts/name-check.mjs <name> [...]`, which checks the App Store, Mac App Store, GitHub, npm, PyPI and domains. Then do one web search for "<name> app". Never use a real brand's name. Real products keep their real name.
5. **Voice next:** generate the voiceover (section 4) and its word timings before any animation. The timeline is keyed to words: every pop-in, move and sound starts on a spoken word (`wordTime`). Scene cuts sit on the beat nearest a word boundary.


- Scene 1 is the viewer's pain: a number, a word or a moment they already feel. Never open on the logo or product name; set `brand: ["name"]` in `film.js` and QA fails any opening frame that shows it (or anything marked `data-brand`).
- Hook within 3 s. The product is on screen by 10 s. One idea per scene.
- Write narration 25 to 30% shorter than feels natural. Every claim must be shown or sourced. Never fake a feature or a client.
- Pick the BPM first. A beat must land on a whole frame: 120 BPM at 30 fps is 15 frames. Other options come from `Motion.frameExactBpms(fps)`. Measure the music's BPM and first beat with `npx hyperframes beats <file> --json`, then set `music.start` to the first beat so the grid offset stays 0.
- Scenes are measured in beats (`beats: 8`), so every cut falls on the grid. Cut every 2 to 8 beats.
- Write `script.md`: scene, beats, line, what moves, transition and its cause, sounds, plus the characters table.

## 3. Build the film

```
node $D/scripts/new.mjs <dir> --aspect 16:9 --fps 30 --bpm 120
```

This copies `template/` (index.html, film.js) and the engine into `<dir>`. Put the real references in `<dir>/assets/ref/`.

**Engine** (`engine/motion.js`, global `Motion`). Every value is a pure function of time:
- `springUnit(t, {preset})` / `spring(t, start, from, to)`: a closed-form damped spring, with no integration and no state. Presets: `snap`, `pop`, `wobble`, `gentle`.
- `springVelocity`, `squash(v)`: squash and stretch that keeps volume. Use it on landings and fast moves.
- `ease.*`, `tween(t, t0, t1, from, to, ease)`: closed-form easing.
- `beats({bpm, fps, offset})`, `film({ scenes, audio, hits, cues, captions, palette })`. In a scene's `render(p)`, `p.t` is seconds into the scene and `p.b(n)` is beat n of the scene.
- `move(t, start, from, to)`: anticipation, then spring. Every object pulls back about 12% for 3 frames before it travels. Use it for anything that moves.
- `set(el, { mb: [vx, vy] })`: motion blur along the move (SVG directional blur, a quarter frame of travel, capped at 8 px, none on slow moves). Get the velocity with `vel(fn, t)` or `springVelocity`. Blur is seasoning: a fast move smears for 2 or 3 frames, then it's sharp. Extra `blur:` on exits and landings stays at 6 px or less.
- `draw(el, t, t0, dur)`: an SVG stroke draws itself on (closed form). `reveal(el, t, start)`: a whole line rises and fades in on a gentle spring, the calm alternative to kinetic type.
- `splitWords`, `kinetic(spans, t, {times | start})`: kinetic type. Each word dips, springs up, stretches and blurs along its move. Words start 3 frames apart unless `times` puts them on spoken words.
- Objects never start on the same frame: stagger them by 3 frames (`3 / fps`).
- `wordTime(words, "word")`, `shiftWords`, captions with the spoken word highlighted.
- `sequence(img, "assets/x_####.png", t)` plays an image sequence. `rng(seed)` gives seeded random. `faceAt(FACES, t)` gives the face box (on-camera).

**Style rules.** `lint.mjs` enforces these, and errors block the render:
- No CSS `transition`, no `@keyframes`, no `requestAnimationFrame`, `setTimeout`, `Date.now` or `Math.random`. Use `renderFrame(t)` and springs.
- `palette = { bg, accent, bad, ... }` in `film.js`: one background, one accent, one colour that means bad news. Keep them for the whole film.
- At most two fonts (fallbacks in a font list don't count).
- At least one file from `assets/ref/` on screen. Real UI, real logo, real numbers.
- No colour outside the palette (greys, black, white and tints of palette colours are fine).
- No lorem ipsum. No sounds made in code (`AudioContext`, oscillators, ffmpeg sine): recorded files only.
- No network: fonts, images and media live in `assets/`, or use installed system fonts.
- Warnings: centered text on a gradient, gradient washes, glow (coloured shadows), frosted blur glass, round placeholder numbers (99%, 10K+, $1,000), plain bar, pie or donut charts, no kinetic type, and linear tweens.

**Rebuild real screens.** UI comes from real screenshots of the product (`assets/ref/`), rebuilt in HTML so it can move. Use specific, believable values: odd cents, real dates. Add the small real details: a URL bar, tabs, status labels ("connecting"). No generic dashboard, no "99%", no donut chart.

**Calm style.** For launch films that should feel trustworthy: a warm paper background, ink type, one accent, music-led, few sounds. Set `style: "calm"` in `film.js`. Lines arrive whole with `Motion.reveal(el, t, start)` (a gentle rise and fade); per-word `kinetic` is optional there, at most for one hero line, because a pop on every word gets tiring fast. Pair each idea with a generated line drawing (inline SVG: ink outlines, the accent stroke last), drawn on with `Motion.draw(el, t, t0, dur)`, then cut to the real product doing it. A drawing explains; the footage proves.

**Glass, only clear.** Frosted blur glass is the AI look. When a scene calls for glass, use `Motion.glass(el)`: clear liquid glass with no blur, where what's underneath bends at the edges (SVG displacement map as the backdrop-filter, saturate(180%), 5% white tint, 1 px top highlight). Put busy detail underneath (text, a grid, a chart) and slide the glass over it so the bending moves. Never put `filter`, `opacity` or `clip-path` on the glass's parent; QA reports it.

**Design.**
- Anchor type to a grid edge. Use one or two families with clear weights.
- One bold thing per scene. Keep holds alive with a slow push or a settling spring.
- Every transition has a cause on screen: zoom through, an object becomes the next world, a whip, a word that rolls into another word, things falling out under gravity.
- Pop-ins land on the spoken word (`cues`); cuts and big moves land on the beat (`hits`).
- Leave room: nothing may pass through, cover or touch another element, during holds and transitions alike. Parts of one thing (two halves of a line) go in one `data-qa-group`; a deliberate overlap gets `data-overlap-ok`.

### 3b. Real footage

- **Web app:** drive the real app with Playwright and record it with `lib/record.mjs` (`record(page, out)`, `rec.glide(locator, { click: true })`, `rec.mark("saved")`, `rec.stop()`). It grabs timed screenshots with a visible cursor, so marks never drift on long idle waits (Playwright's screencast stops writing frames while the page is still). Cut the waits with ffmpeg `trim` + `setpts`, label them "Sped up N×" on screen, and play the frames with `Motion.sequence`. Hold the opening for at least 1 s. Frame the content column, not the page's left edge.
- **CLI:** VHS (`vhs file.tape`) at 3200x1940, FontSize 64, `WindowBarSize 84`, `MarginFill` set to the background colour. Do setup in a hidden `source` step. VHS strings can't escape quotes, so use backtick strings. Use a fast `TypingSpeed` (about 13 ms) so output appears early. The last frame (`ffmpeg -sseof -0.05`) makes a good still for `assets/ref/`.
- **Footage lessons:** bring a row into view by typing into the app's own search (it reads as a deliberate action; a page jump looks like a glitch). When the same text appears twice (table and side panel), select with `>> visible=true`. Full-window dashboard text is unreadable at 1080p: push in 1.3 to 1.4 times on the panel the line is about. Recordings run 1.5 to 2 times longer than planned; time them before setting scene lengths.
- **Sample data must look real:** realistic names, uneven distributions and varied dates, run in memory. No test fixtures on screen.
- **Label it honestly:** when demo mode puts invented statuses on real names, show "Sample data" on those scenes. A lab or test number gets a dated footnote ("Lab evaluation on 8 portals, 21 Nov 2026").
- **Privacy:** no home paths, usernames, real tokens or customer data. Run CLIs from `/tmp/<name>`.

## 4. Voice (free, local)

```
node $D/scripts/voice.mjs <dir> lines.json [--voice Ono_Anna|Ryan|Aiden|Eric|clone:me.wav] [--style "Warm, upbeat"]
```

`lines.json` is `[{ "id": "hook", "text": "..." }]`. The script writes `assets/vo/<id>.wav`, word timings, and `voice.js` (`window.VOICE`). It uses Qwen3-TTS through `tools/say` and whisper word timings (`./setup.sh` installs both).
- **Act each section (directed).** A flat read where every line sounds the same is the default AI tell. Give every line in `lines.json` a `direction` (how this moment is said: hushed, lifted, firm, warm) and `stress` (the 1 to 3 words that carry it). Then each line is acted on its own with the same voice and base style, at the same loudness, and a line whose pace drifts more than 25% from the rest is flagged. Fix one line with `--only <id>`. Listen-check: the pain line should sound different from the reveal, and numbers should land.
- **One voice, one style, one take** (when no line has a direction). The whole script is generated in a single pass and cut into lines at the pauses, so the voice, pace and energy never change between lines. Never mix voices or reuse lines from another film's take. Default voice: Ono_Anna, a warm, gentle female narrator, calm and quietly persuasive (the other stock voices have stronger accents). The default style asks for a brisk launch pace; add `--tempo 1.1` for a little more (stay at 1.2 or below, or the voice sounds processed). `--reuse-take --tempo X` re-cuts from `take-raw.wav` without regenerating. `--per-line` exists but drifts.
- To clone a voice, the user records about 15 s into `me.wav`.
- ElevenLabs runs only with `--provider elevenlabs` and an `ELEVENLABS_API_KEY` the user already has. Never suggest buying one. Never ship Kokoro.

## 5. Sound

- **SFX:** 210 recorded sounds in `$D/sfx/index.json`, each with name, category, duration, licence and source. Categories: click 51, impact 36, ui 21, transition 18, notification 17, whoosh 16, misc 16, scifi 12, pop 7, riser 5, cartoon 4, glitch 3, sparkle 2, typing 2.
  - Reference a sound in `audio.sfx` by name, or by category for the shortest one in it.
  - **Automatic:** `qa.mjs` places recorded foley: a soft tap when a text block or card appears (at most one every 0.25 s), a tick on every number change, a swish on every move and a soft hit on every landing (`build/auto-sfx.json`, merged at stitch). Subtitles stay silent (`data-sfx="off"`, set automatically on captions). No UI chirps: a squeak on every word gets annoying fast. `audio: { auto: false }` turns it off.
  - **By hand:** the big moments: a whoosh on a scene exit, a riser into an impact on the end card, a bigger hit when the final number lands. Auto sounds within 60 ms of a hand-placed one are dropped.
  - `{ start, duration }` cuts a piece out of a long sound. `word: true` marks a sound timed to a word, which the beat check skips. `cue: false` marks a sound whose start is not a motion moment, such as a riser.
  - Grow the library with `sfx-fetch.mjs "<search>"` (Openverse CC0; it refuses anonymous requests after its rate limit) or with `sfx-import.mjs <folder> --license CC0 --source <url>`. Unpack downloads in their own folder first.
- **Voice on top:** music and the whole SFX bus duck under the voice (sidechain), so the voice is always the loudest layer.
- **Music:** a CC0 track from OpenGameArt, Freesound or Openverse at about 0.16 volume. The mood is confident and driving, like a product you'd invest in: a steady 4/4 pulse, minimal electronic or cinematic tech, minor or neutral key, 110 to 128 BPM. Never cheerful ukulele, whistling, bouncy major-key pop or chiptune (it reads as "YouTube kids"). Since you can't listen, build a short audition reel of 3 or 4 candidates (12 s each, at -16 LUFS) and let the user pick. Say that a track was chosen by BPM and energy, not by listening.

## 6. Render, check, critique, repeat

```
node $D/scripts/film.mjs <dir>                 # lint, capture, beat check, critic, layout QA, stitch
node $D/scripts/film.mjs <dir> --scene a,b     # re-render only the failing scenes
```

- **Capture:** headless Chromium paints `renderFrame(i/fps)` for each frame and saves PNGs, with 4 workers.
- **Beat check:** reports `off-beat: N ms` for every cut, beat-locked sound and hit. The target is 0 ms.
- **Critic:** measures changed pixels between frames and scores each scene out of 10.
  - Motion: share of live frames (5 points), minus dead runs longer than 0.5 s.
  - Onset alignment: motion that starts on cues, and cues that move (3 points).
  - Spring feel: moves that peak early and decay, not linear slides (2 points).
  - It writes `build/critic.md`, `critic.json` and a contact sheet per scene in `build/critic/`.
- **Layout QA** (`qa.mjs`): steps through every frame (0.05 s or finer), measures every text block, image and card (text boxes trimmed to the ink), and reports:
  - overlaps and touches (closer than 2 px), during holds and transitions;
  - text outside the safe area while at rest: 5% title-safe for 16:9, and for vertical social video the top 10%, bottom 20% and right 15% (`safe: "instagram-reel"`, or your own margins);
  - anything over the speaker's face (on-camera);
  - the brand in the opening scene.
  It writes `build/qa.md`, `flagged.png` (each problem with its boxes drawn) and `transitions.png` (every cut, -0.2 s to +0.3 s). Look at both sheets.
- **The loop:**
  1. Read `critic.md`.
  2. Open the contact sheets of the failing scenes and look.
  3. Fix the cause, for example a still stretch, a pop-in off the word, or a linear slide.
  4. Re-render only those scenes.
  5. Repeat until every scene is at 8/10 or above and QA reports no problems, for at most 5 passes.
- When the skill's engine changes, add `--update-engine` to refresh the film's copy.

## 7. Before handing over

1. Watch it: a contact sheet of the final MP4 (`fps=1/1.3,tile=5x4`), plus single frames at every transition.
2. Loudness: `ebur128` should read about -16 LUFS with peaks at or below -1.5 dBFS (stitch normalises).
3. Transcribe the MP4 with `tools/words` and compare it to the script.
4. Duration is within the real limit.

Hand over: the MP4 path, its length, the critic table (score per scene), `off-beat: N ms`, the QA result (problems found and fixed), the frames checked (`transitions.png`), and the one thing worth a look. Offer one revision round.

## 8. On-camera mode

The user films themselves. Motion goes around them, not over them.
1. `node $D/scripts/voice.mjs <dir> --transcribe assets/me.mp4` writes word timings for the take to `VOICE.take`.
2. In `film.js`, set `transparent: true` and `audio: { under: { src: "assets/me.mp4" } }`. Set the page background to `transparent`.
3. Find the face: `node $D/scripts/faces.mjs <dir> assets/me.mp4` (OpenCV, local) writes `faces.js`. Load it and set `faces: FACES` in `film.js`; QA then fails any frame where something covers the face. For Reels, TikTok or Shorts set `safe: "instagram-reel"`.
   Place cards in the free side of the frame. Proof (screenshots, numbers like "100 to 10,000") pops on the exact word: `cues` with `wordTime(VOICE.take.words, "10,000")`.
4. The stitch lays the transparent frames over the filmed video and keeps its sound.

## 9. 3D

Off by default: most product films don't need it. Only when the user asks for 3D, never fake it in the browser. Build it in Blender (free): a real model, matte materials, one soft key light, a real shadow on the floor. Render a grey clay preview first and get a yes before materials and the final render. `blender/box_character.py` is a starting recipe (a hopping cardboard box with the engine's spring); play the render with `Motion.sequence`.

## Files

| Path | What it is |
| --- | --- |
| `engine/motion.js` | springs, easing, beat grid, timeline, kinetic type, captions |
| `template/` | starter film (index.html, film.js) |
| `scripts/new, capture, beats, critic, qa, stitch, film, lint, voice, faces` | the pipeline |
| `scripts/name-check` | is an invented product name already a real product? |
| `scripts/sfx-index, sfx-import, sfx-fetch` | the sound library |
| `lib/` | pure logic behind the scripts (tested) |
| `sfx/` | 210 sounds, `index.json`, `CREDITS.md` |
| `blender/box_character.py` | 3D character recipe |
| `py/faces.py` | face finder (OpenCV 4, venv at `cv-venv/`, made by `setup.sh`) |
| `test/` | `npm test` (the pipeline tests drive real Chromium and ffmpeg) |

Reference film: `examples/` in this repo. Every scene at 8/10 or above, 0 ms off-beat, QA clean.
