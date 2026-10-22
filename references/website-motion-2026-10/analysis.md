# "Turn Your Website Into a Motion Video" (Jens Heitmann), compared with Motion Studio

Source: a free Notion guide by Jens Heitmann (@jens.heitmann), read 22 Oct 2026. It builds on a template that
@twoclipping open-sourced on X, and lists other prompts going around X plus the `/brag` skill
(latent-spaces/brag, MIT). Their prompt text and videos are theirs: we take techniques, rebuilt under our own names.

## Their method, in short

A website becomes one UI shape that never cuts. It morphs through the site's real components (button → player →
slider → chart…) on a 120 BPM grid, driven by a cursor, at 1440×1440 and 60 fps, as a 14 s loop or a 42 s tour.

| Step | What they do |
|---|---|
| Capture | Playwright at 1440 px wide; scroll to the bottom first so lazy sections render; screenshot every section and every state (tabs, toggles, accordions, sliders); all copy verbatim into `copy.json`; colours sampled from screenshot pixels, not CSS variables; fonts recorded; `INVENTORY.md` with each component's specs, copy, behaviour and how one shape could become it; **placeholder or sample numbers flagged and left out** |
| Plan | 8–12 components, each growing out of the one before through a **shared element** (a progress bar becomes a volume track, a toggle knob becomes a tab indicator); something on every beat (0.5 s); 4–6 s holds on paragraphs and quotes; `states.md`; optional plan gate |
| Song | Tempo by autocorrelation of an onset envelope, downbeats by low-band energy, kick onset at 10% of its peak; trim so kicks land on the video's beats; warn if more than 1 BPM off 120 |
| Engine | Every frame a pure function of time; springs as closed-form step responses, a value with N target changes is the sum of N step responses; **for a loop, each step is also added at t + T so the last frame matches the first in position and velocity**; damping 0.85–0.9 |
| Text | Each text or icon layer enters about 70 ms after the shape starts moving, exits faster, with about 3 px blur and scale 0.965–1 |
| Liquid indicators | The leading edge rides a stiffer spring than the trailing edge |
| Cursor | A 4th-order step (starts from rest, never overshoots); press 80 ms before the beat, release on the beat; drags are a pure function of the cursor relative to the grab point, then spring back |
| Camera | Zooms and pans per state so any readable text is at least 30 px tall in the frame |
| Check | One still per beat plus one mid-transition, all read before rendering; logs of cursor, shape edges and dragged elements for acceleration spikes and cursor-to-target gaps; the last-to-first jump no bigger than a normal frame step; no console errors |
| Render | 4 subframes per frame blended for motion blur, 60 fps, CRF 12 |
| Sound | Dry synthesised UI clicks per event (band-passed noise plus a sine blip), placed by measured peak, wrapped across the loop; −14 LUFS, true peak −1.5 dBTP |
| Rules | Real copy, colours and data only; never render before the contact sheet is clean; a transition that only works as a crossfade needs a shared element instead |

Their own lessons: a "5.9x" from a build running on sample prices nearly shipped; quotes framed at 64% of the
width came out about 6 px tall on a phone (hence the 30 px rule); every stiff moment was a crossfade where a
shared element belonged. Only square renders tested; rendering is heavy (240 screenshots per second of video).

The other prompts: one-liners ("make a 15-second showreel… go all out"), a 46 s SaaS launch in Notion's style
(HyperFrames), an Apple-style launch with `/brag`, and @rexan_wong's workflow (reference videos from
whatships.com, Remotion or HyperFrames, 21st.dev components, 3 storyboard variants, one still per scene before
anything moves).

## Against Motion Studio

| Their piece | Motion Studio today |
|---|---|
| Site content and brand | Playbook 10.4 scrapes copy, colours, fonts and logo (Firecrawl). **No screenshot capture of sections and interactive states, no pixel-sampled palette, no component inventory** |
| One continuous morphing shape | **Not built.** 10.4 is scene-based (hook → reveal → features → proof → CTA) with mock-ups or screenshots |
| Cursor that clicks, hovers and drags | Only click zooms on screen recordings (Tutorial). **No cursor engine** |
| Beat grid | `npm run beats` and beat snapping. **No trimming of the song so its kicks land on a fixed grid**, no tempo warning against a target |
| Seamless loops | 10.3 hero loops with sine/cosine motion. **No spring loops matched in velocity at the seam, no seam check** |
| Text entering after the shape, blur and scale | Partly, per template; not a shared rule |
| Readable-size rule | Safe zones and caption sizes; **no "text at least 30 px in frame" check for zoomed UI** |
| Contact sheet before render | Storyboard, style frames and design previews gate; per-beat sheets only in the tests |
| Motion blur, 60 fps | `@remotion/motion-blur` is installed but unused; **no 60 fps UI preset** |
| UI click sounds | Sound pack has click, tick, pop and whoosh (synthesised) |
| Loudness | `loudnorm` at −14 LUFS, −1.5 dBTP: same |
| No invented data | Rule in 10.4 and 10.16; **no automatic flag for sample or placeholder numbers on a site** |
| Storyboard variants | One storyboard; 2–3 concepts only for stills |
