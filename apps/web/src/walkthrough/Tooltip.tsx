import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import type { TooltipRenderProps } from "react-joyride";
import { Button, IconButton } from "@next/ui";
import { useRunnerControls } from "./Runner";
import s from "./walkthrough.module.css";

/** Position data the runner passes with each step (`step.data`). */
export interface StepMeta {
  number: number;
  total: number;
  module: string;
  moduleNumber: number;
  moduleTotal: number;
  isFirst: boolean;
  isLast: boolean;
  /** The app tour, with more than one module: offer "Skip Section". */
  multiModule: boolean;
}

/**
 * The walkthrough's tooltip, in Praesto's own controls. Buttons call the
 * runner, not Joyride, so every action goes through the walkthrough state.
 * ←/→ move between steps; Esc pauses (handled by the runner).
 */
export function Tooltip({ step, tooltipProps }: TooltipRenderProps) {
  const c = useRunnerControls();
  const m = step.data as StepMeta;
  const titleId = useId();
  const bodyId = useId();
  const primary = useRef<HTMLButtonElement>(null);

  // Land on Next so Return/Space continues; the focus trap keeps Tab inside.
  useEffect(() => {
    primary.current?.focus({ preventScroll: true });
  }, [step.id]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      c.next();
    } else if (e.key === "ArrowLeft" && !m.isFirst) {
      e.preventDefault();
      c.back();
    }
  };

  const pct = Math.round((m.number / m.total) * 100);

  return (
    <div
      {...tooltipProps}
      className={s.tooltip}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onKeyDown={onKeyDown}
    >
      <div className={s.head}>
        <p className={s.eyebrow}>
          <span className={s.module}>{m.module}</span>
          {m.moduleTotal > 1 && (
            <span>
              {" "}
              · Step {m.moduleNumber} of {m.moduleTotal}
            </span>
          )}
        </p>
        <IconButton icon="x" label="Pause tour" onClick={c.pause} />
      </div>
      <h2 id={titleId} className={s.title}>
        {step.title}
      </h2>
      <div id={bodyId} className={s.body}>
        {step.content}
      </div>

      <div className={s.progress}>
        <div
          className={s.bar}
          role="progressbar"
          aria-label="Tour progress"
          aria-valuemin={1}
          aria-valuemax={m.total}
          aria-valuenow={m.number}
          aria-valuetext={`Step ${m.number} of ${m.total}`}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
        <span className={s.count}>
          {m.number} of {m.total}
        </span>
      </div>

      <div className={s.footer}>
        <div className={s.secondary}>
          {!m.isLast && (
            <button type="button" className={s.link} onClick={c.skipStep}>
              Skip Step
            </button>
          )}
          {m.multiModule && (
            <button type="button" className={s.link} onClick={c.skipModule}>
              Skip Section
            </button>
          )}
          <button type="button" className={s.link} onClick={c.dismiss}>
            End Tour
          </button>
        </div>
        <div className={s.primary}>
          {!m.isFirst && (
            <Button size="small" onClick={c.back}>
              Back
            </Button>
          )}
          <Button ref={primary} size="small" variant="primary" onClick={c.next}>
            {m.isLast ? "Finish" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
