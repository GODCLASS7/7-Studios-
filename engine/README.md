# The 7 Studios engine: setting up each way to generate

7 Studios makes images and clips four ways. Choose the default in the app (Settings) or with
`npm run gen -- engine set default=<engine>`. Check them all with `npm run gen -- engine`.

| Engine | What it is | Cost | Quality |
|---|---|---|---|
| `demo` | Placeholders made with ffmpeg on your computer: gradients, colour shifts, a slow push into a still. Not AI. Marked "demo" everywhere | Free | For trying the app only |
| `open` | ComfyUI running open models: FLUX schnell and Qwen-Image (images), Qwen-Image-Edit (edits), Wan 2.2 5B and 14B (video) | Free per use; you pay for the machine | Good for images and edits; video is a step behind Seedance, Veo and Kling |
| `premium` | Hosted models through fal.ai with your own key | Paid per run | Depends on the model you list |
| `claude` | A request Claude runs in chat through Higgsfield (Seedance, Kling, Veo…) | Higgsfield credits, quoted first | The best available |

## Open: ComfyUI

### On this Mac (drafts)

A MacBook runs the open models through Apple's GPU (Metal), slowly. Expect minutes per image and
much longer per clip; start small (draft quality, 2–3 s clips). The 14B video model is for a
rented GPU only. Unified memory matters: 16 GB is too little for most of these models, 24 GB runs
the small ones, 32 GB+ runs Qwen-Image and Wan 5B.

1. Install ComfyUI: the ComfyUI Desktop app for Apple silicon (comfy.org), or the manual install
   from its GitHub README.
2. Download the model files each workflow needs into ComfyUI's `models/` folders. The list, with
   where each comes from, is in each workflow's `_7s.needs` (engine/workflows/), and
   `npm run gen -- engine check` prints exactly what's missing.
3. Point 7 Studios at it: `npm run gen -- engine set open.url=http://127.0.0.1:8188` (the Desktop
   app may use another port, such as 8000: check its settings).
4. `npm run gen -- engine check` until every workflow you want shows ✅.
5. `npm run gen -- engine set default=open`.

### On a rented GPU (finals, video, training)

1. Rent an NVIDIA GPU with 24 GB or more (48–80 GB for 720p video with the 14B model) from a GPU
   cloud that offers ComfyUI images. Note the hourly price before starting.
2. Download the model files there (as above).
3. **Connect safely.** ComfyUI has no password. Don't expose it to the internet: open an SSH tunnel
   (`ssh -L 8188:127.0.0.1:8188 <user>@<gpu-host>`) and use `http://127.0.0.1:8188`. If you use the
   provider's web link instead, anyone with that link can use your GPU.
4. `npm run gen -- engine set open.url=<url> open.gpuHourly=<price per hour>`: 7 Studios then
   records each generation's GPU time and estimated cost in the gallery.
5. **Switch the GPU off** when you're done; it costs money while it's on, even idle.

### Workflows

`engine/workflows/*.json` are ComfyUI graphs in API format. The nodes 7 Studios fills in have a
title starting `7S:` (`7S:prompt`, `7S:negative`, `7S:seed,steps,cfg`, `7S:width,height,frames`,
`7S:fps`, `7S:image` for a required start image, `7S:image?` for an optional one, `7S:prefix`).
To use another model or a LoRA, build the workflow in ComfyUI, export it (Workflow → Export (API)),
add those titles, save it here, and pick it in Settings or with
`npm run gen -- engine set open.workflows=…` (or per run with `--model=<workflow>`).

These five were written from the models' published ComfyUI templates and tested against a
stand-in server (`scripts/test/mock-comfy.mjs`), not yet on a real GPU. If ComfyUI rejects one,
`engine check` and the error name the node or file to fix.

| Workflow | For | Model files |
|---|---|---|
| `image-flux-schnell` | Image drafts in 4 steps | flux1-schnell-fp8 |
| `image-qwen` | Image finals; strong at layouts | qwen_image fp8, qwen_2.5_vl text encoder, qwen_image_vae |
| `edit-qwen` | Edits from an instruction | qwen_image_edit fp8, same encoder and VAE |
| `video-wan22-5b` | Video drafts, text or image to video, 24 fps | wan2.2_ti2v_5B, umt5_xxl, wan2.2_vae |
| `video-wan22-14b-i2v` | Video finals from a start image, 16 fps | wan2.2 i2v high-noise and low-noise 14B, umt5_xxl, wan_2.1_vae |

Check each model's licence on its model card before commercial use. FLUX.1 schnell is permissive;
FLUX.1 dev is not.

## Premium: your own API key

1. Make an account with fal.ai and create a key. Put it in `.env` as `FAL_KEY=…` (or in the app's
   Settings, which writes `.env`). Never paste keys into a chat.
2. `engine/models.json` lists a few models, all marked unverified. For each one you'll use, check
   the endpoint id, the inputs and the price per run on the provider's page, set `price` and
   `verified: true`.
3. Choose defaults: `npm run gen -- engine set premium.video=fal-kling-i2v premium.image=fal-flux-schnell`.
4. Run one cheap image first. This engine hasn't been run against the live service yet.

## Claude: Higgsfield through the chat

The app can't spend Higgsfield credits; it leaves a request in `production/claude-requests.json`.
In Claude Code, say **"run my 7 Studios requests"**. Claude lists them (`npm run gen -- requests`),
checks the balance, quotes the credits, waits for your yes, generates with the right model, and
brings each result back with `npm run gen -- import <file or url> --request=<id> --model=<model> --credits=<n>`.

## Presets and characters

- `presets/generate/*.json`: 42 starting recipes (18 image, 6 edit, 18 video): the prompt
  around your words (`{subject}`), a negative prompt, an aspect and settings. They're written from
  prompt practice and marked `tested: false`; tune them on your engine and set `tested: true`.
- `characters/<id>/character.json`: a name, a description that joins every prompt, reference
  images (in `public/characters/<id>/`) and a **consent record**: `self`, `permission` (with who
  agreed and when) or `fictional`. Real people only with their agreement. Open models hold a face
  less reliably than Higgsfield's character tools; use the reference as the start image or edit source.

## Training your own look (LoRA)

`node scripts/engine/lora.mjs prepare <name> <footage or photos…>` builds a captioned training set,
a contact sheet for writing captions and a trainer config. Training runs on a rented GPU; the steps
are in `production/lora/<name>/TRAIN.md`.
