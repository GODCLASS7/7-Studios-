# Motion Studio — Project Instructions

Motion Studio is a Remotion project for making videos with React. Each video is a React component. It is registered as a `<Composition>` and rendered to MP4 by the Remotion CLI.

These instructions are for anyone working in this repo, whether a person or Claude.

---

## 1. Stack

| Thing | Version / value |
|---|---|
| Remotion (`remotion`, `@remotion/cli`) | 4.0.537 (pinned; keep every `@remotion/*` package on the same version) |
| React / React DOM | 19.2.3 |
| TypeScript | 5.9.3, `strict`, `noUnusedLocals` |
| Node | `^20.19.0 \|\| ^22.13.0 \|\| >=24` |
| Bundler | Rspack (`Config.setRspack(true)` in `remotion.config.ts`) |
| Frame format | JPEG, output overwrites, 2 s default premount |

## 2. Layout

```
motion-studio/
├── CLAUDE.md              ← this file
├── remotion.config.ts     ← CLI render/bundle config
├── src/
│   ├── index.ts           ← registerRoot(RemotionRoot) — do not edit
│   ├── Root.tsx           ← registers every video as a <Composition>
│   ├── videos/            ← one file (or folder) per video
│   │   └── StudioCheck.tsx  ← 4 s test card; safe to delete
│   └── components/        ← reusable pieces shared across videos
├── public/
│   ├── brand/             ← logos, brand fonts, brand imagery
│   ├── audio/             ← music, voiceover, SFX
│   └── data/              ← CSVs, captions JSON, scraped briefs
├── out/                   ← rendered videos (git-ignored)
└── .claude/skills/        ← Remotion agent skills (see §7)
```

## 3. Commands

```bash
npm i --loglevel=error          # install dependencies
npm run dev                     # open Remotion Studio (live preview) in the browser
npm run lint                    # eslint src && tsc — must pass before rendering/committing
npx remotion render <Id> out/<Id>.mp4   # render one composition
npx remotion still <Id> out/<Id>.png --frame=60   # render one frame to check a layout
npx remotion compositions       # list registered composition IDs
npm run upgrade                 # upgrade Remotion (all @remotion/* together)
```

## 4. How to add a new video

1. Create `src/videos/<Name>.tsx` and export a `React.FC`.
2. Register it in `src/Root.tsx`:
   ```tsx
   <Composition
     id="<Name>"            // unique; letters, numbers, hyphens only
     component={<Name>}
     durationInFrames={30 * seconds}
     fps={30}
     width={1920}
     height={1080}
   />
   ```
3. If the video needs several formats, add one `<Composition>` per format with its own `id`, such as `Promo-16x9`, `Promo-9x16` and `Promo-1x1`. Read `width` and `height` from `useVideoConfig()` inside the component rather than hard-coding them.
4. Run `npm run lint`, then render a still or two to check the layout, then render the full video.

### Standard formats

| Format | Size | Use |
|---|---|---|
| 16:9 | 1920×1080 | YouTube, web, presentations |
| 9:16 | 1080×1920 | Reels, Shorts, TikTok, Stories |
| 1:1 | 1080×1080 | Feed posts |
| 4:5 | 1080×1350 | Instagram portrait feed |

The default is **30 fps**. Use 60 fps only for fast motion or UI capture.

## 5. Animation rules

These rules are required. Remotion renders each frame on its own, possibly in parallel, so animation must be a pure function of the frame number.

