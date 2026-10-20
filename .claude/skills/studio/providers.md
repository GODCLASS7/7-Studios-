# Provider map: what Claude can call, and what each tool is for

The studio's "APIs" are the connectors attached to the user's Claude account (MCP tools), plus the local Remotion toolchain. There are no API keys in this repo. Each connector authenticates through Claude.

**Model lineups and prices change.** Before using any model, confirm its parameters, durations, aspect ratios and cost with Higgsfield `models_explore` (`action: "get"`, `model_id`). Treat the tables below as a starting point.

> Checked at setup on 2026-10-20: the Higgsfield connector was live, but the account was on the **free plan with 0 credits**. Generation needs credits, so check `balance` first.

## 1. Local: Remotion (always available, free, exact)

| Capability | How |
|---|---|
| Motion graphics, kinetic type, UI, charts, captions, transitions, compositing | `src/` compositions and `src/lib` |
| Stills at any size: social, thumbnails, print at 300 DPI, up to 16384 px per side | `<Still>` compositions with `still-4k` / `still-print` presets |
| 4K / ProRes / alpha masters | `scripts/render.mjs` presets |
| Storyboards and animatics | `scripts/storyboard.mjs` |
| QC: resolution, fps, duration, colour, black frames, loudness | `scripts/qc.mjs` (bundled ffprobe/ffmpeg) |
| Grading with LUTs, loudness normalisation | `npx remotion ffmpeg` (see the `studio-finishing` skill) |

## 2. Higgsfield connector: generation hub (`mcp__Higgsfield__*`)

**Tools:**
- Discovery: `models_explore` (list/search/get/recommend), `balance`.
- Generation: `generate_image`, `generate_video`, `generate_audio`, plus `*_batch` versions.
- Waiting and results: `jobs_wait`, `show_generations`, `show_result`.
- Inputs: `media_upload` / `media_confirm` (use local files as references).
- Editing: `upscale_image`, `upscale_video`, `remove_background`, `outpaint_image`, `reframe`.

Some workflows have their own instructions; follow them. Use `get_workflow_instructions` for multi-step video, or `get_preset_instructions` for presets.

### Video models

| Need | Model id (verify first) | Notes |
|---|---|---|
| General cinematic image-to-video, native 4K | `seedance_2_0` | 480p–4K |
| Newest Seedance | `seedance_2_5` | up to 1080p, so upscale for 4K |
| Premium cinematic, genre control, start/end frames, native 4K | `cinematic_studio_3_0` | 4–15 s, 21:9–9:16, optional audio |
| Native-4K alternative | `flux_3_video`, `gemini_omni_flash_1_1` | up to 4K |
| Strong motion, characters, motion control | `kling3_0`, `kling3_0_motion_control`, `kling_o3_flf` (first/last frame) | |
| Generated audio and dialogue | `veo3_1` | quality tiers basic/high/ultra |
| Budget / fast drafts | `seedance_2_0_mini`, `kling3_0_turbo`, `wan3_0` | use for tests, not finals |
| Lip sync | `sync_so` | |
| Clean-up | `video_deflicker`, `video_background_remover` | |
| Upscale to 4K | `topaz_video` (2160p), `bytedance_video_upscale` (4K) | for any shot not generated at 4K |

### Image models

| Need | Model id (verify first) | Notes |
|---|---|---|
| Keyframes for video, photoreal, text in image | `nano_banana_pro`, `nano_banana_2` | up to 4K |
| Hi-res photoreal / transformations | `seedream_v4_5` | up to 4K ("high" about 6K) |
| Multi-reference consistency (product/character) | `flux_3_image` | up to 10 references, 4K |
| Cinematic stills / concept art | `cinematic_studio_2_5`, `soul_cinematic` | up to 4K |
| Typography / text rendering, transparent backgrounds | `gpt_image_2_5`, `gpt_image_2`, `ideogram_4_5` | still overlay final text in Remotion |
| Vector logos, icons, brand illustration | `recraft_v4_1` (`model_type: vector`) | |
| Consistent characters | `soul_cast`, Soul ID with `soul_2` | |
| Extend canvas / re-aspect | `flux_2_pro_outpaint`, `outpaint` | |
| Split into layers (for parallax) | `image_decompose` | |
| Upscale | `topaz_image`, `topaz_image_generative`, `bytedance_image_upscale` (4K) | |
| Cut-outs | `image_background_remover` | |

**Rules:**
1. Quote the cost and get an explicit yes before every generation batch.
2. Generate keyframe images first, then image-to-video.
3. Record each asset's provenance with `npm run fetch-asset`.
4. No likeness of real people without consent. No generated third-party logos or trademarks.

## 3. Other connectors (use when the job calls for them)

| Connector | Use it for | Notes |
|---|---|---|
| **Firecrawl** (`firecrawl_scrape`, formats incl. `branding`) / WebFetch | Pulling copy, colours, fonts and logo from a website (playbook 10.4) | Use only what's on the page |
| **Adobe for Creativity** | Remove backgrounds, generative expand, **vectorise a raster logo** (`image_vectorize`), font recommendations, **speech enhancement** for recorded VO (`media_enhance_speech`), PDF creation/export for print | Call `adobe_mandatory_init` first, every session |
| **vidIQ** | Voiceover (`vidiq_voiceover_generate`), music (`vidiq_generate_music`), b-roll, and **thumbnail and title scoring** (`vidiq_score_thumbnail`, `vidiq_score_title`) for YouTube deliverables | Check each tool's cost/limits |
| **Higgsfield audio** | `generate_audio`, `create_voice`, `voice_change`, `dubbing` | |
| **Figma / Canva** | Hand-off for clients who edit in those tools (e.g. `html_to_figma`, Canva `import-design-from-url`) | Only when asked |
| **Hugging Face** | Finding open models (e.g. Wan, LTX, HunyuanVideo) | They need a GPU host; the cloud container has none |

## 4. What stays local on purpose

Final typography, logos, numbers, charts, captions, colour grade and audio mix always come from Remotion and ffmpeg. That's what makes the output brand-exact, editable and identical on every render. That precision is the studio's edge over a generation-only tool.
