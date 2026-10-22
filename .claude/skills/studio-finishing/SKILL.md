---
name: studio-finishing
description: Finishing for 7 Studios deliverables, covering 4K/ProRes/alpha render presets, colour grading and LUTs, film grain against banding, motion blur, light leaks, audio mix and loudness, delivery specs per platform, and QC. Use when rendering finals, grading, mixing audio, or preparing files for a platform or editor.
---

# Finishing: from "it plays" to "it's broadcast-clean"

## Render presets (`npm run render -- <Comp> <preset>`)

Compositions are authored at 1080p class; `--scale=2` gives 4K, so layouts are identical at every quality level.

| Preset | Output | Use |
|---|---|---|
| `draft` | 540p, every 2nd frame | internal motion check |
| `review` | 1080p H.264 CRF 20 | client review |
| `4k` | 2160p H.264 CRF 16, PNG frames, BT.709 | web, YouTube, social |
| `4k-hevc` | 2160p H.265 CRF 18 | smaller 4K file |
| `master` | 2160p ProRes 422 HQ `.mov` | editing master and archive |
| `alpha` | 2160p ProRes 4444 with alpha | overlays for Premiere/Resolve/FCP |
| `webm-alpha` | 1080p VP9 with alpha | transparent overlays on websites |
| `still`, `still-4k`, `still-print` | PNG | stills |

Use `--frames=0-89` to render part of a video, and `--props=jobs/<id>/props.json` for data-driven versions.

**4K quality rules:**
- Bitmaps (footage, photos, AI images) must be at least 3840 px wide on 16:9, so upscale them first.
- Use PNG frames for finals; JPEG frames band in gradients.
- Add `<Grain opacity={0.04–0.07} />` over large smooth gradients and dark scenes. It hides banding that 8-bit H.264 adds.
- Avoid thin hairlines under 2 px at the 1080p authoring size; they shimmer.

## Look and grade

1. **In-composition:** `<Grade look="film|warm|cool|punchy|noir|faded" vignette={0.3}>` around footage scenes. Use one look across the whole piece.
2. **LUT on the master** (true colour grade). Put `.cube` files in `public/brand/luts/`, then use a **full ffmpeg build**. Remotion's bundled `npx remotion ffmpeg` is minimal: it has `loudnorm` and `scale` but not `lut3d`, `blackdetect`, `tile` or `fps`.
   ```bash
   ffmpeg -i out/X-master.mov -vf "lut3d=file=public/brand/luts/look.cube" -c:v prores_ks -profile:v 3 -c:a copy out/X-graded.mov
   ```
3. Then encode the delivery file from the graded master:
   ```bash
   ffmpeg -i out/X-graded.mov -c:v libx264 -crf 16 -preset slow -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 -c:a aac -b:a 320k out/X-4k.mp4
   ```

## Polish packages (installed)

| Package | Use |
|---|---|
| `@remotion/transitions` | `TransitionSeries` with fade, slide, wipe, flip and clock-wipe; custom presentations |
| `@remotion/motion-blur` | `<CameraMotionBlur>` on fast moves, `<Trail>` for echo effects |
| `@remotion/light-leaks` | organic light leaks on cuts |
| `@remotion/noise` | deterministic noise for organic drift, wobble and particles |
| `@remotion/paths` | `evolvePath` for line drawing, morphing and path animation |
| `@remotion/shapes` | ready-made SVG shapes |
| `@remotion/layout-utils` | `fitText` / `measureText` so titles never overflow |
| `@remotion/media-utils` | audio data for beat detection and visualisers |
| `@remotion/captions` | caption pages and word-level highlighting |
| `@remotion/fonts` | load bundled fonts from `public/brand/fonts` |

## Audio

- Layer the mix: music bed, voiceover (ducks the music by about 8–10 dB with a volume curve on `<Audio volume={(f) => …}>`), SFX on cuts and hits.
- Clean recorded voiceover with the Adobe connector's `media_enhance_speech` before mixing.
- **Loudness:** −14 LUFS integrated, true peak at most −1 dBTP, for YouTube and social. Normalise the final render (pass 1 measures, pass 2 applies a linear gain, then the audio is trimmed to the video length so AAC padding does not make the file longer than the edit):
  ```bash
  npm run loudnorm -- in.mp4 out.mp4            # two-pass, exact length, video stream copied (--lufs=-14 --tp=-1.5)
  ```
  For broadcast, use −23 LUFS (EBU R128).

## Platform delivery specs

| Platform | Spec |
|---|---|
| YouTube | 16:9 2160p H.264/H.265, 30/60 fps, −14 LUFS; thumbnail 1280×720 (render 2×) |
| Instagram / TikTok / Shorts | 9:16 1080×1920 (2160×3840 is accepted but recompressed), ≤ 90 s for Reels, −14 LUFS |
| LinkedIn / X | 16:9 or 1:1, 1080p is enough, captions burned in (often watched muted) |
| Website hero | `4k-hevc` + H.264 fallback + poster still, muted loop, < 10 MB if possible |
| Editors | `master` ProRes 422 HQ, plus `alpha` for overlays |

## QC (every final)

```bash
npm run qc -- out/<file> --expect=3840x2160 --fps=30 --seconds=<n> --job=<id>
```

Then a visual pass: render stills at every cut, look at them, and check the design checklist in the `studio` skill. Watch the review file once from start to finish with sound.

## Speed

On a 4-vCPU cloud container, a simple 4-second 4K card takes about 25 s; footage-heavy scenes take several times longer. Run `npm run bench` once on a new machine so estimates use its real speed. For long 4K jobs, render on a desktop or set up Remotion Lambda, which renders across AWS servers.
