# Pilot: real footage before going live

Every Motion Studio feature has passed its tests in the cloud. Those tests use **synthetic material**:
- the "voice" is tone bursts;
- the speaker is a still photo with a camera drift;
- the music and b-roll are generated test patterns.

That proves the pipeline works end to end. It doesn't prove how it handles a real voice, real hair against a real background, or a real client. This pilot does, on your own computer, with 5 real jobs. Plan about two working days.

## 1. Set up your computer (30 min)

1. Unzip the project, or clone it from your private GitHub repo. Then run `npm i`.
2. Run `npm run doctor -- --network` and fix every ❌. Each ⚠️ only turns off one optional feature.
3. Copy `.env.example` to `.env` and add your **ElevenLabs** key (Speech to Text: Access). Never paste keys into chat.
4. Run `npm test`. Every check should pass. If a frame fails only because fonts render differently on your computer, look at the diff in `out/test/`. If the difference is only edge smoothing, run `npm test -- --update` once to make your computer's frames the reference.
5. Run `npm run bench`, so time estimates use your computer's real speed.
6. **Back up:** create a private GitHub repo and push. Until then, the project exists only on your computer.

## 2. The five pilot jobs

Use material you have the rights to, and people who agreed to be filmed. Run each job through Claude as a real request ("Edit this into a 40-second reel…"). Let it follow the `studio` and `studio-edit` skills, gates included.

| # | Job | What it tests | Pass when |
|---|---|---|---|
| 1 | **Phone talking head**: 2–4 min raw, vertical, one speaker. Make a 30–45 s reel in the `bold` look with your brand kit. | Transcription accuracy, take choice, fillers, punch words, the cut-out on real hair, sound effects, brand end card | The cut check passes within 2 fix rounds. You'd post it with at most 2 small changes. No misheard word reaches the captions. |
| 2 | **16:9 interview or sermon clip** (camera or Zoom): 3–5 min. Make a vertical Short with `track` and `"audio": { "clean": "light" }`. | Face tracking on real movement, reframing, voice cleanup on real room noise | The face stays framed in every shot. On headphones and a phone speaker, the cleaned voice sounds better, not processed. |
| 3 | **Long video into Shorts**: a 20–40 min sermon, talk or podcast. Run `shorts`, make the best 2. | Shortlist quality, hooks, whether clips stand alone | At least 2 of the top 3 picks are ones you'd have chosen yourself. Each made Short makes sense without the rest of the talk. |
| 4 | **Lyric video** for a song you own or have cleared. Use `transcribe --align` with the lyrics. | Forced alignment on singing, card timing, a long render | Every card lands within about a quarter second of the vocal, or after you fix the `⚠ guessed` lines. |
| 5 | **Client review round**: send job 1 or 3 to one friendly client through the review page. Share it from the page's Share menu. | The client's experience, notes coming back in, versioning | The client opens it, leaves notes at the right moments without help, and v2 answers every note. |

**Optional** (only if you plan to use them):
- **Cloud render:** follow the steps in `scripts/render-cloud.mjs`, then render job 1 at `4k`. Compare the time and the AWS bill with a local render.
- **AI b-roll:** for one line that `broll-suggest` couldn't match, get a credit quote, approve it, generate the clip and cut it in.
- **Publishing:** post job 1 through vidIQ or Higgsfield, approving the exact post. A week later, pull the numbers and write one line into `house-notes.md`.

## 3. What to write down for each job

Keep a short log at `jobs/<id>/pilot.md`:
- **Time:** each phase, against the estimate. Log it with `npm run estimate -- --log <id> <phase> <minutes>` so estimates learn.
- **Fix rounds:** how many render → cut check → fix rounds it took, and what failed.
- **Transcript:** how many words were misheard, and which (add recurring ones to house notes).
- **Cut-out and tracking:** any frame where the edge or the crop looked wrong (time and source).
- **Your changes:** everything you changed by hand. Each one is a candidate for a default or a house note.
- **Client:** anything the client found confusing on the review page.

## 4. Go / no-go

Go live when:
- all 5 pilot jobs were delivered, and you'd put your name on each;
- no job needed more than 2 fix rounds after the first review render;
- estimates were within about 30% of the real times by job 4 or 5;
- a client used the review page without help;
- the project is backed up in GitHub, and `npm test` passes after the last change.

Each failure is a specific fix, not a reason to stop. Bring the log back to Claude and fix it before the next job.

## 5. Known limits to watch in the pilot

- **Words behind the head** need some room: a head wider than about half the frame hides the middle of the word. `edl` warns about it. Frame wider, or use `classic` for those sections.
- **The cut-out** is a CPU model: fine hair against a busy background, and fast hand moves, are where it shows. Check a frame before building looks on it.
- **Face tracking** follows the largest face. With two people in shot, set `focus` by hand for those segments.
- **Voice cleanup** can't fix clipped or distant audio. A lav mic or a re-record beats any filter.
- **Shorts scoring** is a guide from the transcript alone. It can't hear delivery, so always judge the picks as an editor.
- **Beat snapping** needs a clear beat. Ambient pads report low confidence, and then nothing moves.
- **Cloud rendering, AI footage and publishing** haven't been run against real accounts yet. The pilot is their first real test.
