---
name: studio-edit
description: Edit real footage in Motion Studio from a word-level transcript - talking heads, interviews, testimonies, sermons, vlogs, podcasts. Covers transcription (ElevenLabs Scribe, local Whisper or an imported transcript), choosing the best takes, cutting fillers and dead air, punch-ins, word-by-word captions, overlays, premium talking-head effects (liquid glass graph, pixel-monitor screen push, over-the-shoulder zoom), music ducking, cut checks at every edit and timed lyric cards for songs. Use whenever raw footage or a song is the input - "edit my footage", "cut this down", "remove the ums", "add captions", "make a Short from this interview", "lyric video for my song".
---

# Editing footage from the transcript

The method comes from browser-use's **video-use** (MIT): the agent never watches the video. It **reads** it: a word-level transcript is the main view, and pictures are drawn only at decision points. Motion Studio keeps that method and runs it through its own pipeline, so every edit still gets a storyboard or plan gate, an estimate, 4K finishing, QC and a master spec.

```
transcribe → pack (takes.md) → choose takes ⏸ → autocut → edl → review render → cutcheck → ⏸ → finals → QC → spec
```

## 0. Setup (once per computer)

| Need | How |
|---|---|
| ElevenLabs (recommended) | An API key with **Speech to Text** set to *Access* (elevenlabs.io → API keys). Put it in `.env` as `ELEVENLABS_API_KEY=…`. **Never ask for the key in chat, never print it, never commit `.env`.** On Claude Code on the web, add it as an environment secret and allow `api.elevenlabs.io` in the network settings. Costs ElevenLabs credits per minute of audio, so state the minutes before transcribing a lot. |
| Whisper (free, local) | Nothing to set: `--engine=whisper` installs whisper.cpp and the model into `production/whisper/` on first use. Needs git, a C compiler and access to huggingface.co. Slower, and less accurate on singing. |
| Existing transcript | `--from=<file>`: ElevenLabs JSON, Remotion caption JSON, SRT/VTT (cue-level) or LRC (line-level). |
| yt-dlp | Only for downloading reference videos (`studio-styles` → learning a recipe). |

Put footage in `public/jobs/<id>/footage/`. Long phone videos are fine; keep the originals untouched.

## 1. Transcribe and pack

```bash
npm run transcribe -- <id> public/jobs/<id>/footage/*.mp4 [--engine=elevenlabs|whisper] [--keyterms="Wait Culture,Ekow"]
npm run pack -- <id>
```

`jobs/<id>/takes.md` is the reading view: every phrase with an ID (`A.3`), start–end, speaker, `(um)` fillers and `‖0.8‖` pauses. Read it all before deciding anything. Use `--keyterms` for names, places and brand words, so they're spelled right.

## 2. Plan the edit (⏸ gate)

From `takes.md`, write the plan and **show it before cutting**:
- the **hook**: the strongest line in the footage, which plays first (recipe `hook-2s`);
- which take of each line you keep, and why (best delivery, no stumble, complete thought);
- what goes, such as false starts, repeats, tangents and anything the speaker wouldn't want public;
- target length, format(s), caption style, punch-ins, overlays, b-roll and music.

For a testimony, the story beats come from the `testimony-doc` recipe (hook → journey → turning point → payoff). Get the user's OK. That is this lane's storyboard gate; for longer pieces, also draw a storyboard as usual.

When two takes are close, or a pause is ambiguous, look at it: `npm run timeline -- <id> <media> <from> <to> [--mark=12.4:cut]` draws filmstrip + waveform + words. Read the PNG.

## 3. Cut

```bash
npm run autocut -- <id> --keep=A.6,A.3-A.4,B.2 [--pause=0.35] [--pad=0.06] [--fillers=like,basically] [--format=9x16]
```

- `--keep` lists phrase IDs **in play order**, so the hook can come first.
- Fillers (um, uh, erm…) and audio events are cut out; pauses longer than `--pause` are closed up; every cut is padded so no word is clipped.
- Jump cuts inside one take get an alternating **1.12× punch-in** (`--punch=none` to switch off).
- Add `--fillers=like,so` only after checking that the speaker uses them as fillers; "like" is often a real word.

