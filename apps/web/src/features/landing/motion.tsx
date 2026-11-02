import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  type MotionValue,
  type Variants,
} from "framer-motion";

/**
 * The landing page's motion vocabulary. The app's own tokens (@next/motion)
 * are tuned for UI feedback (90–320 ms); a marketing page tells a story at a
 * slower pace, so its values live here, once, and every section uses them.
 */
export const ease = {
  /** Entrances: a long, soft settle. */
  out: [0.22, 1, 0.36, 1],
  /** State changes inside a section (tabs, prices, statuses). */
  state: [0.4, 0, 0.2, 1],
} as const satisfies Record<string, [number, number, number, number]>;

export const dur = { text: 0.7, media: 0.9, line: 1, state: 0.35 } as const;
export const travel = { text: 24, media: 48, side: 32 } as const;
export const stagger = { lines: 0.12, items: 0.06, columns: 0.1 } as const;

/**
 * Pointer-driven depth. Tilt is in degrees at the edge of the element;
 * `spring` is what makes it feel weighted rather than glued to the cursor.
 */
export const depth = {
  tiltX: 5,
  tiltY: 7,
  spring: { stiffness: 120, damping: 20, mass: 0.6 },
} as const;

const VIEW_MARGIN = "0px 0px -12% 0px";

// useLayoutEffect warns during the prerender (renderToString).
const useIsoLayoutEffect =
  typeof document === "undefined" ? useEffect : useLayoutEffect;

/**
 * Whether an element should play its entrance, and when.
 *
 * Only content that starts below the fold is hidden: it can't be seen yet,
 * so hiding it before the first paint is invisible. Anything already on
 * screen — the prerendered page a visitor lands on, or a section they had
 * scrolled to — stays put rather than vanishing and fading back in. With
 * Reduce Motion nothing is ever hidden.
 */
export function useEntrance(ref: RefObject<Element | null>) {
  const reduce = useReducedMotion();
  const [armed, setArmed] = useState(false);
  const inView = useInView(ref, { once: true, margin: VIEW_MARGIN });
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (reduce || !el) return;
    if (el.getBoundingClientRect().top > window.innerHeight) setArmed(true);
  }, []);
  return armed && !inView ? "hidden" : "shown";
}

/** `group` doesn't move itself; it only orchestrates its `RevealItem`s. */
export type RevealKind = "rise" | "media" | "left" | "right" | "fade" | "group";

const HIDDEN: Record<RevealKind, Record<string, number>> = {
  rise: { opacity: 0, y: travel.text },
  media: { opacity: 0, y: travel.media, scale: 0.97 },
  left: { opacity: 0, x: -travel.side },
  right: { opacity: 0, x: travel.side },
  fade: { opacity: 0 },
  group: {},
};

/** Variants for one revealing element; `hidden` is instant so arming never shows. */
export function revealVariants(
  kind: RevealKind = "rise",
  delay = 0,
  childStagger = 0,
): Variants {
  const media = kind === "media";
  // An explicit delay (even 0) would override a parent's stagger, so it's
  // only set when there is one.
  return {
    hidden: { ...HIDDEN[kind], transition: { duration: 0 } },
    shown: {
      ...(kind === "group" ? {} : { opacity: 1, x: 0, y: 0, scale: 1 }),
      transition: {
        duration: media ? dur.media : dur.text,
        ease: ease.out,
        ...(delay ? { delay } : {}),
        ...(childStagger
          ? { staggerChildren: childStagger, delayChildren: delay }
          : {}),
      },
    },
  };
}

/** One block that rises (or slides, or settles) into place once. */
export function Reveal({
  children,
  className,
  delay = 0,
  kind = "rise",
  stagger: childStagger = 0,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  kind?: RevealKind;
  /** Stagger children that are `RevealItem`s. */
  stagger?: number;
  as?: "div" | "ol" | "ul";
}) {
  const ref = useRef<HTMLElement>(null);
  const state = useEntrance(ref);
  const Tag = motion[as];
  return (
    <Tag
      ref={ref as never}
      className={className}
      initial={false}
      animate={state}
      variants={revealVariants(kind, delay, childStagger)}
    >
      {children}
    </Tag>
  );
}

