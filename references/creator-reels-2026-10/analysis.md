# Creator reels, Oct 2026 — breakdowns

Three Instagram reels shared by the user on 21 Oct 2026, watched with vidIQ (`watch_shortform_content`, 10 credits each). The breakdowns below are vidIQ's model output, condensed: treat timings and colours as approximate. For study only: never reuse these creators' footage, graphics, music or skill files.

## 1. "This Claude skill can create animated text inside any video" — instagram.com/reel/DeunQopKjVA (32.7 s)

- **Format:** creator promo for a downloadable Claude skill ("comment PYNK and I'll DM you the skill file"). Presenter shots, a physical monitor filmed showing results, Claude UI mock-ups with typing and a cursor, and split screen (UI top, presenter bottom).
- **The showcased effects:** cinematic titles placed *inside* footage:
  - "NEW YORK" big 3D text behind a walking subject, after a "Remove background" tracking box;
  - magazine cut-out colour-block letters ("MAGAZ…") on a greyscale station shot;
  - a huge white serif "Monday" tracked behind a bike rider;
  - a poster layout with "You've got" and a flying 3D butterfly;
  - inflated 3D pink bubble text "PYNK" bouncing on a green screen (for keying onto any video);
  - a purple serif "Motion Design" poster with a 3D eye;
  - a retro 80s neon "BREAD & Butter" card.
- **Captions:** lowercase, 1–3 words per beat, white, bottom third (about 25% up), popping on stressed words.
- **Pacing:** average shot about 1.4 s, 7–8 cuts per 10 s. Cuts land on drum hits of a 115–120 BPM lo-fi / electronic hip-hop beat. Sound effects: typing, UI pops, swooshes.
- **Hook (0–2 s):** points at a floating "SKILL.md" card above their head while naming the capability, then shows proof on a monitor.

## 2. "How to make amazing motion graphics with AI" — instagram.com/reel/DesDQZojJTs (48.2 s)

- **Format:** step-by-step tutorial.
  - Layout: presenter in the top ~30%, a red banner title, a gallery or screen recording below.
  - Steps 1–7 are headed in a hand-drawn script ("① Subscribe & Download", "② Switch to Claude Code", "③ Take a picture", "④ Find an inspiration" (Awwwards), "⑤ Pick a section + pic", "⑥ Put in Claude Code w/ pic", "⑦ Output").
  - Screen recordings get digital zoom and pan to the clicked element, a moving cursor, and hand-drawn white arrows, circles and labels.
- **The showcased output:** 3D kinetic sports-style cards ("Signature Moments") that slide across with perspective shifts, gradient borders and number tickers. Made in 9:16 and 16:9 from one Awwwards reference section.
- **Captions:** uppercase bold sans, white, with the active word in yellow, inside a dark rounded pill.
- **Palette:** red #E52B2B, charcoal #121212, white, yellow #FFDE59. Easing is easeOutExpo / easeInOutCubic.
- **Pacing:** average shot about 2.8 s, 3.5 cuts per 10 s. Mid-low electronic bed; click, riser and whoosh effects on UI moves.
- **Hook:** the finished motion graphic is shown under the presenter while they state the outcome.

## 3. "Roomly" AI interior-design app ad — instagram.com/p/DckuoYvMtjc (19.8 s)

- **Hook (0–3 s):** a paper floor plan morphs into a photoreal 3D render of the flat, then the camera dives into the living room. A black pill caption sits in the top third: "I uploaded my floor plan, and Roomly instantly found the ideal layout." The app icon badge sits top-left.
- **Flow:**
  - capture with a phone camera UI and shutter;
  - a cyan scanning progress bar ("Roomly – 98%");
  - a carousel of style cards slides in, and the 3D model cross-dissolves to each style every 1.5–2 s, with a cyan selection border snapping to the active card;
  - an end card on white paper texture: app icon, "Roomly", "AI Interior Design", the tagline, a cyan "Install Now" button and the App Store badge.
- **Sound:** friendly female voiceover, a light 115–120 BPM indie-pop bed, a shutter click, UI pops and swooshes per style, and a chime on the call to action.
- **Pacing:** average shot about 2.3 s, 4–5 events per 10 s. The proof (sketch to 3D) comes within 1.5 s.

## Shared patterns

- Proof of the result in the first 2 s.
- Beds at 115–120 BPM, with cuts or events on the beat.
- UI mock-ups with cursor and typing as the demo.
- Rounded dark cards and pills.
- Captions of 1–3 words.
- A call to action at the end: comment a keyword, or install.

## What Motion Studio built from these (21 Oct 2026)

- **Title effects for any footage** (reel 1): `src/titles/TitleFX.tsx`, seven styles (cutout, editorial, inflate, neon, extrude, poster, outline), behind or in front of the person, or alone on transparency (`Titles-*`). Plus `npm run pin`, so a title stays stuck to a spot while the camera moves ("Monday" behind the cyclist). See studio-edit §3e.
- **Tutorial layout** (reels 1 and 2): `Tutorial-9x16` / `-16x9`.
  - Presenter and screen recording split, with a step band (circled number and handwriting) between them.
  - The camera zooms into each click, which ripples, with an optional cursor.
  - Hand-drawn circles, boxes, underlines and arrows; pill captions.
  - See studio-edit §3f and CLAUDE.md 10.15.
- **3D card line-up** (reel 2's output): `Cards-*`, carousel or stack. Turning gradient borders, counting numbers, photo, video or generated art, beat landing. See CLAUDE.md 10.16.
- **Design reference → motion** (reel 2's workflow) as a playbook: studio-styles *Rebuilding a design reference*, CLAUDE.md 10.14.
- Not built: the app-ad template from reel 3 (phone mock-up, scanning UI, before/after morph, store end card). Its 3D renders would come from the AI footage lane (studio-ai-footage).
