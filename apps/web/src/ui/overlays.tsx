import { AnimatePresence, motion } from "framer-motion";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { ExitGuard, preset, scrimVariants, type Edge } from "@next/motion";
import {
  Portal,
  focusables,
  useDismissStack,
  useFocusTrap,
  useScrollLock,
} from "./layers";
import { Button, IconButton, type ButtonVariant } from "./controls";
import { Icon, type IconName } from "./Icon";
import s from "./overlays.module.css";

// ── Dialog ──────────────────────────────────────────────────────────────────

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Forms default to false so a stray click can't discard typed input. */
  dismissOnScrim?: boolean;
  initialFocus?: RefObject<HTMLElement | null>;
  /** Block Escape/scrim while a request is in flight. */
  busy?: boolean;
  icon?: { name: IconName; tone: "danger" | "accent" | "warning" };
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissOnScrim = false,
  initialFocus,
  busy,
  icon,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const close = () => {
    if (!busy) onClose();
  };
  useScrollLock(open);
  useDismissStack(open, close);
  useFocusTrap(panelRef, open, initialFocus);

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div className={s.layer} key="dialog">
            <motion.div
              className={s.scrim}
              variants={scrimVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              onClick={dismissOnScrim ? close : undefined}
              aria-hidden
            />
            <ExitGuard
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={description ? descId : undefined}
              tabIndex={-1}
              className={`${s.dialog} ${s[size]}`}
              variants={preset("dialog")}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <div className={s.dialogHeader}>
                {icon && (
                  <span
                    className={s.alertIcon}
                    style={{
                      background: `var(--px-${icon.tone}-soft)`,
                      color: `var(--px-${icon.tone})`,
                    }}
                  >
                    <Icon name={icon.name} />
                  </span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 id={titleId} className={s.dialogTitle}>
                    {title}
                  </h2>
                  {description && (
                    <p id={descId} className={s.dialogDescription}>
                      {description}
                    </p>
                  )}
                </div>
                <IconButton
                  icon="x"
                  label="Close"
                  onClick={close}
                  disabled={busy}
                />
              </div>
              {children && <div className={s.dialogBody}>{children}</div>}
              {footer && <div className={s.dialogFooter}>{footer}</div>}
            </ExitGuard>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

/** Destructive or consequential confirmation. Cancel is always offered. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  tone = "danger",
  busy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  tone?: "danger" | "accent";
  busy?: boolean;
  children?: ReactNode;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const variant: ButtonVariant = tone === "danger" ? "danger" : "primary";
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      busy={busy}
      initialFocus={cancelRef}
      icon={tone === "danger" ? { name: "alert", tone: "danger" } : undefined}
      footer={
        <>
          <Button ref={cancelRef} onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={variant} onClick={onConfirm} busy={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

// ── Sheet ───────────────────────────────────────────────────────────────────
// Edge-attached modal surface: mobile navigation (left), inspectors on narrow
// screens (right), and short tasks on phones (bottom).

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  edge = "right",
  width,
  label,
  back,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  edge?: Edge;
  width?: number;
  /** Accessible name when there's no visible title. */
  label?: string;
  /**
   * A detail view pushed over a list: a leading "‹ {back}" control returns
   * to it (closing the sheet), instead of the trailing close button.
   */
  back?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useScrollLock(open);
  useDismissStack(open, onClose);
  useFocusTrap(panelRef, open);

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div className={`${s.layer} ${s.layerSheet}`} key="sheet">
            <motion.div
              className={s.scrim}
              variants={scrimVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              onClick={onClose}
              aria-hidden
            />
            <ExitGuard
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              aria-label={title ? undefined : label}
              tabIndex={-1}
              data-edge={edge}
              className={s.sheet}
              style={
                width ? ({ "--_w": `${width}px` } as CSSProperties) : undefined
              }
              variants={preset("sheet", edge)}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {edge === "bottom" && <div className={s.grabber} aria-hidden />}
              {back ? (
                <div className={s.sheetHeader} data-back="">
                  <button
                    type="button"
                    className={s.sheetBack}
                    onClick={onClose}
                    aria-label={`Back to ${back}`}
                  >
                    <Icon name="chevronLeft" />
                    <span>{back}</span>
                  </button>
                  {title && (
                    <h2 id={titleId} className={s.sheetTitle}>
                      {title}
                    </h2>
                  )}
                </div>
              ) : (
                title && (
                  <div className={s.sheetHeader}>
                    <h2 id={titleId} className={s.sheetTitle}>
                      {title}
                    </h2>
                    <IconButton icon="x" label="Close" onClick={onClose} />
                  </div>
                )
              )}
              <div
                className={title ? s.sheetBody : undefined}
                style={title ? undefined : { flex: 1, overflowY: "auto" }}
              >
                {children}
              </div>
              {footer && <div className={s.sheetFooter}>{footer}</div>}
            </ExitGuard>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

// ── Popover ─────────────────────────────────────────────────────────────────

type Placement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

function usePosition(
  anchor: RefObject<HTMLElement | null>,
  open: boolean,
  placement: Placement,
) {
  const [pos, setPos] = useState<CSSProperties>({ top: -9999, left: -9999 });
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const a = anchor.current?.getBoundingClientRect();
      if (!a) return;
      const gap = 6;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const roomBelow = vh - a.bottom;
      const roomAbove = a.top;
      // Honour the requested side, flipping only when the other has more room.
      const wantTop = placement.startsWith("top")
        ? roomAbove >= 200 || roomAbove > roomBelow
        : roomBelow < 240 && roomAbove > roomBelow;
      const style: CSSProperties = {};
      if (wantTop) style.bottom = vh - a.top + gap;
      else style.top = a.bottom + gap;
      if (placement.endsWith("end")) style.right = Math.max(8, vw - a.right);
      else style.left = Math.min(Math.max(8, a.left), vw - 208);
      style.transformOrigin = `${placement.endsWith("end") ? "right" : "left"} ${wantTop ? "bottom" : "top"}`;
      setPos(style);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchor, placement]);
  return pos;
}

export function Popover({
  open,
  onClose,
  anchorRef,
  children,
  placement = "bottom-start",
  label,
  role = "dialog",
  className,
  width,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  placement?: Placement;
  label: string;
  role?: "dialog" | "menu" | "presentation";
  className?: string;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = usePosition(anchorRef, open, placement);
  useDismissStack(open, onClose);

  // Outside press closes; the anchor toggles itself.
  useLayoutEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, onClose, anchorRef]);

  // Move focus in, and give it back to the anchor on close.
  useLayoutEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      const root = ref.current;
      if (!root) return;
      (
        root.querySelector<HTMLElement>("[data-autofocus]") ||
        focusables(root)[0] ||
        root
      ).focus({
        preventScroll: true,
      });
    });
    const anchor = anchorRef.current;
    return () => {
      cancelAnimationFrame(raf);
      if (
        anchor &&
        document.contains(anchor) &&
        ref.current?.contains(document.activeElement)
      ) {
        anchor.focus({ preventScroll: true });
      }
    };
  }, [open, anchorRef]);

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <ExitGuard
            key="popover"
            ref={ref}
            role={role}
            aria-label={label}
            tabIndex={-1}
            className={`${s.popover} ${className ?? ""}`}
            style={{ ...pos, width }}
            variants={preset("pop")}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {children}
          </ExitGuard>
        )}
      </AnimatePresence>
    </Portal>
  );
}

