// A brand kit (public/brands/<slug>/brand.json) as template props: the shape
// src/lib/brand.tsx expects (colours, font families and files, logo, end card).

import { join } from "node:path";
import { readJson } from "./media.mjs";

const fam = (f, fallback) => (f?.family ? `"${f.family}", ${fallback}` : fallback);

export const loadBrandKit = (slug) => {
  const kit = readJson(join("public", "brands", slug, "brand.json"));
  if (!kit) throw new Error(`Brand kit not found: public/brands/${slug}/brand.json`);
  return kit;
};

export const brandProps = (slug, { endCard = true } = {}) => {
  const kit = loadBrandKit(slug);
  return {
    name: kit.name,
    accent: kit.colors?.accent || "#E8B44A",
    punch: kit.colors?.punch || "#FFD60A",
    text: kit.colors?.text || "#F4EFE6",
    background: kit.colors?.background || "#0B0B0D",
    displayFont: fam(kit.fonts?.display, "Inter, Helvetica, Arial, sans-serif"),
    serifFont: fam(kit.fonts?.serif, "Fraunces, Georgia, serif"),
    fonts: Object.values(kit.fonts || {})
      .filter((f) => f.file)
      .map((f) => ({ family: f.family, src: `brands/${slug}/${f.file}`, ...(f.weight ? { weight: f.weight } : {}), ...(f.style ? { style: f.style } : {}) })),
    logo: kit.logo ? `brands/${slug}/${kit.logo}` : null,
    wordmark: kit.wordmark || kit.name,
    endCard: kit.endCard && endCard ? { seconds: kit.endCard.seconds ?? 2.5, line: kit.endCard.line || "", sub: kit.endCard.sub || "" } : null,
  };
};
