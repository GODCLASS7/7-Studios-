# Motion Studio

Motion Studio is an agentic design studio that runs on Claude. It makes still and motion graphics of every kind, up to 4K video, ProRes masters and 300 DPI print. It works like a real studio:

**Brief → time estimate → storyboard you approve → design previews you approve → production → review cut → 4K masters → QC → delivery**

- **Remotion** makes everything exact: typography, layouts, charts, captions, motion, timing, grade and audio.
- **Generative models** reached through Claude's connectors make the realistic footage and imagery. Higgsfield gives access to Seedance, Kling, Veo, Cinema Studio, FLUX, Nano Banana, Seedream, GPT Image and Topaz.

## Start a job

Open this folder in Claude Code and describe what you want. For example:

> Make a 20-second 16:9 launch teaser for <product>, with cinematic AI footage, kinetic titles on the beat and a 4K master.

> Design an A3 poster and matching Instagram post for <event>.

Claude follows `.claude/skills/studio/SKILL.md`. It sends you an estimate with ready-by times, a storyboard and animatic to approve, then style frames to approve, and only then builds, generates, renders, checks and delivers.

## Commands

```bash
npm i && npm run setup:cloud     # setup:cloud only in Claude Code cloud containers
npm run dev                      # Remotion Studio preview
npm run new-job -- <id> "<Title>"
npm run estimate -- <id>
npm run storyboard -- <id> --animatic
npm run render -- <Composition> <draft|review|4k|4k-hevc|master|alpha|webm-alpha|still|still-4k|still-print>
npm run qc -- <file> --expect=3840x2160
npm run bench
```

See `CLAUDE.md` for the full reference. Note that some companies need a paid Remotion company licence: https://remotion.dev/license
