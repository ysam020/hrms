import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
} from "framer-motion";
import { dur, ease, useEntrance } from "./motion";
import s from "./flow.module.css";

/**
 * One leave request followed from start to finish, as an illustration drawn
 * with the app's own words: the Apply for Leave form, the Approvals
 * row (as in the real phone screens further down), the Pending → Approved
 * statuses, the approval email's subject and the attendance month. The flow
 * itself is the product's: leave-service starts an application as Pending,
 * the approval chain routes it to the next approver, approving notifies the
 * employee in the app and by email, and paid leave is counted in attendance
 * and payroll from the same leave-balance record.
 *
 * Wide screens pin the stage beside the steps and advance it as each step
 * crosses the middle of the viewport; a rail beside the steps fills with
 * scroll. Narrow screens give every step its own stage, which plays from the
 * previous step's state into its own as it scrolls in — no pinning.
 *
 * Stage -1 is the blank form the pinned stage shows until the first step
 * arrives, so the story starts from nothing when the visitor gets there.
 * A drawn pointer presses Apply and Approve, so each change has a cause.
 */

const STEPS = [
  {
    label: "Apply",
    title: "Ask in a few taps.",
    body: "Pick a leave type and dates, add a reason and apply — from a phone or a laptop. The request starts out Pending.",
  },
  {
    label: "Review",
    title: "It reaches the right person.",
    body: "The request lands in the Approvals inbox of whoever is next in the approval chain you set up, whether that’s one step or several.",
  },
  {
    label: "Decide",
    title: "Approved, and they know.",
    body: "One tap approves it. The employee hears straight away, in the app and by email.",
  },
  {
    label: "Record",
    title: "The record keeps itself.",
    body: "Approved leave shows up in the month’s attendance, and payroll counts paid leave from that same record. No spreadsheet to update.",
  },
];

export function LeaveFlow() {
  const rootRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLOListElement>(null);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);
  // Below the fold at mount: wait on a blank form until the first step.
  const entrance = useEntrance(rootRef);
  const [active, setActive] = useState(0);
  const armed = useRef(false);
  useEffect(() => {
    if (entrance === "hidden" && !armed.current) {
      armed.current = true;
      setActive(-1);
    }
  }, [entrance]);
  const { scrollYProgress } = useScroll({
    target: stepsRef,
    offset: ["start center", "end center"],
  });

  // The step crossing the middle of the viewport drives the pinned stage.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = stepRefs.current.indexOf(e.target as HTMLLIElement);
          if (i >= 0) setActive(i);
        }
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    stepRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div ref={rootRef} className={s.flow}>
      <ol ref={stepsRef} className={s.steps}>
        <span className={s.rail} aria-hidden="true">
          <motion.span
            className={s.railFill}
            style={{ scaleY: scrollYProgress }}
          />
        </span>
        {STEPS.map((step, i) => (
          <li
            key={step.label}
            ref={(el) => {
              stepRefs.current[i] = el;
            }}
            className={s.step}
            data-active={i === active || undefined}
            data-done={i < active || undefined}
            aria-labelledby={`flow-step-${i}`}
          >
            <InlineStage index={i} />
            <span className={s.stepLabel}>
              <span className={s.stepNum}>
                {String(i + 1).padStart(2, "0")}
              </span>
              {step.label}
            </span>
            <h3 id={`flow-step-${i}`} className={s.stepTitle}>
              {step.title}
            </h3>
            <p className={s.stepBody}>{step.body}</p>
          </li>
        ))}
      </ol>
      <div className={s.pin}>
        <div className={s.pinInner} aria-hidden="true">
          <Stage stage={active} />
          <Progress active={active} />
        </div>
      </div>
    </div>
  );
}

