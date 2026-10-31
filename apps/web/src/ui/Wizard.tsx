import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { usePrefersReducedMotion } from "@next/motion";
import { Button } from "./controls";
import { Icon, type IconName } from "./Icon";
import s from "./Wizard.module.css";

// Guided multi-step forms. The form's values live in the page (one state
// object), so moving between steps never loses anything; steps only decide
// which fields are shown and which errors block "Continue".

export interface WizardStep {
  id: string;
  title: string;
  /** One line under the title in the step rail. */
  summary?: string;
  icon?: IconName;
}

export function useWizard(count: number, initialReached = 0) {
  const [current, setCurrent] = useState(0);
  const [reached, setReached] = useState(initialReached);
  const go = useCallback(
    (i: number) => {
      const n = Math.max(0, Math.min(count - 1, i));
      setCurrent(n);
      setReached((r) => Math.max(r, n));
    },
    [count],
  );
  return {
    current,
    reached,
    go,
    /** Mark every step as visited (e.g. editing a record that's complete). */
    reachAll: useCallback(() => setReached(count - 1), [count]),
    next: () => go(current + 1),
    back: () => go(current - 1),
    isFirst: current === 0,
    isLast: current === count - 1,
  };
}

/**
 * The step rail. Wide layouts list every step with its summary; compact
 * ones show "Step 2 of 5" and a segmented progress bar. Visited steps are
 * buttons; later ones can't be skipped to. Steps with problems are marked
 * with an alert glyph as well as color.
 */
export function Stepper({
  steps,
  current,
  reached,
  onSelect,
  flagged = [],
  complete,
  label = "Steps",
}: {
  steps: WizardStep[];
  current: number;
  reached: number;
  onSelect: (i: number) => void;
  flagged?: number[];
  /** Steps whose answers are all valid. Only these get a check mark; a
   *  visited step that's still incomplete keeps its number. Omitted:
   *  every visited step counts as complete. */
  complete?: number[];
  label?: string;
}) {
  const step = steps[current];
  return (
    <nav className={s.stepper} aria-label={label} data-tour="wizard-steps">
      <div className={s.compact}>
        <p className={s.compactText}>
          <span className={s.compactCount}>
            Step {current + 1} of {steps.length}
          </span>
          {steps[current + 1] && (
            <span className={s.compactNext}>
              Next: {steps[current + 1].title}
            </span>
          )}
        </p>
        <div
          className={s.progress}
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={current + 1}
          aria-valuetext={`Step ${current + 1} of ${steps.length}: ${step?.title}`}
          style={{ "--_n": steps.length } as CSSProperties}
        >
          {steps.map((st, i) => (
            <span
              key={st.id}
              data-state={
                i < current ? "done" : i === current ? "current" : undefined
              }
              data-flagged={flagged.includes(i) || undefined}
            />
          ))}
        </div>
      </div>
      <ol className={s.list}>
        {steps.map((st, i) => {
          const state =
            i === current
              ? "current"
              : i > reached
                ? "upcoming"
                : !complete || complete.includes(i)
                  ? "done"
                  : "visited";
          const isFlagged = flagged.includes(i);
          return (
            <li key={st.id} className={s.item} data-state={state}>
              <button
                type="button"
                className={s.stepButton}
                disabled={i > reached}
                aria-current={i === current ? "step" : undefined}
                onClick={() => onSelect(i)}
                data-flagged={isFlagged || undefined}
              >
                <span className={s.marker} aria-hidden>
                  {isFlagged ? (
                    <Icon name="alert" size={14} />
                  ) : state === "done" ? (
                    <Icon name="check" size={14} />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className={s.stepText}>
                  <span className={s.stepTitle}>
                    {st.title}
                    {isFlagged && (
                      <span className="px-sr-only">, needs attention</span>
                    )}
                    {state === "done" && !isFlagged && (
                      <span className="px-sr-only">, complete</span>
                    )}
                    {state === "visited" && !isFlagged && (
                      <span className="px-sr-only">, incomplete</span>
                    )}
                  </span>
                  {st.summary && (
                    <span className={s.stepSummary}>{st.summary}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Rail beside the step on wide containers, above it on narrow ones. */
export function WizardLayout({
  stepper,
  children,
}: {
  stepper: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={s.layout}>
      <div className={s.grid}>
        <aside className={s.rail}>{stepper}</aside>
        <div className={s.main}>{children}</div>
      </div>
    </div>
  );
}

/**
 * The current step's heading. When the step changes it takes focus (so a
 * screen reader announces the new step) and scrolls into view; not on the
 * first render, where the page's own autofocus wins.
 */
export function StepHeader({
  index,
  count,
  title,
  description,
}: {
  index: number;
  count: number;
  title: ReactNode;
  description?: ReactNode;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({
      block: "start",
      behavior: reduced ? "auto" : "smooth",
    });
  }, [index, reduced]);
  return (
    <header className={s.stepHeader}>
      <span className={s.eyebrow}>
        Step {index + 1} of {count}
      </span>
      <h2 ref={ref} tabIndex={-1} className={s.stepHeading}>
        {title}
      </h2>
      {description && <p className={s.stepDescription}>{description}</p>}
    </header>
  );
}

/** Back / Continue (or the final action), pinned to the bottom on wide screens. */
export function WizardFooter({
  onBack,
  backDisabled,
  isFirst,
  isLast,
  continueLabel = "Continue",
  finishLabel,
  finishIcon = "check",
  busy,
  onContinue,
  formId,
  leading,
}: {
  onBack: () => void;
  backDisabled?: boolean;
  isFirst: boolean;
  isLast: boolean;
  continueLabel?: string;
  finishLabel: string;
  finishIcon?: IconName;
  busy?: boolean;
  /** Continue on non-final steps. The final step submits `formId`. */
  onContinue: () => void;
  formId?: string;
  /** Left of the buttons, e.g. a "Cancel" or a draft note. */
  leading?: ReactNode;
}) {
  return (
    <div className={s.footer}>
      <div className={s.footerLeading}>{leading}</div>
      {!isFirst && (
        <Button
          onClick={onBack}
          disabled={backDisabled || busy}
          icon="chevronLeft"
        >
          Back
        </Button>
      )}
      {/* Distinct keys: React must not reuse one <button> and flip its type
          to "submit" mid-click, or the click that opens the last step would
          also submit the form. */}
      {isLast ? (
        <Button
          key="finish"
          variant="primary"
          type="submit"
          form={formId}
          busy={busy}
          icon={finishIcon}
        >
          {finishLabel}
        </Button>
      ) : (
        <Button
          key="continue"
          variant="primary"
          onClick={onContinue}
          disabled={busy}
        >
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {continueLabel}
            <Icon name="chevronRight" size="1.1em" />
          </span>
        </Button>
      )}
    </div>
  );
}

/** Focus the first invalid control in a step after a failed Continue. */
export function focusFirstInvalid(root: ParentNode = document) {
  requestAnimationFrame(() => {
    const el = root.querySelector<HTMLElement>(
      '[aria-invalid="true"], [data-invalid="true"]',
    );
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: "center", behavior: "smooth" });
  });
}
