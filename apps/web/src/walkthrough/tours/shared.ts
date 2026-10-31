import type { TourStepDef } from "../types";

/**
 * A module's opening step: its sidebar entry (where to find it), or the page
 * title where the sidebar isn't on screen (phones, tablets, a hidden
 * sidebar). The runner has already opened the module's page, so a module
 * with several pages shows them expanded beneath the entry.
 */
export const intro = (
  navId: string,
  title: string,
  content: string,
): TourStepDef => ({
  id: "intro",
  target: [`nav-${navId}`, "page-title"],
  placement: "auto",
  title,
  content,
});

/** A step about the current page as a whole, anchored on its title. */
export const page = (
  id: string,
  title: string,
  content: string,
  route?: string,
): TourStepDef => ({
  id,
  target: "page-title",
  placement: "bottom",
  title,
  content,
  ...(route ? { route } : {}),
});
