// Beat grid for the demo teaser. The soundtrack (jobs/demo/sound.mjs) is
// synthesized from the same numbers, so visuals and audio stay locked.

export const FPS = 30;
export const BPM = 120;
export const BEAT = 60 / BPM; // 0.5 s

export const f = (seconds: number) => Math.round(seconds * FPS);

// Scene lengths in seconds; every boundary sits on a beat.
export const SCENES = {
  coldOpen: 4,
  title: 3,
  sketch: 5,
  formats: 4,
  end: 4,
} as const;

// In-scene event times (seconds from the scene's start).
export const EVENTS = {
  firstKick: 3.5, // cold open
  wordLandings: [0.25, 0.5, 0.75, 1.0, 1.25, 1.5], // title slam, on 8th notes
  stamp: 2.0, // sketch scene: APPROVED at 9.0 s
  wipe: [2.5, 3.5] as const, // sketch → final reveal
  tiles: [0.5, 1.0, 1.5, 2.0, 2.5], // formats scene: 12.5–14.5 s
};

export const AUDIO = "jobs/demo/audio/teaser-120bpm.wav";
