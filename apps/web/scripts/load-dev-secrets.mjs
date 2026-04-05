import { loadSecrets } from "@hrms/common";
import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cwd = join(__dirname, "..");

await loadSecrets("hrms/config");

const child = spawn(
  "node",
  ["./node_modules/vite/bin/vite.js", "--clearScreen", "false"],
  { env: process.env, cwd, stdio: "inherit" },
);

child.on("exit", (code) => process.exit(code ?? 0));
