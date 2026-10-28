import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Icon, type IconName } from "@next/ui";
import { BrandLockup, BrandMark } from "./BrandMark";
import s from "./showcase.module.css";

// Sign-in brand panel: a short product story told one scene at a time.
// Everything here is illustrative (names, dates and amounts are placeholders
// or masked), makes no requests, and is independent of the sign-in form.
// Text is real and readable; the visuals are decorative (aria-hidden).

const INTERVAL = 5000;
const EASE = [0.16, 1, 0.3, 1] as const;

interface Scene {
  id: string;
  label: string;
  title: string;
  body: string;
  Visual: () => JSX.Element;
}

const SCENES: Scene[] = [
  {
    id: "workforce",
    label: "Workforce",
    title: "Your people. Your organisation. One workspace.",
    body: "Bring everyday workforce operations together in one connected experience.",
    Visual: Workforce,
  },
  {
    id: "attendance",
    label: "Attendance",
    title: "Every workday, in sync.",
    body: "Attendance, leave requests and approvals come together in one clear workflow.",
    Visual: Attendance,
  },
  {
    id: "hiring",
    label: "Hiring",
    title: "From first conversation to first day.",
    body: "Keep openings, candidates and interview rounds connected.",
    Visual: Hiring,
  },
  {
    id: "organisation",
    label: "Organisation",
    title: "Clarity for every team.",
    body: "Teams, reporting lines and payroll runs, organised in one place.",
    Visual: Organisation,
  },
  {
    id: "together",
    label: "Together",
    title: "Everything connected. Nothing in the way.",
    body: "Move between the workflows your organisation relies on, in one coherent experience.",
    Visual: Together,
  },
];

// ── Carousel ────────────────────────────────────────────────────────────────

export function Showcase() {
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState(
    typeof document !== "undefined" && document.hidden,
  );
  const fillRef = useRef<HTMLSpanElement>(null);
  const elapsed = useRef(0);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // One clock drives both the progress fill and the advance, so they can't
  // drift apart. The tour always plays; it only rests while the tab is hidden.
  useEffect(() => {
    if (hidden) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current += now - last;
      last = now;
      if (elapsed.current >= INTERVAL) {
        elapsed.current = 0;
        setIndex((i) => (i + 1) % SCENES.length);
      }
      fillRef.current?.style.setProperty(
        "--p",
        String(Math.min(1, elapsed.current / INTERVAL)),
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hidden, index]);

  // Jumping to a scene restarts its full interval; the tour keeps playing.
  const go = useCallback((next: number) => {
    elapsed.current = 0;
    setIndex((next + SCENES.length) % SCENES.length);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(index - 1);
    }
  };

  const scene = SCENES[index];
  const { Visual } = scene;

  return (
    <aside
      className={s.panel}
      aria-roledescription="carousel"
      aria-label="Praesto product tour"
    >
      <div className={s.brand}>
        <BrandLockup size={28} inverse />
      </div>

      {/* Text: the old copy leaves first, then the headline rises and the
          description follows a beat later. Not live: it changes on its own. */}
      <div
        className={s.copy}
        aria-live="off"
        aria-atomic="true"
        role="group"
        aria-roledescription="slide"
        aria-label={`${index + 1} of ${SCENES.length}: ${scene.label}`}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={scene.id}
            initial="enter"
            animate="show"
            exit="leave"
            variants={copyVariants}
          >
            <motion.h2 className={s.title} variants={line}>
              {scene.title}
            </motion.h2>
            <motion.p className={s.body} variants={line}>
              {scene.body}
            </motion.p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className={s.stage} aria-hidden="true">
        <AnimatePresence initial={false}>
          <motion.div
            key={scene.id}
            className={s.visual}
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              transition: { duration: 0.55, ease: EASE, delay: 0.12 },
            }}
            exit={{
              opacity: 0,
              scale: 0.985,
              transition: { duration: 0.25, ease: "easeIn" },
            }}
          >
            <Visual />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className={s.controls} onKeyDown={onKeyDown}>
        <div className={s.steps} role="group" aria-label="Choose a scene">
          {SCENES.map((sc, i) => (
            <button
              key={sc.id}
              type="button"
              className={s.step}
              aria-current={i === index ? "step" : undefined}
              aria-label={`Scene ${i + 1} of ${SCENES.length}: ${sc.label}`}
              onClick={() => go(i)}
            >
              <span className={s.track}>
                <span
                  ref={i === index ? fillRef : undefined}
                  className={s.fill}
                  data-state={
                    i < index ? "done" : i === index ? "playing" : "todo"
                  }
                />
              </span>
              <span className={s.stepLabel}>{sc.label}</span>
            </button>
          ))}
        </div>
        <div className={s.buttons}>
          <button
            type="button"
            className={s.round}
            aria-label="Previous scene"
            onClick={() => go(index - 1)}
          >
            <Icon name="chevronLeft" size={14} />
          </button>
          <button
            type="button"
            className={s.round}
            aria-label="Next scene"
            onClick={() => go(index + 1)}
          >
            <Icon name="chevronRight" size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}

