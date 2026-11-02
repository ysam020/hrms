import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import {
  Button,
  Field,
  IconButton,
  Popover,
  Select,
  Sheet,
  TextInput,
} from "@next/ui";
import { useIsCompact } from "@next/lib/hooks";
import {
  AVAILABILITIES,
  DURATIONS,
  MESSAGE_MAX,
  STATUS,
  untilLabel,
  type Availability,
  type Duration,
} from "./model";
import { usePresence } from "./PresenceProvider";
import { PresenceDot, PresenceSummary } from "./PresenceIndicator";
import s from "./presence.module.css";

const SUGGESTIONS: Partial<Record<Availability, string>> = {
  meeting: "In a meeting",
  lunch: "Out for lunch",
  break: "Taking a short break",
  focusing: "Heads down — please message",
};

/** Pick a status, message and duration, then save. */
export function StatusForm({ onDone }: { onDone: () => void }) {
  const presence = usePresence();
  const me = presence?.me ?? null;
  const [availability, setAvailability] = useState<Availability>(
    me?.availability ?? "available",
  );
  const [message, setMessage] = useState(me?.message ?? "");
  const [duration, setDuration] = useState<Duration>("until_changed");
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const groupLabel = useId();

  if (!presence) return null;

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const step =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + AVAILABILITIES.length) % AVAILABILITIES.length;
    setAvailability(AVAILABILITIES[next]);
    radios.current[next]?.focus();
  };

  const save = async () => {
    const ok = await presence.choose({
      availability,
      message: message.trim() || null,
      duration,
    });
    if (ok) onDone();
  };
  const back = me?.previous;

  return (
    <form
      className={s.form}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {me && (
        <div className={s.current}>
          <span className={s.currentLabel}>Now</span>
          <PresenceSummary view={me} showWorkMode={false} />
        </div>
      )}

      <div>
        <span id={groupLabel} className={s.groupLabel}>
          Status
        </span>
        <div
          role="radiogroup"
          aria-labelledby={groupLabel}
          className={s.options}
        >
          {AVAILABILITIES.map((a, i) => (
            <button
              key={a}
              ref={(el) => {
                radios.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={availability === a}
              tabIndex={availability === a ? 0 : -1}
              className={s.option}
              onClick={() => setAvailability(a)}
              onKeyDown={(e) => onKeyDown(e, i)}
              data-autofocus={availability === a ? "" : undefined}
            >
              <PresenceDot status={a} decorative />
              {STATUS[a].label}
            </button>
          ))}
        </div>
      </div>

      <div className={s.messageRow}>
        <Field label="Message" optional className={s.messageField}>
          <TextInput
            value={message}
            maxLength={MESSAGE_MAX}
            placeholder={
              SUGGESTIONS[availability] ?? "What are you working on?"
            }
            onChange={(e) => setMessage(e.target.value)}
          />
        </Field>
        {message && (
          <IconButton
            icon="x"
            label="Clear message"
            type="button"
            onClick={() => setMessage("")}
          />
        )}
      </div>

      <Field label="Clear after">
        <Select
          value={duration}
          onChange={(e) => setDuration(e.target.value as Duration)}
        >
          {DURATIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className={s.actions}>
        {back ? (
          <Button
            variant="plain"
            type="button"
            disabled={presence.saving}
            onClick={async () => (await presence.restore()) && onDone()}
          >
            Back to {STATUS[back.availability].label}
          </Button>
        ) : me && (me.source === "manual" || me.message) ? (
          <Button
            variant="plain"
            type="button"
            disabled={presence.saving}
            onClick={async () =>
              (await presence.choose({
                availability: "available",
                message: null,
                duration: "until_changed",
              })) && onDone()
            }
          >
            Reset to Available
          </Button>
        ) : (
          <span />
        )}
        <span className={s.actionsEnd}>
          <Button variant="secondary" type="button" onClick={onDone}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            busy={presence.saving}
            busyLabel="Saving…"
          >
            Save
          </Button>
        </span>
      </div>
    </form>
  );
}

/** The picker as a popover on wide screens and a bottom sheet on phones. */
export function StatusPicker({
  open,
  onClose,
  anchorRef,
  placement = "bottom-start",
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
}) {
  const compact = useIsCompact();
  // Re-mount the form on every open so it starts from the current status.
  const form = open ? <StatusForm onDone={onClose} /> : null;
  return compact ? (
    <Sheet open={open} onClose={onClose} edge="bottom" title="Set Status">
      {form}
    </Sheet>
  ) : (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      label="Set status"
      placement={placement}
      width={340}
    >
      <div className={s.popoverBody}>{form}</div>
    </Popover>
  );
}

/** "● Busy — On a call, until 3 PM" as a button that opens the picker. */
export function MyStatusButton({ className }: { className?: string }) {
  const presence = usePresence();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const me = presence?.me;
  if (!presence) return null;
  const until = untilLabel(me?.expiresAt ?? null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`${s.myStatus} ${className ?? ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {me ? (
          <>
            <PresenceDot status={me.status} decorative />
            <span className={s.myStatusText}>
              <span className={s.myStatusLabel}>{STATUS[me.status].label}</span>
              {(me.message || until) && (
                <span className={s.myStatusDetail}>
                  {[me.message, until].filter(Boolean).join(" · ")}
                </span>
              )}
            </span>
          </>
        ) : (
          <span className={s.myStatusLabel}>Set Status</span>
        )}
        <span className={s.myStatusAction}>Change</span>
      </button>
      <StatusPicker
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={ref}
      />
    </>
  );
}
