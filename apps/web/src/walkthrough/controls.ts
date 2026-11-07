import { createContext, useContext } from "react";

// The runner's step controls, provided by Runner and read by Tooltip. Kept
// in its own module so Tooltip doesn't import Runner (which imports
// Tooltip to render it).

export interface RunnerControls {
  next: () => void;
  back: () => void;
  skipStep: () => void;
  skipModule: () => void;
  pause: () => void;
  dismiss: () => void;
}

export const ControlsCtx = createContext<RunnerControls | null>(null);

export const useRunnerControls = () => useContext(ControlsCtx)!;
