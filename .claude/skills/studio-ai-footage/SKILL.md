---
name: studio-ai-footage
description: Playbook 7, AI footage plus a motion-graphics finish. Plan, prompt, cost, generate, upscale and composite AI video and images (Seedance, Kling, Veo, Cinema Studio and others through the Higgsfield connector) into a Remotion edit at 4K. Use when a storyboard panel's source is ai-video or ai-image, or the user asks for generated, cinematic or photoreal footage.
---

# Playbook 7: AI footage → motion-graphics finish (4K)

AI models make the realistic pixels. Remotion makes everything exact: type, logos, numbers, timing, grade and sound. Together they produce a result neither can reach alone.

## 0. Preconditions

- Gate G1 (storyboard) is approved, and the AI panels are marked `source: "ai-video"` or `"ai-image"`.
- `balance` (Higgsfield) has been checked, and a **credit quote** for the full shot list has been approved by the user. Re-quote if the plan changes.

## 1. Shot list

For each AI panel, add a shot to `jobs/<id>/shots.json`:

```json
{ "panel": "1", "shot": "S01", "seconds": 4, "aspect": "16:9", "model": "seedance_2_0", "resolution": "1080p",
  "keyframe": { "model": "nano_banana_pro", "prompt": "…", "resolution": "4k" },
  "prompt": "…", "endFrame": null, "seed": null, "takes": 2, "upscale": "topaz_video" }
```

- Generate a little longer than the panel (+1 s) so there's room to trim.
- Match the panel's `camera` move in the prompt.

## 2. Prompt formula (video)

`[shot size + lens] of [subject] [doing action] in [setting], [camera move], [lighting], [mood/colour], [style/film stock], [motion pacing]`

> Medium close-up, 50mm, of a ceramic mug on a walnut desk as steam curls up, slow push-in, warm low-key window light from the left, calm amber palette, shot on 35mm film, gentle motion.

- One action per shot. Describe motion explicitly: what moves, which way, how fast.
- **No text, logos or UI in the prompt.** Leave clean space where titles will go ("negative space upper third").
- Keep wardrobe, palette and light consistent across shots. Reuse the same reference images, character IDs (Soul ID / `soul_cast`) and seed where supported.

## 3. Keyframe first

1. Generate the start image for each shot with an image model (see providers.md). Use 4K when it will be upscaled or used as a still.
2. Show the keyframes at Gate G2, together with the style frames. Changes are cheap at this stage.
3. For controlled moves, also generate an **end frame** and use a model that supports start/end frames (`cinematic_studio_3_0`, `kling_o3_flf`).

## 4. Generate

1. Confirm the model's parameters with `models_explore` `get`. Upload the keyframes as references (`media_upload` → `media_confirm`).
2. Submit all shots with `generate_video_batch`, then `jobs_wait`, which waits up to 15 s per call; loop it.
3. **Review every take.** Download it, extract a contact sheet with `npx remotion ffmpeg -i take.mp4 -vf fps=2,scale=480:-1,tile=4x2 sheet.png`, Read it, and check:
   - morphing hands or faces, warped geometry or flicker;
   - the camera move matches the panel;
   - there's room for titles;
   - continuity with neighbouring shots.
4. Regenerate a failed take at most twice, with a targeted prompt fix. If it still fails, tell the user and propose a fallback: a different model, or a motion-graphics treatment.

## 5. Bring it into the project

- `npm run fetch-asset -- "<url>" <job> footage S01_t2.mp4 --model=seedance_2_0 --prompt="…" --provider-job=<id> --credits=<n>`
- If the shot isn't native 4K, upscale the **chosen take only** (`topaz_video` 2160p or `bytedance_video_upscale` 4K), then fetch the upscaled file. Deflicker if needed.

## 6. Composite in Remotion

```tsx
<Grade look="film" vignette={0.35}>
  <FootageShot src="jobs/acme/footage/S01_t2_4k.mp4" trimBeforeSeconds={0.5} move={{ fromScale: 1, toScale: 1.06 }} />
</Grade>
<KineticTitle text="Built for focus" startFrame={12} />
<Grain opacity={0.05} />
```

- Grade every shot with the **same** look so the AI shots match each other and the graphics.
- Add titles, lower thirds, logos and captions on top, in the safe areas.
- Use transitions from `@remotion/transitions`, and light leaks from `@remotion/light-leaks` for warmth. Add motion blur (`@remotion/motion-blur`) to fast graphic moves so they sit with the filmed motion.
- Audio: music bed, SFX on cuts and hits, voiceover. Then follow `studio-finishing` for loudness.

## 7. Cost discipline

- Use draft or cheap models (`seedance_2_0_mini`, `kling3_0_turbo`) only for internal tests. Never show them to the user as the final look.
- Upscale only the takes that made the cut.
- Keep a running credit total from `assets.json`, and report it at delivery.
