// Copies monitoring/grafana/dashboards-prod/*.json into docker-compose.prod.yml
// as inline `configs` (grafana-dashboard-<name>), between the BEGIN/END
// generated markers. deploy.sh only syncs the compose file to the instance,
// so dashboards have to travel inside it. Run after editing a dashboard:
//
//   node scripts/embed-grafana-dashboards.mjs
//
// Each config still needs a matching entry under the grafana service's
// `configs:` (target /var/lib/grafana/dashboards/<name>.json).
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dashboardsDir = join(root, "monitoring/grafana/dashboards-prod");
const composePath = join(root, "docker-compose.prod.yml");

const BEGIN = "  # BEGIN generated dashboards";
const END = "  # END generated dashboards";

const compose = readFileSync(composePath, "utf-8");
const start = compose.indexOf(BEGIN);
const end = compose.indexOf(END);
if (start === -1 || end === -1 || end < start) {
  throw new Error("generated-dashboards markers not found in docker-compose.prod.yml");
}
// Keep the BEGIN marker's own comment lines (everything up to the first
// non-comment line after it).
const header = compose
  .slice(start, end)
  .split("\n")
  .filter((line) => line.startsWith("  #"))
  .join("\n");

const blocks = readdirSync(dashboardsDir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((file) => {
    // Re-serialise so the embedded copy is valid JSON and stably formatted.
    const json = JSON.stringify(
      JSON.parse(readFileSync(join(dashboardsDir, file), "utf-8")),
      null,
      2,
    );
    // Compose interpolates `$` inside config content too (`up` and `config`
    // both do), which would blank Grafana's $service/${search:regex}
    // variables or abort the deploy on "invalid interpolation format".
    // "$$" is compose's escape for a literal "$".
    const body = json
      .split("$")
      .join("$$")
      .split("\n")
      .map((line) => `      ${line}`)
      .join("\n");
    return `  grafana-dashboard-${basename(file, ".json")}:\n    content: |\n${body}\n`;
  });

writeFileSync(
  composePath,
  compose.slice(0, start) + `${header}\n${blocks.join("\n")}` + compose.slice(end),
);
console.log(`Embedded ${blocks.length} dashboard(s) into docker-compose.prod.yml`);
