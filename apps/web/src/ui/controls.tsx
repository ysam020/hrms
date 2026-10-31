import { LayoutGroup, motion } from "framer-motion";
import {
  Children,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { duration, ease } from "@next/motion";
import { useIsCompact } from "@next/lib/hooks";
import { Select } from "./fields";
import { Icon, type IconName } from "./Icon";
import { SpinnerMark } from "./Spinner";
import s from "./controls.module.css";

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

export type ButtonVariant =
  | "secondary"
  | "primary"
  | "danger"
  | "plain"
  | "tinted"
  | "tintedDanger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "small" | "regular" | "large";
  icon?: IconName;
  busy?: boolean;
  block?: boolean;
}

/**
 * Set by Page around its toolbar actions on compact widths: buttons with an
 * icon show just the icon there (their text becomes the accessible name and
 * a tooltip), so the title and every action fit on one row.
 */
export const ToolbarActionsContext = createContext(false);

/** The plain text of a button's children, for its icon-only name. */
function textOf(node: ReactNode): string {
  let out = "";
  Children.forEach(node, (c) => {
    if (typeof c === "string" || typeof c === "number") out += c;
    else if (isValidElement<{ children?: ReactNode }>(c))
      out += textOf(c.props.children);
  });
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Tooltip for icon-only buttons: hover and keyboard focus show it (CSS);
 * on touch, a long press shows it — and doesn't also press the button.
 */
function useLongPressTip() {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const hide = useRef<ReturnType<typeof setTimeout>>();
  const swallowClick = useRef(false);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(hide.current);
    },
    [],
  );
  const cancel = () => clearTimeout(timer.current);
  return {
    open,
    swallowClick,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === "mouse") return;
        swallowClick.current = false;
        timer.current = setTimeout(() => {
          swallowClick.current = true;
          setOpen(true);
          clearTimeout(hide.current);
          hide.current = setTimeout(() => setOpen(false), 1500);
        }, 450);
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onContextMenu: (e: React.MouseEvent) => {
        // The long press is ours; no text-selection or callout menu.
        if (swallowClick.current || timer.current) e.preventDefault();
      },
    },
  };
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "regular",
      icon,
      busy,
      block,
      className,
      children,
      disabled,
      type = "button",
      onClick,
      ...rest
    },
    ref,
  ) {
    const inToolbar = useContext(ToolbarActionsContext);
    const labelText = icon && inToolbar ? textOf(children) : "";
    const iconOnly = Boolean(labelText);
    const tip = useLongPressTip();
    // An onClick that returns a promise (any async handler) puts the button in
    // its busy state until it settles, so every async action shows progress
    // and can't be triggered twice without each caller wiring `busy`.
    const [pending, setPending] = useState(false);
    const mounted = useRef(true);
    // Set on every mount: StrictMode's mount → unmount → mount would
    // otherwise leave it false and the button stuck busy.
    useEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
      };
    }, []);
    const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
      if (iconOnly && tip.swallowClick.current) {
        // A long press showed the label; it isn't a tap.
        tip.swallowClick.current = false;
        e.preventDefault();
        return;
      }
      const result = onClick?.(e) as unknown;
      if (result && typeof (result as Promise<unknown>).then === "function") {
        setPending(true);
        (result as Promise<unknown>).then(
          () => mounted.current && setPending(false),
          () => mounted.current && setPending(false),
        );
      }
    };
    busy = busy || pending;
    return (
      <button
        ref={ref}
        type={type}
        onClick={handleClick}
        className={cx(
          s.button,
          variant !== "secondary" && s[variant],
          size !== "regular" && s[size],
          block && s.block,
          iconOnly && s.iconOnly,
          className,
        )}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        {...(iconOnly && {
          "aria-label": labelText,
          "data-tip": labelText,
          "data-tip-open": tip.open || undefined,
          ...tip.handlers,
        })}
        {...rest}
      >
        <span
          className={cx(busy && s.busyLabel)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          {icon && <Icon name={icon} size={iconOnly ? undefined : "1.15em"} />}
          {!iconOnly && children}
        </span>
        {busy && (
          <span className={s.busyOverlay}>
            <SpinnerMark size="1.6em" tone="mono" />
          </span>
        )}
      </button>
    );
  },
);

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Required: icon-only controls must have an accessible name. */
  label: string;
  badge?: number;
  /** Destructive actions are red; trash icons default to it. */
  tone?: "danger" | "default";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { icon, label, badge, tone, className, type = "button", ...rest },
    ref,
  ) {
    const danger = tone ? tone === "danger" : icon === "trash";
    return (
      <button
        ref={ref}
        type={type}
        data-tone={danger ? "danger" : undefined}
        className={cx(s.iconButton, className)}
        aria-label={badge ? `${label}, ${badge} new` : label}
        title={label}
        {...rest}
      >
        <Icon name={icon} />
        {!!badge && (
          <span className={s.iconBadge} aria-hidden>
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>
    );
  },
);

// ── Segmented control ───────────────────────────────────────────────────────
// Used for sibling sub-views of a page (tabs) and for small filters. The
// selection thumb glides between segments with a shared layout animation.

export interface Segment<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  label,
  role = "tablist",
  idPrefix,
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  /** "tablist" when it switches panels, "radiogroup" when it filters. */
  role?: "tablist" | "radiogroup";
  /** For tablists: panel ids are `${idPrefix}-panel-${value}`. */
  idPrefix?: string;
}) {
  const group = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const isTabs = role === "tablist";
  const compact = useIsCompact();

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? segments.length - 1
          : (index + dir + segments.length) % segments.length;
    refs.current[next]?.focus();
    onChange(segments[next].value);
  };

  // A filter with more choices than fit on a phone becomes a pop-up picker
  // there instead of a strip whose later segments sit off-screen. The HIG
  // suggests at most about five segments on iPhone; with this app's labels,
  // five already overflow a 375pt screen, so the cut is above four. Tab
  // sets keep their segments.
  if (!isTabs && compact && segments.length > 4)
    return (
      <Select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={s.segmentedPicker}
      >
        {segments.map((seg) => (
          <option key={seg.value} value={seg.value}>
            {typeof seg.label === "string" ? seg.label : seg.value}
            {seg.count != null ? ` (${seg.count})` : ""}
          </option>
        ))}
      </Select>
    );

  return (
    <LayoutGroup id={group}>
      <div className={s.segmented} role={role} aria-label={label}>
        {segments.map((seg, i) => {
          const selected = seg.value === value;
          return (
            <button
              key={seg.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role={isTabs ? "tab" : "radio"}
              id={idPrefix ? `${idPrefix}-tab-${seg.value}` : undefined}
              aria-controls={
                isTabs && idPrefix
                  ? `${idPrefix}-panel-${seg.value}`
                  : undefined
              }
              aria-selected={isTabs ? selected : undefined}
              aria-checked={!isTabs ? selected : undefined}
              tabIndex={selected ? 0 : -1}
              className={s.segment}
              onClick={() => onChange(seg.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {selected && (
                <motion.span
                  layoutId="thumb"
                  className={s.segmentThumb}
                  transition={{ duration: duration.base, ease: ease.standard }}
                />
              )}
              {seg.label}
              {seg.count != null && (
                <span className={s.segmentCount}>{seg.count}</span>
              )}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={s.switch}
      onClick={() => onChange(!checked)}
    >
      <span className={s.switchKnob} />
    </button>
  );
}

export const Checkbox = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { indeterminate?: boolean }
>(function Checkbox({ indeterminate, className, ...rest }, ref) {
  return (
    <input
      ref={(el) => {
        if (el) el.indeterminate = Boolean(indeterminate);
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      type="checkbox"
      className={cx(s.checkbox, className)}
      {...rest}
    />
  );
});
