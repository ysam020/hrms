import type { Transition, Variants } from "framer-motion";
import { duration, ease, rise } from "./tokens";

// The complete vocabulary of presence animations. Each preset has one job;
// components pick a preset by name rather than passing raw keyframes, which
// keeps motion consistent across the app.
//
// Exits are shorter than entrances and use an accelerating curve, so leaving
// UI gets out of the way quickly.

export type PresetName =
  | "fade" // inline status, toasts content, swaps
  | "rise" // content that appears in place (panels, banners, revealed fields)
  | "pop" // anchored popovers and menus (scale from the anchor)
  | "dialog" // centered modal surfaces
  | "sheet" // edge-attached modal drawers / bottom sheets
  | "slide"; // inline panels that slide a short way in from an edge (inspector)

export type Edge = "right" | "left" | "bottom" | "top";

const enter = (d: number = duration.base): Transition => ({
  duration: d,
  ease: ease.enter,
});
const exit = (d: number = duration.fast): Transition => ({
  duration: d,
  ease: ease.exit,
});

const sheetOffset: Record<Edge, { x?: string; y?: string }> = {
  right: { x: "100%" },
  left: { x: "-100%" },
  bottom: { y: "100%" },
  top: { y: "-100%" },
};

export function preset(name: PresetName, edge: Edge = "right"): Variants {
  switch (name) {
    case "fade":
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: enter(duration.fast) },
        exit: { opacity: 0, transition: exit(duration.instant) },
      };
    case "rise":
      return {
        initial: { opacity: 0, y: rise },
        animate: { opacity: 1, y: 0, transition: enter() },
        exit: { opacity: 0, y: rise / 2, transition: exit() },
      };
    case "pop":
      return {
        initial: { opacity: 0, scale: 0.97, y: -4 },
        animate: {
          opacity: 1,
          scale: 1,
          y: 0,
          transition: enter(duration.fast),
        },
        exit: { opacity: 0, scale: 0.98, transition: exit(duration.instant) },
      };
    case "dialog":
      return {
        initial: { opacity: 0, scale: 0.96, y: rise },
        animate: { opacity: 1, scale: 1, y: 0, transition: enter() },
        exit: { opacity: 0, scale: 0.98, transition: exit() },
      };
    case "slide": {
      const d = edge === "left" ? -16 : 16;
      return {
        initial: { opacity: 0, x: d },
        animate: { opacity: 1, x: 0, transition: enter() },
        exit: { opacity: 0, x: d, transition: exit() },
      };
    }
    case "sheet":
      return {
        initial: { ...sheetOffset[edge], opacity: 1 },
        animate: { x: 0, y: 0, transition: enter(duration.slow) },
        exit: { ...sheetOffset[edge], transition: exit(duration.base) },
      };
  }
}

export const scrimVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: enter(duration.base) },
  exit: { opacity: 0, transition: exit(duration.base) },
};