/** A narrow screen's stage for one step: plays from the step before. */
function InlineStage({ index }: { index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const state = useEntrance(ref);
  return (
    <div ref={ref} className={s.inlineStage} aria-hidden="true">
      <Stage stage={state === "hidden" ? index - 1 : index} />
    </div>
  );
}

function Progress({ active }: { active: number }) {
  return (
    <div className={s.progress}>
      {STEPS.map((step, i) => (
        <span
          key={step.label}
          className={s.progressStep}
          data-on={i <= active || undefined}
        >
          {step.label}
        </span>
      ))}
    </div>
  );
}

// ── The stage ──────────────────────────────────────────────────────────────

type Screen = "form" | "inbox" | "attendance";
const SCREEN: Screen[] = ["form", "inbox", "inbox", "attendance"];
const TITLES: Record<Screen, string> = {
  form: "Apply for Leave",
  inbox: "Approvals",
  attendance: "Attendance",
};
const VIEWER = [
  { initials: "RS", name: "Riya Sharma", role: "Employee" },
  { initials: "KS", name: "Kabir Singh", role: "Team Lead" },
  { initials: "KS", name: "Kabir Singh", role: "Team Lead" },
  { initials: "RS", name: "Riya Sharma", role: "Employee" },
];
/** Where the request card sits on each screen, in px from the body's top. */
const CARD_Y: Record<Screen, number> = {
  form: 300,
  inbox: 44,
  attendance: 316,
};

/** One timeline for the stage's choreography, in seconds after a change. */
const T = {
  field: 0.12, // per form field filling in
  reach: 0.75, // pointer starts moving to its button
  press: 1.45, // pointer presses
  pending: 1.65, // the new request appears
  decide: 0.45, // Approve pressed → Approved
  toast: 0.75, // the notification arrives
};

const swap = { duration: dur.state, ease: ease.state };

/** Where the drawn pointer's tip rests, from the body's top-right. */
const POINTER = {
  apply: { top: 248, right: 54 },
  approve: { top: 82, right: 60 },
};

function Stage({ stage }: { stage: number }) {
  const reduce = useReducedMotion();
  const at = Math.max(stage, 0);
  const screen = SCREEN[at];
  const viewer = VIEWER[at];
  const target =
    stage === 0 ? "apply" : stage === 1 || stage === 2 ? "approve" : null;
  return (
    <div className={s.window}>
      <div className={s.bar}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={screen}
            className={s.barTitle}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={swap}
          >
            {TITLES[screen]}
          </motion.span>
        </AnimatePresence>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={viewer.initials}
            className={s.viewer}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={swap}
          >
            <span className={s.avatar} data-tone={viewer.initials}>
              {viewer.initials}
            </span>
            <span className={s.viewerName}>
              {viewer.name}
              <span className={s.role}> · {viewer.role}</span>
            </span>
          </motion.span>
        </AnimatePresence>
      </div>

      <div className={s.body}>
        <AnimatePresence initial={false}>
          <motion.div
            key={screen}
            className={s.screen}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.01 }}
            transition={swap}
          >
            {screen === "form" && <FormScreen stage={stage} />}
            {screen === "inbox" && <InboxScreen />}
            {screen === "attendance" && <AttendanceScreen />}
          </motion.div>
        </AnimatePresence>

        <motion.div
          className={s.request}
          initial={false}
          animate={{
            y: CARD_Y[screen],
            opacity: stage < 0 ? 0 : 1,
            scale: stage < 0 ? 0.92 : 1,
          }}
          transition={{
            y: { type: "spring", stiffness: 140, damping: 18 },
            opacity: { duration: 0.4, delay: stage === 0 ? T.pending : 0 },
            scale: {
              type: "spring",
              stiffness: 260,
              damping: 18,
              delay: stage === 0 ? T.pending : 0,
            },
          }}
        >
          <RequestCard stage={stage} />
        </motion.div>

        <AnimatePresence>
          {target && !reduce && (
            <motion.span
              key={target}
              className={s.pointer}
              style={POINTER[target]}
              initial={{ opacity: 0, x: 70, y: 90 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{
                duration: 0.7,
                ease: ease.out,
                delay: target === "apply" ? T.reach : 0.6,
              }}
            >
              <motion.span
                className={s.pointerInner}
                animate={{
                  scale: stage === 0 || stage === 2 ? [1, 0.78, 1] : 1,
                }}
                transition={{
                  duration: 0.3,
                  delay: stage === 0 ? T.press : 0.1,
                }}
              >
                <Cursor />
              </motion.span>
            </motion.span>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {stage === 2 && (
            <motion.div
              className={s.toast}
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{
                type: "spring",
                stiffness: 380,
                damping: 28,
                delay: reduce ? 0 : T.toast,
              }}
            >
              <span className={s.toastIcon}>
                <Mail />
              </span>
              <span>
                <b>Your leave request was approved</b>
                <small>Email and in-app notification to Riya</small>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** The one request, travelling between screens. */
function RequestCard({ stage }: { stage: number }) {
  const reduce = useReducedMotion();
  const inbox = SCREEN[Math.max(stage, 0)] === "inbox";
  // Approve is pressed first; the decision lands a beat later.
  const [decided, setDecided] = useState(stage >= 2);
  useEffect(() => {
    if (stage < 2) return setDecided(false);
    if (stage > 2 || reduce) return setDecided(true);
    const id = setTimeout(() => setDecided(true), T.decide * 1000);
    return () => clearTimeout(id);
  }, [stage, reduce]);
  const asking = stage === 1 || (stage === 2 && !decided);
  return (
    <div className={s.card} data-inbox={inbox || undefined}>
      <span className={s.avatar} data-tone="RS">
        RS
      </span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={inbox ? "inbox" : "mine"}
          className={s.cardText}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={swap}
        >
          {inbox ? (
            <>
              <b>Casual leave · 4 Nov (1 day)</b>
              <small>
                <span className={s.tag}>Leave</span> Riya Sharma · just now
              </small>
            </>
          ) : (
            <>
              <b>Casual Leave · 1 day</b>
              <small>4 Nov · Family function</small>
            </>
          )}
        </motion.span>
      </AnimatePresence>
      <span className={s.cardEnd}>
        <AnimatePresence mode="popLayout" initial={false}>
          {asking ? (
            <motion.span
              key="actions"
              className={s.actions}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={swap}
            >
              <span className={s.reject}>Reject</span>
              <motion.span
                className={s.approve}
                data-hover={stage >= 1 || undefined}
                animate={{ scale: stage === 2 ? [1, 0.9, 1] : 1 }}
                transition={{ duration: 0.3, delay: 0.1 }}
              >
                Approve
              </motion.span>
            </motion.span>
          ) : (
            <motion.span
              key={decided ? "approved" : "pending"}
              className={s.status}
              data-approved={decided || undefined}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 460, damping: 20 }}
            >
              {decided ? <Check /> : <i />}
              {decided ? "Approved" : "Pending"}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </div>
  );
}

const FIELDS = [
  ["Leave type", "Casual Leave"],
  ["Dates", "4 Nov"],
  ["Duration", "Full day"],
  ["Reason", "Family function"],
];

function FormScreen({ stage }: { stage: number }) {
  const filled = stage >= 0;
  return (
    <div className={s.form}>
      {FIELDS.map(([k, v], i) => (
        <div key={k} className={s.field}>
          <span>{k}</span>
          <motion.b
            initial={false}
            animate={{ opacity: filled ? 1 : 0, x: filled ? 0 : 10 }}
            transition={{
              duration: 0.4,
              ease: ease.out,
              delay: filled ? 0.15 + i * T.field : 0,
            }}
          >
            {v}
          </motion.b>
        </div>
      ))}
      <motion.span
        className={s.applyBtn}
        animate={{ scale: stage === 0 ? [1, 0.92, 1] : 1 }}
        transition={{ duration: 0.3, delay: T.press }}
      >
        Apply
      </motion.span>
    </div>
  );
}

function InboxScreen() {
  return (
    <div className={s.inbox}>
      <p className={s.inboxHead}>Waiting on you</p>
      {/* The request card fills the first row; the rest stand for others. */}
      <span className={s.rowSlot} />
      {[0.62, 0.48].map((w) => (
        <div key={w} className={s.ghostRow}>
          <span className={s.ghostAvatar} />
          <span className={s.ghostLines}>
            <i style={{ width: `${w * 100}%` }} />
            <i style={{ width: `${w * 60}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

// November with Monday first; the 1st falls on a Sunday.
const LEAD = 6;
const DAYS = 30;
const LEAVE_DAY = 4;
const WEEKEND = (d: number) => {
  const dow = (LEAD + d - 1) % 7; // 0 = Monday
  return dow >= 5;
};

/** Mounts as the request arrives: the day is marked, then the count ticks. */
function AttendanceScreen() {
  const reduce = useReducedMotion();
  const [counted, setCounted] = useState(Boolean(reduce));
  useEffect(() => {
    if (reduce) return;
    const id = setTimeout(() => setCounted(true), 900);
    return () => clearTimeout(id);
  }, [reduce]);
  return (
    <div className={s.attendance}>
      <div className={s.stats}>
        <span>
          <small>Month</small>
          <b>November</b>
        </span>
        <span>
          <small>Paid Leave</small>
          <b className={s.count}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={counted ? 1 : 0}
                initial={{ y: 14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -14, opacity: 0 }}
                transition={swap}
              >
                {counted ? 1 : 0}
              </motion.span>
            </AnimatePresence>
          </b>
        </span>
      </div>
      <div className={s.month}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className={s.dow}>
            {d}
          </span>
        ))}
        {Array.from({ length: LEAD }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {Array.from({ length: DAYS }, (_, i) => {
          const d = i + 1;
          return d === LEAVE_DAY ? (
            <motion.span
              key={d}
              className={s.day}
              data-leave
              initial={reduce ? false : { scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                type: "spring",
                stiffness: 380,
                damping: 16,
                delay: 0.5,
              }}
            >
              {d}
            </motion.span>
          ) : (
            <span key={d} className={s.day} data-off={WEEKEND(d) || undefined}>
              {d}
            </span>
          );
        })}
      </div>
      <span className={s.legend}>
        <i /> Leave or holiday
      </span>
    </div>
  );
}

function Cursor() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M5 3.5v15.2l4.1-3.9 2.6 6 2.7-1.2-2.6-5.9H17L5 3.5Z"
        fill="#1d1d1f"
        stroke="#fff"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
      <path
        d="M2.5 6.3 4.9 8.6 9.5 3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Mail() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <rect
        x="2.5"
        y="4.5"
        width="15"
        height="11"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="m3.5 6 6.5 5 6.5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