const copyVariants: Variants = {
  enter: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.02 } },
  leave: { opacity: 0, y: -6, transition: { duration: 0.18, ease: "easeIn" } },
};
const line: Variants = {
  enter: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

// ── Shared pieces ───────────────────────────────────────────────────────────

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: EASE, delay },
  },
});

/** Re-renders once after `ms` (timers are cleared if the scene leaves). */
function useAfter(ms: number) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return done;
}

function Chip({ icon, hue }: { icon: IconName; hue: string }) {
  return (
    <span className={s.chip} style={{ ["--hue" as string]: hue }}>
      <Icon name={icon} size={15} />
    </span>
  );
}

function Initials({ text, hue }: { text: string; hue: string }) {
  return (
    <span className={s.initials} style={{ ["--hue" as string]: hue }}>
      {text}
    </span>
  );
}

// ── Scene 1: the connected workforce ────────────────────────────────────────

const ORBIT: {
  icon: IconName;
  title: string;
  hue: string;
  x: number;
  y: number;
}[] = [
  { icon: "people", title: "People", hue: "var(--teal)", x: 8, y: 10 },
  { icon: "clock", title: "Attendance", hue: "var(--green)", x: 64, y: 6 },
  { icon: "leave", title: "Leave", hue: "var(--orange)", x: 2, y: 64 },
  { icon: "briefcase", title: "Recruitment", hue: "var(--red)", x: 66, y: 66 },
];

function Workforce() {
  return (
    <div className={s.orbit}>
      <svg className={s.links} viewBox="0 0 100 100" preserveAspectRatio="none">
        {ORBIT.map((m, i) => (
          <motion.line
            key={m.title}
            x1="50"
            y1="50"
            x2={m.x + 16}
            y2={m.y + 7.5}
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              transition: { duration: 0.6, ease: EASE, delay: 0.4 + i * 0.08 },
            }}
          />
        ))}
      </svg>
      <motion.div
        className={s.hub}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{
          opacity: 1,
          scale: 1,
          transition: { duration: 0.6, ease: EASE, delay: 0.15 },
        }}
      >
        <BrandMark size={36} />
      </motion.div>
      {ORBIT.map((m, i) => (
        <motion.div
          key={m.title}
          className={s.orbitTile}
          style={{ left: `${m.x}%`, top: `${m.y}%` }}
          {...rise(0.25 + i * 0.09)}
        >
          <Chip icon={m.icon} hue={m.hue} />
          <span className={s.strong}>{m.title}</span>
        </motion.div>
      ))}
    </div>
  );
}

// ── Scene 2: attendance and leave ───────────────────────────────────────────

// A placeholder month: P present, L leave, W week-off, T today, F future.
const MONTH = "WPPPPPWWPPLPPWWPPPPTFFFFFWWFFFF".split("");
const DAY_HUE: Record<string, string> = {
  P: "var(--teal)",
  L: "var(--orange)",
  W: "rgb(255 255 255 / 0.1)",
  T: "var(--teal)",
  F: "rgb(255 255 255 / 0.04)",
};