/** A child of a staggered `Reveal`; follows its parent's state. */
export function RevealItem({
  children,
  className,
  kind = "rise",
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  kind?: RevealKind;
  as?: "div" | "li";
}) {
  const Tag = motion[as];
  return (
    <Tag className={className} variants={revealVariants(kind)}>
      {children}
    </Tag>
  );
}

/**
 * A headline whose lines rise out of a slot, one after another. Each line
 * is a block; the mask is padded so descenders and the tight leading never
 * clip. `play` false renders the settled headline.
 */
export function MaskedLines({
  lines,
  play,
  delay = 0,
  lineClassName,
  innerClassName,
}: {
  lines: string[];
  /** true plays on mount; false is settled; a state follows `useEntrance`. */
  play: boolean | "hidden" | "shown";
  delay?: number;
  lineClassName: string;
  innerClassName: string;
}) {
  const state = play === true ? "shown" : play === false ? "still" : play;
  return (
    <>
      {lines.map((line, i) => (
        <span key={line} className={lineClassName}>
          <motion.span
            className={innerClassName}
            initial={state === "shown" ? { y: "110%" } : false}
            animate={state === "hidden" ? { y: "110%" } : { y: 0 }}
            transition={
              state === "hidden"
                ? { duration: 0 }
                : {
                    duration: dur.line,
                    ease: ease.out,
                    delay: delay + i * stagger.lines,
                  }
            }
          >
            {line}
          </motion.span>{" "}
        </span>
      ))}
    </>
  );
}

const finePointer = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;

/**
 * Pointer position over `ref`, normalised to -0.5…0.5 and sprung. Only a fine
 * pointer drives it (touch has no hover to follow) and Reduce Motion keeps it
 * at rest. Values are motion values, so moving the pointer never re-renders.
 */
export function usePointerDepth(ref: RefObject<HTMLElement | null>): {
  x: MotionValue<number>;
  y: MotionValue<number>;
} {
  const reduce = useReducedMotion();
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, depth.spring);
  const y = useSpring(rawY, depth.spring);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || !finePointer()) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      rawX.set((e.clientX - r.left) / r.width - 0.5);
      rawY.set((e.clientY - r.top) / r.height - 0.5);
    };
    const leave = () => {
      rawX.set(0);
      rawY.set(0);
    };
    el.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [ref, reduce, rawX, rawY]);
  return { x, y };
}

/**
 * Marks `ref` with data-idle while it's off screen, so its CSS ambient loops
 * (`[data-idle] … { animation-play-state: paused }`) cost nothing out of view.
 */
export function useAmbient(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      el.toggleAttribute("data-idle", !e.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
}

/**
 * A soft light that trails the pointer across `ref` (writes --sx/--sy, in
 * px, lerped at 0.12 per frame). Fine pointers only; the loop stops once it
 * has caught up, so an idle pointer costs nothing.
 */
export function useSpotlight(ref: RefObject<HTMLElement | null>) {
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || !finePointer()) return;
    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    const loop = () => {
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      el.style.setProperty("--sx", `${x.toFixed(1)}px`);
      el.style.setProperty("--sy", `${y.toFixed(1)}px`);
      raf =
        Math.abs(tx - x) > 0.5 || Math.abs(ty - y) > 0.5
          ? requestAnimationFrame(loop)
          : 0;
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      tx = e.clientX - r.left;
      ty = e.clientY - r.top;
      if (!x && !y) {
        x = tx;
        y = ty;
      }
      el.setAttribute("data-lit", "");
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const leave = () => el.removeAttribute("data-lit");
    el.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [ref, reduce]);
}
