import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { Icon } from "./Icon";
import { Popover } from "./overlays";
import s from "./pickers.module.css";
import f from "./fields.module.css";

// Pop-up button and date picker for pointer devices. Select and TextInput
// (type="date" | "month" | "datetime-local") render these instead of the
// browser's menus on fine pointers; touch devices keep the native pickers,
// which are the platform's own. Both keep the native contract: `value` is the
// option value / ISO date string and `onChange` receives `{ target: { value } }`.

const cx = (...c: (string | false | undefined | null)[]) =>
  c.filter(Boolean).join(" ");

/** The subset of a ChangeEvent consumers read (`e.target.value`, `e.target.name`). */
function changeEvent<T extends HTMLElement>(value: string, name?: string) {
  const target = { value, name: name ?? "" } as unknown as T;
  return { target, currentTarget: target } as unknown as ChangeEvent<T>;
}

// ── Pop-up button ───────────────────────────────────────────────────────────

interface Opt {
  value: string;
  label: ReactNode;
  text: string;
  disabled?: boolean;
  group?: string;
}

const textOf = (n: ReactNode): string =>
  typeof n === "string" || typeof n === "number"
    ? String(n)
    : Array.isArray(n)
      ? n.map(textOf).join("")
      : isValidElement(n)
        ? textOf((n.props as { children?: ReactNode }).children)
        : "";

function readOptions(children: ReactNode, group?: string): Opt[] {
  return Children.toArray(children).flatMap((c) => {
    if (!isValidElement(c)) return [];
    const el = c as ReactElement<Record<string, any>>;
    if (el.type === Fragment) return readOptions(el.props.children, group);
    if (el.type === "optgroup")
      return readOptions(el.props.children, el.props.label);
    if (el.type !== "option") return [];
    const text = textOf(el.props.children);
    return [
      {
        value: String(el.props.value ?? text),
        label: el.props.children,
        text,
        disabled: el.props.disabled,
        group,
      },
    ];
  });
}

export function PopUpSelect({
  value,
  defaultValue,
  onChange,
  children,
  disabled,
  className,
  id,
  name,
  style,
  ...aria
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = useMemo(() => readOptions(children), [children]);
  const [inner, setInner] = useState(
    String(defaultValue ?? options[0]?.value ?? ""),
  );
  const current = value !== undefined ? String(value) : inner;
  const selectedIndex = options.findIndex((o) => o.value === current);
  const selected = options[selectedIndex];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [width, setWidth] = useState<number>();
  const anchor = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();

  const enabled = (i: number) => options[i] && !options[i].disabled;
  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir)
      if (enabled(i)) return i;
    return from;
  };

  const show = () => {
    if (disabled) return;
    setWidth(anchor.current?.offsetWidth);
    setActive(selectedIndex >= 0 ? selectedIndex : step(-1, 1));
    setOpen(true);
  };
  const choose = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    setOpen(false);
    if (o.value === current) return;
    if (value === undefined) setInner(o.value);
    onChange?.(changeEvent<HTMLSelectElement>(o.value, name));
  };

  useLayoutEffect(() => {
    if (!open) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, () => number> = {
      ArrowDown: () => step(active, 1),
      ArrowUp: () => step(active, -1),
      Home: () => step(-1, 1),
      End: () => step(options.length, -1),
      PageDown: () => Math.min(options.length - 1, active + 8),
      PageUp: () => Math.max(0, active - 8),
    };
    if (keys[e.key]) {
      e.preventDefault();
      setActive(keys[e.key]());
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      // Type to select, as in a native pop-up.
      const now = Date.now();
      typed.current = {
        text:
          (now - typed.current.at < 700 ? typed.current.text : "") +
          e.key.toLowerCase(),
        at: now,
      };
      const hit = options.findIndex(
        (o, i) =>
          !o.disabled &&
          o.text.toLowerCase().startsWith(typed.current.text) &&
          (typed.current.text.length > 1 || i !== active),
      );
      if (hit >= 0) setActive(hit);
    }
  };

  let lastGroup: string | undefined;
  return (
    <>
      <button
        ref={anchor}
        type="button"
        id={id}
        className={cx(f.control, s.popup, className)}
        style={style}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={aria["aria-label"]}
        aria-describedby={aria["aria-describedby"]}
        aria-invalid={aria["aria-invalid"]}
        data-tour={(aria as Record<string, unknown>)["data-tour"] as string}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
          }
        }}
      >
        <span className={s.popupValue}>
          {selected?.label ?? <span className={s.placeholder}>Choose…</span>}
        </span>
        <Icon name="chevronUpDown" size={14} className={s.popupIcon} />
      </button>
      {name && <input type="hidden" name={name} value={current} />}
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchor}
        label={aria["aria-label"] ?? "Options"}
        role="presentation"
        width={width}
      >
        <div
          ref={list}
          id={listId}
          role="listbox"
          tabIndex={0}
          data-autofocus
          aria-activedescendant={`${listId}-${active}`}
          aria-label={aria["aria-label"]}
          className={s.listbox}
          onKeyDown={onListKey}
        >
          {options.map((o, i) => {
            const heading = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <Fragment key={`${o.value}-${i}`}>
                {heading && (
                  <div className={s.groupLabel} role="presentation">
                    {heading}
                  </div>
                )}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  data-index={i}
                  aria-selected={o.value === current}
                  aria-disabled={o.disabled || undefined}
                  data-active={i === active || undefined}
                  className={s.option}
                  onPointerMove={() => !o.disabled && setActive(i)}
                  onClick={() => choose(i)}
                >
                  <Icon name="check" size={14} className={s.check} />
                  <span className={s.optionLabel}>{o.label}</span>
                </div>
              </Fragment>
            );
          })}
        </div>
      </Popover>
    </>
  );
}

