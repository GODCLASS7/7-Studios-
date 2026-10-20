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
│   └── audio/             ← music, voiceover, SFX
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

1. **Confirm the brief:** topic, length, format(s), copy, brand assets and audio. Fill gaps with sensible defaults and say which ones you chose.
2. **Read the matching skill(s)** in `.claude/skills/`.
3. **Build** the video in `src/videos/`, register it in `Root.tsx`, and put reusable parts in `src/components/`.
4. **Check:** `npm run lint` must pass. Render stills at key frames (each scene start, mid-animation and the last frame), look at them, and fix any layout problems.
5. **Render** the full video to `out/<Id>.mp4` and share it.
6. **Commit** the source, not `out/`. Use short, imperative commit messages, for example "Add Promo 9:16 composition".

## 10. Don'ts

- Don't edit `src/index.ts` or the files in `.claude/skills/`.
- Don't commit `out/`, `node_modules/` or `.env`.
- Don't mix `@remotion/*` versions.
- Don't use non-deterministic animation (see §5).
- Note that some companies need a paid Remotion company licence: https://remotion.dev/license
