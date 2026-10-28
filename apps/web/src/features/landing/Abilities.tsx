import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { arrivedPrerendered } from "@next/app/seo";
import s from "./abilities.module.css";

/**
 * Three abilities that don't show well as a still screen — face punch-in,
 * working offline and the assistant — drawn as small live vignettes instead
 * of screenshots. The wording inside each one is the app's own (the punch
 * dialog's step messages, the Pending Changes states, the assistant's
 * suggested questions), so the drawing never promises more than the product
 * does. Each plays once when it scrolls into view; with reduced motion it
 * shows its finished state.
 */

const EASE = [0.2, 0, 0, 1] as const;

/** Steps through `count` stages once the element is in view. */
function useStages(count: number, delays: number[]) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -20% 0px" });
  const reduce = useReducedMotion();
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setStage(count - 1);
      return;
    }
    let total = 0;
    const timers = delays.map((d, i) => {
      total += d;
      return setTimeout(() => setStage(i + 1), total);
    });
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduce]);
  return { ref, stage };
}

export function Abilities() {
  return (
    <div className={s.grid}>
      <Tile
        label="Face Punch-In"
        title="Punch in with a glance."
        body="Your face is matched on your own device, with a quick turn of the head to show it’s really you. Praesto keeps a face signature, never a photo, and can require people to be at the office."
      >
        <FaceVignette />
      </Tile>
      <Tile
        label="Works Offline"
        title="No signal? Keep going."
        body="Apply for leave, ask to work from home or raise a ticket without a connection. Forms keep your draft, and changes are sent once — exactly once — when you’re back online."
      >
        <OfflineVignette />
      </Tile>
      <Tile
        label="Assistant"
        title="Ask instead of searching."
        body="How much leave is left, what the work-from-home policy says, how this month’s attendance looks — just ask. The assistant only ever sees your own records."
      >
        <AssistantVignette />
      </Tile>
    </div>
  );
}

function Tile({
  label,
  title,
  body,
  children,
}: {
  label: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  // Prerendered: already on screen, so don't fade in (see Landing's Reveal).
  const [still] = useState(() => arrivedPrerendered("/"));
  return (
    <motion.article
      className={s.tile}
      initial={still ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.7, ease: EASE }}
    >
      <div className={s.visual} aria-hidden>
        {children}
      </div>
      <div className={s.copy}>
        <span className={s.label}>{label}</span>
        <h3 className={s.title}>{title}</h3>
        <p className={s.body}>{body}</p>
      </div>
    </motion.article>
  );
}

// ── Face punch-in ──────────────────────────────────────────────────────────

const RING = 2 * Math.PI * 92;

function FaceVignette() {
  // 0 waiting · 1 turning the head · 2 matched
  const { ref, stage } = useStages(3, [500, 2200]);
  const turning = stage === 1;
  return (
    <div ref={ref} className={s.face}>
      <div className={s.viewfinder}>
        <svg viewBox="0 0 200 200" className={s.faceSvg}>
          <circle cx="100" cy="100" r="92" className={s.ringTrack} />
          <motion.circle
            cx="100"
            cy="100"
            r="92"
            className={s.ring}
            data-done={stage === 2 || undefined}
            strokeDasharray={RING}
            initial={false}
            animate={{ strokeDashoffset: stage === 0 ? RING : 0 }}
            transition={{ duration: stage === 1 ? 2 : 0, ease: "easeInOut" }}
          />
          <motion.g
            animate={turning ? { x: [0, -9, 9, 0] } : { x: 0 }}
            transition={{ duration: 2, ease: "easeInOut" }}
          >
            <ellipse cx="100" cy="88" rx="30" ry="37" className={s.head} />
            <path
              d="M86 84h0M114 84h0M92 106c5 4 11 4 16 0"
              className={s.features}
            />
          </motion.g>
          <path d="M48 172c8-22 28-34 52-34s44 12 52 34" className={s.head} />
        </svg>
        <motion.span
          className={s.check}
          initial={false}
          animate={{ scale: stage === 2 ? 1 : 0, opacity: stage === 2 ? 1 : 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 22 }}
        >
          <svg viewBox="0 0 20 20" width="20" height="20">
            <path d="M5 10.5 8.5 14 15 6.5" />
          </svg>
        </motion.span>
      </div>
      <span className={s.caption} data-done={stage === 2 || undefined}>
        {stage === 2
          ? "Punched in · 9:12 AM"
          : "Slowly turn your head left and right"}
      </span>
    </div>
  );
}

// ── Offline ────────────────────────────────────────────────────────────────

const QUEUED = [
  { title: "Leave · 3–5 Nov", saved: "Saved 2 min ago" },
  { title: "Ticket · Laptop charger not working", saved: "Saved just now" },
];

function OfflineVignette() {
  // 0 offline · 1 syncing · 2 sent
  const { ref, stage } = useStages(3, [1800, 1400]);
  const chip =
    stage === 0
      ? { tone: "offline", text: "Offline · 2 waiting" }
      : stage === 1
        ? { tone: "syncing", text: "Syncing…" }
        : { tone: "done", text: "Up to date" };
  return (
    <div ref={ref} className={s.offline}>
      <span className={s.chip} data-tone={chip.tone}>
        <i />
        {chip.text}
      </span>
      <ul className={s.queue}>
        {QUEUED.map((q, i) => {
          const sent = stage === 2 || (stage === 1 && i === 0);
          return (
            <li key={q.title} className={s.queueItem}>
              <span className={s.queueText}>
                <b>{q.title}</b>
                <small>{q.saved}</small>
              </span>
              <span className={s.queueState} data-sent={sent || undefined}>
                {sent ? "Sent" : "Waiting for connection"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Assistant ──────────────────────────────────────────────────────────────

function AssistantVignette() {
  // 0 empty · 1 question · 2 thinking · 3 answer
  const { ref, stage } = useStages(4, [400, 700, 1300]);
  const pop = {
    initial: { opacity: 0, y: 10, scale: 0.96 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { type: "spring", stiffness: 380, damping: 28 },
  } as const;
  return (
    <div ref={ref} className={s.chat}>
      {stage >= 1 && (
        <motion.span {...pop} className={`${s.bubble} ${s.mine}`}>
          How many leaves do I have left?
        </motion.span>
      )}
      {stage === 2 && (
        <motion.span {...pop} className={`${s.bubble} ${s.typing}`}>
          <i />
          <i />
          <i />
        </motion.span>
      )}
      {stage === 3 && (
        <motion.span {...pop} className={s.bubble}>
          You have 12 days of paid leave, 6 sick days and 4 casual days left
          this year.
        </motion.span>
      )}
      <span className={s.composer}>
        Ask a question
        <span className={s.send}>
          <svg viewBox="0 0 20 20" width="14" height="14">
            <path d="M10 16V4M5.5 8.5 10 4l4.5 4.5" />
          </svg>
        </span>
      </span>
    </div>
  );
}
