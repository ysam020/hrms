import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "framer-motion";
import { Icon, type IconName } from "@next/ui";
import { useStages } from "./Abilities";
import { Reveal, dur, ease } from "./motion";
import p from "./platform.module.css";

/**
 * The platform chapter: six capabilities that don't fit a single screenshot
 * — geofenced attendance, organisation settings, scoped permissions, HR
 * policies, the report builder and notifications — each drawn as a small
 * working piece of Praesto. Every label, setting, permission scope and
 * message below is the app's own (file references beside each data block),
 * and every person, organisation and number is fictional. Nothing here calls
 * the API.
 */

const SPRING = { duration: dur.state, ease: ease.state };

export function Platform() {
  return (
    <>
      <Attendance />
      <Configure />
      <Access />
      <Policies />
      <Reports />
      <Notifications />
    </>
  );
}

// ── Shared pieces ──────────────────────────────────────────────────────────

type Point = { icon: IconName; title: string; body: string };

/** One capability: copy on one side, its working illustration on the other. */
function Chapter({
  id,
  label,
  title,
  lead,
  points,
  flip = false,
  tint = false,
  note,
  children,
}: {
  id: string;
  label: string;
  title: string;
  lead: string;
  points: Point[];
  flip?: boolean;
  tint?: boolean;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={p.chapter}
      data-tint={tint || undefined}
      data-nav="platform"
      aria-labelledby={`${id}-title`}
    >
      <div className={p.inner} data-flip={flip || undefined}>
        <Reveal className={p.copy} kind={flip ? "right" : "left"}>
          <span className={p.label}>{label}</span>
          <h2 id={`${id}-title`} className={p.h2}>
            {title}
          </h2>
          <p className={p.lead}>{lead}</p>
          <ul className={p.points}>
            {points.map((pt) => (
              <li key={pt.title}>
                <span className={p.pointIcon} aria-hidden="true">
                  <Icon name={pt.icon} size={16} />
                </span>
                <span>
                  <strong>{pt.title}</strong> {pt.body}
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal className={p.visual} kind="media" delay={0.08}>
          {children}
          {note && <p className={p.note}>{note}</p>}
        </Reveal>
      </div>
    </section>
  );
}

/**
 * A segmented choice (radio group): arrow keys move and select, and the
 * selected background slides between options.
 */
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  dark = false,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  dark?: boolean;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div
      className={p.choice}
      data-dark={dark || undefined}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className={p.choiceOption}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {on && (
              <motion.span
                layoutId={`choice-${id}`}
                className={p.choiceThumb}
                transition={SPRING}
              />
            )}
            <span className={p.choiceText}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** A window from the app: title bar and body. */
function Window({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${p.window} ${className ?? ""}`}>
      <div className={p.windowBar} aria-hidden="true">
        <i />
        <i />
        <i />
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

/** A drawn switch; `onChange` makes it a real one. */
function Toggle({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange?: (v: boolean) => void;
}) {
  if (!onChange)
    return (
      <span className={p.toggle} data-on={on || undefined}>
        <span className={p.srOnly}>{on ? "On" : "Off"}</span>
      </span>
    );
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={p.toggle}
      data-on={on || undefined}
      onClick={() => onChange(!on)}
    />
  );
}

/** A value that rolls when it changes. */
function Value({ v }: { v: string | boolean }) {
  if (typeof v === "boolean") return <Toggle on={v} label="" />;
  return (
    <span className={p.valueSlot}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={v}
          className={p.value}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={SPRING}
        >
          {v}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * Plays a demo on its own while it's on screen, until the visitor takes
 * over. Reduce Motion never auto-plays.
 */
function useAutoplay(step: () => void, every: number, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "0px 0px -25% 0px" });
  const reduce = useReducedMotion();
  const tick = useRef(step);
  tick.current = step;
  useEffect(() => {
    if (!inView || reduce || !enabled) return;
    const t = setInterval(() => tick.current(), every);
    return () => clearInterval(t);
  }, [inView, reduce, enabled, every]);
  return ref;
}

// ── Attendance & geofencing ────────────────────────────────────────────────

// Outcomes use the check-in's own wording (attendance-service
// markAttendance.ts): it measures the distance to the office and, outside
// the radius, answers with exactly this message.
const RADIUS = 200;
const AWAY = 1240;

function Attendance() {
  const [place, setPlace] = useState<"office" | "away">("office");
  const [fence, setFence] = useState(true);
  const [touched, setTouched] = useState(false);
  const ref = useAutoplay(
    () => setPlace((v) => (v === "office" ? "away" : "office")),
    3400,
    !touched,
  );
  const take =
    <A,>(fn: (a: A) => void) =>
    (a: A) => {
      setTouched(true);
      fn(a);
    };
  const refused = fence && place === "away";
  const pin = place === "office" ? { x: 168, y: 146 } : { x: 336, y: 54 };

  return (
    <Chapter
      id="attendance-rules"
      tint
      label="Smart attendance"
      title="Attendance that knows where work happens."
      lead="Turn on geofencing and Praesto accepts a punch only when it’s made within the radius you draw around your office. Teams that work across sites can leave it off. Either way, the hours, grace period and half-day rules are yours."
      points={[
        {
          icon: "flag",
          title: "Draw the fence on a map.",
          body: "Find your office, drop the pin and set a radius from 50 metres.",
        },
        {
          icon: "alert",
          title: "A clear answer at the door.",
          body: "Too far away, and people are told how far — and how close they need to be.",
        },
        {
          icon: "clock",
          title: "Your working day.",
          body: "Start time, late grace, full- and half-day hours, how far back corrections can go, and whether overtime needs approval first.",
        },
        {
          icon: "wfh",
          title: "Work from home, by request.",
          body: "People ask, their team lead decides, and you can switch WFH requests off if you don’t offer them.",
        },
      ]}
      note="An illustration using the app’s own settings and messages. The office and people are fictional."
    >
      <div ref={ref} className={p.geo}>
        <div className={p.map}>
          <svg
            viewBox="0 0 400 260"
            className={p.mapSvg}
            role="img"
            aria-label={
              fence
                ? `A map with a ${RADIUS}-metre fence around the office. The employee is ${place === "office" ? "inside it" : `${AWAY} metres away`}.`
                : "A map of the office area. Geofencing is off."
            }
          >
            <rect width="400" height="260" className={p.mapLand} />
            <path
              d="M-10 196 C 80 180 140 230 230 206 S 360 160 420 176"
              className={p.mapWater}
            />
            <rect
              x="34"
              y="28"
              width="86"
              height="64"
              rx="10"
              className={p.mapPark}
            />
            <rect
              x="262"
              y="150"
              width="70"
              height="44"
              rx="8"
              className={p.mapPark}
            />
            <g className={p.mapRoads}>
              <path d="M0 120 H400" />
              <path d="M150 0 V260" />
              <path d="M0 40 L400 98" />
              <path d="M270 0 C 260 90 300 140 290 260" />
            </g>
            <g className={p.mapMinor}>
              <path d="M0 160 H400" />
              <path d="M80 0 V260" />
              <path d="M220 0 V260" />
              <path d="M340 0 V260" />
            </g>
            <motion.g
              initial={false}
              animate={{ opacity: fence ? 1 : 0, scale: fence ? 1 : 0.6 }}
              transition={{ duration: dur.state, ease: ease.out }}
              style={{ transformOrigin: "190px 132px" }}
            >
              <circle cx="190" cy="132" r="64" className={p.fence} />
              <path d="M190 132 H254" className={p.fenceRadius} />
              <text x="222" y="126" className={p.fenceText}>
                {RADIUS} m
              </text>
            </motion.g>
            <g transform="translate(178 120)">
              <rect width="24" height="24" rx="7" className={p.office} />
              <path
                d="M7 18V9l5-3 5 3v9M10.5 18v-4h3v4"
                className={p.officeGlyph}
              />
            </g>
            <motion.line
              x1="190"
              y1="132"
              initial={false}
              animate={{
                x2: pin.x,
                y2: pin.y,
                opacity: refused ? 1 : 0,
              }}
              transition={{ duration: 0.8, ease: ease.out }}
              className={p.distance}
            />
            <motion.g
              initial={false}
              animate={{ x: pin.x, y: pin.y }}
              transition={{ duration: 0.8, ease: ease.out }}
            >
              <circle
                r="15"
                className={p.pinHalo}
                data-bad={refused || undefined}
              />
              <circle
                r="7"
                className={p.pinDot}
                data-bad={refused || undefined}
              />
            </motion.g>
          </svg>

          <div className={p.mapControls}>
            <Choice
              label="Where the employee is"
              value={place}
              onChange={take(setPlace)}
              options={[
                { value: "office", label: "At the office" },
                { value: "away", label: "Across town" },
              ]}
            />
          </div>

          <div className={p.outcomeSlot} aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${refused}-${fence}`}
                className={p.outcome}
                data-bad={refused || undefined}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={SPRING}
              >
                <Icon name={refused ? "alert" : "checkCircle"} size={20} />
                <span>
                  <strong>
                    {refused ? "Check-in not accepted" : "Checked in at 09:12"}
                  </strong>
                  {refused
                    ? `You are ${AWAY} m from the office (allowed: ${RADIUS} m). Move closer and try again.`
                    : fence
                      ? `Within ${RADIUS} m of the office.`
                      : "Geofencing is off, so location isn’t checked."}
                </span>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <Window title="Settings · Attendance Rules">
          <dl className={p.rows}>
            <div className={p.row}>
              <dt>
                Workday starts<small>Late after 09:45</small>
              </dt>
              <dd>09:30</dd>
            </div>
            <div className={p.row}>
              <dt>
                Full day<small>Minimum hours worked</small>
              </dt>
              <dd>8 hours</dd>
            </div>
            <div className={p.row}>
              <dt>Allow work-from-home requests</dt>
              <dd>
                <Toggle on label="" />
              </dd>
            </div>
            <div className={p.row}>
              <dt>Require punching in at the office</dt>
              <dd>
                <Toggle
                  on={fence}
                  label="Geofencing"
                  onChange={take(setFence)}
                />
              </dd>
            </div>
            <div className={p.row} data-off={!fence || undefined}>
              <dt>Radius</dt>
              <dd>{RADIUS} metres</dd>
            </div>
          </dl>
        </Window>
      </div>
    </Chapter>
  );
}

// ── Organisation settings ──────────────────────────────────────────────────

// Two fictional organisations, configured differently. Page names, row
// labels and help text are Settings' own (settings/OrgPolicy.tsx,
// ExitAndPayroll.tsx).
const ORGS = [
  { value: "halcyon", label: "Halcyon Labs", kind: "Software studio" },
  { value: "meridian", label: "Meridian Stores", kind: "Retail chain" },
] as const;
type Org = (typeof ORGS)[number]["value"];

type SettingRow = {
  label: string;
  help?: string;
  v: [string | boolean, string | boolean];
};

const SETTINGS: {
  id: string;
  label: string;
  icon: IconName;
  rows: SettingRow[];
}[] = [
  {
    id: "leave",
    label: "Leave Policy",
    icon: "leave",
    rows: [
      { label: "Paid leave", help: "Days per year", v: ["18 days", "12 days"] },
      { label: "Sick leave", help: "Days per year", v: ["12 days", "8 days"] },
      { label: "Casual leave", help: "Days per year", v: ["8 days", "6 days"] },
      { label: "Medical certificate for sick leave", v: [false, true] },
      {
        label: "Carry forward",
        help: "Paid leave",
        v: ["Up to 10 days", "Up to 5 days"],
      },
      { label: "Comp off", help: "Expires after", v: ["60 days", "30 days"] },
    ],
  },
  {
    id: "attendance",
    label: "Attendance Rules",
    icon: "clock",
    rows: [
      { label: "Workday starts", v: ["10:00", "09:00"] },
      { label: "Late grace period", v: ["15 min", "10 min"] },
      {
        label: "Full day",
        help: "Minimum hours worked",
        v: ["8 hours", "9 hours"],
      },
      { label: "Corrections window", v: ["7 days", "3 days"] },
      { label: "Overtime needs approval first", v: [false, true] },
      { label: "Allow work-from-home requests", v: [true, false] },
      { label: "Require punching in at the office", v: [false, true] },
    ],
  },
  {
    id: "week",
    label: "Work Week",
    icon: "calendar",
    rows: [
      { label: "Pattern", v: ["Monday to Friday", "Monday to Saturday"] },
      { label: "Working days", v: ["Mon – Fri", "Mon – Sat"] },
    ],
  },
  {
    id: "exit",
    label: "Exit Policy",
    icon: "door",
    rows: [
      {
        label: "Notice period",
        help: "During probation",
        v: ["15 days", "7 days"],
      },
      {
        label: "Notice period",
        help: "Three years or more",
        v: ["90 days", "30 days"],
      },
      { label: "Exit checklist", v: ["6 tasks", "4 tasks"] },
      { label: "Exit interview", v: ["5 questions", "3 questions"] },
    ],
  },
  {
    id: "payroll",
    label: "Payroll Setup",
    icon: "banknote",
    rows: [
      { label: "Pay cycle", v: ["Monthly, on the 1st", "Monthly, on the 7th"] },
      {
        label: "Salary components",
        v: ["Basic, HRA, Special", "Basic, HRA, Overtime"],
      },
      { label: "Professional tax", v: ["Karnataka", "Maharashtra"] },
      { label: "Income tax slabs", v: ["2026-27", "2026-27"] },
    ],
  },
];

function Configure() {
  const [org, setOrg] = useState<Org>("halcyon");
  const [page, setPage] = useState(SETTINGS[0].id);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const i = ORGS.findIndex((o) => o.value === org);
  const current = SETTINGS.find((x) => x.id === page)!;
  const onKey = (e: KeyboardEvent, at: number) => {
    const step =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = (at + step + SETTINGS.length) % SETTINGS.length;
    setPage(SETTINGS[next].id);
    tabs.current[next]?.focus();
  };

  return (
    <Chapter
      id="settings"
      label="Your organisation, your rules"
      title="Configured for the way you work."
      lead="A software studio and a retail chain don’t run the same way, so Praesto doesn’t make them. Every organisation sets its own leave, attendance, work week, exit and payroll rules — and the requests people make follow them."
      flip
      points={[
        {
          icon: "leave",
          title: "Leave that matches your policy.",
          body: "Add leave types with their own accrual, carry forward, encashment, proof and comp-off rules.",
        },
        {
          icon: "door",
          title: "Exits, by tenure and role.",
          body: "Notice periods that vary by tenure, designation or department, with an exit checklist and exit interview.",
        },
        {
          icon: "banknote",
          title: "Payroll, set once.",
          body: "Salary components, pay cycles, professional tax and income-tax slabs.",
        },
        {
          icon: "doc",
          title: "Every change on record.",
          body: "Settings changes land in the audit log with their before and after values.",
        },
      ]}
      note="Also in Settings: Company Info, HR Policy, Recruitment Pipeline and Join Requests. Organisations shown are fictional."
    >
      <Window title="Praesto · Settings" className={p.settings}>
        <div className={p.settingsHead}>
          <span className={p.orgMark} aria-hidden="true">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={org}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={SPRING}
              >
                {ORGS[i].label[0]}
              </motion.span>
            </AnimatePresence>
          </span>
          <Choice
            label="Organisation"
            value={org}
            onChange={setOrg}
            options={ORGS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </div>
        <div className={p.settingsBody}>
          <div
            className={p.settingsNav}
            role="tablist"
            aria-label="Settings pages"
            aria-orientation="vertical"
          >
            {SETTINGS.map((x, n) => (
              <button
                key={x.id}
                ref={(el) => {
                  tabs.current[n] = el;
                }}
                type="button"
                role="tab"
                id={`settings-tab-${x.id}`}
                aria-selected={x.id === page}
                aria-controls="settings-panel"
                tabIndex={x.id === page ? 0 : -1}
                onClick={() => setPage(x.id)}
                onKeyDown={(e) => onKey(e, n)}
              >
                <Icon name={x.icon} size={15} />
                {x.label}
              </button>
            ))}
          </div>
          <div
            id="settings-panel"
            role="tabpanel"
            aria-labelledby={`settings-tab-${page}`}
            className={p.settingsPanel}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.dl
                key={page}
                className={p.rows}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.22, ease: ease.state }}
              >
                {current.rows.map((r) => (
                  <div key={r.label + (r.help ?? "")} className={p.row}>
                    <dt>
                      {r.label}
                      {r.help && <small>{r.help}</small>}
                    </dt>
                    <dd>
                      <Value v={r.v[i]} />
                    </dd>
                  </div>
                ))}
              </motion.dl>
            </AnimatePresence>
          </div>
        </div>
      </Window>
    </Chapter>
  );
}

// ── Scoped permissions ─────────────────────────────────────────────────────

type Scope = "self" | "team" | "all";

const SCOPES: { value: Scope; label: string; who: string; body: string }[] = [
  {
    value: "self",
    label: "Self",
    who: "Everyone, from day one",
    body: "Their own attendance, leave, payslips, KYC, tax declaration and resignation — and nobody else’s.",
  },
  {
    value: "team",
    label: "Team",
    who: "Team leads",
    body: "Requests from their team arrive in their Approvals inbox, and their team shows on their Today dashboard.",
  },
  {
    value: "all",
    label: "Organisation",
    who: "HR, admins and whoever you grant it",
    body: "Organisation-wide permissions open a module to everyone’s records — approving KYC, reviewing tax declarations or correcting attendance.",
  },
];

/**
 * Scopes each permission can be granted at, straight from the permission
 * catalog (shared-core/assets/data/permissionStructure.tsx, mirrored by
 * @hrms/common permissionCatalog). A test keeps them in step.
 */
export const SCOPE_MATRIX: { label: string; perm: string; scopes: Scope[] }[] =
  [
    {
      label: "View attendance",
      perm: "Attendance:view",
      scopes: ["self", "team", "all"],
    },
    {
      label: "Mark attendance",
      perm: "Attendance:mark_attendance",
      scopes: ["self"],
    },
    {
      label: "Correct attendance",
      perm: "Attendance:attendance_correction",
      scopes: ["all"],
    },
    {
      label: "View leave",
      perm: "Leave:view",
      scopes: ["self", "team", "all"],
    },
    { label: "Apply for leave", perm: "Leave:apply", scopes: ["self"] },
    { label: "Approve leave", perm: "Leave:approve", scopes: ["team", "all"] },
    {
      label: "View resignations",
      perm: "ResignationProcess:view_resignation",
      scopes: ["self", "team", "all"],
    },
    {
      label: "Approve resignations",
      perm: "ResignationProcess:approve_resignation",
      scopes: ["team", "all"],
    },
    {
      label: "View KYC",
      perm: "BasicKYCDetails:view_kyc",
      scopes: ["self", "all"],
    },
    {
      label: "Approve KYC",
      perm: "BasicKYCDetails:approve_kyc",
      scopes: ["all"],
    },
  ];

// People on the rings: one in the centre, a team around them, then the rest.
// The top of each ring stays clear for its label.
const TEAM_DOTS = [0, 72, 144, 216, 288].map((a) => polar(a + 20, 74));
const ORG_DOTS = Array.from({ length: 14 }, (_, n) => n * (360 / 14))
  .filter((a) => Math.abs(a - 270) > 30)
  .map((a) => polar(a, 128));
function polar(deg: number, r: number) {
  const t = (deg * Math.PI) / 180;
  return { x: 150 + r * Math.cos(t), y: 150 + r * Math.sin(t) };
}

function Access() {
  const [scope, setScope] = useState<Scope>("team");
  const reach = { self: 0, team: 1, all: 2 }[scope];
  const info = SCOPES.find((x) => x.value === scope)!;
  return (
    <Chapter
      id="permissions"
      tint
      label="Roles & permissions"
      title="Access that follows responsibility."
      lead="Roles bundle permissions, and each scoped permission reaches exactly as far as it should: a person’s own records, their team’s, or the whole organisation’s. People see what their work needs — and nothing more."
      points={[
        {
          icon: "people",
          title: "Roles, plus exceptions.",
          body: "Build roles like Team Lead or Payroll Admin, and grant a person an extra permission without inventing a new role.",
        },
        {
          icon: "inbox",
          title: "Requests find the right person.",
          body: "Leave, WFH and other requests go to the requester’s team lead, or to an owner or admin when there isn’t one.",
        },
        {
          icon: "shield",
          title: "Checked on every request.",
          body: "The server enforces each permission — it isn’t just hidden in the menu.",
        },
      ]}
      note="Scopes each permission can be granted at, from Praesto’s permission catalog. Not every action offers every scope."
    >
      <div className={p.access}>
        <div className={p.scopeTop}>
          <svg
            viewBox="0 0 300 300"
            className={p.rings}
            role="img"
            aria-label={`${info.label} scope: ${info.who.toLowerCase()}.`}
          >
            {[128, 74, 30].map((r, n) => (
              <motion.circle
                key={r}
                cx="150"
                cy="150"
                r={r + (n === 2 ? 0 : 18)}
                className={p.ring}
                initial={false}
                animate={{
                  opacity: 2 - n <= reach ? 1 : 0.35,
                  scale: 2 - n === reach ? 1.02 : 1,
                }}
                data-on={2 - n <= reach || undefined}
                style={{ transformOrigin: "150px 150px" }}
                transition={SPRING}
              />
            ))}
            {ORG_DOTS.map((d, n) => (
              <motion.circle
                key={`o${n}`}
                cx={d.x}
                cy={d.y}
                r="6"
                className={p.dot}
                initial={false}
                animate={{ opacity: reach >= 2 ? 1 : 0.25 }}
                transition={{ ...SPRING, delay: reach >= 2 ? n * 0.02 : 0 }}
              />
            ))}
            {TEAM_DOTS.map((d, n) => (
              <motion.circle
                key={`t${n}`}
                cx={d.x}
                cy={d.y}
                r="7"
                className={p.dot}
                initial={false}
                animate={{ opacity: reach >= 1 ? 1 : 0.25 }}
                transition={{ ...SPRING, delay: reach >= 1 ? n * 0.03 : 0 }}
              />
            ))}
            <circle cx="150" cy="150" r="12" className={p.dotSelf} />
            <text x="150" y="26" className={p.ringLabel}>
              Organisation
            </text>
            <text x="150" y="78" className={p.ringLabel}>
              Team
            </text>
            <text x="150" y="133" className={p.ringLabel}>
              Self
            </text>
          </svg>
          <div className={p.scopeInfo}>
            <Choice
              label="Permission scope"
              value={scope}
              onChange={setScope}
              options={SCOPES.map((x) => ({ value: x.value, label: x.label }))}
            />
            <div className={p.scopeCopy} aria-live="polite">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={scope}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={SPRING}
                >
                  <strong>{info.who}</strong>
                  <p>{info.body}</p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
        <table className={p.matrix}>
          <caption className={p.srOnly}>
            The scopes each permission can be granted at
          </caption>
          <thead>
            <tr>
              <th scope="col">Permission</th>
              {SCOPES.map((x) => (
                <th
                  key={x.value}
                  scope="col"
                  data-on={x.value === scope || undefined}
                >
                  {x.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SCOPE_MATRIX.map((r) => (
              <tr key={r.perm}>
                <th scope="row">{r.label}</th>
                {SCOPES.map((x) => {
                  const has = r.scopes.includes(x.value);
                  return (
                    <td key={x.value} data-on={x.value === scope || undefined}>
                      {has ? (
                        <span className={p.yes}>
                          <Icon name="check" size={13} />
                          <span className={p.srOnly}>Available</span>
                        </span>
                      ) : (
                        <span className={p.no}>
                          <span aria-hidden="true">—</span>
                          <span className={p.srOnly}>Not offered</span>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Chapter>
  );
}

// ── HR policies ────────────────────────────────────────────────────────────

// The policy types are the editor's own (policies/PolicyEditor.tsx
// POLICY_TYPES); "Travel Policy" is a custom one, published as "Other".
// Text and dates are fictional.
const POLICIES: {
  id: string;
  title: string;
  icon: IconName;
  updated: string;
  intro: string;
  sections: string[];
  rules?: string[];
}[] = [
  {
    id: "posh",
    title: "POSH Policy",
    icon: "shield",
    updated: "12 Oct 2026",
    intro:
      "Halcyon Labs is committed to a workplace free from sexual harassment. This policy explains what harassment is, how to raise a complaint with the Internal Committee, and how every complaint is handled in confidence.",
    sections: [
      "Scope",
      "Internal Committee",
      "Raising a complaint",
      "Confidentiality",
    ],
  },
  {
    id: "leave",
    title: "Leave Policy",
    icon: "leave",
    updated: "2 Sept 2026",
    intro:
      "Everyone gets time to rest. This policy covers the leave you’re entitled to each year, how to apply, and what happens to days you don’t use.",
    sections: ["Entitlement", "Applying for leave", "Carry forward"],
    rules: [
      "Paid 18 days",
      "Sick 12 days",
      "Casual 8 days",
      "Carry forward up to 10",
    ],
  },
  {
    id: "conduct",
    title: "Code of Conduct",
    icon: "doc",
    updated: "20 Aug 2026",
    intro:
      "How we work with each other, our customers and the communities around us — and what to do if something doesn’t feel right.",
    sections: ["Respect at work", "Conflicts of interest", "Speaking up"],
  },
  {
    id: "advance",
    title: "Advance Salary Policy",
    icon: "banknote",
    updated: "4 Jul 2026",
    intro:
      "When you can ask for part of your salary early, how much, and how it’s recovered from later payslips.",
    sections: ["Eligibility", "Limits", "Recovery"],
  },
  {
    id: "travel",
    title: "Travel Policy",
    icon: "briefcase",
    updated: "18 Jun 2026",
    intro:
      "Booking, allowances and claims for work travel, so nobody has to guess what’s covered.",
    sections: ["Booking", "Daily allowance", "Claims"],
  },
];

function Policies() {
  const [id, setId] = useState("posh");
  const cur = POLICIES.find((x) => x.id === id)!;
  return (
    <Chapter
      id="policies"
      label="HR policies"
      title="Every policy, in one place."
      lead="Publish your POSH policy, leave policy, code of conduct and anything else your people need to know. Everyone in the organisation can read them in Praesto and download a PDF — no more hunting through old email threads."
      flip
      points={[
        {
          icon: "edit",
          title: "Written in Praesto.",
          body: "A rich-text editor for HR, with POSH, leave, code of conduct and advance salary ready to go, and any other policy you name.",
        },
        {
          icon: "refresh",
          title: "Always the current version.",
          body: "Publishing a policy type that already exists replaces it, and every policy shows when it was last updated.",
        },
        {
          icon: "checklist",
          title: "Rules that match the words.",
          body: "Leave entitlements, carry forward and notice periods are set in Settings, and the leave and resignation requests people make follow them.",
        },
        {
          icon: "key",
          title: "Only who you allow can publish.",
          body: "Creating, editing and deleting policies are permissions you grant.",
        },
      ]}
      note="Policy text and dates are fictional."
    >
      <Window title="Praesto · Policies" className={p.policies}>
        <div className={p.policyBody}>
          <ul className={p.policyList} aria-label="Policies">
            {POLICIES.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  aria-pressed={x.id === id}
                  onClick={() => setId(x.id)}
                >
                  <span className={p.policyIcon} aria-hidden="true">
                    <Icon name={x.icon} size={16} />
                  </span>
                  <span className={p.policyName}>
                    {x.title}
                    <small>Updated {x.updated}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className={p.reader} aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.article
                key={cur.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25, ease: ease.state }}
              >
                <div className={p.readerMeta}>
                  <span className={p.chip} data-tone="good">
                    Published
                  </span>
                  <span>Updated {cur.updated}</span>
                </div>
                <h3 className={p.readerTitle}>{cur.title}</h3>
                <p className={p.readerIntro}>{cur.intro}</p>
                <ol className={p.readerSections}>
                  {cur.sections.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ol>
                {cur.rules && (
                  <div className={p.readerRules}>
                    <span>
                      <Icon name="gear" size={13} /> Applied from Settings ·
                      Leave Policy
                    </span>
                    <ul>
                      {cur.rules.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <span className={p.fakeButton} aria-hidden="true">
                  <Icon name="download" size={14} /> Download PDF
                </span>
              </motion.article>
            </AnimatePresence>
          </div>
        </div>
      </Window>
    </Chapter>
  );
}

// ── Report builder ─────────────────────────────────────────────────────────

// Sources, condition names and the CSV/Save actions are the builder's own
// (reports/Reports.tsx; fields from api-gateway handlers/reports.ts). Rows
// are fictional.
type Source = "employee" | "attendance" | "leave";
const REPORTS: Record<
  Source,
  {
    label: string;
    columns: string[];
    filters: [string, string, string][];
    sort: string;
    rows: string[][];
  }
> = {
  employee: {
    label: "Employees",
    columns: [
      "First Name",
      "Last Name",
      "Department",
      "Joining Date",
      "Status",
    ],
    filters: [["Employee Status", "is", "Active"]],
    sort: "Joining Date, newest first",
    rows: [
      ["Ananya", "Rao", "Design", "6 Oct 2026", "Active"],
      ["Kabir", "Mehta", "Engineering", "22 Sept 2026", "Active"],
      ["Leah", "Thomas", "People", "1 Sept 2026", "Active"],
      ["Rohan", "Iyer", "Engineering", "18 Aug 2026", "Active"],
      ["Meera", "Pillai", "Sales", "4 Aug 2026", "Active"],
    ],
  },
  attendance: {
    label: "Attendance",
    columns: ["Date", "Time In", "Time Out", "Working Hours", "Status"],
    filters: [
      ["Date", "at least", "1 Oct 2026"],
      ["Date", "at most", "31 Oct 2026"],
    ],
    sort: "Date, newest first",
    rows: [
      ["30 Oct 2026", "09:18", "18:04", "8.8", "Present"],
      ["29 Oct 2026", "09:41", "18:22", "8.7", "Present"],
      ["28 Oct 2026", "09:26", "13:40", "4.2", "Half Day"],
      ["27 Oct 2026", "09:12", "17:58", "8.8", "WFH"],
      ["24 Oct 2026", "09:30", "18:15", "8.8", "Present"],
    ],
  },
  leave: {
    label: "Leave",
    columns: ["Leave Type", "From", "To", "Days", "Status"],
    filters: [
      ["Status", "is", "Approved"],
      ["From", "at least", "1 Oct 2026"],
    ],
    sort: "From, newest first",
    rows: [
      ["Casual", "3 Nov 2026", "3 Nov 2026", "1", "Approved"],
      ["Paid", "27 Oct 2026", "31 Oct 2026", "5", "Approved"],
      ["Sick", "21 Oct 2026", "22 Oct 2026", "2", "Approved"],
      ["Comp Off", "17 Oct 2026", "17 Oct 2026", "1", "Approved"],
      ["Paid", "6 Oct 2026", "8 Oct 2026", "3", "Approved"],
    ],
  },
};

function Reports() {
  const [source, setSource] = useState<Source>("employee");
  const [touched, setTouched] = useState(false);
  const order: Source[] = ["employee", "attendance", "leave"];
  const ref = useAutoplay(
    () => setSource((v) => order[(order.indexOf(v) + 1) % order.length]),
    4200,
    !touched,
  );
  const r = REPORTS[source];
  return (
    <Chapter
      id="reports"
      tint
      label="Reports"
      title="Ask your own questions of your data."
      lead="Built-in analytics answer the everyday questions about headcount, attendance, hiring and pay. For everything else, the report builder lets HR choose the data, the columns and the filters — then export it or save it for next month."
      points={[
        {
          icon: "table",
          title: "Six sources.",
          body: "Employees, attendance, leave, salary, recruitment and payroll.",
        },
        {
          icon: "filter",
          title: "Your columns, your filters.",
          body: "Filter with conditions like is, is one of, at least and contains — date ranges included — and sort the way you need.",
        },
        {
          icon: "download",
          title: "Export it or keep it.",
          body: "Download a CSV, or save the report and run it again from Saved Reports.",
        },
        {
          icon: "lock",
          title: "Built for HR.",
          body: "Report building is open to HR, owners and admins, and sensitive fields are never offered.",
        },
      ]}
      note="Sample data. Also available as sources: salary, recruitment and payroll."
    >
      <div ref={ref}>
        <Window title="Praesto · Report Builder" className={p.report}>
          <div className={p.reportBar}>
            <Choice
              label="Data"
              value={source}
              onChange={(v) => {
                setTouched(true);
                setSource(v);
              }}
              options={order.map((v) => ({
                value: v,
                label: REPORTS[v].label,
              }))}
            />
            <span className={p.reportActions} aria-hidden="true">
              <span className={p.fakeButton}>
                <Icon name="download" size={13} /> CSV
              </span>
              <span className={p.fakeButton}>
                <Icon name="pin" size={13} /> Save
              </span>
            </span>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={source}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className={p.reportConfig}>
                <div>
                  <span className={p.configLabel}>Filters</span>
                  <div className={p.filterRow}>
                    {r.filters.map(([f, op, v]) => (
                      <span key={f + op} className={p.filter}>
                        {f} <em>{op}</em> {v}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className={p.configLabel}>Sort By</span>
                  <span className={p.sort}>{r.sort}</span>
                </div>
              </div>
              <div className={p.tableWrap}>
                <table className={p.results}>
                  <caption className={p.srOnly}>
                    Sample {r.label.toLowerCase()} report
                  </caption>
                  <thead>
                    <tr>
                      {r.columns.map((c) => (
                        <th key={c} scope="col">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((row, n) => (
                      <motion.tr
                        key={row.join()}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          duration: 0.3,
                          delay: n * 0.05,
                          ease: ease.out,
                        }}
                      >
                        {row.map((cell, c) => (
                          <td key={c}>
                            {c === row.length - 1 ? (
                              <span
                                className={p.chip}
                                data-tone={statusTone(cell)}
                              >
                                {cell}
                              </span>
                            ) : (
                              cell
                            )}
                          </td>
                        ))}
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={p.rowCount}>
                {r.rows.length} of {r.rows.length} rows · {r.columns.length}{" "}
                columns
              </p>
            </motion.div>
          </AnimatePresence>
        </Window>
      </div>
    </Chapter>
  );
}

function statusTone(s: string) {
  if (s === "Half Day") return "warn";
  if (s === "WFH") return "info";
  return "good";
}

// ── Notifications ──────────────────────────────────────────────────────────

// Titles and messages are the services' own: leave-service approveLeave,
// employee-service approveKyc, api-gateway assets. A push carries the same
// title and message as the in-app notification (notification-service).
const EARLIER = [
  { title: "KYC", message: "KYC approved successfully", when: "2h ago" },
  {
    title: "Asset assigned",
    message: "LAP-0142 has been assigned to you",
    when: "Yesterday",
  },
];
const LATEST = { title: "Leave", message: "Leave approved successfully" };

const CHANNELS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "bell",
    title: "In Praesto",
    body: "The bell. New notifications arrive while Praesto is open and stay until you clear them.",
  },
  {
    icon: "device",
    title: "Push",
    body: "On the browser or phone of anyone who turns them on in their profile, where the browser supports it.",
  },
  {
    icon: "inbox",
    title: "Email",
    body: "Many updates also arrive by email in your organisation’s name. Salary slips come as a password-protected PDF.",
  },
];

const EVENTS = [
  "Leave approved or rejected",
  "Leave cancellations",
  "Work-from-home requests",
  "KYC approved",
  "Assets assigned",
  "Salary disbursed",
];

function Notifications() {
  // 0: earlier notifications · 1: the push arrives · 2: it lands in the bell.
  const { ref, stage } = useStages(3, [1400, 700]);
  return (
    <Chapter
      id="notifications"
      label="Notifications"
      title="The update reaches them, wherever they are."
      lead="When a request is decided or something changes, the people involved hear about it — in Praesto, as a push on their browser or phone, and often by email. Requests that need a decision wait in Approvals, so the bell stays for news."
      flip
      points={[
        {
          icon: "checkCircle",
          title: "Decisions, the moment they’re made.",
          body: "Approvals and rejections reach the person who asked.",
        },
        {
          icon: "inbox",
          title: "Approvers aren’t left guessing.",
          body: "New leave and WFH requests reach approvers by push and email, and wait in their Approvals inbox.",
        },
        {
          icon: "bell",
          title: "Push is opt-in.",
          body: "People turn push on from their profile, per browser or device.",
        },
      ]}
      note="Delivery of push notifications depends on each browser and device."
    >
      <div ref={ref} className={p.notify} aria-hidden="true">
        <div className={p.bellPanel}>
          <div className={p.bellBar}>
            <span>Notifications</span>
            <span className={p.bell}>
              <Icon name="bell" size={16} />
              <motion.b
                key={stage >= 2 ? 3 : 2}
                initial={{ scale: 0.4 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 18 }}
              >
                {stage >= 2 ? 3 : 2}
              </motion.b>
            </span>
          </div>
          <ul className={p.bellList}>
            <AnimatePresence initial={false}>
              {stage >= 2 && (
                <motion.li
                  key="latest"
                  className={p.bellItem}
                  data-new
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.45, ease: ease.out }}
                >
                  <strong>{LATEST.title}</strong>
                  <span>{LATEST.message}</span>
                  <small>just now</small>
                </motion.li>
              )}
            </AnimatePresence>
            {EARLIER.map((n) => (
              <li key={n.title} className={p.bellItem}>
                <strong>{n.title}</strong>
                <span>{n.message}</span>
                <small>{n.when}</small>
              </li>
            ))}
          </ul>
        </div>

        <div className={p.lock}>
          <span className={p.lockIsland} />
          <span className={p.lockTime}>9:41</span>
          <span className={p.lockDate}>Monday 2 November</span>
          <AnimatePresence>
            {stage >= 1 && (
              <motion.div
                key="push"
                className={p.push}
                initial={{ opacity: 0, y: -28, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
              >
                <span className={p.pushIcon}>P</span>
                <span className={p.pushText}>
                  <span className={p.pushHead}>
                    <b>Praesto</b>
                    <small>now</small>
                  </span>
                  <strong>{LATEST.title}</strong>
                  <span>{LATEST.message}</span>
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <p className={p.srOnly}>
        Example: the notification “{LATEST.title}: {LATEST.message}” arrives as
        a push notification and in Praesto’s notification list.
      </p>
      <div className={p.channels}>
        {CHANNELS.map((c) => (
          <div key={c.title} className={p.channel}>
            <Icon name={c.icon} size={18} />
            <strong>{c.title}</strong>
            <p>{c.body}</p>
          </div>
        ))}
      </div>
      <ul
        className={p.events}
        aria-label="Examples of what people are notified about"
      >
        {EVENTS.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </Chapter>
  );
}