function Attendance() {
  const approved = useAfter(1700);
  return (
    <div className={s.stack}>
      <motion.div className={s.card} {...rise(0.15)}>
        <div className={s.cardHead}>
          <span className={s.strong}>This month</span>
          <span className={s.muted}>Present · Leave · Week off</span>
        </div>
        <div className={s.ribbon}>
          {MONTH.map((d, i) => (
            <motion.span
              key={i}
              data-today={d === "T" || undefined}
              style={{ background: DAY_HUE[d] }}
              initial={{ opacity: 0, scaleY: 0.4 }}
              animate={{
                opacity: 1,
                scaleY: 1,
                transition: {
                  duration: 0.35,
                  ease: EASE,
                  delay: 0.3 + i * 0.018,
                },
              }}
            />
          ))}
        </div>
      </motion.div>

      <div className={s.row}>
        <motion.div className={s.card} {...rise(0.45)}>
          <div className={s.cardHead}>
            <Chip icon="clock" hue="var(--green)" />
            <span className={s.strong}>Today</span>
          </div>
          <div className={s.timeline}>
            <span className={s.muted}>In 09:12</span>
            <span className={s.bar}>
              <motion.span
                initial={{ scaleX: 0 }}
                animate={{
                  scaleX: 0.62,
                  transition: { duration: 1.1, ease: EASE, delay: 0.7 },
                }}
              />
            </span>
            <span className={s.muted}>18:00</span>
          </div>
          <span
            className={s.badge}
            style={{ ["--hue" as string]: "var(--green)" }}
          >
            <span className={s.dot} /> Working
          </span>
        </motion.div>

        <motion.div className={s.card} {...rise(0.6)}>
          <div className={s.cardHead}>
            <Initials text="RS" hue="var(--orange)" />
            <span style={{ display: "grid" }}>
              <span className={s.strong}>Casual leave</span>
              <span className={s.muted}>Mon – Wed · 3 days</span>
            </span>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={approved ? "ok" : "wait"}
              className={s.badge}
              style={{
                ["--hue" as string]: approved
                  ? "var(--green)"
                  : "var(--orange)",
              }}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.3 } }}
              exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
            >
              {approved ? (
                <Icon name="check" size={12} />
              ) : (
                <span className={s.dot} />
              )}
              {approved ? "Approved" : "Awaiting approval"}
            </motion.span>
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}

// ── Scene 3: hiring ─────────────────────────────────────────────────────────

const STAGES = ["Applied", "Round 1", "Round 2", "Hired"];

