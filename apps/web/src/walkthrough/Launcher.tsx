import { Button, Icon } from "@next/ui";
import { useWalkthrough } from "./WalkthroughProvider";
import { progressOf } from "./engine";
import { APP_TOUR } from "./types";
import s from "./walkthrough.module.css";

/**
 * Today's onboarding card. Shown to someone who has never started the tour,
 * or whose tour is paused; "Not Now" skips the tour for good (it stays
 * available from Help & Support → Product Tours). Never shown on any other
 * page, and never once the tour is finished or skipped.
 */
export function OnboardingCard() {
  const wt = useWalkthrough();
  if (!wt?.ready) return null;
  const p = progressOf(wt.state, APP_TOUR);
  const paused = p.status === "paused" && wt.state.active === APP_TOUR;
  if (p.status !== "not_started" && !paused) return null;
  // Another tour is running right now: don't compete with it.
  if (wt.state.active && wt.state.active !== APP_TOUR) return null;

  return (
    <section className={s.hero} aria-labelledby="px-tour-card">
      <div className={s.heroHead}>
        <span className={s.heroIcon} aria-hidden>
          <Icon name="sparkle" size={20} />
        </span>
        <div>
          <h2 id="px-tour-card" className={s.heroTitle}>
            {paused ? "Pick up your tour" : "New to Praesto? Take the tour"}
          </h2>
          <p className={s.heroText}>
            {paused
              ? `You’ve seen ${p.seen.length} step${p.seen.length === 1 ? "" : "s"} so far. Carry on from where you paused.`
              : "A guided walk through every part of Praesto you can use. Pause whenever you like and come back to it later."}
          </p>
        </div>
      </div>
      <div className={s.heroActions}>
        <Button variant="primary" onClick={() => void wt.start(APP_TOUR)}>
          {paused ? "Resume Tour" : "Start Tour"}
        </Button>
        <Button variant="plain" onClick={() => wt.dismiss(APP_TOUR)}>
          {paused ? "End Tour" : "Not Now"}
        </Button>
      </div>
    </section>
  );
}