Then refine `jobs/<id>/edl.json` by hand:

| Field | What it does |
|---|---|
| `segments[].zoom`, `push`, `focus` | Punch-in (1.0–1.25), slow push over the piece (e.g. 0.05), crop centre `[x, y]` 0–1 |
| `sources.<key>.focus` | Default crop centre for 16:9 footage in a 9:16 frame (put the face in frame) |
| `sources.<key>.faceBox` | `[x, y, w, h]` of the face, 0–1 of the source frame. Set it from a timeline frame; the cut check uses it to keep text off faces |
| `captions` | `style` pop/line/none, `maxWords` (3), `position` (0.66 of the height on 9:16), `uppercase`, `highlight`, `size`, `emphasis` words |
| `overlays[]` | `{ kind: title/lower-third/popup, text, sub, at or atPhrase, seconds, y }` |
| `grade` | Any `LOOKS` name (`warm`, `film`, `worship`…) or `none` |
| `music` | `{ file, volume: 0.12, duck: 0.35 }`: ducked under speech automatically |

```bash
npm run edl -- <id>     # frame-accurate cuts, voice track with 30 ms fades, caption cues, jobs/<id>/edit.md
```

`jobs/<id>/edit.md` maps output time to source time and text. Use it to answer notes like "at 0:12, cut straight to …".

## 3b. Talking-head effects (optional)

Three premium effects live in `src/effects/` (adapted from the "Effect of the Day" prompts, EP. 02–04). Add them to `edl.json` → `effects`, and `edl` times them from the transcript. Use **one effect per idea**, at most one every 8–10 s: they're accents, not wallpaper.

| `kind` | What it does | Settings (defaults) |
|---|---|---|
| `liquid-glass` | A frosted glass card rises over the footage and **really refracts it** (lens bend, colour split at the rim). A glowing line draws up on a velocity ramp while a counter counts to the value, then punches, holds and sinks away. About 3.2 s. | `at` / `atPhrase` / `atWord`, `title` ("RETENTION"), `value` ("82%", "$10K", "2.4M"), `colour` (green/gold/blue/red/purple/orange or hex), `drawSeconds` 1.16, `holdSeconds` 1.5, `cardY` (0.4 on 9:16), `frost` 7, `bend` 1, `shape` |
| `screen-push` | Hard-cuts to an extreme close-up of an LCD monitor showing the words, **one word per cut as they're said**, then cuts back. Captions step aside while it runs. | `text` (shown exactly as typed), `when`: `"said"` (default; found in the transcript) or `[from, to]` seconds, `colour` (white/green/amber/red/blue or hex), `zoom` 3.1, `pixelSize` 10, `fringe` 3, `glow` 0.85, `focusFalloff` 5 |
| `shoulder-zoom` | The camera pushes in, looks to a card over one shoulder, whips to a card over the other and eases out. `"style": "transition"` turns the first card's big text into points of light that streak into the second. 4.6 s. **Vertical formats only.** | `at` / `atPhrase` / `atWord`, `start` and `end` as `"LABEL \| big \| small"` (big text up to about 9 characters), `style` normal/transition, `colour` (clay/gold/green/blue/red/purple or hex) |

```json
"effects": [
  { "kind": "screen-push", "text": "Stop scrolling.", "colour": "amber" },
  { "kind": "liquid-glass", "atWord": "retention", "title": "Retention", "value": "82%", "colour": "gold" },
  { "kind": "shoulder-zoom", "atPhrase": "B.4", "style": "transition", "start": "OLD WAY | 4 hours | per edit", "end": "NEW WAY | 4 minutes | per edit", "colour": "gold" }
]
```

