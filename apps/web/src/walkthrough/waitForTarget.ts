// Wait for a step's target to be rendered and visible. A MutationObserver
// re-checks when the DOM changes (route commits, data arriving), and a slow
// fallback poll catches changes that don't mutate the DOM (CSS transitions
// finishing, layout settling). Bounded by `timeout`, cancelled by `signal`,
// and everything is cleaned up whichever way it ends.

export function isVisible(el: Element): boolean {
  if (!el.isConnected) return false;
  // Inside an inert or hidden region (a collapsed sidebar, a closed sheet).
  if (el.closest("[inert], [hidden], [aria-hidden='true']")) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
}

/** A page the route gate refused (NoAccess / NotFound): no target to wait for. */
export const blockedPage = () =>
  Boolean(document.querySelector("#px-main [data-tour-blocked]"));

/** Still loading: a skeleton that the real content will replace. */
const isBusy = (el: Element) =>
  Boolean(
    el.closest("[aria-busy='true']") || el.querySelector("[aria-busy='true']"),
  );

/**
 * The first selector (in priority order) with a visible, settled match.
 * A visible match that's still loading is returned separately, to fall
 * back on if loading never finishes in time.
 */
function find(selectors: string[]): {
  el: HTMLElement | null;
  busy: HTMLElement | null;
  invalid: boolean;
} {
  let valid = false;
  let busy: HTMLElement | null = null;
  for (const sel of selectors) {
    try {
      const el = document.querySelector<HTMLElement>(sel);
      valid = true;
      if (!el || !isVisible(el)) continue;
      if (!isBusy(el)) return { el, busy: null, invalid: false };
      busy ??= el;
    } catch {
      /* an invalid selector never matches */
    }
  }
  return { el: null, busy, invalid: !valid };
}

/** The page is still loading: skeletons on screen, or a list marked busy. */
export const pageLoading = () =>
  Boolean(
    document.querySelector(
      "#px-main [data-skeleton], #px-main [aria-busy='true']:not(button)",
    ),
  );

/**
 * `settle`: once the page has finished loading (no skeletons, nothing
 * busy) and the DOM has been quiet this long with no sign of the target,
 * it isn't coming — give up then instead of waiting out `timeout`. Missing
 * steps (a button this role doesn't get, an empty state) are skipped in
 * about a second rather than several.
 */
export function waitForTarget(
  selector: string | string[],
  {
    timeout = 6000,
    signal,
    root = document.body,
    poll = 250,
    settle = 800,
  }: {
    timeout?: number;
    signal?: AbortSignal;
    root?: Node;
    poll?: number;
    settle?: number;
  } = {},
): Promise<HTMLElement | null> {
  const selectors = Array.isArray(selector) ? selector : [selector];
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(null);

    let done = false;
    let observer: MutationObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    let frame = 0;
    let busy: HTMLElement | null = null;
    let lastChange = Date.now();

    const finish = (el: HTMLElement | null) => {
      if (done) return;
      done = true;
      observer?.disconnect();
      clearTimeout(timer);
      clearInterval(interval);
      cancelAnimationFrame(frame);
      signal?.removeEventListener("abort", onAbort);
      resolve(el);
    };
    const onAbort = () => finish(null);

    const check = () => {
      frame = 0;
      if (done) return;
      if (blockedPage()) return finish(null);
      const found = find(selectors);
      if (found.invalid) return finish(null);
      if (found.el) return finish(found.el);
      busy = found.busy;
      if (!busy && !pageLoading() && Date.now() - lastChange >= settle)
        finish(null);
    };
    // Coalesce bursts of mutations into one check per frame.
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };

    signal?.addEventListener("abort", onAbort);
    check();
    if (done) return;
    observer = new MutationObserver(() => {
      lastChange = Date.now();
      schedule();
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "inert", "aria-hidden"],
    });
    interval = setInterval(schedule, poll);
    // Out of time: settle for a target that's visible but still loading.
    timer = setTimeout(
      () => finish(busy && busy.isConnected && isVisible(busy) ? busy : null),
      timeout,
    );
  });
}
