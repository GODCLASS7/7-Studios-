import { z } from "zod";

// Storyboard data model. Claude "draws" a panel by listing simple elements on
// a 0–100 grid (x/y/w/h are % of the panel), or points the panel at a real
// image (a rendered frame, an AI keyframe, a photo).

const pos = { x: z.number(), y: z.number() };
const box = { ...pos, w: z.number(), h: z.number() };

export const elementSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rect"), ...box, label: z.string().optional(), fill: z.string().optional() }),
  z.object({ type: z.literal("circle"), ...pos, r: z.number(), label: z.string().optional(), fill: z.string().optional() }),
  z.object({
    type: z.literal("text"),
    ...pos,
    text: z.string(),
    size: z.number().optional(),
    weight: z.number().optional(),
    align: z.enum(["start", "middle", "end"]).optional(),
  }),
  z.object({ type: z.literal("figure"), ...pos, h: z.number(), label: z.string().optional() }),
  z.object({
    type: z.literal("arrow"),
    x1: z.number(),
    y1: z.number(),
    x2: z.number(),
    y2: z.number(),
    label: z.string().optional(),
  }),
  z.object({ type: z.literal("device"), kind: z.enum(["phone", "laptop", "browser"]), ...box, label: z.string().optional() }),
  z.object({ type: z.literal("chart"), kind: z.enum(["bar", "line", "donut"]), ...box }),
  z.object({ type: z.literal("logo"), ...box, text: z.string() }),
  z.object({ type: z.literal("horizon"), y: z.number() }),
]);

export const cameraSchema = z.enum([
  "static",
  "push-in",
  "pull-out",
  "pan-left",
  "pan-right",
  "tilt-up",
  "tilt-down",
  "orbit",
  "handheld",
  "crane-up",
]);

export const sourceSchema = z.enum(["motion", "ai-video", "ai-image", "footage", "still"]);

export const panelSchema = z.object({
  id: z.string(),
  title: z.string(),
  seconds: z.number(),
  shot: z.string().optional(),
  camera: cameraSchema.optional(),
  action: z.string(),
  onScreenText: z.string().optional(),
  audio: z.string().optional(),
  exit: z.string().optional(),
  source: sourceSchema.optional(),
  // Path inside public/ to a real frame. Takes priority over `draw`.
  image: z.string().optional(),
  // Ask scripts/storyboard.mjs to render this frame of a composition as the panel image.
  capture: z.object({ composition: z.string(), frame: z.number() }).optional(),
  draw: z.array(elementSchema).optional(),
});

export const storyboardSchema = z.object({
  project: z.string(),
  client: z.string().optional(),
  version: z.number(),
  date: z.string().optional(),
  format: z.enum(["16x9", "9x16", "1x1", "4x5", "21x9"]),
  fps: z.number(),
  status: z.enum(["draft", "for-approval", "approved", "changes-requested"]),
  notes: z.string().optional(),
  panels: z.array(panelSchema),
});

export type Element = z.infer<typeof elementSchema>;
export type Camera = z.infer<typeof cameraSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Panel = z.infer<typeof panelSchema>;
export type Storyboard = z.infer<typeof storyboardSchema>;

export const ASPECT: Record<Storyboard["format"], number> = {
  "16x9": 16 / 9,
  "9x16": 9 / 16,
  "1x1": 1,
  "4x5": 4 / 5,
  "21x9": 21 / 9,
};

export const startTimes = (panels: Panel[]) => {
  const starts: number[] = [];
  panels.reduce((t, p) => {
    starts.push(t);
    return t + p.seconds;
  }, 0);
  return starts;
};

export const totalSeconds = (panels: Panel[]) => panels.reduce((t, p) => t + p.seconds, 0);

export const timecode = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec < 10 ? "0" : ""}${sec.toFixed(1)}`;
};