// ── Date picker ─────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoMonth = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
/** Local-time parse (no UTC shift) of "YYYY-MM-DD" or "YYYY-MM". */
function parse(v?: string | null): Date | null {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(v ?? "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3] ?? 1)) : null;
}
const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => {
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return new Date(
    t.getFullYear(),
    t.getMonth(),
    Math.min(
      d.getDate(),
      new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate(),
    ),
  );
};
const sameDay = (a: Date | null, b: Date | null) =>
  Boolean(a && b && iso(a) === iso(b));
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

interface DateProps {
  mode: "date" | "month";
  value: string;
  onValue: (v: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
  placeholder?: string;
  label?: string;
  describedBy?: string;
  invalid?: boolean;
  style?: CSSProperties;
}

export function DatePicker({
  mode,
  value,
  onValue,
  min,
  max,
  required,
  disabled,
  id,
  className,
  placeholder,
  label,
  describedBy,
  invalid,
  style,
}: DateProps) {
  const selected = parse(value);
  const minD = parse(min);
  const maxD = parse(max);
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<Date>(selected ?? new Date());
  const anchor = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const today = new Date();

  const clamp = (d: Date) =>
    minD && d < minD ? minD : maxD && d > maxD ? maxD : d;
  const allowed = (d: Date) =>
    mode === "month"
      ? !(minD && isoMonth(d) < isoMonth(minD)) &&
        !(maxD && isoMonth(d) > isoMonth(maxD))
      : !(minD && iso(d) < iso(minD)) && !(maxD && iso(d) > iso(maxD));

  useEffect(() => {
    if (open) setFocus(clamp(selected ?? new Date()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Roving focus follows the keyboard cursor.
  useLayoutEffect(() => {
    if (!open) return;
    const key = mode === "month" ? isoMonth(focus) : iso(focus);
    const el = grid.current?.querySelector<HTMLElement>(`[data-key="${key}"]`);
    if (el && grid.current?.contains(document.activeElement))
      el.focus({ preventScroll: true });
  }, [focus, open, mode]);

  const pick = (d: Date) => {
    if (!allowed(d)) return;
    onValue(mode === "month" ? isoMonth(d) : iso(d));
    setOpen(false);
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, () => Date> =
      mode === "month"
        ? {
            ArrowLeft: () => addMonths(focus, -1),
            ArrowRight: () => addMonths(focus, 1),
            ArrowUp: () => addMonths(focus, -3),
            ArrowDown: () => addMonths(focus, 3),
            PageUp: () => addMonths(focus, -12),
            PageDown: () => addMonths(focus, 12),
          }
        : {
            ArrowLeft: () => addDays(focus, -1),
            ArrowRight: () => addDays(focus, 1),
            ArrowUp: () => addDays(focus, -7),
            ArrowDown: () => addDays(focus, 7),
            Home: () => addDays(focus, -focus.getDay()),
            End: () => addDays(focus, 6 - focus.getDay()),
            PageUp: () => addMonths(focus, e.shiftKey ? -12 : -1),
            PageDown: () => addMonths(focus, e.shiftKey ? 12 : 1),
          };
    if (moves[e.key]) {
      e.preventDefault();
      setFocus(moves[e.key]());
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(focus);
    }
  };

  const shown = selected
    ? mode === "month"
      ? selected.toLocaleDateString("en-IN", { month: "long", year: "numeric" })
      : `${selected.toLocaleDateString("en-IN", { weekday: "short" })} ${selected.getDate()} ${MONTHS[selected.getMonth()]} ${selected.getFullYear()}`
    : null;

  const year = focus.getFullYear();
  const month = focus.getMonth();
  const first = new Date(year, month, 1);
  const cells = Array.from({ length: 42 }, (_, i) =>
    addDays(first, i - first.getDay()),
  );
  const weeks = cells[35].getMonth() === month ? 6 : 5;

  return (
    <>
      <button
        ref={anchor}
        type="button"
        id={id}
        className={cx(f.control, s.popup, className)}
        style={style}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label ? `${label}${shown ? `, ${shown}` : ""}` : undefined}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={s.popupValue}>
          {shown ?? (
            <span className={s.placeholder}>
              {placeholder ??
                (mode === "month" ? "Choose a month" : "Choose a date")}
            </span>
          )}
        </span>
        <Icon name="calendar" size={15} className={s.popupIcon} />
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchor}
        label={mode === "month" ? "Choose a month" : "Choose a date"}
        className={s.calendarPop}
      >
        <div className={s.calendar}>
          <div className={s.calHead}>
            <span className={s.calTitle} aria-live="polite">
              {mode === "month"
                ? year
                : focus.toLocaleDateString("en-IN", {
                    month: "long",
                    year: "numeric",
                  })}
            </span>
            <button
              type="button"
              className={s.calNav}
              aria-label={mode === "month" ? "Previous year" : "Previous month"}
              onClick={() =>
                setFocus(addMonths(focus, mode === "month" ? -12 : -1))
              }
            >
              <Icon name="chevronLeft" size={14} />
            </button>
            <button
              type="button"
              className={s.calNav}
              aria-label={mode === "month" ? "Next year" : "Next month"}
              onClick={() =>
                setFocus(addMonths(focus, mode === "month" ? 12 : 1))
              }
            >
              <Icon name="chevronRight" size={14} />
            </button>
          </div>
          {mode === "month" ? (
            <div
              ref={grid}
              className={s.months}
              role="grid"
              aria-label={String(year)}
              onKeyDown={onGridKey}
            >
              {MONTHS.map((m, i) => {
                const d = new Date(year, i, 1);
                const key = isoMonth(d);
                const isFocus = i === month;
                return (
                  <button
                    key={key}
                    type="button"
                    role="gridcell"
                    data-key={key}
                    tabIndex={isFocus ? 0 : -1}
                    data-autofocus={isFocus || undefined}
                    className={s.monthCell}
                    aria-selected={
                      selected ? isoMonth(selected) === key : false
                    }
                    data-today={isoMonth(today) === key || undefined}
                    disabled={!allowed(d)}
                    onClick={() => pick(d)}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          ) : (
            <div
              ref={grid}
              role="grid"
              aria-label={focus.toLocaleDateString("en-IN", {
                month: "long",
                year: "numeric",
              })}
              onKeyDown={onGridKey}
            >
              <div className={s.weekdays} role="row">
                {WEEKDAYS.map((w, i) => (
                  <span
                    key={i}
                    role="columnheader"
                    aria-label={
                      [
                        "Sunday",
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                      ][i]
                    }
                  >
                    {w}
                  </span>
                ))}
              </div>
              {Array.from({ length: weeks }, (_, w) => (
                <div key={w} className={s.week} role="row">
                  {cells.slice(w * 7, w * 7 + 7).map((d) => {
                    const key = iso(d);
                    const isFocus = sameDay(d, focus);
                    return (
                      <button
                        key={key}
                        type="button"
                        role="gridcell"
                        data-key={key}
                        tabIndex={isFocus ? 0 : -1}
                        data-autofocus={isFocus || undefined}
                        className={s.day}
                        data-outside={d.getMonth() !== month || undefined}
                        data-today={sameDay(d, today) || undefined}
                        aria-selected={sameDay(d, selected)}
                        aria-label={d.toLocaleDateString("en-IN", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                        disabled={!allowed(d)}
                        onClick={() => pick(d)}
                      >
                        {d.getDate()}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          <div className={s.calFoot}>
            {!required && value ? (
              <button
                type="button"
                className={s.calLink}
                onClick={() => {
                  onValue("");
                  setOpen(false);
                }}
              >
                Clear
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              className={s.calLink}
              disabled={!allowed(today)}
              onClick={() => pick(today)}
            >
              {mode === "month" ? "This Month" : "Today"}
            </button>
          </div>
        </div>
      </Popover>
    </>
  );
}

// ── Time ────────────────────────────────────────────────────────────────────

const timeLabel = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
};
/** Every quarter hour of the day, as "HH:mm". */
const QUARTERS = Array.from(
  { length: 96 },
  (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`,
);

/**
 * "HH:mm" as a pop-up list of quarter hours (like Calendar's time menu) in
 * place of the browser's time popup. A value off the quarter-hour grid is
 * kept and listed in its place; type-ahead jumps by label ("2" → 2:00 AM).
 */
export function TimePicker({
  value,
  onValue,
  min,
  max,
  disabled,
  id,
  className,
  label,
  describedBy,
  invalid,
  required,
  name,
  style,
}: {
  value: string;
  onValue: (v: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  label?: string;
  describedBy?: string;
  invalid?: boolean;
  required?: boolean;
  name?: string;
  style?: CSSProperties;
}) {
  const current = (value ?? "").slice(0, 5);
  const times = useMemo(() => {
    const all =
      current && !QUARTERS.includes(current)
        ? [...QUARTERS, current].sort()
        : QUARTERS;
    return all.filter((t) => (!min || t >= min) && (!max || t <= max));
  }, [current, min, max]);
  return (
    <PopUpSelect
      id={id}
      name={name}
      className={className}
      style={style}
      disabled={disabled}
      required={required}
      aria-label={label ?? "Time"}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      value={current}
      onChange={(e) => onValue(e.target.value)}
    >
      {!current && <option value="">Time</option>}
      {times.map((t) => (
        <option key={t} value={t}>
          {timeLabel(t)}
        </option>
      ))}
    </PopUpSelect>
  );
}

/** "YYYY-MM-DDTHH:mm": the date picker beside a time menu. */
export function DateTimePicker({
  value,
  onValue,
  style,
  ...rest
}: Omit<DateProps, "mode"> & { name?: string }) {
  const [date = "", time = ""] = (value ?? "").split("T");
  return (
    <span className={s.dateTime} style={style}>
      <DatePicker
        {...rest}
        placeholder={rest.placeholder ?? "Date"}
        mode="date"
        value={date}
        onValue={(d) => onValue(d ? `${d}T${time || "09:00"}` : "")}
      />
      <TimePicker
        label={rest.label ? `${rest.label} time` : "Time"}
        value={time.slice(0, 5) || "09:00"}
        disabled={rest.disabled || !date}
        onValue={(t) => onValue(`${date}T${t}`)}
      />
    </span>
  );
}

export { changeEvent };
