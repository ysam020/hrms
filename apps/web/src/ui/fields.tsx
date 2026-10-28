import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Icon } from "./Icon";
import { Presence } from "@next/motion";
import { useMediaQuery } from "@next/lib/hooks";
import {
  DatePicker,
  DateTimePicker,
  TimePicker,
  PopUpSelect,
  changeEvent,
} from "./pickers";
import s from "./fields.module.css";

/** Custom pickers on mouse/trackpad; touch keeps the system's own pickers. */
const useFinePointer = () => useMediaQuery("(pointer: fine)");
const PICKER_TYPES = new Set(["date", "month", "datetime-local", "time"]);

const cx = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");

/**
 * Label + control + hint + error, wired for assistive tech: the control gets
 * the id, aria-describedby, and aria-invalid. Errors animate in place and
 * are announced politely.
 */
export function Field({
  label,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | false | null;
  optional?: boolean;
  children: ReactElement;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby":
          [hintId, errId].filter(Boolean).join(" ") || undefined,
      })
    : children;
  return (
    <div className={cx(s.field, className)}>
      <label htmlFor={id} className={s.label}>
        {label}
        {optional && <span className={s.optional}>Optional</span>}
      </label>
      {control}
      {hint && !error && (
        <span id={hintId} className={s.hint}>
          {hint}
        </span>
      )}
      <div aria-live="polite">
        <Presence show={Boolean(error)} variant="fade">
          <span id={errId} className={s.error}>
            <Icon name="alert" size={14} />
            {error}
          </span>
        </Presence>
      </div>
    </div>
  );
}

export const TextInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function TextInput({ className, ...rest }, ref) {
  const fine = useFinePointer();
  if (fine && rest.type && PICKER_TYPES.has(rest.type) && !rest.readOnly) {
    const props = {
      value: String(rest.value ?? ""),
      onValue: (v: string) =>
        rest.onChange?.(changeEvent<HTMLInputElement>(v, rest.name)),
      min: rest.min as string | undefined,
      max: rest.max as string | undefined,
      required: rest.required,
      disabled: rest.disabled,
      id: rest.id,
      className,
      placeholder: rest.placeholder,
      label: rest["aria-label"],
      describedBy: rest["aria-describedby"],
      invalid: Boolean(rest["aria-invalid"]),
      style: rest.style,
    };
    return rest.type === "time" ? (
      <TimePicker {...props} name={rest.name} />
    ) : rest.type === "datetime-local" ? (
      <DateTimePicker {...props} />
    ) : (
      <DatePicker {...props} mode={rest.type as "date" | "month"} />
    );
  }
  return <input ref={ref} className={cx(s.control, className)} {...rest} />;
});

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(s.control, className)} {...rest} />;
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...rest }, ref) {
  const fine = useFinePointer();
  if (fine && !rest.multiple)
    return (
      <PopUpSelect className={className} {...rest}>
        {children}
      </PopUpSelect>
    );
  return (
    <select ref={ref} className={cx(s.control, className)} {...rest}>
      {children}
    </select>
  );
});

export const SearchField = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label: string; shortcut?: string }
>(function SearchField({ label, shortcut, className, ...rest }, ref) {
  return (
    <div className={cx(s.search, className)}>
      <Icon name="search" className={s.searchIcon} size={15} />
      <input
        ref={ref}
        type="search"
        aria-label={label}
        placeholder={label}
        className={s.control}
        {...rest}
      />
      {shortcut && !rest.value && <kbd className={s.shortcut}>{shortcut}</kbd>}
    </div>
  );
});

export function FormGrid({
  columns = 1,
  children,
}: {
  columns?: 1 | 2;
  children: ReactNode;
}) {
  return (
    <div className={s.formGrid} data-columns={columns}>
      {children}
    </div>
  );
}
export const fieldSpan2 = s.span2;
export const inlineCheckClass = s.inlineCheck;
