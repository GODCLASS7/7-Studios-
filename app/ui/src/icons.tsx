// Line icons, drawn for 7 Studios (24-unit grid, 1.7 stroke).
const P: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5M5 9v11h5v-6h4v6h5V9",
  image: "M4 5h16v14H4zM4 15l4.5-4.5 4 4 3-3L20 16M15.5 9.5a1.5 1.5 0 1 0 0-.01",
  video: "M3.5 6h12v12h-12zM15.5 10l5-3v10l-5-3",
  edit: "M6 3v18M18 3v18M6 8h12M6 16h12M3 8h3M18 8h3M3 16h3M18 16h3",
  motion: "M4 18c3-9 6-12 8-12s3 4 2 6-4 2-4 0 3-8 10-8M4 18h2",
  carousel: "M7 5h10v14H7zM3 7v10M21 7v10",
  web: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  publish: "M4 12 20 4l-5 16-3.5-6.5zM11.5 13.5 20 4",
  library: "M4 4h4v16H4zM10 4h4v16h-4zM16 5l3.5-.8 3 15.5-3.5.8z",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z",
  play: "M7 4.5v15l12-7.5z",
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5 10 17l9-10",
  x: "M6 6l12 12M18 6 6 18",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v4h16v-4",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  heart: "M12 20s-7-4.4-9-9a4.8 4.8 0 0 1 9-3 4.8 4.8 0 0 1 9 3c-2 4.6-9 9-9 9z",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  wand: "M4 20 16 8M14 4v2M19 9h2M18.5 5.5 17 7M10 5l.7 1.4L12 7l-1.3.6L10 9l-.7-1.4L8 7l1.3-.6zM18 13l.6 1.2 1.2.6-1.2.6L18 17l-.6-1.2-1.2-.6 1.2-.6z",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z",
  arrow: "M5 12h14M13 6l6 6-6 6",
  back: "M19 12H5M11 6l-6 6 6 6",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  terminal: "M4 5h16v14H4zM7.5 10l3 2.5-3 2.5M12.5 15H16",
  bolt: "M13 3 5 14h6l-1 7 8-11h-6z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6",
  layers: "M12 3 3 8l9 5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.5",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  scissors: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.1 7.9 20 18M8.1 16.1 20 6",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  refresh: "M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4",
  shield: "M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM20 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z",
};
export type IconName = keyof typeof P;
export const Icon: React.FC<{ name: IconName; size?: number; className?: string; fill?: boolean }> = ({ name, size = 18, className, fill }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={P[name]} />
  </svg>
);
// The 7 Studios mark: a white tile, a gold ring and a gold 7, with a light that
// sweeps across now and then.
export const Logo: React.FC<{ size?: number; className?: string }> = ({ size = 30, className }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" style={{ filter: "drop-shadow(0 4px 10px rgba(150,105,20,.28))" }}>
    <defs>
      <linearGradient id="lg7" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#F8E3A2" />
        <stop offset="0.45" stopColor="#E8B44A" />
        <stop offset="1" stopColor="#B98722" />
      </linearGradient>
      <clipPath id="lc7">
        <rect x="20" y="20" width="472" height="472" rx="112" />
      </clipPath>
    </defs>
    <rect x="20" y="20" width="472" height="472" rx="112" fill="#FFFFFF" />
    <rect x="34" y="34" width="444" height="444" rx="100" fill="none" stroke="url(#lg7)" strokeWidth="10" />
    <path d="M150 150 H362 L246 372" fill="none" stroke="url(#lg7)" strokeWidth="56" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M196 262 H316" stroke="url(#lg7)" strokeWidth="32" strokeLinecap="round" />
    <g clipPath="url(#lc7)">
      <rect className="logo-shine" x="-140" y="-40" width="90" height="600" fill="#FFFFFF" opacity="0.7" transform="skewX(-20)" />
    </g>
  </svg>
);
