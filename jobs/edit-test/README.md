# edit-test: footage edit pipeline check

A synthetic talking-head take tests the whole edit lane with no camera and no paid transcription. The take has tone bursts for words, fillers, a false start and a long pause, with the source timecode burned in.

```bash
node scripts/test/footage-fixture.mjs edit-test                       # take + ElevenLabs-format transcript
npm run transcribe -- edit-test public/jobs/edit-test/footage/take-a.mp4 --from=jobs/edit-test/fixtures/take-a.elevenlabs.json
npm run pack -- edit-test                                             # takes.md
npm run autocut -- edit-test --keep=A.6,A.3-A.4,A.7-A.9               # hook first; false start and fillers out
npm run edl -- edit-test                                              # uses the hand-set face box, overlays, grade in edl.json
npm run render -- FootageEdit-9x16 hd --props=jobs/edit-test/.edl.resolved.json --out=out/edit-test/edit.mp4
npm run cutcheck -- edit-test out/edit-test/edit.mp4                  # expect all PASS
```

Expected: 29.8 s of footage → 17.0 s edit in 7 segments and 6 cuts, with alternating punch-ins, no pops, and text clear of the face box.

`jobs/lyric-test/` does the same for song timing: `lyrics.txt` + `test.lrc` (or the word transcript in `transcripts/`) → `npm run lyrics -- lyric-test --audio=public/jobs/wait-isaiah-40-31/audio/pad-isaiah-40-31.wav --lyrics=jobs/lyric-test/lyrics.txt`.
