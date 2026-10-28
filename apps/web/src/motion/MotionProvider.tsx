import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";
import { duration, ease } from "./tokens";

/**
 * App-wide motion defaults. `reducedMotion="user"` makes every framer
 * animation drop transforms (travel, scale) under Reduce Motion while keeping
 * opacity — exits still run to completion, so unmounting and focus restore
 * behave identically with motion on or off.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: duration.base, ease: ease.standard }}
    >
      {children}
    </MotionConfig>
  );
}
