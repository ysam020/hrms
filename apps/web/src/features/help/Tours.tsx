import { useContext, useMemo } from "react";
import { UserContext } from "@web/app/providers/UserContext";
import { useShell } from "@next/shell/context";
import { Button, Icon, Page, Section, StatusBadge } from "@next/ui";
import { useWalkthrough } from "@next/walkthrough/WalkthroughProvider";
import {
  availableModules,
  buildSteps,
  progressOf,
  resumeIndex,
} from "@next/walkthrough/engine";
import { MODULES, canReach } from "@next/walkthrough/registry";
import {
  APP_TOUR,
  type TourEnv,
  type TourProgress,
} from "@next/walkthrough/types";
import s from "@next/walkthrough/walkthrough.module.css";

// Product Tours (Help & Support): start, resume or restart the full tour,
// or take the tour of one area. Only areas this person can open are listed.

export default function Tours() {
  const wt = useWalkthrough();
  const { user } = useContext(UserContext);
  const { docked } = useShell();
  const env = useMemo<TourEnv>(() => ({ user, docked }), [user, docked]);
  const appSteps = useMemo(
    () => buildSteps(APP_TOUR, MODULES, env, canReach),
    [env],
  );
  const modules = useMemo(
    () =>
      availableModules(MODULES, env, canReach).map((m) => ({
        ...m,
        count: buildSteps(m.id, MODULES, env, canReach).length,
      })),
    [env],
  );

  if (!wt) return null;
  const app = progressOf(wt.state, APP_TOUR);
  const at = resumeIndex(appSteps, app) + 1;
  const resumable = app.status === "paused" || app.status === "running";

  return (
    <Page
      title="Product Tours"
      subtitle="Learn Praesto at your own pace"
      width="wide"
      description="Guided walkthroughs of the parts of Praesto you can use. Tours only point things out — they never change your data. Press Esc at any time to pause."
    >
      <section className={s.hero} aria-labelledby="tour-app">
        <div className={s.heroHead}>
          <span className={s.heroIcon} aria-hidden>
            <Icon name="sparkle" size={20} />
          </span>
          <div>
            <h2 id="tour-app" className={s.heroTitle}>
              The full tour
            </h2>
            <p className={s.heroText}>{appSummary(app, at, appSteps.length)}</p>
          </div>
        </div>
        <div className={s.heroActions}>
          {resumable ? (
            <>
              <Button
                variant="primary"
                icon="play"
                disabled={!wt.ready}
                onClick={() => void wt.start(APP_TOUR)}
              >
                Resume Tour
              </Button>
              <Button
                icon="refresh"
                disabled={!wt.ready}
                onClick={() => void wt.start(APP_TOUR, { restart: true })}
              >
                Start Over
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              icon="play"
              disabled={!wt.ready || !appSteps.length}
              onClick={() =>
                void wt.start(APP_TOUR, {
                  restart: app.status === "completed",
                })
              }
            >
              {app.status === "completed" ? "Take It Again" : "Start Tour"}
            </Button>
          )}
        </div>
      </section>

      <Section
        title="Tour One Area"
        detail="Just the part you need, without the rest"
      >
        <ul className={s.modules} data-tour="tours-list">
          {modules.map((m) => {
            const p = progressOf(wt.state, m.id);
            const active =
              wt.state.active === m.id &&
              (p.status === "paused" || p.status === "running");
            return (
              <li key={m.id} className={s.moduleRow}>
                <div className={s.moduleText}>
                  <p className={s.moduleName}>{m.label}</p>
                  <p className={s.moduleSummary}>{m.summary}</p>
                </div>
                <span className={s.moduleMeta}>
                  {p.status === "completed" ? (
                    <StatusBadge tone="success">Done</StatusBadge>
                  ) : active ? (
                    <StatusBadge tone="accent">Paused</StatusBadge>
                  ) : (
                    `${m.count} step${m.count === 1 ? "" : "s"}`
                  )}
                </span>
                <Button
                  size="small"
                  disabled={!wt.ready}
                  aria-label={`${active ? "Resume" : "Start"} the ${m.label} tour`}
                  onClick={() =>
                    void wt.start(m.id, { restart: p.status === "completed" })
                  }
                >
                  {active
                    ? "Resume"
                    : p.status === "completed"
                      ? "Again"
                      : "Start"}
                </Button>
              </li>
            );
          })}
        </ul>
      </Section>
    </Page>
  );
}

function appSummary(p: TourProgress, at: number, total: number) {
  switch (p.status) {
    case "completed":
      return "You’ve finished the tour. Take it again whenever you like.";
    case "paused":
    case "running":
      return `Paused at step ${at} of ${total}. Resume where you left off, or start over.`;
    case "dismissed":
      return `You skipped the tour earlier. It’s here whenever you want it — ${total} steps across the areas you use.`;
    default:
      return `${total} steps across the areas you use. Pause at any time and pick up where you left off.`;
  }
}
