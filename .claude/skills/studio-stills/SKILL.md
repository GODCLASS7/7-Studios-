---
name: studio-stills
description: Design still graphics at any resolution with Remotion, including posters, flyers, social posts, carousels, thumbnails, banners, ads, cards, infographics and print pieces at 300 DPI. Covers concepts, approval, exact typography over AI or photo imagery, and export. Use for any static design request.
---

# Still graphics

A still is a Remotion `<Still>`: React and CSS rendered by headless Chrome. Text, shapes and SVG stay razor-sharp at any size. Photos and AI images must be at least the output resolution, so upscale them first if needed.

## Sizes

Use `src/lib/formats.ts`:
- `social.*`, such as `ig-post` 1080×1350, `story`, `yt-thumb` and `og-image`. Render these with `still-4k` (2×).
- `print.*`: A5/A4/A3, Letter, posters and business cards, already at 300 DPI pixel size. Render these with `still-print` (1×).
- Use `mmToPx()` / `inToPx()` for custom sizes.

**Print:**
- Add **3 mm bleed** on every side (`mmToPx(3)` ≈ 35 px) and keep text 5 mm inside the trim.
- Chrome renders in sRGB. If the printer needs CMYK or a PDF/X file, say so, and offer a PDF via the Adobe connector or the print shop's conversion.
- Chromium can't render more than about 16384 px per side.

## Workflow

1. **Brief:** purpose, where it will appear, the copy (exact wording), brand, mandatory elements and size(s).
2. **Concepts (⏸ gate):**
   - Build 2–3 directions as separate `<Still>` compositions, `src/videos/<Name>/Concept{A,B,C}.tsx`.
   - Make a concept sheet: a `jobs/<id>/storyboard.json` where each panel has `capture: { composition, frame: 0 }`, `source: "still"`, a direction name as the title, and a one-line rationale as the `action`.
   - Choose a sheet `format` that matches the concept aspect.
   - Render it with `npm run storyboard -- <id>`.
3. **Critique before sending.** Read each rendered concept at full size and again scaled small (phone view). Go through the design checklist in the `studio` skill.
4. **Refine** the chosen direction. For imagery, generate it with the providers in `studio/providers.md`: keyframe models for photoreal, `recraft_v4_1` for vector, `flux_3_image` for multi-reference product consistency. **Always set final text in Remotion**, never inside the generated image.
5. **Variants:** make one composition per size, sharing a layout component. Reflow the layout rather than scaling: change the type scale and positions for each aspect.
6. **Export:**
   - `npm run render -- <Comp> still-4k` or `still-print` gives PNG.
   - For JPG at quality 95: `npx remotion ffmpeg -i in.png -q:v 2 out.jpg`.
   - `npm run qc -- <file> --expect=<WxH>`.

## Typography rules that make stills look expensive

- Use one display face and one text face at most. Bundle every font in `public/brand/fonts` and load it with `@remotion/fonts`.
- Headlines: tight leading (1.0–1.1) and slightly negative tracking. Large size contrast with body text (at least 3×).
- Align everything to a margin grid: 6–8% of the short side for social, and the trim margin for print.
- Contrast for text over images: add a scrim (gradient) or pick a quiet area of the image. Never rely on a drop shadow alone.
- One accent colour, used for one thing.

## Carousels: Carousel Studio

The `Carousel` template (`src/templates/Carousel/`) renders a whole deck, one slide per frame, from a props file. Formats: `Carousel-4x5` (1080×1350, Instagram's default), `-1x1`, `-9x16` (TikTok photo posts, stories).

```bash
npm run carousel -- <id> frames public/jobs/<id>/footage/<video>.mp4 --count=8 --cutout   # stills from a video (optional)
npm run carousel -- <id> render --format=4x5                                              # out/<id>/carousel/4x5/slide-01.jpg … + sheet.jpg
```

1. **Words first.** Write the deck from the transcript (`takes.md`) or the topic: a cover that makes a promise, one idea per slide, a closing slide that says what to do (save, share, follow). Quote the speaker exactly; check scripture word for word. Show the slide copy for approval (⏸) before rendering.
2. **Pictures.** `frames` picks the sharpest, best-exposed moments of a video (preferring ones with a face after `npm run track`), at least `--min-gap` seconds apart, full size; `--cutout` also cuts the person out of each (a transparent PNG trimmed to them). Or use the user's photos in `public/jobs/<id>/`.
3. **Props**, in `jobs/<id>/carousel.json`:
   ```json
   { "look": "glow", "brand": "the-wait-culture", "handle": "@thewaitculture",
     "slides": [
       { "kind": "cover", "kicker": "The Wait Culture", "title": "Waiting is *not* wasting", "image": "jobs/<id>/carousel/frame-02-cut.png", "cutout": true },
       { "kind": "list", "title": "Three things to do *while you wait*", "items": ["Keep showing up", "Stay close to people", "Write down what changes"] },
       { "kind": "cta", "title": "Save this for *your* season", "body": "Send it to someone who's waiting." } ] }
   ```
   Slide kinds: `cover`, `point` (title + body), `list` (`items`), `quote` (`body`, `reference`), `stat` (`value`, `title`, `body`), `scripture` (`body`, `reference`), `image` (a photo with a title), `cta`. `*word*` sets a word in the accent colour (italic in the serif looks). Titles fit themselves. Also `swipeHint`, `pageNumbers`, and `theme` to override colours and fonts.
4. **Looks:** `glow` (dark, a glowing horizon, the speaker cut out over it), `paper` (warm paper, ink serif, taped photos), `poster` (condensed caps filling the width, an accent bar), `editorial` (cream page, serif with italic accents, arched photo), `bold` (big caps over full-bleed photos), `soft` (blush and cream, rounded photos), `pop` (bright colour blocks, sticker photos), `scripture` (ink on paper, small-caps references). `"brand": "<slug>"` applies the brand kit's colours, fonts and logo.
5. **Check** the contact sheet (`sheet.jpg`) at phone size: the cover must read in a second, nothing important in the bottom 15% on 4:5 (the app's buttons), and every number and quote matches the source.
6. **Post** through the queue (`npm run posts -- add out/<id>/carousel/4x5 …`, studio-edit §5b): TikTok takes it as a photo post; an Instagram carousel is handed to the user to post.

For a series of single posts, use one composition with an `index` prop and a shared frame; keep the headline in the same place on every one.
