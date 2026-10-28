import {
  AnimatePresence,
  motion,
  useIsPresent,
  type HTMLMotionProps,
} from "framer-motion";
import {
  forwardRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { duration, ease, stagger } from "./tokens";
import { preset, type Edge, type PresetName } from "./presets";

// ─────────────────────────────────────────────────────────────────────────────
// Presence-aware conditional rendering.
//
//   {isOpen && <FilterPanel />}           ← unmounts instantly, no exit
//   <Presence show={isOpen}><FilterPanel/></Presence>   ← animates both ways
//
// React state stays the source of truth: `show` decides whether the subtree
// should exist. AnimatePresence keeps it mounted only while its exit runs and
// then removes it. Re-showing during an exit reverses the same element instead
// of mounting a second copy, so rapid toggling never stacks duplicates.
//
// While an element is leaving it is made `inert` and ignores the pointer, so
// a half-faded panel can't take focus or swallow a click.
// ─────────────────────────────────────────────────────────────────────────────

/** Spread onto a DOM element to make it inert (React 18 passes it through). */
export function inertProps(isInert: boolean) {
  return isInert
    ? ({ inert: "", "aria-hidden": true } as unknown as Record<string, never>)
    : {};
}

type ExitGuardProps = HTMLMotionProps<"div"> & { children: ReactNode };

/**
 * A motion.div that turns inert while AnimatePresence is removing it.
 * Forwards its ref: overlays rely on it for focus trapping and positioning.
 */
export const ExitGuard = forwardRef<HTMLDivElement, ExitGuardProps>(
  function ExitGuard({ children, style, ...rest }, ref) {
    const isPresent = useIsPresent();
    return (
      <motion.div
        ref={ref}
        {...rest}
        {...inertProps(!isPresent)}
        style={{ ...style, pointerEvents: isPresent ? undefined : "none" }}
      >
        {children}
      </motion.div>
    );
  },
);

export interface PresenceProps {
  show: boolean;
  children: ReactNode;
  /** Which entrance/exit pair to use. */
  variant?: PresetName;
  /** For `sheet`: the edge the surface is attached to. */
  edge?: Edge;
  /** Seconds to wait before entering (exits are never delayed). */
  delay?: number;
  /** Skip the entrance when the component first mounts already shown. */
  skipInitial?: boolean;
  className?: string;
  style?: CSSProperties;
  onExitComplete?: () => void;
  /** Forwarded to the animated element (roles, ids, aria-*). */
  elementProps?: Omit<HTMLMotionProps<"div">, "variants" | "children">;
}

export function Presence({
  show,
  children,
  variant = "rise",
  edge,
  delay = 0,
  skipInitial = false,
  className,
  style,
  onExitComplete,
  elementProps,
}: PresenceProps) {
  const variants = preset(variant, edge);
  return (
    <AnimatePresence initial={!skipInitial} onExitComplete={onExitComplete}>
      {show && (
        <ExitGuard
          key="presence"
          {...elementProps}
          className={className}
          style={style}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={delay ? { delay } : undefined}
        >
          {children}
        </ExitGuard>
      )}
    </AnimatePresence>
  );
}

// ── Collapse ────────────────────────────────────────────────────────────────
// Height-animated disclosure for nav groups, advanced settings, revealed form
// fields, and expandable rows. Content is unmounted when closed, so hidden
// fields can't be tabbed into and don't submit stale values.

export interface CollapseProps {
  open: boolean;
  children: ReactNode;
  id?: string;
  className?: string;
  skipInitial?: boolean;
}

export function Collapse({
  open,
  children,
  id,
  className,
  skipInitial = true,
}: CollapseProps) {
  // Clip only while moving, so focus rings inside aren't cut off at rest.
  const [settled, setSettled] = useState(open);
  return (
    <AnimatePresence initial={!skipInitial}>
      {open && (
        <ExitGuard
          key="collapse"
          id={id}
          className={className}
          initial={{ height: 0, opacity: 0 }}
          animate={{
            height: "auto",
            opacity: 1,
            transition: {
              height: { duration: duration.base, ease: ease.standard },
              opacity: { duration: duration.fast, delay: 0.04 },
            },
          }}
          exit={{
            height: 0,
            opacity: 0,
            transition: {
              height: { duration: duration.fast, ease: ease.exit },
              opacity: { duration: duration.instant },
            },
          }}
          onAnimationStart={() => setSettled(false)}
          onAnimationComplete={() => setSettled(true)}
          style={{ overflow: settled ? "visible" : "hidden" }}
        >
          {children}
        </ExitGuard>
      )}
    </AnimatePresence>
  );
}

// ── Swap ────────────────────────────────────────────────────────────────────
// Keyed content switch: tab panels, loading → loaded, step → step. The old
// content leaves quickly before the new one enters, so two panels never
// overlap or fight for layout.

export interface SwapProps {
  id: string | number;
  children: ReactNode;
  variant?: Extract<PresetName, "fade" | "rise">;
  className?: string;
  elementProps?: Omit<HTMLMotionProps<"div">, "variants" | "children">;
}

export function Swap({
  id,
  children,
  variant = "fade",
  className,
  elementProps,
}: SwapProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <ExitGuard
        key={id}
        {...elementProps}
        className={className}
        variants={preset(variant)}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {children}
      </ExitGuard>
    </AnimatePresence>
  );
}

// ── Stagger ─────────────────────────────────────────────────────────────────
// Lists that appear together, and rows that leave individually (approve a
// request and the row folds away while its neighbours close the gap).
// Only the first few rows stagger; the rest arrive with the last one so long
// lists never feel slow.

export function StaggerList({
  children,
  as = "ul",
  className,
  ...rest
}: {
  children: ReactNode;
  as?: "ul" | "ol" | "div";
  className?: string;
} & Record<string, unknown>) {
  const Tag = as;
  return (
    <Tag className={className} {...rest}>
      <AnimatePresence initial>{children}</AnimatePresence>
    </Tag>
  );
}

export function StaggerItem({
  index = 0,
  children,
  as = "li",
  className,
  ...rest
}: {
  index?: number;
  children: ReactNode;
  as?: "li" | "div";
  className?: string;
} & Omit<HTMLMotionProps<"li">, "children">) {
  const isPresent = useIsPresent();
  const Comp = as === "li" ? motion.li : motion.div;
  const delay = Math.min(index, stagger.maxItems) * stagger.step;
  return (
    <Comp
      layout="position"
      className={className}
      initial={{ opacity: 0, y: 6 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: { duration: duration.base, ease: ease.enter, delay },
      }}
      exit={{
        opacity: 0,
        height: 0,
        transition: { duration: duration.fast, ease: ease.exit },
      }}
      {...(rest as object)}
      {...inertProps(!isPresent)}
      style={{
        ...(rest.style as object),
        pointerEvents: isPresent ? undefined : "none",
      }}
    >
      {children}
    </Comp>
  );
}