- The screen push and the cards show text **exactly as typed**. Check spelling and numbers against the brief.
- `shoulder-zoom` frames from the source's `faceBox`: head about 32% of the frame width, eyes about a quarter down. `edl` warns if the head is too big for the cards (move the camera back, or use a wider take). The cut check tests both cards against the face.
- `edit.md` lists every effect with its time; the cut check draws `out/<id>/effects-v<N>.png` at each effect's key moments. **Read it.**
- Effects are heavy to render: the glass refracts a second copy of the footage, and the screen is a pixel grid. Expect a 1080p render to take about twice as long.
- Fonts (Plus Jakarta Sans, DM Mono, Inter) are bundled, so renders don't depend on Google Fonts. The refraction maths follows liquid-glass-js by Armagan Amcalar (MIT).

## 4. Review cut and cut check (⏸ gate)

```bash
npm run render -- FootageEdit-9x16 review --props=jobs/<id>/.edl.resolved.json --out=out/<id>/<id>_edit_v<N>_review.mp4
npm run cutcheck -- <id> out/<id>/<id>_edit_v<N>_review.mp4
```

The cut check covers audio pops, black frames at cuts, flash pieces, unmasked jump cuts, captions or overlays over faces, and length. It draws `out/<id>/cutcheck-v<N>.png`, with the frames before and after every cut. **Read the sheet and fix every FAIL before the user sees anything** (up to 3 fix-and-re-render passes, as video-use does). Then send the review cut with the plan, the length and what was cut.

Notes come back in plain English ("captions are covering my face", "punch in on every number", "warmer"). Apply them in `edl.json`, bump the version (autocut bumps it, or change `version` by hand), re-run `edl`, re-render and re-check.

## 5. Finals

- Formats: `FootageEdit-9x16`, `-16x9`, `-1x1`, `-4x5` from the same edit list (set each source's `focus` for the reframe).
- `4k` renders need 4K sources to be sharp. With 1080p phone footage, deliver the `hd` preset (1080p, BT.709, high quality), or upscale first (`studio-ai-footage`).
- Then `loudnorm` (−14 LUFS), `qc`, the cut check on the final, the frames sheet and the master spec, as in the `studio` skill.
- A captions-free version for platforms that add their own: set `"captions": { "style": "none" }`, re-run `edl` and render to a separate file.

## 6. Songs: timed lyric cards

```bash
npm run transcribe -- <id> public/jobs/<id>/audio/<song>.wav --align=jobs/<id>/lyrics.txt   # ElevenLabs forced alignment (best)
npm run lyrics -- <id> --audio=public/jobs/<id>/audio/<song>.wav --lyrics=jobs/<id>/lyrics.txt [--lrc=<file.lrc>]
npm run render -- ScriptureLyric-9x16 review --props=jobs/<id>/lyrics.props.json
```

- `lyrics.txt`: one card per line, `|` for the line break, `*word*` for the underlined word, `[verse]` labels ignored, and header lines `# overline:`, `# reference:`, `# intro: Title | Artist`.
- **Forced alignment** matches lyrics you already have to the vocal. Speech-to-text on singing is weaker; an LRC file from a music app or DAW is the free option.
- Cards land 0.5 s before the vocal (`--lead`) and hold 0.8 s after the line (`--hold`). Gaps become the empty page (instrumentals). The script prints every card's time, and `⚠ guessed` marks lines it couldn't match. Check those against the song.
- Only songs the user owns or has cleared (CCLI or the writer's permission).
- Full songs at 4K with the paper look are slow (about 16 min per 20 s per format here): approve a `review` render first.

## Rules

- The transcript is the surface. Don't extract hundreds of frames; draw a timeline only where a decision needs it.
- Every cut lands on a word boundary or in a pause; never mid-word or mid-note.
- Keep the speaker's meaning. Never cut words in a way that changes what they said, and never invent quotes.
- Captions: max 3 words for pop style, no 1-word flashes, off faces, out of the bottom 20% and right 12% on 9:16.
- Consent: everyone on camera has agreed (testimonies especially).
- Log feedback into `.claude/skills/studio-styles/house-notes.md` at delivery (the `studio` skill, phase 8).