- **Drive all motion from `useCurrentFrame()`** with `interpolate()` or `spring()`. Do not use CSS transitions, CSS `@keyframes`, `setTimeout`, `requestAnimationFrame`, or `Math.random()`. Use `random(seed)` from `remotion` when you need randomness.
- **Express timing in seconds × `fps`**, for example `0.8 * fps`, not in raw frame numbers. That way timing stays correct if the fps changes.
- **Clamp interpolations**, for example `extrapolateRight: "clamp"`, unless you deliberately want overshoot.
- **Easing:** use `spring({ config: { damping: 200 } })` for smooth, non-bouncy entrances. Use `Easing.bezier(0.65, 0, 0.35, 1)` for wipes and lines. `StudioCheck.tsx` shows this house style.
- **Sequence scenes with `<Sequence>` / `<Series>`**, and use `@remotion/transitions` for cuts between scenes. Inside a `<Sequence>`, `useCurrentFrame()` counts from 0 at the start of that sequence.
- **Assets:** put files in `public/` and reference them with `staticFile("brand/logo.svg")`. Use `<Img>`, `<Video>`/`<OffthreadVideo>` and `<Audio>` from Remotion, not plain HTML tags, so that rendering waits for each asset to load.
- **Fonts:** load them with `@remotion/google-fonts` or `@remotion/fonts` (local files go in `public/brand/`). Don't rely on system fonts in a final render.
- **Data/props:** pass content such as titles, numbers and colours as props with a `zod` schema (`schema` + `defaultProps` on the `<Composition>`). That lets you edit them in Studio and reuse the same video with different content.
- Use `AbsoluteFill` as the root of every scene, and give each scene an explicit background colour.

## 6. House style (from StudioCheck)

| Token | Value | Use |
|---|---|---|
| Background | `#0B0B0D` | Near-black canvas |
| Primary text | `#F4EFE6` | Warm off-white headlines |
| Accent | `#E8B44A` | Gold rules, highlights |
| Secondary text | `#9A958C` | Subtitles, captions |
| Type | Heavy (900) uppercase titles with letter-spacing that tightens in; 600-weight spaced subtitles | |
| Exit | 0.5 s fade out at the end | |

Keep shared tokens in `src/components/` (for example `theme.ts`) once more than one video uses them. When brand assets arrive in `public/brand/`, they take priority over these tokens.

## 7. Agent skills (`.claude/skills/`)

These are pinned from `remotion-dev/skills`; `skills-lock.json` records their hashes. **Before writing Remotion code, read the relevant skill.** If you're unsure which one applies, start with `remotion-best-practices`, which routes to the others.

| Skill | Use it for |
|---|---|
| `remotion-best-practices` | Router: start here |
| `remotion-create` | Building a new video, layout, Tailwind |
| `remotion-markup` | Animation, timing, sequencing, transitions, text, fonts, images, audio, voiceover, 3D, effects |
| `remotion-captions` | Transcribing and animating captions |
| `remotion-maps` | Map and flyover animations (MapLibre, Mapbox, MapTiler, Cesium) |
| `remotion-multimedia` | Reading or processing media files (Mediabunny) |
| `remotion-interactivity` | Structuring markup so Studio can edit it |
| `remotion-studio` | Previewing |
| `remotion-render` | Exporting / rendering options |
| `remotion-saas` | Embedding Remotion in an app (Player, server rendering) |
| `remotion-docs` | Searching the official docs |
| `remotion-upgrade` | Upgrading Remotion |

Don't edit files in `.claude/skills/`. They are vendored, and edits would be overwritten on update.

## 8. Rendering in a Linux cloud container (Claude Code on the web)

Rendering works on a normal Mac, Windows or Linux desktop with no extra setup. In the cloud container, two fixes are needed:

1. **Compositor binary.** `package-lock.json` only includes the Alpine Linux (musl) build of the compositor, but the container uses standard Linux (glibc). After `npm i`, run:
   ```bash
   npm i --no-save --loglevel=error @remotion/compositor-linux-x64-gnu@4.0.537
   ```
   If the Remotion version changes, keep this version number in sync with it.
2. **Browser.** Use the pre-installed headless Chromium instead of downloading one:
   ```bash
   npx remotion render <Id> out/<Id>.mp4 \
     --browser-executable=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
   ```

The "Detected differing memory amounts" warning in containers is harmless.

## 9. Workflow for every new video request

