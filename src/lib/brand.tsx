import { loadFont } from "@remotion/fonts";
import React, { createContext, useContext, useEffect, useState } from "react";
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { color, font, springs } from "./tokens";

// A client's brand kit (public/brands/<slug>/brand.json, chosen with "brand" in
// edl.json): colours and fonts for captions, punch words, lower thirds and
// pop-ups, plus an end card. Components read it with useBrand(); with no kit,
// the house style applies.

export type Brand = {
  name: string;
  accent: string; // lower-third bars, highlights, end-card rule
  punch: string; // the big punch word (bold look) and active caption word
  text: string; // caption and title text
  background: string; // end card
  displayFont: string; // CSS font-family for captions, titles, punch words
  serifFont: string; // CSS font-family for serif punch lines
  fonts: { family: string; src: string; weight?: string; style?: string }[]; // files to load (paths under public/)
  logo: string | null; // image under public/, or null to set the wordmark in type
  wordmark: string;
  endCard: { seconds: number; line: string; sub: string } | null;
};

// The brand as template props (what scripts/edl.mjs and the carousel script pass in).
export const brandSchema = z
  .object({
    name: z.string(),
    accent: z.string(),
    punch: z.string(),
    text: z.string(),
    background: z.string(),
    displayFont: z.string(),
    serifFont: z.string(),
    fonts: z.array(
      z.object({
        family: z.string(),
        src: z.string(),
        weight: z.string().optional(),
        style: z.string().optional(),
      }),
    ),
    logo: z.string().nullable(),
    wordmark: z.string(),
    endCard: z
      .object({ seconds: z.number(), line: z.string(), sub: z.string() })
      .nullable(),
  })
  .nullable()
  .default(null);

export const HOUSE_BRAND: Brand = {
  name: "Motion Studio",
  accent: color.accent,
  punch: "#FFD60A",
  text: color.text,
  background: color.bg,
  displayFont: font.display,
  serifFont: font.serif,
  fonts: [],
  logo: null,
  wordmark: "",
  endCard: null,
};

const BrandContext = createContext<Brand>(HOUSE_BRAND);
export const useBrand = () => useContext(BrandContext);

// Loads the kit's own font files before the first frame renders.
export const BrandProvider: React.FC<{
  brand: Brand | null;
  children: React.ReactNode;
}> = ({ brand, children }) => {
  const b = brand ?? HOUSE_BRAND;
  const [handle] = useState(() =>
    b.fonts.length ? delayRender("Loading brand fonts") : null,
  );
  useEffect(() => {
    if (handle === null) return;
    Promise.all(
      b.fonts.map((f) =>
        loadFont({
          family: f.family,
          url: staticFile(f.src),
          weight: f.weight,
          style: f.style,
        }),
      ),
    )
      .catch(() => undefined)
      .then(() => continueRender(handle));
  }, [b.fonts, handle]);
  return <BrandContext.Provider value={b}>{children}</BrandContext.Provider>;
};

// The kit's end card over the last seconds of an edit: brand background fades
// in over the footage, then the logo (or wordmark), a line and a small sub line.
export const BrandEndCard: React.FC<{ durationInFrames: number }> = ({
  durationInFrames,
}) => {
  const b = useBrand();
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const u = Math.min(width, height) / 1080;
  if (!b.endCard) return null;
  const bg = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const mark = spring({
    frame: frame - 6,
    fps,
    config: springs.smooth,
    durationInFrames: 18,
  });
  const line = interpolate(frame, [16, 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const out = interpolate(
    frame,
    [durationInFrames - 8, durationInFrames],
    [1, 0.0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <AbsoluteFill
      style={{
        backgroundColor: b.background,
        opacity: bg * (0.25 + 0.75 * out),
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 28 * u,
      }}
    >
      <div
        style={{
          opacity: mark,
          transform: `translateY(${interpolate(mark, [0, 1], [24 * u, 0])}px)`,
        }}
      >
        {b.logo ? (
          <Img
            src={staticFile(b.logo)}
            style={{
              maxWidth: width * 0.6,
              maxHeight: height * 0.18,
              objectFit: "contain",
            }}
          />
        ) : (
          <div
            style={{
              fontFamily: b.displayFont,
              fontWeight: 700,
              fontSize: 64 * u,
              letterSpacing: "0.32em",
              color: b.text,
              textAlign: "center",
              paddingLeft: "0.32em",
            }}
          >
            {b.wordmark || b.name}
          </div>
        )}
      </div>
      <div
        style={{
          width: 90 * u,
          height: 4 * u,
          background: b.accent,
          opacity: line,
          borderRadius: 2,
        }}
      />
      {b.endCard.line ? (
        <div
          style={{
            opacity: line,
            fontFamily: b.serifFont,
            fontStyle: "italic",
            fontSize: 54 * u,
            color: b.text,
            textAlign: "center",
            maxWidth: width * 0.8,
          }}
        >
          {b.endCard.line}
        </div>
      ) : null}
      {b.endCard.sub ? (
        <div
          style={{
            opacity: line,
            fontFamily: b.displayFont,
            fontWeight: 600,
            fontSize: 26 * u,
            letterSpacing: "0.2em",
            color: b.text,
            textTransform: "uppercase",
          }}
        >
          {b.endCard.sub}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
