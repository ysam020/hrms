/**
 * Timer worker for AnimatedClock
 *
 * Runs the countdown in a dedicated thread so the interval stays accurate
 * even when the main thread is busy or the tab is backgrounded (browsers
 * throttle main-thread timers in hidden tabs but worker timers are unaffected).
 *
 * Messages in:
 *   { type: 'start', targetDate: ISO string }
 *   { type: 'stop' }
 *
 * Messages out:
 *   { type: 'tick', minutes: number, seconds: number }
 *   { type: 'expired' }
 */

export {};

let intervalId: ReturnType<typeof setInterval> | null = null;

const tick = (targetTs) => {
  const diff = targetTs - Date.now();

  if (diff <= 0) {
    clearInterval(intervalId ?? undefined);
    intervalId = null;
    self.postMessage({ type: "expired" });
    return;
  }

  const totalSeconds = Math.floor(diff / 1000);
  self.postMessage({
    type: "tick",
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  });
};

self.onmessage = ({ data }) => {
  if (data.type === "start") {
    clearInterval(intervalId ?? undefined);
    const targetTs = new Date(data.targetDate).getTime();
    tick(targetTs); // immediate first update
    intervalId = setInterval(() => tick(targetTs), 1000);
    return;
  }

  if (data.type === "stop") {
    clearInterval(intervalId ?? undefined);
    intervalId = null;
  }
};
