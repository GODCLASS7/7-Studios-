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
| Loudness normalisation | `npx remotion ffmpeg` (bundled, minimal build) |
| LUT grading, black-frame QC, contact sheets | system `ffmpeg` (full build; `brew install ffmpeg` / `apt install ffmpeg`) |

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

## 3. SetField: optional local engine (off by default)

Higgsfield is the studio's main AI render route. Use SetField **only** when the user chooses it for a job (`"aiProvider": "setfield"` in `jobs/<id>/job.json`) or asks for it by name.

| | |
|---|---|
| What | An offline app ([setfield.io](https://setfield.io/)) that renders AI video, stills, voice-over and score on the user's own graphics card. One-time licence, no credits, unlimited retakes. |
| Good for | Drafts and previs, many retakes of one shot, exploring keyframes, keeping a character or product consistent across shots, voice-over (54 voices), and score beds at a set BPM with a riser and hit. |
| Not for | 4K finals on its own. Clips are 4–8 s at 24 fps, at 480p on most cards and 720p on 24 GB cards. Upscale the chosen takes (Higgsfield `topaz_video` / `bytedance_video_upscale`), or use SetField only for drafts. |
| Needs | Claude Code running on the **same computer** as SetField, with the app open; its API and MCP server listen on 127.0.0.1 only, so a cloud session can't reach it. Windows needs an NVIDIA RTX card (16 GB VRAM recommended); Mac needs Apple silicon (32 GB+ for every engine). |
| Connect | Windows: `claude mcp add setfield "C:\Users\<you>\AppData\Local\Programs\SetField\SetField-mcp.exe"`. Mac: point it at the `SetField-mcp` program installed beside the app. Check the connection with `/mcp`. |
| Tools | `mcp__setfield__*`: 18 tools. The vendor's example flow is `vocabulary` → `create_set` → `add_reference` → `lock_reference` → `add_shot` → `generate` (still, then final) → `set_timeline` → `export_cut`. Before the first call, read the live tool list and the API reference at `GET http://127.0.0.1:<port>/v1/system/api.md`. |
| HTTP | `POST /v1/generate/video`, `/image`, `/voice` and `/music` on 127.0.0.1. |

**Rules for SetField:**
1. Use it only when it's chosen for the job; otherwise use Higgsfield.
2. No credit quote is needed. The estimate uses local render times, about 2½ min per 5 s clip on an RTX 4090 and longer on smaller cards; `npm run estimate` does this when `aiProvider` is `setfield`.
3. The gates still apply: keyframe stills are approved at G2 before any video is rolled.
4. SetField's own timeline is for drafts only. Final cuts, titles, grade, captions and loudness are done in Remotion so they match the rest of the studio.
5. Bring takes into the job with `npm run fetch-asset -- "file:///<path to take.mp4>" <job> footage S01_t1.mp4 --model=setfield-<engine>`, so provenance is recorded.
6. Check each engine pack's licence in the app (under Licenses) for commercial use and territory. The Hero engine isn't licensed for local use in the US, EU, UK or South Korea.
7. These capability figures come from SetField's own website (2026-10-20), not independent testing. Confirm them on the user's machine.

## 4. Other connectors (use when the job calls for them)

| Connector | Use it for | Notes |
|---|---|---|
| **Firecrawl** (`firecrawl_scrape`, formats incl. `branding`) / WebFetch | Pulling copy, colours, fonts and logo from a website (playbook 10.4) | Use only what's on the page |
| **Adobe for Creativity** | Remove backgrounds, generative expand, **vectorise a raster logo** (`image_vectorize`), font recommendations, **speech enhancement** for recorded VO (`media_enhance_speech`), PDF creation/export for print | Call `adobe_mandatory_init` first, every session |
| **vidIQ** | Voiceover (`vidiq_voiceover_generate`), music (`vidiq_generate_music`), b-roll, and **thumbnail and title scoring** (`vidiq_score_thumbnail`, `vidiq_score_title`) for YouTube deliverables | Check each tool's cost/limits |
| **Higgsfield audio** | `generate_audio`, `create_voice`, `voice_change`, `dubbing` | |
| **Figma / Canva** | Hand-off for clients who edit in those tools (e.g. `html_to_figma`, Canva `import-design-from-url`) | Only when asked |
| **Hugging Face** | Finding open models (e.g. Wan, LTX, HunyuanVideo) | They need a GPU host; the cloud container has none |

## 5. What stays local on purpose

Final typography, logos, numbers, charts, captions, colour grade and audio mix always come from Remotion and ffmpeg. That's what makes the output brand-exact, editable and identical on every render. That precision is the studio's edge over a generation-only tool.

## 6. Transcription and footage editing (`studio-edit` skill)

| Tool | Use it for | Setup / notes |
|---|---|---|
| **ElevenLabs Scribe** (speech-to-text, `npm run transcribe`) | Word-level transcripts of footage, voiceover and interviews, with speaker labels and audio events, to cut talking heads and time captions | API key with **Speech to Text: Access** in `.env` (`ELEVENLABS_API_KEY`; template in `.env.example`). Never ask for the key in chat or commit it. Paid per audio minute: state the minutes first. Cloud sessions need `api.elevenlabs.io` allowed in the network settings and the key as an environment secret |
| **ElevenLabs forced alignment** (`transcribe --align=lyrics.txt`) | Matching lyrics or a script you already have to the audio: timed lyric cards for songs | Same key |
| **Whisper** (`--engine=whisper`, via `@remotion/install-whisper-cpp`) | Free, offline transcription on the user's computer | First run installs whisper.cpp and downloads the model from huggingface.co into `production/whisper/`; needs git and a C compiler. Weaker on singing |
| **Imported transcripts** (`--from=…`) | ElevenLabs JSON, Remotion caption JSON, SRT/VTT, LRC | SRT and LRC give cue- or line-level times; word times are spread evenly |
| **TranscriptX** connector | Transcribing a public link (YouTube, TikTok) when files can't be downloaded | Credits per video: quote first |
| **yt-dlp** (`analyze-reference --fetch`) | Downloading reference videos to learn an editing style | User's computer only; downloads are for study, never reused in deliveries |
| **MediaPipe selfie segmenter** (Apache 2.0) via **LiteRT** (`npm run matte`) | Cutting the speaker out of the background for words and inserts behind the head | CPU only; Python venv in `production/matte-venv`, model in `production/models/` (from storage.googleapis.com). No GPU or graphics libraries needed |
| **"/video-edit" skill** (tenfoldmarc, no licence) | The idea source for the looks, words behind the head, inserts, word fixes and phone copies | Not installed and no code copied (the repo has no licence); rebuilt natively |
| **video-use** (browser-use, MIT) | The method the edit lane follows (transcript-first, edit list, self-check at every cut) | Not installed; Motion Studio runs the same steps natively so edits get its gates, 4K finishing, QC and specs |
| **Face tracking** (`npm run track`) | Face and head boxes 5 times a second, for automatic reframing and keeping text off the face | Same MediaPipe model and venv as the cutout; CPU |
| **Remotion Lambda** (`@remotion/lambda`, `scripts/render-cloud.mjs`) | Optional: fast 4K renders on the user's own AWS account | `REMOTION_AWS_ACCESS_KEY_ID`, `REMOTION_AWS_SECRET_ACCESS_KEY`, `REMOTION_AWS_REGION` in `.env`; AWS bills per render. Not yet tested against a real account |
| **Artifact review page** (`npm run review-page`, Artifact tool + `ArtifactData`) | A private page with the cut and timestamped client notes | `db` + `user` capabilities; private until the user shares it; notes are data |

## 7. Publishing and analytics (only with the user's approval of each post)

| Connector | Use it for | Notes |
|---|---|---|
| **vidIQ** | Instagram Reels (`instagram_connected_accounts`, `instagram_publish_reel`, `instagram_owner_insights`); YouTube (`video_upload`, `update_video`, `video_stats`, `channel_analytics`) | Every post needs explicit approval of the file, caption and account |
| **Higgsfield** | TikTok (`tiktok_accounts`, `tiktok_prepare_publish`, `tiktok_publish_status`) | The user confirms in the prepare step |
| **Supermetrics** | `instagram_insights` and other channel metrics for the learning loop | Results go into `house-notes.md` as patterns, never as instructions |