function Hiring() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const timers = [800, 1600, 2400].map((ms, i) =>
      setTimeout(() => setStage(i + 1), ms),
    );
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <div className={s.stack}>
      <motion.div className={s.card} {...rise(0.15)}>
        <div className={s.cardHead}>
          <Chip icon="briefcase" hue="var(--red)" />
          <span style={{ display: "grid" }}>
            <span className={s.strong}>Product Designer</span>
            <span className={s.muted}>Opening · 1 position</span>
          </span>
        </div>
      </motion.div>
      <motion.div className={`${s.card} ${s.pipeline}`} {...rise(0.3)}>
        <div className={s.columns}>
          {STAGES.map((name, i) => (
            <div
              key={name}
              className={s.column}
              data-active={i === stage || undefined}
              data-past={i < stage || undefined}
            >
              <span className={s.columnLabel}>{name}</span>
              <span className={s.slot} />
            </div>
          ))}
          {/* Columns are (W − 3 gaps) / 4 wide with 8px gaps: column i starts at i × (25% + 2px). */}
          <motion.div
            className={s.candidate}
            initial={false}
            animate={{ left: `calc(${stage} * (25% + 2px) + 4px)` }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <Initials text="AK" hue="var(--teal)" />
            <span style={{ display: "grid" }}>
              <span className={s.strong}>Candidate</span>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={stage}
                  className={s.muted}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  {stage === 3 ? "Offer accepted" : STAGES[stage]}
                </motion.span>
              </AnimatePresence>
            </span>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Scene 4: organisation and payroll ───────────────────────────────────────

const PAY_STEPS = ["Draft", "Approved", "Disbursed"];

function Organisation() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timers = [1100, 1900].map((ms, i) =>
      setTimeout(() => setStep(i + 1), ms),
    );
    return () => timers.forEach(clearTimeout);
  }, []);
  const leads = [
    { t: "Engineering", hue: "var(--teal)" },
    { t: "Design", hue: "var(--orange)" },
    { t: "People", hue: "var(--green)" },
  ];
  return (
    <div className={s.row}>
      <motion.div className={`${s.card} ${s.org}`} {...rise(0.15)}>
        <motion.span className={s.orgRoot} {...rise(0.3)}>
          <BrandMark size={18} /> Leadership
        </motion.span>
        <svg
          className={s.orgLines}
          viewBox="0 0 100 40"
          preserveAspectRatio="none"
        >
          {[16.7, 50, 83.3].map((x, i) => (
            <motion.path
              key={x}
              d={`M50 0 V18 H${x} V40`}
              initial={{ pathLength: 0 }}
              animate={{
                pathLength: 1,
                transition: { duration: 0.6, ease: EASE, delay: 0.5 + i * 0.1 },
              }}
            />
          ))}
        </svg>
        <div className={s.orgLeads}>
          {leads.map((l, i) => (
            <motion.span
              key={l.t}
              className={s.orgNode}
              {...rise(0.8 + i * 0.1)}
            >
              <span className={s.swatch} style={{ background: l.hue }} />
              {l.t}
            </motion.span>
          ))}
        </div>
      </motion.div>

      <motion.div className={s.card} {...rise(0.35)}>
        <div className={s.cardHead}>
          <Chip icon="banknote" hue="var(--green)" />
          <span style={{ display: "grid" }}>
            <span className={s.strong}>Monthly payroll run</span>
            <span className={s.muted}>Amounts hidden</span>
          </span>
        </div>
        <div className={s.masked}>
          <span style={{ width: "72%" }} />
          <span style={{ width: "54%" }} />
          <span style={{ width: "64%" }} />
        </div>
        <ol className={s.payline}>
          {PAY_STEPS.map((p, i) => (
            <li
              key={p}
              data-state={i < step ? "done" : i === step ? "now" : undefined}
            >
              <span className={s.payDot}>
                {i < step && <Icon name="check" size={10} />}
              </span>
              {p}
            </li>
          ))}
        </ol>
      </motion.div>
    </div>
  );
}

// ── Scene 5: everything together ────────────────────────────────────────────

const ALL: {
  icon: IconName;
  title: string;
  hue: string;
  from: [number, number];
}[] = [
  { icon: "people", title: "People", hue: "var(--teal)", from: [-60, -40] },
  { icon: "clock", title: "Attendance", hue: "var(--green)", from: [0, -60] },
  { icon: "leave", title: "Leave", hue: "var(--orange)", from: [60, -40] },
  { icon: "inbox", title: "Approvals", hue: "var(--teal)", from: [-60, 40] },
  { icon: "briefcase", title: "Recruitment", hue: "var(--red)", from: [0, 60] },
  { icon: "banknote", title: "Payroll", hue: "var(--green)", from: [60, 40] },
];

function Together() {
  return (
    <div className={s.together}>
      <motion.div
        className={s.hub}
        style={{
          position: "relative",
          translate: "none",
          left: "auto",
          top: "auto",
        }}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{
          opacity: 1,
          scale: 1,
          transition: { duration: 0.6, ease: EASE, delay: 0.9 },
        }}
      >
        <BrandMark size={36} />
      </motion.div>
      <div className={s.grid}>
        {ALL.map((m, i) => (
          <motion.div
            key={m.title}
            className={s.gridTile}
            initial={{ opacity: 0, x: m.from[0], y: m.from[1], scale: 0.92 }}
            animate={{
              opacity: 1,
              x: 0,
              y: 0,
              scale: 1,
              transition: { duration: 0.8, ease: EASE, delay: 0.15 + i * 0.06 },
            }}
          >
            <Chip icon={m.icon} hue={m.hue} />
            <span className={s.strong}>{m.title}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