// ── Menu ────────────────────────────────────────────────────────────────────

export type MenuEntry =
  | {
      label: string;
      icon?: IconName;
      meta?: string;
      tone?: "danger";
      onSelect: () => void;
      disabled?: boolean;
    }
  | { separator: true }
  | { heading: string };

export function Menu({
  open,
  onClose,
  anchorRef,
  items,
  label,
  placement = "bottom-end",
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  items: MenuEntry[];
  label: string;
  placement?: Placement;
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const list = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([disabled])',
      ),
    );
    const i = list.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? list.length - 1
          : (i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
    list[next]?.focus();
  };
  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      label={label}
      role="menu"
      placement={placement}
    >
      <div className={s.menu} onKeyDown={onKeyDown}>
        {items.map((item, i) =>
          "separator" in item ? (
            <div key={i} className={s.menuSeparator} role="separator" />
          ) : "heading" in item ? (
            <div key={i} className={s.menuHeading} role="presentation">
              {item.heading}
            </div>
          ) : (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={s.menuItem}
              data-tone={item.tone}
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.onSelect();
              }}
            >
              {item.icon && <Icon name={item.icon} />}
              {item.label}
              {item.meta && <span className={s.menuMeta}>{item.meta}</span>}
            </button>
          ),
        )}
      </div>
    </Popover>
  );
}
