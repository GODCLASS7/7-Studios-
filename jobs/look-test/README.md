# look-test: looks, words behind the head, inserts and sound

Tests the "/video-edit"-style features on a real person: a vertical take built from scikit-image's bundled astronaut portrait (a public-domain NASA photo of Eileen Collins), given a slow camera drift and the fixture's tone-burst "voice".

```bash
python -c "from skimage import data; from PIL import Image; Image.fromarray(data.astronaut()).save('astronaut.png')"
node scripts/test/footage-fixture.mjs look-test --photo=astronaut.png
npm run transcribe -- look-test public/jobs/look-test/footage/take-a.mp4 --from=jobs/look-test/fixtures/take-a.elevenlabs.json
npm run pack -- look-test
npm run autocut -- look-test --keep=A.6,A.3-A.4,A.7-A.9      # then restore the look settings in edl.json if autocut was re-run from scratch
npm run matte -- look-test --check
npm run sfx
npm run edl -- look-test
npm run render -- FootageEdit-9x16 hd --props=jobs/look-test/.edl.resolved.json --out=out/look-test/look.mp4
npm run cutcheck -- look-test out/look-test/look.mp4
```

`edl.json` runs Bold (the punch words behind the head) → Cool girl from phrase A.7 (sparkles, the reels in `public/jobs/look-test/reels/` orbiting) → Cool dude from A.8 (the room darkened, big serif words). It also has an app window and a document behind the speaker, a profile-follow card, and automatic sound effects. Expect every cut-check row to PASS, including the safe zone and the face checks.
