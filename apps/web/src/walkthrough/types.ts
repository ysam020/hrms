import type { ReactNode } from "react";

// Types for the product walkthrough. See docs/walkthrough.md for how to add
// a module's steps.

/** Bump when steps are reordered or targets change enough that saved
 *  positions should be re-checked. Saved progress is reconciled by step id,
 *  never discarded, so a bump doesn't replay anything. */
export const WALKTHROUGH_VERSION = 1;

/** Persisted state schema; bump only when the shape below changes. */
export const STATE_SCHEMA = 1;

/** The application-wide tour's id; module tours use their module's id. */
export const APP_TOUR = "app";

type User = any;

/** What a step's condition or preparation can look at. Never business data. */
export interface TourEnv {
  user: User;
  /** Regular width: the sidebar is docked (it's a sheet below 1024px). */
  docked: boolean;
}

/** Safe UI the runner can drive before showing a step (never a mutation). */
export interface PrepareContext extends TourEnv {
  sidebarHidden: boolean;
  showSidebar: () => void;
}

export interface TourStepDef {
  /** Unique within the module; the stable id is `${module}.${id}`. */
  id: string;
  /** `[data-tour="…"]` value (preferred) or a CSS selector. A list is
   *  tried in order: the first visible one is used (e.g. the sidebar entry,
   *  else the page title where the sidebar is a closed sheet). */
  target: string | string[];
  title: string;
  content: ReactNode;
  /** Defaults to the module's route. `null`: wherever the user is. */
  route?: string | null;
  placement?:
    | "top"
    | "bottom"
    | "left"
    | "right"
    | "auto"
    | "center"
    | "bottom-start"
    | "right-start";
  /** Extra condition beyond the route's own access check. */
  when?: (env: TourEnv) => boolean;
  /** Needs the docked sidebar (skipped on tablets and phones). */
  sidebar?: boolean;
  /** Safe UI preparation (expand, show) before the target is looked for. */
  prepare?: (ctx: PrepareContext) => void | Promise<void>;
  /** Wait this long for the target (ms). Default: 6000 after navigating. */
  timeout?: number;
}

export interface TourModuleDef {
  /** Matches the NAV module id where there is one. */
  id: string;
  label: string;
  /** One line for the Product Tours page. */
  summary: string;
  /** The module's main route; steps navigate here unless they say otherwise. */
  route: string;
  /** Whether the module applies to this user at all. Route access is also
   *  checked step by step against the navigation's own predicates. */
  when?: (env: TourEnv) => boolean;
  steps: TourStepDef[];
}

/** A step ready to run: ids are global, the route and module are resolved. */
export interface ResolvedStep {
  id: string;
  module: string;
  moduleLabel: string;
  /** Selectors in priority order. */
  target: string[];
  title: string;
  content: ReactNode;
  route: string | null;
  placement: NonNullable<TourStepDef["placement"]>;
  prepare?: TourStepDef["prepare"];
  timeout?: number;
}

export type TourStatus =
  | "not_started"
  | "running"
  | "paused"
  | "completed"
  /** The user chose to skip the whole tour. Not the same as completed. */
  | "dismissed";

export interface TourProgress {
  status: TourStatus;
  /** The step being shown, or where to resume. */
  stepId: string | null;
  /** Steps the user moved past with Next. */
  seen: string[];
  /** Steps the user skipped, or that weren't available when reached. */
  skipped: string[];
  lastRoute: string | null;
  updatedAt: string;
}

export interface WalkthroughState {
  schema: number;
  /** WALKTHROUGH_VERSION when this was saved. */
  version: number;
  /** The tour that's running or paused (one at a time). */
  active: string | null;
  tours: Record<string, TourProgress>;
  updatedAt: string;
}
