import type { SVGProps } from "react";

// One icon language: 20×20 grid, 1.6 stroke, round caps/joins, no fills except
// where a filled glyph signals state (e.g. the selected nav item). Sized in em
// so icons track the adjacent text weight and size.

const P = {
  today:
    "M3.5 8.5 10 3.5l6.5 5V16a1 1 0 0 1-1 1h-3.5v-4.5h-4V17H4.5a1 1 0 0 1-1-1z",
  inbox:
    "M3 11.5 5 4.5h10l2 7M3 11.5V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4.5M3 11.5h4.2a2.8 2.8 0 0 0 5.6 0H17",
  calendar:
    "M4 5.5h12a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1ZM3 9h14M7 3.5v3M13 3.5v3",
  chat: "M4 4.5h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9l-3.5 3v-3H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z",
  people:
    "M7.5 9a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM2.5 16.5c.4-2.8 2.4-4.5 5-4.5s4.6 1.7 5 4.5M13 3.7a2.6 2.6 0 0 1 0 5M14.5 12.2c1.6.5 2.7 2 3 4.3",
  person:
    "M10 9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 17c.5-3.2 2.9-5 6-5s5.5 1.8 6 5",
  clock: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM10 6v4.2l2.8 1.8",
  leave:
    "M3 16.5h14M5.5 13.5l-1.8-4 1.4-.5 2.6 2.3 3.6-1.3L6.9 4.4l1.9-.7 5.6 4.7 2.4-.9a1.4 1.4 0 0 1 1 2.6L5.5 13.5Z",
  wfh: "M3.5 9 10 3.5 16.5 9M5 7.8V16.5h10V7.8M8.5 16.5v-4h3v4",
  idcard:
    "M3.5 5h13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM7 10.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2ZM4.6 13c.4-1 1.3-1.6 2.4-1.6s2 .6 2.4 1.6M11.5 8.5h3.5M11.5 11.5h2.5",
  org: "M8 3.5h4v3H8zM3 13.5h4v3H3zM8 13.5h4v3H8zM13 13.5h4v3h-4zM10 6.5v3.5M5 13.5V10h10v3.5",
  door: "M5 17V4a1 1 0 0 1 1-1h6.5a1 1 0 0 1 1 1v13M3 17h14M10.5 10.5v.01M13.5 6l2.5-1v11",
  briefcase:
    "M3.5 6.5h13a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1ZM7.5 6.5V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5M2.5 10.5h15",
  star: "m10 3.2 2 4.3 4.6.5-3.4 3.2.9 4.6L10 13.5l-4.1 2.3.9-4.6L3.4 8l4.6-.5Z",
  banknote:
    "M2.5 5.5h15v9h-15zM10 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4ZM5 8v.01M15 12v.01",
  laptop:
    "M4.5 5h11a1 1 0 0 1 1 1v7h-13V6a1 1 0 0 1 1-1ZM2 13h16l-.8 2a1 1 0 0 1-.9.5H3.7a1 1 0 0 1-.9-.5Z",
  megaphone:
    "M3.5 8.5v3a1 1 0 0 0 1 1H6l7 3.5v-12L6 7.5H4.5a1 1 0 0 0-1 1ZM6.5 12.5l1 4h2l-1-3.5M15.5 8a2.5 2.5 0 0 1 0 4",
  flag: "M5 17.5V3.5M5 4h9.5l-2 3.2 2 3.3H5",
  doc: "M5.5 2.5h6l3.5 3.5v10.5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1ZM11.5 2.5V6H15M7.5 10h5M7.5 13h5",
  lifebuoy:
    "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM5 5l2.9 2.9M12.1 12.1 15 15M15 5l-2.9 2.9M7.9 12.1 5 15",
  chart: "M3 17h14M5.5 14V9.5M10 14V5M14.5 14v-6",
  table:
    "M3.5 4h13a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM2.5 8h15M2.5 12h15M8 8v8",
  key: "M7 13a4 4 0 1 1 3.6-2.3L17 17h-2.5v-1.5H13V14h-1.5l-.9-.9A4 4 0 0 1 7 13ZM6 8v.01",
  gear: "M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM8.6 2.8h2.8l.4 2 1.4.8 1.9-.7 1.4 2.4-1.5 1.4v1.6l1.5 1.4-1.4 2.4-1.9-.7-1.4.8-.4 2H8.6l-.4-2-1.4-.8-1.9.7-1.4-2.4L5 10.8V9.2L3.5 7.8l1.4-2.4 1.9.7 1.4-.8Z",
  link: "M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-1 1M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l1-1",
  card: "M3 5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM2 8.5h16M5 12h3",
  help: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM8 8a2 2 0 1 1 2.8 1.8c-.5.2-.8.7-.8 1.2v.5M10 14v.01",
  search: "M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM17 17l-3.8-3.8",
  bell: "M5 13.5V9a5 5 0 0 1 10 0v4.5l1.5 1.5h-13ZM8.5 17a1.6 1.6 0 0 0 3 0",
  chevronRight: "m8 5 5 5-5 5",
  chevronLeft: "m12 5-5 5 5 5",
  chevronDown: "m5 8 5 5 5-5",
  chevronUp: "m5 12 5-5 5 5",
  chevronUpDown: "m7 8 3-3 3 3M7 12l3 3 3-3",
  plus: "M10 4.5v11M4.5 10h11",
  check: "m4.5 10.5 3.5 3.5 7.5-8",
  x: "m5.5 5.5 9 9M14.5 5.5l-9 9",
  more: "M5 10v.01M10 10v.01M15 10v.01",
  sidebar:
    "M3.5 4h13a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM8 4v12",
  logout:
    "M8 17H4.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1H8M12.5 13.5 16 10l-3.5-3.5M16 10H8",
  filter: "M3.5 5h13M6 10h8M8.5 15h3",
  external:
    "M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3M11 3.5h5.5V9M16 4l-7 7",
  checkCircle: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM6.8 10.2l2.2 2.2 4.2-4.6",
  alert: "M10 3.5 17.5 16.5h-15ZM10 8.5v3.5M10 14.5v.01",
  info: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM10 9v5M10 6.5v.01",
  upload: "M10 16.5v-9M6 11l4-4 4 4M4 3.5h12",
  download: "M10 3.5v9M6 9l4 4 4-4M4 16.5h12",
  edit: "M12.5 4.5l3 3L7 16H4v-3Zm-2 2 3 3",
  trash:
    "M4 6h12M8 6V4.5h4V6M5.5 6l.8 10a1 1 0 0 0 1 .9h5.4a1 1 0 0 0 1-.9l.8-10M8.5 9v5M11.5 9v5",
  pin: "M10 17.5s5.5-4.8 5.5-9a5.5 5.5 0 0 0-11 0c0 4.2 5.5 9 5.5 9ZM10 10.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  sun: "M10 13.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM10 2v1.5M10 16.5V18M2 10h1.5M16.5 10H18M4.3 4.3l1.1 1.1M14.6 14.6l1.1 1.1M4.3 15.7l1.1-1.1M14.6 5.4l1.1-1.1",
  moon: "M16.5 12.2A7 7 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7Z",
  cake: "M3.5 17h13M4.5 17v-5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v5M4.5 13.5c1.2 0 1.2 1 2.4 1s1.2-1 2.4-1 1.2 1 2.4 1 1.2-1 2.4-1 1.1.6 1.4.8M10 11V8M10 6.3c-.8-.6-.8-1.6 0-2.8.8 1.2.8 2.2 0 2.8Z",
  sparkle:
    "M10 3v3M10 14v3M3 10h3M14 10h3M5.2 5.2l2 2M12.8 12.8l2 2M14.8 5.2l-2 2M7.2 12.8l-2 2",
  assistant:
    "M8.5 4.5c.6 3 1.5 3.9 4.5 4.5-3 .6-3.9 1.5-4.5 4.5-.6-3-1.5-3.9-4.5-4.5 3-.6 3.9-1.5 4.5-4.5ZM14.5 2.5c.3 1.3.7 1.7 2 2-1.3.3-1.7.7-2 2-.3-1.3-.7-1.7-2-2 1.3-.3 1.7-.7 2-2ZM14 12.5c.3 1.5.8 2 2.3 2.3-1.5.3-2 .8-2.3 2.2-.3-1.4-.8-1.9-2.3-2.2 1.5-.3 2-.8 2.3-2.3Z",
  arrowRight: "M4 10h12M11.5 5.5 16 10l-4.5 4.5",
  refresh: "M16 10a6 6 0 1 1-1.8-4.3M16 3.5v3.5h-3.5",
  lock: "M5.5 9h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1ZM7 9V6.5a3 3 0 0 1 6 0V9",
  device:
    "M6 2.5h8a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1ZM9 15h2",
  shield: "M10 2.8 16 5v4.7c0 3.6-2.6 6.5-6 7.5-3.4-1-6-3.9-6-7.5V5Z",
  play: "M7 4.8v10.4a.6.6 0 0 0 .9.5l8-5.2a.6.6 0 0 0 0-1l-8-5.2a.6.6 0 0 0-.9.5Z",
  ticket:
    "M3 6.5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2a1.5 1.5 0 0 0 0 3v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a1.5 1.5 0 0 0 0-3ZM12 5.5v9",
} satisfies Record<string, string>;

export type IconName = keyof typeof P;

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number | string;
  /** Accessible label; omit for decorative icons next to visible text. */
  label?: string;
}

export function Icon({ name, size = "1.25em", label, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      style={{ flexShrink: 0 }}
      {...rest}
    >
      <path d={P[name]} />
    </svg>
  );
}
