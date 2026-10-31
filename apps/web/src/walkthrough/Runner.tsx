import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { EVENTS, Joyride, type EventData } from "react-joyride";
import { UserContext } from "@web/app/providers/UserContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import { usePrefersReducedMotion } from "@next/motion";
import { useShell } from "@next/shell/context";
import { Button, Spinner } from "@next/ui";
import * as engine from "./engine";
import { MODULES, canReach, matchesRoute } from "./registry";
import { isVisible, waitForTarget } from "./waitForTarget";
import { useWalkthrough } from "./WalkthroughProvider";
import { Tooltip, type StepMeta } from "./Tooltip";
import {
  APP_TOUR,
  type PrepareContext,
  type ResolvedStep,
  type TourEnv,
} from "./types";
import s from "./walkthrough.module.css";

// Runs the active tour. For each step: go to its route with the app's own
// router (no reloads), wait for that route to commit, run any safe
// preparation (show the sidebar), wait for the target to render and be
// visible, then show it. Joyride is used in controlled mode for one step at
// a time — it draws the spotlight and tooltip; the position lives only in
// the walkthrough state, so a route change can never race Joyride's own
// index. A target that doesn't appear in time is skipped, never waited on
// forever, and the person can pause at any moment, including while waiting.

export interface RunnerControls {
  next: () => void;
  back: () => void;
  skipStep: () => void;
  skipModule: () => void;
  pause: () => void;
  dismiss: () => void;
}

const ControlsCtx = createContext<RunnerControls | null>(null);
export const useRunnerControls = () => useContext(ControlsCtx)!;

/**
 * Where the tooltip attaches. A target taller than half the screen (a long
 * table, the dashboard grid) is still highlighted whole, but the tooltip
 * attaches to its top part — the header row, the first card — so it sits
 * on screen next to what it describes instead of off the end of the page.
 */
export function anchorFor(el: HTMLElement): HTMLElement {
  const limit = window.innerHeight * 0.5;
  let cur = el;
  for (let depth = 0; depth < 5; depth++) {
    if (cur.getBoundingClientRect().height <= limit) break;
    const head = cur.querySelector<HTMLElement>("thead");
    const next =
      head && isVisible(head)
        ? head
        : (Array.from(cur.children).find(
            (c): c is HTMLElement => c instanceof HTMLElement && isVisible(c),
          ) ?? null);
    if (!next) break;
    cur = next;
  }
  return cur;
}

/**
 * The part of the screen where `el` can actually be seen: the viewport,
 * cut down by every scrolling or clipping ancestor (the sidebar's own
 * scrolling list, a scrolling table). Page content also loses the sticky
 * toolbar's height at the top.
 */
function visibleArea(el: HTMLElement) {
  let top = el.closest("#px-main") ? 72 : 8;
  let bottom = window.innerHeight - 16;
  let left = 0;
  let right = window.innerWidth;
  for (
    let p = el.parentElement;
    p && p !== document.body;
    p = p.parentElement
  ) {
    const st = getComputedStyle(p);
    if (!/(auto|scroll|hidden|clip)/.test(st.overflowY + st.overflowX))
      continue;
    const r = p.getBoundingClientRect();
    top = Math.max(top, r.top);
    bottom = Math.min(bottom, r.bottom);
    left = Math.max(left, r.left);
    right = Math.min(right, r.right);
  }
  return { top, bottom, left, right };
}

/**
 * The side the tooltip opens on. Anything in the sidebar opens to its right,
 * just past the sidebar's edge. "auto" otherwise means below (flipping above
 * when there's no room) — Joyride's own auto placement picks whichever side
 * is roomiest, which put sidebar tooltips on top of the sidebar.
 */
export function placementFor(
  placement: ResolvedStep["placement"],
  el: HTMLElement,
): ResolvedStep["placement"] {
  if (placement === "center") return placement;
  if (el.closest("[data-px-sidebar]")) return "right";
  return placement === "auto" ? "bottom" : placement;
}

/** Scroll the anchor into a comfortable spot, only if it isn't in one. */
function bringIntoView(anchor: HTMLElement, smooth: boolean) {
  const r = anchor.getBoundingClientRect();
  const v = visibleArea(anchor);
  if (
    r.top >= v.top &&
    r.bottom <= v.bottom &&
    r.left >= v.left - 1 &&
    r.right <= v.right + 1
  )
    return;
  anchor.scrollIntoView?.({
    block: "center",
    inline: "nearest",
    behavior: smooth ? "smooth" : "auto",
  });
}

/** Joyride failing (a target swapped out mid-render) pauses the tour, never
 *  the page around it. */
class TourBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function Runner({ tour }: { tour: string }) {
  const wt = useWalkthrough()!;
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext) as any;
  const shell = useShell();
  const reduced = usePrefersReducedMotion();
  const location = useLocation();
  const navigate = useNavigate();

  const env = useMemo<TourEnv>(
    () => ({ user, docked: shell.docked }),
    [user, shell.docked],
  );
  // Rebuilt when the person or the layout changes (permissions re-checked,
  // sidebar steps dropped on narrow screens); the position is kept by id.
  const steps = useMemo(
    () => engine.buildSteps(tour, MODULES, env, canReach),
    [tour, env],
  );
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const progress = engine.progressOf(wt.state, tour);
  const index = steps.findIndex((x) => x.id === progress.stepId);
  const step: ResolvedStep | undefined = steps[index];

  // The saved step isn't in this person's tour (removed in an update, or
  // no longer permitted): move to the nearest valid one, or stop.
  useEffect(() => {
    if (step) return;
    if (!steps.length) {
      wt.update((st) => engine.pause(st));
      return;
    }
    const i = engine.resumeIndex(steps, progress);
    wt.update((st) => ({
      ...st,
      tours: { ...st.tours, [tour]: { ...progress, stepId: steps[i].id } },
    }));
  }, [step, steps]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Controls ──
  // Which way the person is moving: a missing target is skipped that way.
  const direction = useRef<1 | -1>(1);
  // One action per step: double clicks and repeated key presses are ignored
  // until the next step is on screen.
  const acted = useRef<string | null>(null);
  const announceEnd = useCallback(
    (next: typeof wt.state) => {
      if (engine.progressOf(next, tour).status !== "completed") return;
      setAlert?.({
        open: true,
        severity: "success",
        message:
          tour === APP_TOUR
            ? "Tour complete. Revisit any part from Help & Support → Product Tours."
            : "Tour complete.",
      });
    },
    [tour, setAlert],
  );
  const move = useCallback(
    (fn: (st: typeof wt.state, steps: ResolvedStep[]) => typeof wt.state) =>
      announceEnd(wt.update((st) => fn(st, stepsRef.current))),
    [wt, announceEnd],
  );
  const act = useCallback(
    (fn: (st: typeof wt.state, steps: ResolvedStep[]) => typeof wt.state) => {
      if (!step || acted.current === step.id) return;
      acted.current = step.id;
      move(fn);
    },
    [step, move],
  );
  /** The step can't be shown here: skip it in the direction of travel. */
  const unavailable = useCallback(() => {
    acted.current = null;
    move((st, all) => engine.skipStep(st, all, direction.current));
  }, [move]);

  const controls = useMemo<RunnerControls>(
    () => ({
      next: () => {
        direction.current = 1;
        act(engine.next);
      },
      back: () => {
        direction.current = -1;
        act(engine.back);
      },
      skipStep: () => {
        direction.current = 1;
        act((st, all) => engine.skipStep(st, all, 1));
      },
      skipModule: () => {
        direction.current = 1;
        act(engine.skipModule);
      },
      pause: () => wt.update((st) => engine.pause(st, location.pathname)),
      dismiss: () => wt.update((st) => engine.dismiss(st, tour)),
    }),
    [act, wt, tour, location.pathname],
  );

  // ── Route ──
  const routeOk = step ? matchesRoute(location.pathname, step.route) : false;
  const navigatedFor = useRef<string | null>(null);
  // The step whose route has been reached. Leaving it after that is the
  // person's own doing (a link, the back button): pause rather than drag
  // them back, whether the tooltip was up or still loading.
  const arrivedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!step) return;
    if (routeOk) {
      arrivedFor.current = step.id;
      return;
    }
    if (arrivedFor.current === step.id) {
      wt.update((st) => engine.pause(st, location.pathname));
      setAlert?.({
        open: true,
        severity: "info",
        message: "Tour paused. Resume it from Help & Support → Product Tours.",
      });
      return;
    }
    if (!step.route) return;
    // Navigate once per step. Until the route commits nothing is looked for
    // (the old page has targets with the same names); if it never commits —
    // a redirect, a failed load — the step is skipped after a while.
    if (navigatedFor.current !== step.id) {
      navigatedFor.current = step.id;
      navigate(step.route);
    }
    const t = setTimeout(unavailable, 8000);
    return () => clearTimeout(t);
  }, [step, routeOk]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Target ──
  const [shown, setShown] = useState<{
    id: string;
    el: HTMLElement;
    anchor: HTMLElement;
  } | null>(null);
  // Bumped when a shown target is replaced in the page (data finished
  // loading, a list re-rendered): look for it again instead of pointing
  // Joyride at a detached element.
  const [lookup, setLookup] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const prepareCtx = useRef<PrepareContext | null>(null);
  prepareCtx.current = {
    ...env,
    sidebarHidden: shell.sidebarHidden,
    showSidebar: () => {
      if (shell.sidebarHidden) shell.toggleSidebar();
    },
  };

  useEffect(() => {
    setShown(null);
    if (!step) return;
    // Only for a genuinely slow page; most steps are ready well before.
    const slow = setTimeout(() => setWaiting(true), 1200);
    if (!routeOk) return () => clearTimeout(slow);
    const ac = new AbortController();
    (async () => {
      try {
        await step.prepare?.(prepareCtx.current!);
      } catch {
        /* preparation is best-effort */
      }
      const el = await waitForTarget(step.target, {
        timeout: step.timeout ?? 6000,
        signal: ac.signal,
      });
      if (ac.signal.aborted) return;
      clearTimeout(slow);
      setWaiting(false);
      if (!el) return unavailable();
      const anchor = step.placement === "center" ? el : anchorFor(el);
      if (step.placement !== "center") bringIntoView(anchor, !reduced);
      acted.current = null;
      setShown({ id: step.id, el, anchor });
    })();
    return () => {
      ac.abort();
      clearTimeout(slow);
    };
  }, [step?.id, routeOk, lookup]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = shown && step && shown.id === step.id ? shown : null;

  useEffect(() => {
    if (!visible) return;
    const mo = new MutationObserver(() => {
      if (visible.el.isConnected && visible.anchor.isConnected) return;
      mo.disconnect();
      setShown(null);
      setLookup((n) => n + 1);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [visible]);

  const onTourError = useCallback(() => {
    wt.update((st) => engine.pause(st, window.location.pathname));
    setAlert?.({
      open: true,
      severity: "warning",
      message:
        "The tour hit a problem on this page and was paused. Resume it from Help & Support → Product Tours.",
    });
  }, [wt, setAlert]);

  // Remember where the tour was for "resume" summaries.
  useEffect(() => {
    if (visible) wt.update((st) => engine.recordRoute(st, location.pathname));
  }, [visible?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape pauses — wherever focus is, since the overlay blocks the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      controls.pause();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [controls]);

  const total = steps.length;

  const meta = useMemo<StepMeta | null>(() => {
    if (!step) return null;
    const inModule = steps.filter((x) => x.module === step.module);
    return {
      number: index + 1,
      total,
      module: step.moduleLabel,
      moduleNumber: inModule.findIndex((x) => x.id === step.id) + 1,
      moduleTotal: inModule.length,
      isFirst: index === 0,
      isLast: index === total - 1,
      multiModule:
        tour === APP_TOUR && steps.some((x) => x.module !== step.module),
    };
  }, [step, steps, index, total, tour]);

  const onEvent = useCallback(
    (data: EventData) => {
      if (data.type === EVENTS.TARGET_NOT_FOUND) unavailable();
    },
    [unavailable],
  );

  return (
    <ControlsCtx.Provider value={controls}>
      {visible && step && meta && (
        <TourBoundary key={`${step.id}:${lookup}`} onError={onTourError}>
          <Joyride
            key={step.id}
            run
            continuous
            stepIndex={0}
            steps={[
              {
                id: step.id,
                target: visible.anchor,
                spotlightTarget:
                  visible.anchor === visible.el ? undefined : visible.el,
                title: step.title,
                content: step.content,
                placement: placementFor(step.placement, visible.el),
                data: meta,
              },
            ]}
            tooltipComponent={Tooltip}
            onEvent={onEvent}
            options={{
              skipBeacon: true,
              skipScroll: true,
              targetWaitTimeout: 0,
              blockTargetInteraction: true,
              overlayClickAction: false,
              dismissKeyAction: false,
              overlayColor: "rgb(0 0 0 / 0.42)",
              spotlightPadding: 6,
              spotlightRadius: 10,
              scrollDuration: reduced ? 0 : 300,
              zIndex: 350,
              width: "min(380px, calc(100vw - 32px))",
            }}
            floatingOptions={{
              // Positioned against the viewport: the tooltip never extends
              // the page (which pushed the layout down or sideways) and is
              // flipped/shifted to stay fully on screen.
              strategy: "fixed",
              // Keep it on screen — against the viewport, not the target's
              // own scrolling container (for a sidebar entry that's the
              // sidebar, which would pull the tooltip on top of it).
              shiftOptions: {
                padding: 12,
                crossAxis: true,
                boundary: "clippingAncestors",
                rootBoundary: "viewport",
              },
              flipOptions: {
                padding: 12,
                boundary: "clippingAncestors",
                rootBoundary: "viewport",
              },
              hideArrow: step.placement === "center",
            }}
            locale={{
              back: "Back",
              next: "Next",
              last: "Finish",
              close: "Pause",
            }}
          />
        </TourBoundary>
      )}
      {waiting && !visible && (
        <div className={s.waiting}>
          <Spinner label="Loading the next step…" size="small" showLabel />
          <Button size="small" variant="plain" onClick={controls.pause}>
            Pause Tour
          </Button>
        </div>
      )}
    </ControlsCtx.Provider>
  );
}