0. **Match the request to a playbook in §10** and follow it.
1. **Confirm the brief:** topic, length, format(s), copy, brand assets and audio. Fill gaps with sensible defaults and say which ones you chose.
2. **Read the matching skill(s)** in `.claude/skills/`.
3. **Build** the video in `src/videos/`, register it in `Root.tsx`, and put reusable parts in `src/components/`.
4. **Check:** `npm run lint` must pass. Render stills at key frames (each scene start, mid-animation and the last frame), look at them, and fix any layout problems.
5. **Render** the full video to `out/<Id>.mp4` and share it.
6. **Commit** the source, not `out/`. Use short, imperative commit messages, for example "Add Promo 9:16 composition".

## 10. Playbooks: the six core prompts

Each video in this studio is code. A headless browser renders it frame by frame, so every export comes out the same. The six playbooks below cover the usual requests. **When a request matches one, follow its steps.** Copy-paste prompts are in the quote blocks; replace the `<placeholders>`.

### 10.1 Scenes are just code

> Build a `<length>`-second `<format>` video about `<topic>` with these scenes: `<scene 1>`, `<scene 2>`, `<scene 3>`. Use the house style.

1. Write a scene list first: each scene's purpose, duration in seconds, on-screen copy and the transition into the next scene.
2. Build each scene as its own component, `src/videos/<Name>/Scene<N>.tsx`, rooted in `AbsoluteFill`. Assemble them with `<Series>` or `<TransitionSeries>`.
3. Keep all copy and colours in props with a zod schema, so the same video can be re-rendered with new text.
4. Skills: `remotion-create`, `remotion-markup` (sequencing.md, transitions.md, timing.md).

### 10.2 Kinetic titles that land on the beat

> Make kinetic typography for these lines: `<lines>`, timed to the beat of `public/audio/<track>.mp3` (BPM `<bpm, if known>`).

1. **Find the beat grid.** If the BPM is given, the beat frame is `round(n * 60 / bpm * fps)` plus an offset to the first downbeat. If it isn't given, analyse the track with `@remotion/media-utils` (`useAudioData` + `visualizeAudio`, low-frequency bins) to find the kick hits, and confirm by rendering stills.
2. Store the beats as an array of frame numbers in `src/videos/<Name>/beats.ts`. Every title, cut and accent snaps to a beat.
3. Each word or line **lands** on its beat: a short `spring` (damping 200, or around 12 for a punchier look) for scale or translate, with motion finishing on the beat frame, not starting on it. Add small accents on off-beats, such as underlines, flashes or letter-spacing.
4. Add the track with `<Audio src={staticFile("audio/<track>.mp3")} />` and set the duration to the track length.
5. Skills: `remotion-markup` (audio.md, audio-visualization.md, text-highlights.md, measuring-text.md, timing.md).

### 10.3 Hero motion for your landing page

> Make a seamless looping hero animation for my landing page: `<brand/product>`, `<colours>`, `<size, e.g. 1920×1080>`, `<length, e.g. 6 s>`.

1. **It must loop seamlessly.** The last frame flows into the first. Drive the motion with periodic functions of `frame / durationInFrames` (sine or cosine of 2π·t), not with one-way entrances.
2. Keep it calm and quiet: slow motion, no text that would compete with the page's own headline, safe for dark or light page backgrounds as specified.
3. Export for the web, using the flags in remotion-render/transparent-videos.md:
   - Opaque: H.264 MP4 (`--codec=h264 --crf=23`) plus a VP9 WebM (`--codec=vp9`) for the page's `<video autoplay muted loop playsinline>`.
   - Transparent overlay: VP9 WebM with alpha (`--codec=vp9 --image-format=png --pixel-format=yuva420p`), or ProRes 4444 for editors (`--codec=prores --prores-profile=4444 --image-format=png --pixel-format=yuva444p10le`, output `.mov`).
   - A poster image with `npx remotion still <Id> out/<Id>-poster.jpg --frame=0`.
4. Alternative: if the user wants it live in a React or Next.js site, embed it with `@remotion/player` instead of a video file (see the `remotion-saas` skill).
5. Skills: `remotion-render` (transparent-videos.md), `remotion-saas` (player.md), `remotion-markup`.

