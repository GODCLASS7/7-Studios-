# 7 Studios

7 Studios is a creative studio that runs on your own computer, with Claude as the studio team. It makes images, video, edits, motion graphics, carousels and websites in motion, up to 4K video, ProRes masters and 300 DPI print.

## Open the app

```bash
npm run app            # or double-click "7 Studios.command"
```

7 Studios opens in your browser at `http://127.0.0.1:7777`, with the logo drawing itself and the motto, *Making dreams, creating realities.* It runs only on this computer: nothing is hosted, and other computers can't reach it. On a Mac, `bash scripts/make-mac-app.sh` makes **7 Studios.app** with its icon, for Launchpad and the Dock.

The app is white and gold and always moving: a wall of clips made by the studio's own templates, previews of every look and camera move, and type that leans toward your pointer. If your computer asks for reduced motion, it keeps still.

| Studio | What it does |
|---|---|
| **01 Image** | Generate from a prompt, 18 looks and your characters (with a consent record); edit any picture with a sentence (6 edit recipes) |
| **02 Video** | Animate a still with one of 18 camera moves and film looks, or describe the whole shot |
| **03 Edit** | Cut talking heads, interviews and sermons by reading the transcript: tick the phrases, open with the best line; fillers out, no pops, captions to the word, a check of every cut |
| **04 Motion** | Art styles (7 hand-made looks), cinematic titles, card line-ups, SiteMorph, terminal, a logo sting, scripture and lyrics: live previews as you type, rendered exactly up to 4K or ProRes |
| **05 Carousel** | Carousel posts in 8 looks, with stills and cut-outs picked from a video |
| **06 Web** | Paste a website: 7 Studios reads every section, its exact words, colours and fonts, and tells it as one shape morphing through its real parts on the beat, then checks every beat and the loop |
| **07 Publish** | Trial versions of an edit, client review pages, phone copies, and the post queue: nothing is posted unless you approve that exact post |

Plus the **Library** (everything made, with its prompt, look, engine, seed and cost) and **Settings** (engines, keys, this computer).

### Engines: where images and clips come from

| Engine | What it is | Cost |
|---|---|---|
| Demo | Placeholders made on this computer, to try the app. Not AI | Free |
| This Mac | Real AI images made on your Mac by the free Draw Things app (FLUX, SDXL…). Private, no account. Images and edits | Free |
| Open | Open models (FLUX, Qwen-Image, Wan 2.2) in ComfyUI: on your Mac for drafts, or a rented GPU | Free per use; you pay for the machine |
| Premium | Hosted models through fal.ai with your own key; you confirm the cost of each run | Paid per run |
| Claude + Higgsfield | Requests Claude runs in chat (Seedance, Kling, Veo…), quoted in credits before anything is spent | Higgsfield credits |

Setup for each is in [engine/README.md](engine/README.md). Every exact thing (type, logos, numbers, captions, layout, motion, grade, sound) is made by Remotion on your computer, never by an AI model.

## Or ask Claude

Open this folder in Claude Code and describe what you want:

> Make a 20-second 16:9 launch teaser for <product>, with cinematic AI footage, kinetic titles on the beat and a 4K master.

> Turn https://our-site.com into a looping 1:1 SiteMorph at 120 BPM.

> Find the three best Shorts in this sermon and edit them with our brand kit.

> Run my 7 Studios requests.

Claude follows `.claude/skills/studio/SKILL.md`: an estimate with ready-by times, a storyboard to approve, style frames to approve, then production, review, masters, checks and delivery.

## Setting up a computer

**Step by step, for a Mac:** [INSTALL.md](INSTALL.md) (Homebrew, the installer, opening the app, the Dock icon, and fixes for common problems).

In short, on a Mac with an Apple chip: install Homebrew with its `.pkg` file, unzip the project and double-click **Install 7 Studios.command**. Or open a terminal in the folder and paste one line:
- Mac or Linux: `bash scripts/install.sh`
- Windows (PowerShell): `powershell -ExecutionPolicy Bypass -File scripts\install.ps1`

It checks Node and ffmpeg (installing them where it can), installs the packages, builds the sound pack, creates `.env` for your keys, starts a git history and runs the doctor.

```bash
npm run app                      # the 7 Studios app
npm run app:showcase             # re-render the app's moving previews after changing a template
npm run dev                      # Remotion Studio (every composition, for building)
npm run gen -- image "a prompt" --preset=cinematic-portrait   # the engine from the command line
npm run site-capture -- <url> <job>  &&  npm run sitemorph -- plan <job> --loop
npm run render -- <Composition> <draft|review|4k|master|alpha|webm-alpha|still|…>
npm run doctor                   # is this computer ready? (what's missing, and the fix)
npm test                         # regression tests; npm test -- --full adds the app, end to end
```

**First time, or before going live:** `npm run doctor`, then `npm test`, then follow [PILOT.md](PILOT.md) with real material.

See `CLAUDE.md` for the full reference. Some companies need a paid Remotion company licence: https://remotion.dev/license
