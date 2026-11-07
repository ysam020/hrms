import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
import { useFormStatus } from "react-dom";
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
  | "tintedDanger"
  | "plainDanger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "small" | "regular" | "large";
  icon?: IconName;
  busy?: boolean;
  /** The button's accessible name while busy, e.g. "Saving…". */
  busyLabel?: string;
  block?: boolean;
  ref?: Ref<HTMLButtonElement>;
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
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hide = useRef<ReturnType<typeof setTimeout>>(undefined);
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
    // True once after a long press showed the label: that press's click
    // isn't a tap. Reading it resets it.
    consumeLongPress: () => {
      const pressed = swallowClick.current;
      swallowClick.current = false;
      return pressed;
    },
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

export function Button({
  variant = "secondary",
  size = "regular",
  icon,
  busy,
  busyLabel,
  block,
  className,
  children,
  disabled,
  type = "button",
  onClick,
  ref,
  ...rest
}: ButtonProps) {
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
    if (iconOnly && tip.consumeLongPress()) {
      // A long press showed the label; it isn't a tap.
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
      aria-label={(busy && busyLabel) || undefined}
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
}

/**
 * A form's submit button that follows the form's own submission: inside a
 * `<form action={…}>` it is busy, and can't be pressed again, until the
 * action settles. useFormStatus reads the nearest enclosing form, so this
 * must render inside the form it submits. Buttons outside their form
 * (dialog footers using form="id") keep Button with `busy`.
 */
export function SubmitButton({
  busy,
  variant = "primary",
  ...rest
}: Omit<ButtonProps, "type" | "onClick">) {
  const { pending } = useFormStatus();
  return (
    <Button {...rest} variant={variant} type="submit" busy={busy || pending} />
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  /** Required: icon-only controls must have an accessible name. */
  label: string;
  badge?: number;
  /** Destructive actions are red; trash icons default to it. */
  tone?: "danger" | "default";
  ref?: Ref<HTMLButtonElement>;
}

export function IconButton({
  icon,
  label,
  badge,
  tone,
  className,
  type = "button",
  ref,
  ...rest
}: IconButtonProps) {
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

export function Checkbox({
  indeterminate,
  className,
  ref,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  indeterminate?: boolean;
  ref?: Ref<HTMLInputElement>;
}) {
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
}
