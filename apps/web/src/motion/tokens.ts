// JS mirror of the motion tokens in design/tokens.css. Framer Motion needs
// numbers (seconds) and bezier arrays, so these are the only motion values
// any component may use — no ad-hoc durations or curves elsewhere.

export const duration = {
  instant: 0.09,
  fast: 0.15,
  base: 0.22,
  slow: 0.32,
} as const;

export const ease = {
  standard: [0.2, 0, 0, 1],
  enter: [0.16, 1, 0.3, 1],
  exit: [0.4, 0, 1, 1],
} as const satisfies Record<string, [number, number, number, number]>;

/** Small travel distance for entrances, in px. */
export const rise = 8;

/** Per-item stagger and the cap after which items appear together. */
export const stagger = { step: 0.03, maxItems: 8 } as const;
