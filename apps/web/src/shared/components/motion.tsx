/**
 * Shared motion primitives — built on framer-motion.
 *
 * Import these instead of raw `motion.*` so animation values are
 * consistent across the entire app and can be tuned in one place.
 */
import React from "react";
import {
  motion,
  AnimatePresence,
  type Variants,
  type Transition,
} from "framer-motion";

// ─── Shared timing ─────────────────────────────────────────────────────────

/** Default spring used for most mount animations */
export const spring: Transition = {
  type: "spring",
  stiffness: 340,
  damping: 28,
  mass: 0.8,
};

/** Smooth ease for opacity/scale fades */
export const ease: Transition = {
  duration: 0.22,
  ease: [0.4, 0, 0.2, 1],
};

// ─── Variant presets ────────────────────────────────────────────────────────

/** Fade + slide up — used for pages and primary content blocks */
export const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: spring },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18, ease: "easeIn" } },
};

/** Fade only — for overlays, drawers, subtle reveals */
export const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: ease },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

/** Scale + fade — for chips, badges, action buttons popping in */
export const scaleVariants: Variants = {
  hidden: { opacity: 0, scale: 0.88 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", stiffness: 380, damping: 22 },
  },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.14 } },
};

/** Stagger container — apply to the wrapping list element */
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.055, delayChildren: 0.05 },
  },
};

/** Individual staggered child — pair with staggerContainer */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 320, damping: 26 },
  },
};

// ─── Wrapper components ─────────────────────────────────────────────────────

/**
 * Wraps any content in a fade-up reveal on mount.
 * Drop-in replacement for a plain `<div>`.
 *
 * @example
 * <FadeUp>
 *   <MyCard />
 * </FadeUp>
 */
export const FadeUp = React.forwardRef<
  HTMLDivElement,
  Omit<
    React.HTMLAttributes<HTMLDivElement>,
    // framer-motion redefines these with its own (PanInfo-based) signatures,
    // which conflict with the native DOM event handler types.
    | "onDrag"
    | "onDragStart"
    | "onDragEnd"
    | "onAnimationStart"
    | "onAnimationEnd"
  > & {
    delay?: number;
    duration?: number;
  }
>(function FadeUp({ children, delay = 0, duration, style, ...rest }, ref) {
  const transition: Transition = duration
    ? { ...spring, duration }
    : { ...spring, delay };
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={fadeUpVariants}
      transition={delay ? { ...spring, delay } : transition}
      style={{ display: "contents", ...style }}
      {...rest}
    >
      {children}
    </motion.div>
  );
});

/**
 * Wraps a list so children stagger-in on mount.
 * Pair children with <AnimatedItem>.
 *
 * @example
 * <AnimatedList>
 *   {items.map(i => <AnimatedItem key={i.id}><Row item={i} /></AnimatedItem>)}
 * </AnimatedList>
 */
export function AnimatedList({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

/**
 * A single staggered list item. Must be a direct child of <AnimatedList>.
 */
export function AnimatedItem({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div variants={staggerItem} className={className} style={style}>
      {children}
    </motion.div>
  );
}

/**
 * AnimatePresence-wrapped page transition.
 * Wrap the <Routes> block and key it on location.pathname.
 *
 * @example
 * <PageTransition locationKey={location.pathname}>
 *   <Routes> … </Routes>
 * </PageTransition>
 */
export function PageTransition({
  locationKey,
  children,
}: {
  locationKey: string;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={locationKey}
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={fadeUpVariants}
        style={{ height: "100%" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// Re-export framer-motion primitives so feature files import from one place
export { motion, AnimatePresence };
