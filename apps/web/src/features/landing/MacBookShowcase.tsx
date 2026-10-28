import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useMediaQuery } from "@next/lib/hooks";
import s from "./macbook.module.css";

export type ShowcaseScene = {
  id: string;
  /** Short name on the selector. */
  label: string;
  title: string;
  body: string;
  /** A real Praesto screen, 16:10 (captured at 1440 × 900). */
  src: string;
  alt: string;
};

const EASE = [0.2, 0, 0, 1] as const;

/**
 * Real Praesto screens inside a MacBook frame. The frame never moves; only
 * the screen changes. Every screenshot stays mounted and stacked, so a
 * change is a crossfade the browser can retarget mid-flight — rapid
 * selection can't leave two screens settled on top of each other, and
 * upcoming images are already decoded when their turn comes.
 *
 * Autoplay is gentle and yields: it pauses while the pointer or focus is on
 * the showcase, while it's off-screen and while the tab is hidden; choosing a
 * scene stops it for good; Pause/Play controls it; Reduce Motion turns it off.
 */
export function MacBookShowcase({
  scenes,
  interval = 7000,
  label = "Product tour",
  priority = false,
}: {
  scenes: ShowcaseScene[];
  interval?: number;
  label?: string;
  /** Load the first screen eagerly (above the fold). */
  priority?: boolean;
}) {
  const uid = useId();
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [index, setIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(!reduced);
  const [held, setHeld] = useState(false);
  const [visible, setVisible] = useState(true);
  // The other screens sit stacked in view behind the first, so "lazy" doesn't
  // defer them; they're added once the first has loaded, leaving it the
  // bandwidth (it's the page's largest paint).
  const [warm, setWarm] = useState(false);
  const [hidden, setHidden] = useState(
    typeof document !== "undefined" && document.hidden,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const elapsed = useRef(0);

  useEffect(() => {
    if (reduced) setAutoplay(false);
  }, [reduced]);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), {
      threshold: 0.25,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // One clock drives the progress fill and the advance together.
  const running = autoplay && !held && !hidden && visible;
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current += now - last;
      last = now;
      if (elapsed.current >= interval) {
        elapsed.current = 0;
        setIndex((i) => (i + 1) % scenes.length);
      }
      fillRef.current?.style.setProperty(
        "--p",
        String(Math.min(1, elapsed.current / interval)),
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, index, interval, scenes.length]);

  // On narrow screens the selector scrolls; keep the active tab in view
  // without moving the page itself.
  useEffect(() => {
    const tab = tabRefs.current[index];
    const list = tab?.parentElement;
    if (!tab || !list || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo({
      left: tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2,
      behavior: reduced ? "auto" : "smooth",
    });
  }, [index, reduced]);

  // A visitor's choice is final: autoplay stops so it isn't overridden.
  const select = useCallback(
    (next: number, focus = false) => {
      const i = (next + scenes.length) % scenes.length;
      elapsed.current = 0;
      setAutoplay(false);
      setIndex(i);
      if (focus) tabRefs.current[i]?.focus();
    },
    [scenes.length],
  );

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: scenes.length - 1,
    };
    if (!(e.key in keys)) return;
    e.preventDefault();
    select(keys[e.key], true);
  };

  const toggle = () => {
    if (!autoplay) elapsed.current = 0;
    setAutoplay((a) => !a);
  };

  const scene = scenes[index];
  const tabId = (i: number) => `${uid}-tab-${i}`;
  const panelId = `${uid}-panel`;

  return (
    <div
      ref={rootRef}
      className={s.showcase}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setHeld(false);
      }}
    >
      <div className={s.device}>
        <div className={s.lid}>
          <span className={s.camera} aria-hidden="true" />
          <div
            id={panelId}
            className={s.screen}
            role="tabpanel"
            aria-labelledby={tabId(index)}
          >
            {scenes.map((sc, i) =>
              !warm && i !== index ? null : (
                <img
                  key={sc.id}
                  className={s.shot}
                  src={sc.src}
                  alt={i === index ? sc.alt : ""}
                  aria-hidden={i === index ? undefined : true}
                  data-active={i === index || undefined}
                  width={1440}
                  height={900}
                  decoding="async"
                  loading={priority && i === 0 ? "eager" : "lazy"}
                  {...(priority && i === 0
                    ? { fetchPriority: "high" as const }
                    : {})}
                  draggable={false}
                  onLoad={warm ? undefined : () => setWarm(true)}
                />
              ),
            )}
          </div>
        </div>
        <div className={s.base} aria-hidden="true" />
      </div>

      <div className={s.controls}>
        <div
          className={s.tabs}
          role="tablist"
          aria-label="Choose a screen"
          onKeyDown={onTabKey}
        >
          {scenes.map((sc, i) => (
            <button
              key={sc.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={tabId(i)}
              type="button"
              role="tab"
              className={s.tab}
              aria-selected={i === index}
              aria-controls={panelId}
              tabIndex={i === index ? 0 : -1}
              onClick={() => select(i)}
            >
              {sc.label}
              {i === index && autoplay && (
                <span ref={fillRef} className={s.fill} aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
        {!reduced && (
          <button
            type="button"
            className={s.toggle}
            aria-label={autoplay ? "Pause tour" : "Play tour"}
            onClick={toggle}
          >
            {autoplay ? <PauseGlyph /> : <PlayGlyph />}
          </button>
        )}
      </div>

      <div className={s.caption} aria-live={autoplay ? "off" : "polite"}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={scene.id}
            initial="enter"
            animate="show"
            exit="leave"
            variants={captionVariants}
          >
            <motion.p className={s.title} variants={line}>
              {scene.title}
            </motion.p>
            <motion.p className={s.body} variants={line}>
              {scene.body}
            </motion.p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

const captionVariants: Variants = {
  enter: {},
  show: { transition: { staggerChildren: 0.07 } },
  leave: { opacity: 0, y: -4, transition: { duration: 0.16, ease: "easeIn" } },
};
const line: Variants = {
  enter: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

function PauseGlyph() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
      <rect x="2.5" y="2" width="2.4" height="8" rx="0.8" fill="currentColor" />
      <rect x="7.1" y="2" width="2.4" height="8" rx="0.8" fill="currentColor" />
    </svg>
  );
}
function PlayGlyph() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
      <path
        d="M3.5 2.2v7.6a.5.5 0 0 0 .76.43l6.1-3.8a.5.5 0 0 0 0-.86l-6.1-3.8a.5.5 0 0 0-.76.43Z"
        fill="currentColor"
      />
    </svg>
  );
}
