# 7 Studios

7 Studios is an agentic design studio that runs on Claude. It makes still and motion graphics of every kind, up to 4K video, ProRes masters and 300 DPI print. It works like a real studio:

**Brief → time estimate → storyboard you approve → design previews you approve → production → review cut → 4K masters → QC → delivery**

- **Remotion** makes everything exact: typography, layouts, charts, captions, motion, timing, grade and audio.
- **Generative models** reached through Claude's connectors make the realistic footage and imagery. Higgsfield gives access to Seedance, Kling, Veo, Cinema Studio, FLUX, Nano Banana, Seedream, GPT Image and Topaz.
- **Ready-made motion templates:** cinematic title effects (8 styles, in footage or on transparency), tutorial reels (presenter plus screen recordings that zoom to each click), kinetic 3D card line-ups, and **Carousel Studio** (designed carousel posts in 8 looks, from a topic or from stills and cut-outs picked out of a video).
- **Footage editing from the transcript:** talking heads, interviews, sermons and podcasts are cut from a word-level transcript. Captions in 16 styles, 12 one-pick editing styles, looks, an **effects pack of 18** (clones, frame break, god rays, rack focus, vertigo, doodles, freeze frames, green screen, callouts, checklists, counters, magazine cover, zoom-through…), face-tracked reframing, voice cleanup, brand kits, beat-synced music, b-roll, Shorts from long videos, cut checks, and a client review page with timestamped notes.
- **Trial versions and posting:** several versions of one edit (hook, opening line, captions, pace, look) for testing, and an approved-post queue for scheduled posting, including Instagram trial reels. Nothing is posted without your approval of that exact post.

## Start a job

Open this folder in Claude Code and describe what you want. For example:

> Make a 20-second 16:9 launch teaser for <product>, with cinematic AI footage, kinetic titles on the beat and a 4K master.

> Design an A3 poster and matching Instagram post for <event>.

> Find the three best Shorts in this sermon and edit them with our brand kit.

> Turn this reel into a 6-slide carousel in the glow look, with me cut out on the cover.

> Make three trial versions of this edit with different hooks, and queue the one I pick for Friday 6 pm.

Claude follows `.claude/skills/studio/SKILL.md`. It sends you an estimate with ready-by times, a storyboard and animatic to approve, then style frames to approve, and only then builds, generates, renders, checks and delivers.

## Commands

**Setting up a computer:** unzip the project, open a terminal in its folder and paste one line:
- Mac or Linux: `bash scripts/install.sh`
- Windows (PowerShell): `powershell -ExecutionPolicy Bypass -File scripts\install.ps1`

It checks Node and ffmpeg (installing them where it can), installs the packages, builds the sound pack, creates `.env` for your keys, starts a git history and runs the doctor.

```bash
npm i && npm run setup:cloud     # setup:cloud only in Claude Code cloud containers
npm run dev                      # Remotion Studio preview
npm run new-job -- <id> "<Title>"
npm run estimate -- <id>
npm run storyboard -- <id> --animatic
npm run render -- <Composition> <draft|review|4k|4k-hevc|master|alpha|webm-alpha|still|still-4k|still-print>
npm run qc -- <file> --expect=3840x2160
npm run bench
npm run carousel -- <id> render  # carousel slides from jobs/<id>/carousel.json
npm run variants -- <id> build --render   # trial versions of an edit
npm run posts -- list            # the approved-post queue
npm run doctor                   # is this computer ready? (what's missing, and the fix)
npm test                         # regression tests on the studio's own test material
```

**First time on a new computer, or before going live:** run `npm run doctor`, then `npm test`, then follow [PILOT.md](PILOT.md) with real footage.

See `CLAUDE.md` for the full reference. Note that some companies need a paid Remotion company licence: https://remotion.dev/license
