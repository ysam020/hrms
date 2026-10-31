import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Presence,
  TransitionLink,
  usePrefersReducedMotion,
} from "@next/motion";
import { useShell } from "@next/shell/context";
import { useIsCompact, useIsRegular } from "@next/lib/hooks";
import { IconButton, ToolbarActionsContext } from "./controls";
import { Icon } from "./Icon";
import { Sheet } from "./overlays";
import s from "./Page.module.css";

/**
 * Every screen is a Page: a unified toolbar (leading nav control or back link,
 * title, subtitle, trailing actions + global extras), an optional row of
 * sub-view tabs, the content, and an optional inspector.
 */
export function Page({
  title,
  subtitle,
  actions,
  tabs,
  back,
  width = "full",
  inspector,
  children,
  documentTitle,
  largeTitle,
  description,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** One or two sentences under the toolbar saying what the page is for. */
  description?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  back?: { to: string; label: string };
  width?: "full" | "wide" | "reading";
  inspector?: ReactNode;
  children: ReactNode;
  documentTitle?: string;
  /** The page shows its own large title; the toolbar title appears on scroll. */
  largeTitle?: boolean;
}) {
  const {
    docked,
    sidebarHidden,
    toggleSidebar,
    openNavigation,
    toolbarExtras,
  } = useShell();
  // Compact: page actions show as icon buttons so the title fits beside them.
  const compact = useIsCompact();
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) =>
      setScrolled(!e.isIntersecting),
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const t = documentTitle ?? (typeof title === "string" ? title : undefined);
    if (t) document.title = `${t} · Praesto`;
  }, [documentTitle, title]);

  const showNavButton = !docked || sidebarHidden;

  return (
    <div className={s.page}>
      <div className={s.main}>
        <header className={s.toolbar} data-scrolled={scrolled || undefined}>
          {(showNavButton || back) && (
            <div className={s.leading}>
              {showNavButton && (
                <IconButton
                  icon="sidebar"
                  label={docked ? "Show Sidebar" : "Open Navigation"}
                  onClick={docked ? toggleSidebar : openNavigation}
                  data-tour="page-nav"
                />
              )}
              {back && (
                <TransitionLink
                  to={back.to}
                  className="px-back-link"
                  aria-label={`Back to ${back.label}`}
                >
                  <Icon name="chevronLeft" />
                  <span>{back.label}</span>
                </TransitionLink>
              )}
            </div>
          )}
          <div className={s.titles} data-tour="page-title">
            <h1
              className={s.title}
              data-collapsed={largeTitle && !scrolled ? "" : undefined}
            >
              {title}
            </h1>
            {subtitle && <p className={s.subtitle}>{subtitle}</p>}
          </div>
          <div className={s.actions}>
            <ToolbarActionsContext.Provider value={compact}>
              {actions}
            </ToolbarActionsContext.Provider>
            {toolbarExtras}
          </div>
        </header>
        <div ref={sentinel} className={s.sentinel} aria-hidden />
        {description && (
          <div className={s.leadRow} data-width={width}>
            <p className={s.lead}>{description}</p>
          </div>
        )}
        {tabs && (
          <div className={s.tabsRow} data-tour="page-tabs">
            {tabs}
          </div>
        )}
        <div id="px-content" className={s.body} data-width={width}>
          {children}
        </div>
      </div>
      {inspector}
    </div>
  );
}

/**
 * Inspector: details for the selected record without leaving the list.
 * Regular widths → an inline sticky column that slides in beside the content.
 * Narrower → a modal sheet from the trailing edge.
 */
