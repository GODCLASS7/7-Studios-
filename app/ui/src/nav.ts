import type { IconName } from "./icons";

export const STUDIOS: { path: string; label: string; icon: IconName; blurb: string }[] = [
  { path: "image", label: "Image", icon: "image", blurb: "Generate and edit images from a prompt, a preset or a character." },
  { path: "video", label: "Video", icon: "video", blurb: "Turn a still into a moving shot, or write one, with camera moves." },
  { path: "edit", label: "Edit", icon: "scissors", blurb: "Cut talking heads from the transcript: best takes, captions, checks." },
  { path: "motion", label: "Motion", icon: "motion", blurb: "Titles, cards, art styles, terminal: live previews, rendered exactly." },
  { path: "carousel", label: "Carousel", icon: "carousel", blurb: "Carousel posts from a talk or a topic, in eight looks." },
  { path: "web", label: "Web", icon: "web", blurb: "A website into a SiteMorph: its real parts, morphing on the beat." },
  { path: "publish", label: "Publish", icon: "publish", blurb: "Versions, review pages and the approved-post queue." },
];

// #/image?x=y → { path: "image", q: URLSearchParams }
export const parse = () => {
  const h = window.location.hash.replace(/^#\/?/, "");
  const [path, qs] = h.split("?");
  return { path: path || "home", q: new URLSearchParams(qs || "") };
};
export const go = (path: string, q?: Record<string, string>) => {
  window.location.hash = `/${path}${q ? `?${new URLSearchParams(q)}` : ""}`;
};

