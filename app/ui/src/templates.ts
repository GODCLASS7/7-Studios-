// The studio's own templates, imported from src/ so the app previews exactly what
// the renderer will make. Each one: its component, schema, defaults and formats.
import type { ComponentType } from "react";
import type { CalculateMetadataFunction } from "remotion";
import type { ZodType } from "zod";
import { ArtStyles, artStylesDefaults, artStylesSchema, calcArtStyles } from "../../../src/artstyles/ArtStyles";
import { calcCards, Cards, cardsDefaults, cardsSchema } from "../../../src/templates/Cards/Cards";
import { calcCarousel, Carousel, carouselDefaults, carouselSchema } from "../../../src/templates/Carousel/Carousel";
import { calcScripture, isaiah4031, ScriptureLyric, scriptureSchema } from "../../../src/templates/ScriptureLyric/ScriptureLyric";
import { calcSiteMorph, SiteMorph, siteMorphDefaults, siteMorphSchema } from "../../../src/templates/SiteMorph/SiteMorph";
import { calcTerminalReel, TerminalReel, terminalReelDefaults, terminalReelSchema } from "../../../src/templates/TerminalReel/TerminalReel";
import { calcTitleReel, TitleReel, titleReelDefaults, titleReelSchema } from "../../../src/titles/TitleReel";
import type { IconName } from "./icons";

export const SIZES: Record<string, [number, number]> = {
  "9x16": [1080, 1920],
  "16x9": [1920, 1080],
  "1x1": [1080, 1080],
  "4x5": [1080, 1350],
};
export type Template = {
  name: string;
  label: string;
  description: string;
  icon: IconName;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
  schema: ZodType;
  defaults: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calc?: CalculateMetadataFunction<any>;
  formats: string[];
  fps: number;
};
const t = (x: Template) => x;
export const TEMPLATES: Template[] = [
  t({ name: "ArtStyles", label: "Art styles", description: "One line of text or a picture in seven hand-made looks: one-line drawing, ASCII, pixel, sketch, riso, HUD and ink.", icon: "sparkle", component: ArtStyles, schema: artStylesSchema, defaults: artStylesDefaults, calc: calcArtStyles, formats: ["9x16", "16x9"], fps: 30 }),
  t({ name: "Titles", label: "Cinematic titles", description: "Eight title styles, on colour, a picture, a clip or transparent for editors.", icon: "layers", component: TitleReel, schema: titleReelSchema, defaults: titleReelDefaults, calc: calcTitleReel, formats: ["9x16", "16x9", "1x1"], fps: 30 }),
  t({ name: "Cards", label: "Card line-up", description: "Speakers, campuses, products or numbers as 3D cards in a carousel or a stack.", icon: "grid", component: Cards, schema: cardsSchema, defaults: cardsDefaults, calc: calcCards, formats: ["9x16", "16x9", "1x1", "4x5"], fps: 30 }),
  t({ name: "SiteMorph", label: "SiteMorph", description: "A website told as one shape that morphs through its parts, with a cursor and camera, on the beat. Build one from a real site in the Web studio.", icon: "web", component: SiteMorph, schema: siteMorphSchema, defaults: siteMorphDefaults, calc: calcSiteMorph, formats: ["1x1", "9x16", "16x9"], fps: 60 }),
  t({ name: "Terminal", label: "Terminal", description: "A command line that types, counts and clicks: for how-tos and product intros. Generic, no platform's look.", icon: "terminal", component: TerminalReel, schema: terminalReelSchema, defaults: terminalReelDefaults, calc: calcTerminalReel, formats: ["9x16", "16x9", "1x1"], fps: 30 }),
  t({ name: "ScriptureLyric", label: "Scripture & lyrics", description: "Verses and song lines as timed cards, word for word.", icon: "music", component: ScriptureLyric, schema: scriptureSchema, defaults: isaiah4031, calc: calcScripture, formats: ["9x16", "16x9"], fps: 30 }),
];
export const CAROUSEL = t({ name: "Carousel", label: "Carousel", description: "Slides for a carousel post.", icon: "carousel", component: Carousel, schema: carouselSchema, defaults: carouselDefaults, calc: calcCarousel, formats: ["4x5", "1x1", "9x16"], fps: 30 });

export type Meta = { durationInFrames: number; fps: number; width: number; height: number; props: Record<string, unknown> };
export const metaFor = async (tpl: Template, fmt: string, props: Record<string, unknown>): Promise<Meta> => {
  const [width, height] = SIZES[fmt] || SIZES["9x16"];
  const base = { durationInFrames: 150, fps: tpl.fps, width, height, props };
  if (!tpl.calc) return base;
  const r = await tpl.calc({ props, defaultProps: props, abortSignal: new AbortController().signal, compositionId: `${tpl.name}-${fmt}`, isRendering: false });
  return {
    durationInFrames: r.durationInFrames ?? base.durationInFrames,
    fps: r.fps ?? base.fps,
    width: r.width ?? width,
    height: r.height ?? height,
    props: (r.props as Record<string, unknown>) ?? props,
  };
};
