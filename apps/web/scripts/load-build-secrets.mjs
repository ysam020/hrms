import { loadSecrets } from "@hrms/common";
import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cwd = join(__dirname, "..");

await loadSecrets("hrms/config");

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: process.env,
      cwd,
      stdio: "inherit",
      shell: false,
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)),
    );
  });
}

await run("node", ["scripts/build-wasm.js"]);
await run("node", ["./node_modules/vite/bin/vite.js", "build"]);
await run("node", ["scripts/optimize-images.js"]);
await run("./node_modules/.bin/workbox", [
  "injectManifest",
  "workbox-config.cjs",
]);
await run("node", ["scripts/optimize-css-loading.js"]);
await run("node", ["scripts/purge-css.js"]);
