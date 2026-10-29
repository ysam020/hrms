import { useEffect, useRef, useState, type ReactNode } from "react";
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
}: {
  title: ReactNode;
  subtitle?: ReactNode;
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
          <div className={s.titles}>
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
        {tabs && <div className={s.tabsRow}>{tabs}</div>}
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
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Changing id swaps content in place instead of closing/reopening. */
  id?: string;
}) {
  const inline = useIsRegular();
  const reduced = usePrefersReducedMotion();

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
      elementProps={{
        role: "complementary",
        "aria-label": typeof title === "string" ? title : "Details",
      }}
    >
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

export const layout = { split: s.split, rail: s.rail, stack: s.stack };
