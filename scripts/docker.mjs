#!/usr/bin/env node
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPOSE = "docker compose -f docker-compose.dev.yml";
const COMMANDS = ["build", "build:force", "up", "down", "push"];

const [, , command, service] = process.argv;

if (!command || !COMMANDS.includes(command)) {
  console.error(`Usage: pnpm docker <command> [service]\n`);
  console.error(`Commands: ${COMMANDS.join(", ")}`);
  process.exit(1);
}

const run = (cmd) => {
  console.log(`\n> ${cmd}\n`);
  execSync(cmd, { stdio: "inherit", cwd: ROOT });
};

const s = service ? ` ${service}` : "";

switch (command) {
  case "build":
    run("node scripts/generate-certs.mjs");
    run(`cross-env COMPOSE_PARALLEL_LIMIT=4 ${COMPOSE} build${s}`);
    break;

  case "build:force":
    run("node scripts/generate-certs.mjs");
    run(`cross-env COMPOSE_PARALLEL_LIMIT=4 ${COMPOSE} build --no-cache${s}`);
    break;

  case "up":
    run("node scripts/generate-certs.mjs");
    run(`${COMPOSE} up -d mongodb redis`);
    run(`${COMPOSE} up -d${s}`);
    break;

  case "down":
    // `docker compose down` doesn't accept a service name — use stop for individual
    service ? run(`${COMPOSE} stop ${service}`) : run(`${COMPOSE} down`);
    break;

  case "push":
    run(`${COMPOSE} push${s}`);
    break;
}