export function Inspector({
  open,
  onClose,
  title,
  children,
  footer,
  id,
  resizeKey,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Changing id swaps content in place instead of closing/reopening. */
  id?: string;
  /** Makes the inline inspector resizable; the width is remembered under
   *  this key on this device. */
  resizeKey?: string;
}) {
  const inline = useIsRegular();
  const reduced = usePrefersReducedMotion();
  const [width, setWidth] = useInspectorWidth(resizeKey);

  // Escape closes the inline inspector too (the Sheet handles its own).
  useEffect(() => {
    if (!open || !inline) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        !document.querySelector(
          "#px-layers [role=dialog], #px-layers [role=menu]",
        )
      )
        onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, inline, onClose]);

  if (!inline) {
    return (
      <Sheet open={open} onClose={onClose} title={title} footer={footer}>
        {children}
      </Sheet>
    );
  }
  return (
    <Presence
      show={open}
      variant="slide"
      className={s.inspector}
      style={
        width
          ? ({ "--px-inspector-w": `${width}px` } as CSSProperties)
          : undefined
      }
      elementProps={{
        role: "complementary",
        "aria-label": typeof title === "string" ? title : "Details",
      }}
    >
      {resizeKey && <ResizeHandle width={width} onWidth={setWidth} />}
      <div className={s.inspectorHeader}>
        <h2 className={s.inspectorTitle}>{title}</h2>
        <IconButton icon="x" label="Close" onClick={onClose} />
      </div>
      <div className={s.inspectorBody} key={reduced ? undefined : id}>
        {children}
      </div>
      {footer && <div className={s.inspectorFooter}>{footer}</div>}
    </Presence>
  );
}

// ── Resizable inspector ────────────────────────────────────────────────────

const INSPECTOR_MIN = 320;
const INSPECTOR_DEFAULT = 400;
/** The page beside the inspector keeps at least this much room. */
const CONTENT_MIN = 520;
const maxInspector = () =>
  Math.max(
    INSPECTOR_MIN,
    Math.min(
      760,
      window.innerWidth -
        CONTENT_MIN -
        (document.querySelector("[data-px-sidebar]")?.getBoundingClientRect()
          .width ?? 0),
    ),
  );
const clampWidth = (w: number) =>
  Math.round(Math.min(maxInspector(), Math.max(INSPECTOR_MIN, w)));

function useInspectorWidth(key?: string) {
  const storageKey = key ? `px-inspector-w:${key}` : null;
  const [width, setWidthState] = useState<number | null>(() => {
    if (!storageKey) return null;
    try {
      const n = Number(localStorage.getItem(storageKey));
      return n ? clampWidth(n) : null;
    } catch {
      return null;
    }
  });
  const setWidth = useCallback(
    (w: number) => {
      const next = clampWidth(w);
      setWidthState(next);
      if (storageKey)
        try {
          localStorage.setItem(storageKey, String(next));
        } catch {
          /* private mode: keep it for this session only */
        }
    },
    [storageKey],
  );
  return [width, setWidth] as const;
}

/**
 * The inspector's leading edge: drag to resize (pointer events, so mouse,
 * trackpad and touch), or focus it and use ←/→ (Shift for bigger steps),
 * Home/End for the narrowest/widest. Double-click resets.
 */
function ResizeHandle({
  width,
  onWidth,
}: {
  width: number | null;
  onWidth: (w: number) => void;
}) {
  const current = width ?? INSPECTOR_DEFAULT;
  const start = useRef<{ x: number; w: number } | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, w: current };
    document.body.dataset.pxResizing = "";
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    // Dragging left widens: the handle is on the inspector's left edge.
    onWidth(start.current.w + (start.current.x - e.clientX));
  };
  const end = () => {
    start.current = null;
    delete document.body.dataset.pxResizing;
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16;
    if (e.key === "ArrowLeft") onWidth(current + step);
    else if (e.key === "ArrowRight") onWidth(current - step);
    else if (e.key === "Home") onWidth(INSPECTOR_MIN);
    else if (e.key === "End") onWidth(maxInspector());
    else return;
    e.preventDefault();
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize details panel"
      aria-valuenow={current}
      aria-valuemin={INSPECTOR_MIN}
      aria-valuemax={typeof window === "undefined" ? 760 : maxInspector()}
      tabIndex={0}
      className={s.resize}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onWidth(INSPECTOR_DEFAULT)}
    />
  );
}

export const layout = { split: s.split, rail: s.rail, stack: s.stack };
