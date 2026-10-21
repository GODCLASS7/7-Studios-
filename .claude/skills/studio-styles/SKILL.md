---
name: studio-styles
description: Style recipes for Motion Studio, built from the user's Video Editor Reference Library. Six recipes give concrete rules for look, pacing, sound, type, the Remotion build, shooting guidance and QA. Use when choosing or describing the look and feel of a job, when a brief names an editor or style (Peter McKinnon, Daniel Schiffer, Ben Marriott, Mks.Vision, Steven Ndukwu, CapCut/phone-first), or when starting a job from a preset in presets/.
---

# Style recipes

Source: the user's **Video Editor Reference Library** (claude.ai doc, 21 Oct 2026). It profiles 19 editors and maps their skills to the user's ministry and business work. Each recipe below turns one editor's craft into rules Claude can build and check.

**Order of learning in the library: sound and pacing first, then colour, hooks, story, typography, speed workflows.** Apply recipes in that order of priority too. A video with the right sound and pacing and a plain look beats a busy one with weak sound.

**Never use the fan-edit genre** (cutting other people's films or anime; e.g. Wizzy Tutorials, Bankai x7, Rizer-Edits). It relies on copyrighted footage, which risks takedowns, especially on a church channel.

Record the recipe(s) a job uses in `jobs/<id>/spec.json` → `visualNotes`, so the master spec carries them.

**Before planning any job, read the client's section in `house-notes.md`** (preferences learned from earlier feedback) and apply it by default.

---

## 1. `atmosphere`: sound-led atmosphere (Peter McKinnon)

**Use for:** worship clips (Worship With Me), brand films, event recaps, anything that should *feel* rather than inform.

| Element | Rule |
|---|---|
| Pacing | Cut on the music: phrase ends, breaths and lyric lines, never on the camera's timing. Hold shots 2–5 s. Slow emotional build; the biggest moment arrives in the last third. |
| Look | **One house look per series** (`<Grade look="worship">`, or a .cube LUT on the master; `studio-finishing`). Warm, soft contrast, lifted blacks. Same look on every post, so the feed reads as one brand. |
| Sound | Audio leads. Music bed + room tone + 2–4 subtle SFX per minute (breath, page turn, crowd swell). Loudness −14 LUFS. No sound effects over sung lyrics. |
| Type | Minimal: song or theme title as a lower third, small-caps overline, serif title (`font.serif`). |
| Remotion | `FootageShot` + `Grade look="worship"` + `Grain 0.04–0.06`, slow push-ins (`move` 1 → 1.05), crossfades of 8–12 frames only between musical sections. |
| Shoot | Soft window light, one or two angles, phone is fine; record clean room audio. |
| QA | No cut mid-word or mid-note; grade identical across clips; nothing louder than the music's peak. |

References: [McKinnon channel](https://www.youtube.com/@petermckinnon) · [Async on his style](https://async.com/blog/who-is-peter-mckinnon/)

## 2. `product-broll`: commercial B-roll with speed ramps (Daniel Schiffer)

**Use for:** food and product ads (Brothers on the Grill), print-product showcases (D&D Brand Co.).

| Element | Rule |
|---|---|
| Pacing | 10–15 s reels: hit in the first 0.5 s, then build → slow-motion hero → payoff. Ramp fast (2–4×) into slow (0.25–0.5×) on the money moment, then back. Match-cut shape to shape and motion to motion. |
| Look | `<Grade look="food">`: warm, rich reds and browns, crisp highlights. |
| Sound | Sound design carries it: sizzle, flame whoosh, plate clink, pour. Each visual hit gets a sound hit, synced to the frame. Music sits under the SFX. |
| Type | One price/offer line and one order line at the end, large; nothing else on screen. |
| Remotion | `SpeedRamp` with keyframes `[[out, source], …]` (frame-accurate time remap), `FootageShot` for holds, `@remotion/motion-blur` on graphic moves, SFX on their own `<Audio>` tracks. |
| Shoot | **60–120 fps** for anything that will be slowed; dark background, hard side light; flame, smoke and steam backlit. |
| QA | Ramp shows no stutter (enough source fps); every hit has a sound; the price and order line are readable at phone size. |

References: [Schiffer channel](https://www.youtube.com/@danielschiffer) · [Fstoppers: dining-room ad](https://fstoppers.com/vfx/how-shoot-ad-your-dining-room-475016) · [LensVid: gingerbread B-roll](https://lensvid.com/technique/epic-b-roll-fun-in-the-gingerbread-house-behind-the-scenes/)

## 3. `illustrated-type`: illustrated typography (Ben Marriott)

**Use for:** scripture and lyric videos (The Wait Culture), service themes, logo reveals (D&D Brand Co.), explainers.

| Element | Rule |
|---|---|
| Pacing | One phrase per card, 3–3.5 s each. Motion **on twos** (`onTwos`): hand-made, stop-motion feel. A 3-frame breath between cards. |
| Look | Paper, ink and cut-outs, not stock templates. Warm paper page (`PaperTexture`), torn strips (`CutoutStrip`), ink-bleed type (`InkText`), one accent colour. |
| Sound | Beatless pad or gentle bed; a paper rustle on each card; a soft low hit on the end card. |
| Type | `font.serif` (Fraunces) for the words; Inter small caps for overlines; 1–2 emphasis words per phrase, accent colour plus `HandUnderline`. |
| Remotion | **Template: `ScriptureLyric`** (9:16, 16:9, 4:5 still): props `phrases[{ text, seconds, emphasis }]`, `reference`, `version`, `overline`, `audio`. `\|` breaks a line in portrait only. |
| QA | Every emphasis word is in the text; no orphan words in portrait; the scripture text matches the stated translation word for word; the reference and translation are on screen. |

References: [Marriott channel](https://www.youtube.com/@benmarriott) · [Lester Banks: paper cut-out stop motion](https://lesterbanks.com/2020/02/an-easy-way-to-get-a-paper-cutout-stop-motion-look-in-ae/)

## 4. `hook-2s`: two-second hooks and practical transitions (Mks.Vision, SIRMADII AEP)

**Use for:** service promos (Men's Month, Carols, 31st Night), teasers, every ad's opening.

| Element | Rule |
|---|---|
| Pacing | 8–12 s total. **Motion or a reveal in frame 1**, never a logo or a title on black. The payoff is visible by 2.0 s. Loop-friendly ending. |
| Look | High contrast, one bold colour. The transition is practical (lights, a turn, a door, a hand over the lens), shot in camera. |
| Sound | A hit on the reveal; a riser into it; silence for 0.2 s before the hit makes it land. |
| Type | Hook text ≤ 6 words, on screen by frame 6; big, top third. |
| Remotion | Opening scene with `KineticTitle` (`feel="punch"`), cut on the practical transition frame (`Sequence` from that frame), beat grid in `beats.ts`. |
| Shoot | Plan the practical transition in the storyboard (`camera` + `action`), and shoot both halves with matching framing and motion direction. |
| QA | Frame 1 has motion; the hook text is readable at 0.5× scale; the first 2 s make sense with the sound off. |

References: [Mks.Vision](https://www.instagram.com/mks.vision/) · [SIRMADII AEP Shorts](https://www.youtube.com/@sirmadii_aep/shorts)

## 5. `testimony-doc`: documentary storytelling (Steven Ndukwu)

**Use for:** testimonies, HSM stories, brand stories, campus features.

| Element | Rule |
|---|---|
| Structure | **Hook → journey → turning point → payoff.** 3–5 min mini-doc. The hook is the strongest line of the interview (0:00–0:10); the turning point lands around 60–70%. Cut a 30 s Short from the strongest moment. |
| Pacing | Let lines breathe; cut B-roll on the words it illustrates; hold silence after the turning point (1–2 s). |
| Look | Natural and warm, `Grade look="film"`; interviews lit by a window. |
| Sound | Clean dialogue first (Adobe speech enhancer if needed), music under at −20 to −24 dB below the voice, swelling only at the payoff. |
| Type | Name + context lower third once; word-synced captions (playbook 10.5) for the Short. |
| Remotion | Scenes per act; `@remotion/captions` for subtitles; `calculateMetadata` from the interview length. |
| QA | The story makes sense without the visuals (audio-only check); names and places spelled right; consent recorded for everyone on camera. |

References: [Ndukwu channel](https://www.youtube.com/@stevenndukwu) · [Wikipedia](https://en.wikipedia.org/wiki/Steven_Ndukwu)

## 6. `phone-first-volume`: phone-first production at volume (Chibuzor, Fibman Beats, Kobbyshots, Matt Loui, Fusion Frames)

**Use for:** Campus Invasion across 8 universities, steady weekly content for every brand, volunteer teams.

| Element | Rule |
|---|---|
| System | **One kit per series:** shot list + grade + lower thirds + end card, used by every team. Templates per format (ad, behind-the-scenes, testimonial). Batch-produce weekly. |
| Pacing | 20–45 s; a hook in 2 s (recipe 4); one idea per video. |
| Look | One grade preset for everyone (`Grade look`), same fonts and colours, same end card. Phone footage at 30 fps, locked exposure. |
| Sound | Music from a cleared library; captions burned in (most views are muted). |
| Remotion | Props-driven compositions (zod schema): each team's footage and copy go in `--props`, and the look never changes. Render many with `npm run render -- <Comp> review --props=jobs/<id>/props/<team>.json`. |
| QA | A side-by-side contact sheet of every team's frames shows one consistent look; no copyrighted music. |

References: [Chibuzor](https://www.youtube.com/@hellochibuzor) · [Fibman Beats](https://www.youtube.com/@fibmanbeats) · [Kobbyshots](https://www.youtube.com/@kobbyshots) · [Matt Loui](https://www.youtube.com/@mattloui) · [Fusion Frames](https://www.youtube.com/@fusionframes-f5y)

---

## Learning a new recipe from reference videos

When the user shares 3–5 videos whose editing they like (theirs or another creator's), turn the shared style into a recipe. One video is a guess; five is a pattern.

1. **Get the files.**
   - On the user's computer: `npm run analyze-reference -- <name> --fetch <url> <url> …` (needs yt-dlp).
   - In a cloud session, TikTok and Instagram are usually blocked, so ask for the files and pass the paths: `npm run analyze-reference -- <name> <file|folder…>`.
   - Downloads are for study only. Never reuse the creator's footage, music or graphics in a delivery.
2. **Measure.** The script writes `references/<name>/analysis.md` and sheets. It covers:
   - shot lengths, cuts per minute and cuts in the first 3 s, with punch-ins and jump cuts counted;
   - loudness;
   - speaking pace, if you transcribe the videos into `references/<name>/transcripts/` with `npm run transcribe` (any job id, then move the files).
3. **Read the pictures.** `sheets/<video>-shots.png` shows the first frame of every shot; `sheets/<video>-hook.png` shows the first 3 s every 0.25 s. If you need a closer look, `npm run timeline` draws any stretch.
4. **Write the breakdown** in `analysis.md`. Ignore anything that only happens once. Cover:
   - pacing and jump cuts;
   - zooms and punch-ins;
   - captions: font, size, colour, position, words per line, animation and highlighted words;
   - graphics, pop-ups and b-roll;
   - colour;
   - sound;
   - the hook.

   Show it and ask about anything unclear.
5. **Once approved, save it** under *Learned recipes* below, in the same table format as recipes 1–6 (Pacing, Look, Sound, Type, Remotion, Shoot, QA). Put the measured numbers in the rules, and map each rule onto Motion Studio settings, such as `edl.json` captions, `autocut --pause`, punch-in `zoom`, a `Grade` look and recipe `hook-2s`. Name the source videos in a References line.

## Rebuilding a design reference (screenshot or screen recording → motion)

When the user shares a design they like (a section of a site from Awwwards, a poster, a frame of someone's reel) and wants "motion like this":

1. **Get it as a file.** A screenshot, or a screen recording if the motion matters. In a cloud session, ask for the file: Instagram, TikTok and most design galleries are blocked. A link the user owns or that's public can be fetched with Firecrawl or WebFetch for its text and images.
2. **Break it down before building**, and show the breakdown:
   - layout grid and spacing;
   - type (families or close free alternatives, weights, case, sizes relative to the frame);
   - palette as hex values;
   - components (cards, pills, borders, gradients, textures);
   - motion: what moves, in what order, how far, with what easing and timing (in frames at 30 fps).

   Say what's licensed (fonts, photos, logos) and therefore can't be copied.
3. **Map it onto Motion Studio** before writing new code:
   - `Cards` for card line-ups and stats;
   - `TitleFX` styles for type moments;
   - `KineticTitle`, `paper.tsx` (cut-outs, ink) and `src/effects` for the rest;
   - the brand kit for colours and fonts.

   Only what's left becomes a new component, and it goes into `src/` so the next job can reuse it.
4. **Rebuild it with the user's own content and brand**, in every format asked for (one composition per format, with `useVideoConfig` for sizes). Never reuse their logo, photos, illustrations, copy or exact layout as a whole; take the techniques. The result should be recognisably the user's, inspired by the reference.
5. Normal gates: a style frame for approval, then the full motion, renders, QC.

The breakdowns of reels the user shared are kept in `references/<name>/analysis.md` (e.g. `references/creator-reels-2026-10/`).

## Learned recipes

_None yet. Recipes learned from reference videos go here (section 7 onwards)._

---

## Presets (start a job from one)

`npm run new-job -- <id> "<title>" --preset=<name>` copies a preset's brief defaults, deliverables, a drawn storyboard, and spec rules (hard rules, motion vocabulary, QA) into the new job. Everything stays editable. The presets live in `presets/*.json`.

| Preset | For | Recipes | Template / main deliverable |
|---|---|---|---|
| `worship-clip` | Worship With Me sessions | atmosphere | 9:16 30–60 s from session footage |
| `lyric-video` | The Wait Culture releases, scripture, full songs | illustrated-type, atmosphere | `ScriptureLyric` 9:16 + 16:9 + 4:5 card; songs timed with `npm run lyrics` (`studio-edit` §6) |
| `testimony-doc` | Testimonies, HSM stories | testimony-doc | 3–5 min 16:9 + 30 s 9:16 Short, edited from the interview (`studio-edit`) |
| `talking-head` | Short-form edits of raw talking-head footage (sermon clips, teaching, vlogs) | hook-2s, phone-first-volume | `FootageEdit` 9:16 30–60 s with pop captions (`studio-edit`) |
| `campus-kit` | Campus Invasion (8 universities) | phone-first-volume, hook-2s | 30 s 9:16 recap per campus |
| `service-promo` | Service themes, Men's Month, Carols, 31st Night | hook-2s, illustrated-type | 8–12 s 9:16 + 16:9 + 4:5 poster |
| `grill-reel` | Brothers on the Grill ads | product-broll, hook-2s | 10–15 s 9:16 food reel |
| `logo-reveal` | D&D Brand Co. logo animation (upsell) | illustrated-type | 3–5 s 16:9 + alpha overlay |
