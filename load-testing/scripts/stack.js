#!/usr/bin/env node
// node scripts/stack.js up [--build] | down | status | restore-limits
import {
  down,
  restoreRateLimits,
  status,
  up,
  verifyRateLimitsRestored,
} from "../lib/stack.js";

const [cmd, ...flags] = process.argv.slice(2);
try {
  if (cmd === "up") {
    await up({ build: flags.includes("--build") });
    console.log(
      "loadtest stack is up (coded rate limits, Prometheus targets added).",
    );
  } else if (cmd === "down") {
    await down();
    console.log(
      "loadtest stack removed; overrides cleared; Prometheus targets removed.",
    );
  } else if (cmd === "status") {
    console.log(status());
  } else if (cmd === "restore-limits") {
    // Manual recovery if a run was killed with SIGKILL.
    console.log(JSON.stringify(await restoreRateLimits(), null, 2));
  } else if (cmd === "verify-limits") {
    console.log(JSON.stringify(await verifyRateLimitsRestored(), null, 2));
  } else {
    console.error(
      "usage: stack.js up [--build] | down | status | restore-limits | verify-limits",
    );
    process.exitCode = 2;
  }
} catch (e) {
  console.error(e.stderr?.toString() || e.message);
  process.exitCode = 1;
}
