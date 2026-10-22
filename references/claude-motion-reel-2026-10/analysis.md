# "Make Claude motion videos" reel, and prompt-motion.com

Source: an Instagram reel (instagram.com/reel/Det1WW_Ocn3), watched with vidIQ on 22 Oct 2026 (10 credits), and the
index page of prompt-motion.com (one Firecrawl read; individual prompt pages not opened). The reel's footage,
music and the featured creators' videos are theirs; we take techniques only.

## The reel (9:16, 42 s)

A how-to reel: a presenter on camera, a dark crumpled-paper canvas, and screen mock-ups.

| Time | What happens |
|---|---|
| 0:00–0:05 | Hook spoken to camera ("everyone posts these crazy cool Claude motion videos, but nobody really shows you how"); cards of other creators' videos spring onto the paper with small rotations, each with its @handle |
| 0:05–0:14 | Seven styles, one per cut on the beat, each tagged bottom left in mono (`01 - one-line` …): **one-line** (a continuous blue line drawing over a millimetre grid), **ASCII** (a spinning 3D torus in green phosphor characters), **pixel art** (Game Boy 4-shade landscape, dithered sphere), **Renaissance** (Da Vinci-style technical sketch, construction circles, parchment), **risograph** (halftone spot colours, cut-paper hands and shapes), **show-reel** (a dot grid pulsing out from a red dot, HUD labels: WAVE FIELD, 128 BPM, timecode), **ink bloom** (blue ink spreading in water under a red dot) |
| 0:14–0:21 | Terminal mock-up: `/model`, a menu choosing the model, an effort meter filling to max; serif italic headline with lime-green accent words |
| 0:18–0:21 | The prompt: format, colours (`#000000`, `#33FF66`), 124 BPM, a reference image attached |
| 0:21–0:28 | "Ask for the storyboard first": a 2×3 storyboard of keyframes with time ranges, a token counter rolling up, an "approve ✓" button pressed |
| 0:28–0:34 | Files being written, a preview window, a waveform; an iteration prompt ("make the glitch 2 frames shorter") |
| 0:34–0:38 | A browser scroll through prompt-motion.com with a cursor hovering and clicking |
| 0:38–0:42 | Three style cards above the presenter, a lime pill: "comment MOTION" |

Craft notes: retro styles stepped at a lower frame rate over a smooth timeline; mono for tags, numbers and
timecode, serif italic for the narrative headline; one accent colour (phosphor green / lime).

## prompt-motion.com (index page)

"A collection of motion videos made with Claude Opus 5.5, with the prompts and skills behind them." About 235
entries (231 prompts, 4 skills), each crediting its creator, with a "customize any prompt" feature and
sponsored spots. Category counts on the page: Product UI 103, Kinetic type 98, Music 51, Shapes 44,
Particles 43, Charts 34, Diagrams 31, Characters 27, Photos 23, Phone 22, Code 21.

## Against Motion Studio

| Their piece | Motion Studio today |
|---|---|
| Storyboard before building | Already the studio's gate (storyboard, animatic, style frames before production) |
| Prompts from elsewhere | Playbook 10.8 imports a spec or generation prompt into a job; credit the creator |
| One-line drawing | `evolvePath`, hand-drawn underlines and notes; **no single-stroke illustration style** |
| ASCII / phosphor terminal | **None** (no character renderer, no CRT scanlines or glow) |
| Pixel art | **None** (no palette quantising or ordered dithering) |
| Renaissance sketch | `paper.tsx` paper and ink, Caveat; **no construction-line sketch style** |
| Risograph | Grain and paper; **no halftone, spot colours or misregistration** |
| HUD dot field | **None** |
| Ink bloom | **None** |
| Stepped frame rate for retro looks | `onTwos` |
| Terminal / CLI mock-up for how-to reels | App window, profile follow and file scroll inserts; **no terminal insert** |
| Cards of other creators' work with handles | `Cards` template and on-screen credit rule |
| Product UI and kinetic type (the site's two biggest categories) | Covered: Cards, TitleFX, kinetic titles, inserts, 10.4; the website-motion work (references/website-motion-2026-10) adds the morphing UI |
