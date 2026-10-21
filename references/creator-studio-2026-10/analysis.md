# Tenfold "Creator Studio" (paid skill), compared with Motion Studio

Source: the public sales page, paid.tenfoldmarketing.com/claude-creator-studio, read 21 Oct 2026. It costs $67 until 22 Oct, then $97; doors close 25 Oct. It's by Marc Cleroux, whose free "/video-edit" guide we rebuilt earlier. Only the public page was read; nothing was bought or downloaded. If it's ever bought, its files stay out of this repo: ideas can be rebuilt natively, code can't be copied.

## Its nine parts, against Motion Studio

| Their part | What it does | Motion Studio today |
|---|---|---|
| Look Builder | 9 editing styles (5 "for him", 4 "for her"), 20 caption styles, or a style built from a reel you like | 4 looks (classic, bold, cool-girl, cool-dude), 6 style recipes, recipes learned from reference videos, brand kits. About 5 caption styles. **Gap: named style presets and a caption-style library.** |
| FX Pack | 46 effects | About 12 covered or close (see below). **Gap: about 30.** |
| Trial Reels | One edit becomes N versions (hook, captions, style, speed, framing, colour), posted as Instagram Trial Reels | **Gap.** The pieces exist: takes, looks, grades, zoom and captions in edl.json. vidIQ `instagram_publish_reel` supports `trialParams` (MANUAL / SS_PERFORMANCE). |
| Carousel Studio | A video, a topic or a reference carousel becomes a designed carousel; 8 looks | **Gap.** Stills, formats, TitleFX, cut-outs and the brand kit exist. Higgsfield `tiktok_prepare_publish` posts photo carousels (up to 35 JPEGs). |
| Posting and scheduling | Posts and schedules to TikTok, Instagram, YouTube, LinkedIn | Posting is documented, approval-only (vidIQ, Higgsfield). **Gap: scheduling,** e.g. a scheduled task that posts an approved file at an approved time. |
| Sound Rules | Which sound goes with which effect, and how loud | Built (`"sfx": "auto"`, capped under the voice). |
| GIF Finder | Giphy and Tenor GIFs dropped into reels | Not planned: most reaction GIFs are clips from films and TV that the poster doesn't own (takedown risk, especially on a church channel). An alternative would be our own sticker pack or licensed stickers. |
| 8 walkthroughs | Screen videos of the tool in use | Can be made with `Tutorial-*`. |
| First Reel Setup | One-paste install for Mac and Windows; a doctor command | `npm run doctor` exists. **Gap: one-paste installers** (setup.sh / setup.ps1). |

## Their 46 effects, against Motion Studio

**Covered or close (about 12):**

| Their effect | Ours |
|---|---|
| Orbit | orbit (cool-girl) |
| Spotlight | cool-dude (the room falls back) |
| Neon Sign | TitleFX `neon`, pinned |
| Scene Text | pinned TitleFX |
| Paper Cut | TitleFX `cutout`, paper.tsx |
| Type Wall | punch words behind the head (not the marching wall) |
| Digital Zoom | punch-ins (no slow creep, then snap) |
| UI World | app-window insert, behind |
| Prompt Box | screen-push and the tutorial layout |
| Glass Type, Spatial Glass | liquid-glass card |
| Chart Grow | liquid-glass graph |
| Odometer, Stat Stack | counters in Cards and liquid glass (no rolling digits) |
| Show-and-tell layouts | Tutorial `stack` / `pip` |

**Buildable with the cut-out and tracking we already have:** Clone, Frame Break, Vertigo (room stretches, person stays), Rack Focus (blur room vs title), God Rays (light from behind the head), Inside Out (the body as a window), Green Screen (person over content), Doodle Boil (a line traced round the person from the matte), Freeze and Label, Freeze Sticker (a die-cut sticker from the matte outline), Sticky Text (pinned to the chest or cap), Pointer Callout (cards tied to the tracked face).

**Plain motion graphics:**

| Their effect | What it is |
|---|---|
| Checklist | ticks as each step is said |
| Dot Counter | a dot per item to come |
| Chip Row | a pill per item listed |
| Comment Bubble | a generic comment and reply, no platform UI |
| Before and After | wipe from raw clip to edit |
| Blackout | lights cut on a line |
| Zoom-Through Cut | camera dives through to the next shot |
| Headline Wall | headlines fill the wall |
| Couch Wall | grid of reel covers on the wall |
| Knockout Tiles | name tiles knocked out one by one |
| Word Pile | named things drop and pile up |
| Depth Scatter | words land at different sizes, falling out of focus |
| Cover Story | a magazine-cover layout |
| Phone Mockup | a CSS 3D phone playing a screen |
| Pull-Back Reveal | the video shrinks into an editor window |
| Timeline Burn | an editing timeline catches fire |
| Code Scan | the picture resolves into code and back |
| Shatter 3D | the frame shatters to reveal you |
| Serif Flow | a dark card draws steps in serif type |

## What we built from this (October 2026)

Rebuilt natively under our own names; none of their code, assets or wording is used.

| Their part | Ours |
|---|---|
| Carousel Studio | `Carousel` template, 8 looks and 8 slide kinds; `npm run carousel` picks stills and cut-outs from a video (studio-stills) |
| Trial Reels | `npm run variants` builds one-change versions of an edit; `npm run posts` queues each approved post, with Instagram's trial setting (studio-edit §5c) |
| Effects (first batch) | The effects pack `src/fx/`, 18 kinds: clone, frame-break, god-rays, rack-focus, vertigo, doodles, freeze (sticker and labels), green-screen, callout, checklist, counter (rolling digits), chips, before-after, blackout, phone, cover, comment, zoom-through; plus the `tag` title style for sticky labels (studio-edit §3g) |
| Style presets and caption library | 12 editing styles in `presets/styles/` and 14 caption styles in `src/captions/` (studio-edit §3h) |
| Scheduling | The post queue plus a one-off scheduled task that runs `posts check` before posting |
| One-command installers | `scripts/install.sh` and `scripts/install.ps1` |

Not built: the GIF finder (copyright: GIFs are other people's material), Inside Out, Headline Wall, Couch Wall, Knockout Tiles, Word Pile, Depth Scatter, Pull-Back Reveal, Timeline Burn, Code Scan, Shatter 3D, Dot Counter and Serif Flow. Candidates for a second batch.