### 10.4 A full SaaS intro from your website link (flagship)

> Here's my SaaS website: `<url>`. Make a `<20–30>`-second product intro in `<format(s)>`.

1. **Fetch the page** with WebFetch, or with the Firecrawl scrape tool for JS-heavy sites; ask for branding as well as content. Extract the following into `src/videos/<Name>/brief.json`:
   product name, one-line value proposition, 3–4 key features or benefits, social proof (logos, numbers, quotes), the primary CTA text and URL, brand colours and fonts, and the logo URL.
   Use only what's on the page. Don't invent claims, numbers or testimonials; mark anything missing as `null` and ask about it.
2. Download the logo or screenshots into `public/brand/`.
3. **Plan the scenes** and show the plan before building:
   Hook (problem or bold claim, 3 s) → Product reveal and logo (3 s) → 2–3 feature scenes with UI mock-ups or real screenshots (4 s each) → Social proof (3 s) → CTA with URL (4 s).
4. Build each scene as in 10.1, with every string read from `brief.json` through props. Theme the video from the extracted brand tokens; those override the house style.
5. Render 16:9, plus 9:16 and 1:1 if asked, each as its own `<Composition>`.
6. Skills: `remotion-create`, `remotion-markup` (multi-scene-video.md, transitions.md, google-fonts.md, images.md).

### 10.5 Titles synced to your audio

> Add animated titles/captions synced to `public/audio/<voiceover>.mp3` (or `<video>.mp4`).

1. **Transcribe** to word-level timestamps in the `Caption` JSON format, following remotion-captions/transcribe-captions.md (Whisper via `@remotion/install-whisper-cpp`). If the user supplies a `.srt` file, import it instead (import-srt-captions.md). Save the result to `public/data/<name>.captions.json`.
2. Group the words into pages of 3–6 words with `createTikTokStyleCaptions`, and highlight the active word.
3. Convert ms to frames with `Math.round(ms / 1000 * fps)`. Never hard-code timings; they all come from the JSON.
4. Use `calculateMetadata` to set the duration from the audio length.
5. Keep captions inside the safe area: away from the bottom 20% on 9:16 videos, where platform UI sits.
6. Skills: `remotion-captions`, `remotion-markup` (calculate-metadata.md, voiceover.md, text-highlights.md).

### 10.6 Animated charts from a CSV

> Turn `public/data/<file>.csv` into an animated `<bar/line/donut>` chart: `<title>`, highlight `<series/point>`.

1. Load the CSV (put it in `public/data/`). Parse it with `staticFile` + `fetch` inside `calculateMetadata`, or read it at build time into a typed `data.ts`. **Check the columns, types and units, and report anything odd before animating.**
2. Choose the chart from the data's shape: bars to compare categories, a line for change over time, a donut for parts of a whole (6 slices or fewer). Before choosing colours, read the global `dataviz` skill if it's available.
3. Animate with meaning: axes first, then bars growing or the line drawing (`evolvePath` from `@remotion/paths`), then labels counting up (`interpolate`, rounded to the data's precision), then the highlight. Stagger elements by about 3–5 frames.
4. Draw the chart as SVG from your own scales; don't add a chart library that animates on its own clock. Every number on screen must match the CSV exactly.
5. Skills: `remotion-markup` (measuring-text.md, timing.md), `remotion-render`.

### Bonus ideas

These combine the playbooks. For a launch reel, use 10.4 for the content and 10.2 to time it to music. For a data story, combine 10.6 with 10.5 voiceover captions. For a website, pair 10.3 hero loops with 10.4 cut-downs for social media.

## 11. Don'ts

- Don't edit `src/index.ts` or the files in `.claude/skills/`.
- Don't commit `out/`, `node_modules/` or `.env`.
- Don't mix `@remotion/*` versions.
- Don't use non-deterministic animation (see §5).
- Note that some companies need a paid Remotion company licence: https://remotion.dev/license
