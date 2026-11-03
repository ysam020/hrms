import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Runs a real two-worker cluster against the built package (as the services
// do: the primary loads @hrms/logger, then forks) and scrapes the primary.
// Each worker counts one request; the scrape must see both, summed.
const SCRIPT = `
const cluster = require("node:cluster");
if (cluster.isPrimary) {
  require(${JSON.stringify(path.resolve(__dirname, "../../dist/index.js"))});
  let ready = 0;
  cluster.on("message", (_w, m) => {
    if (m !== "ready" || ++ready < 2) return;
    fetch("http://127.0.0.1:" + process.env.METRICS_PORT + "/metrics")
      .then(async (r) => { console.log("STATUS " + r.status); console.log(await r.text()); })
      .catch((e) => console.log("FETCH " + e.message))
      .finally(() => { for (const w of Object.values(cluster.workers)) w.kill(); process.exit(0); });
  });
  cluster.fork(); cluster.fork();
} else {
  const { httpRequestsTotal } = require(${JSON.stringify(path.resolve(__dirname, "../../dist/index.js"))});
  httpRequestsTotal.inc({ method: "GET", route: "/x", status: "200", service: "t" });
  process.send("ready");
}
`;

function run(): Promise<string> {
  // A file, not `node -e`: cluster.fork() re-runs the primary's script path.
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "cluster-metrics-")),
    "run.js",
  );
  fs.writeFileSync(file, SCRIPT);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], {
      env: {
        ...process.env,
        NODE_ENV: "test",
        METRICS_PORT: String(19000 + Math.floor(Math.random() * 1000)),
        LOKI_URL: "",
      },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("exit", () => resolve(out));
  });
}

describe("cluster metrics", () => {
  it("serves one scrape that sums every worker's counters", async () => {
    const out = await run();
    expect(out).toContain("STATUS 200");
    const line = out
      .split("\n")
      .find(
        (l) => l.startsWith("http_requests_total{") && l.includes('route="/x"'),
      );
    expect(line).toBeDefined();
    expect(Number(line!.trim().split(" ").pop())).toBe(2);
  }, 20000);
});
