import { execFileSync } from "node:child_process";

const ALLOWED = new Set(["praesto-it-mongo", "praesto-it-redis"]);

/** Freeze a container (TCP stalls, nothing refuses) — a hung dependency. */
export function pause(name: string) {
  if (!ALLOWED.has(name)) throw new Error(`refusing to pause ${name}`);
  execFileSync("docker", ["pause", name]);
}
export function unpause(name: string) {
  if (!ALLOWED.has(name)) throw new Error(`refusing to unpause ${name}`);
  try {
    execFileSync("docker", ["unpause", name], { stdio: "ignore" });
  } catch {
    /* already running */
  }
}
