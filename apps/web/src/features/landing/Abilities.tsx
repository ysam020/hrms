import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "framer-motion";
import { revealVariants, useEntrance } from "./motion";
import s from "./abilities.module.css";

/**
 * Three abilities that don't show well as a still screen — face punch-in,
 * working offline and the MCP server — drawn as small live vignettes instead
 * of screenshots. The wording inside each one is the app's own (the punch
 * dialog's step messages, the Pending Changes states, a real MCP tool name),
 * so the drawing never promises more than the product does. Each plays
 * while it's on screen and replays after a pause, so the row stays alive
 * without anyone scrolling; off screen it stops. With reduced motion it shows
 * its finished state.
 */

const EASE = [0.2, 0, 0, 1] as const;

/** How long a finished vignette rests before it plays again. */
const HOLD = 3600;

/**
 * Steps through `count` stages while the element is in view, then holds the
 * last one and starts over. Leaving the viewport stops the clock.
 */
function useStages(count: number, delays: number[]) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "0px 0px -20% 0px" });
  const reduce = useReducedMotion();
  const [stage, setStage] = useState(0);
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setStage(count - 1);
      return;
    }
    setStage(0);
    let total = 0;
    const timers = delays.map((d, i) => {
      total += d;
      return setTimeout(() => setStage(i + 1), total);
    });
    timers.push(setTimeout(() => setCycle((c) => c + 1), total + HOLD));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduce, cycle]);
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
        label="MCP Server"
        title="Ask the AI assistant you already use."
        body="Praesto runs an MCP server, so the AI assistant you already use can answer from your HR records. It signs in through Praesto, reads only what you allow, and can’t change a thing."
      >
        <McpVignette />
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
  // Same rule as every landing reveal (motion.tsx): only hidden if it
  // starts below the fold, never with Reduce Motion.
  const ref = useRef<HTMLElement>(null);
  const state = useEntrance(ref);
  return (
    <motion.article
      ref={ref}
      className={s.tile}
      initial={false}
      animate={state}
      variants={revealVariants("media")}
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

/** The punch dialog's own step messages (useStepMessage), in order. */
const FACE_STEPS = [
  null, // not punched in: the Punch In button
  "Detecting face...",
  "Slowly turn your head left and right",
  "Matching with stored face data...",
  null, // done: Working · Since 9:12 AM
];

function FaceVignette() {
  // 0 not punched in · 1 detecting · 2 turning · 3 matching · 4 working
  const { ref, stage } = useStages(5, [1100, 1000, 2200, 1200]);
  const turning = stage === 2;
  const done = stage === 4;
  return (
    <div ref={ref} className={s.face}>
      <div className={s.viewfinder} data-off={stage === 0 || undefined}>
        <svg viewBox="0 0 200 200" className={s.faceSvg}>
          <circle cx="100" cy="100" r="92" className={s.ringTrack} />
          <motion.circle
            cx="100"
            cy="100"
            r="92"
            className={s.ring}
            data-done={done || undefined}
            data-matching={stage === 3 || undefined}
            strokeDasharray={RING}
            initial={false}
            animate={{ strokeDashoffset: stage < 2 ? RING : 0 }}
            transition={{ duration: turning ? 2 : 0, ease: "easeInOut" }}
          />
          <motion.g
            animate={turning ? { x: [0, -9, 9, -6, 0] } : { x: 0 }}
            transition={{ duration: 2, ease: "easeInOut" }}
          >
            <ellipse cx="100" cy="88" rx="30" ry="37" className={s.head} />
            <path
              d="M86 84h0M114 84h0M92 106c5 4 11 4 16 0"
              className={s.features}
            />
          </motion.g>
          <path d="M48 172c8-22 28-34 52-34s44 12 52 34" className={s.head} />
          {/* Detecting: a scan line sweeps the frame. */}
          {stage === 1 && (
            <motion.rect
              x="30"
              width="140"
              height="2"
              rx="1"
              className={s.scan}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: [40, 150, 40], opacity: [0, 1, 0] }}
              transition={{ duration: 1, ease: "easeInOut" }}
            />
          )}
        </svg>
        <motion.span
          className={s.check}
          initial={false}
          animate={{ scale: done ? 1 : 0, opacity: done ? 1 : 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 18 }}
        >
          <svg viewBox="0 0 20 20" width="20" height="20">
            <path d="M5 10.5 8.5 14 15 6.5" />
          </svg>
        </motion.span>
      </div>
      <div className={s.faceStatus}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={stage}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: EASE }}
            className={s.faceLine}
          >
            {stage === 0 ? (
              <>
                <span className={s.dot} data-tone="off" />
                Not Punched In
                <motion.span
                  className={s.punch}
                  animate={{ scale: [1, 1, 0.9, 1] }}
                  transition={{ duration: 1, times: [0, 0.7, 0.85, 1] }}
                >
                  Punch In
                </motion.span>
              </>
            ) : done ? (
              <span className={s.caption} data-done>
                <span className={s.dot} data-tone="on" />
                Working · Since 9:12 AM
              </span>
            ) : (
              <span className={s.caption}>{FACE_STEPS[stage]}</span>
            )}
          </motion.span>
        </AnimatePresence>
      </div>
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

// ── MCP server ─────────────────────────────────────────────────────────────

function McpVignette() {
  // 0 empty · 1 question · 2 tool running · 3 tool done · 4 answer
  const { ref, stage } = useStages(5, [400, 600, 800, 450]);
  const pop = {
    initial: { opacity: 0, y: 10, scale: 0.96 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { type: "spring", stiffness: 380, damping: 28 },
  } as const;
  return (
    <div ref={ref} className={s.chat}>
      <span className={s.server}>
        <span className={s.serverDot} aria-hidden="true" />
        Praesto MCP · connected
      </span>
      {stage >= 1 && (
        <motion.span {...pop} className={`${s.bubble} ${s.mine}`}>
          How much leave do I have left?
        </motion.span>
      )}
      {stage >= 2 && (
        <motion.span
          {...pop}
          className={s.tool}
          data-done={stage >= 3 || undefined}
        >
          <span className={s.toolState} aria-hidden="true">
            {stage >= 3 ? (
              <svg viewBox="0 0 20 20" width="12" height="12">
                <path d="m4.5 10.5 3.5 3.5 7.5-8" />
              </svg>
            ) : (
              <i />
            )}
          </span>
          <span className={s.toolName}>get_my_leave_balance</span>
          <span className={s.toolTag}>read-only</span>
        </motion.span>
      )}
      {stage >= 4 && (
        <motion.span {...pop} className={s.bubble}>
          You have 12 days of paid leave, 6 sick days and 4 casual days left
          this year.
        </motion.span>
      )}
    </div>
  );
}
