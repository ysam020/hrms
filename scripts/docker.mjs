#!/usr/bin/env node
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMMANDS = ["build", "build:force", "up", "down", "push"];
const COMPOSE_COMMANDS = {
  dev: "docker compose -f docker-compose.dev.yml",
  prod: "docker compose -f docker-compose.prod.yml",
};
const DEFAULT_BUILD_PLATFORMS = {
  dev: process.env.DOCKER_BUILD_PLATFORMS || "linux/amd64",
  prod: process.env.DOCKER_BUILD_PLATFORMS || "linux/amd64,linux/arm64",
};

const PROD_SERVICE_TARGETS = {
  "api-gateway": {
    dockerfile: "docker/base.Dockerfile",
    image: "ysam090/hrms-api-gateway:latest",
    args: { APP_DIR: "api-gateway", PROJECT: "api-gateway-service", PORT: "9002" },
  },
  "auth-service": {
    dockerfile: "docker/base.Dockerfile",
    image: "ysam090/hrms-auth-service:latest",
    args: { APP_DIR: "auth-service", PROJECT: "auth-service", PORT: "50051" },
  },
  "user-service": {
    dockerfile: "docker/base.Dockerfile",
    image: "ysam090/hrms-user-service:latest",
    args: { APP_DIR: "user-service", PROJECT: "user-service", PORT: "50052" },
  },
  "employee-service": {
    dockerfile: "docker/base.Dockerfile",
    image: "ysam090/hrms-employee-service:latest",
    args: { APP_DIR: "employee-service", PROJECT: "employee-service", PORT: "50053" },
  },
  "attendance-service": {
    dockerfile: "docker/base.Dockerfile",
    image: "ysam090/hrms-attendance-service:latest",
    args: { APP_DIR: "attendance-service", PROJECT: "attendance-service", PORT: "50054" },
  },
  "leave-service": {
    dockerfile: "docker/base.Dockerfile",
    image: "ysam090/hrms-leave-service:latest",
    args: { APP_DIR: "leave-service", PROJECT: "leave-service", PORT: "50055" },
  },
  "recruitment-service": {
    dockerfile: "docker/base.Dockerfile",
    image: "ysam090/hrms-recruitment-service:latest",
    args: { APP_DIR: "recruitment-service", PROJECT: "recruitment-service", PORT: "50056" },
  },
  "hrm-service": {
    dockerfile: "docker/base.Dockerfile",
    image: "ysam090/hrms-hrm-service:latest",
    args: { APP_DIR: "hrm-service", PROJECT: "hrm-service", PORT: "50057" },
  },
  "salary-service": {
    dockerfile: "docker/base.Dockerfile",
    image: "ysam090/hrms-salary-service:latest",
    args: { APP_DIR: "salary-service", PROJECT: "salary-service", PORT: "50058" },
  },
  "analytics-service": {
    dockerfile: "docker/base.Dockerfile",
    image: "ysam090/hrms-analytics-service:latest",
    args: { APP_DIR: "analytics-service", PROJECT: "analytics-service", PORT: "50059" },
  },
  "notification-service": {
    dockerfile: "docker/base.Dockerfile",
    image: "ysam090/hrms-notification-service:latest",
    args: { APP_DIR: "notification-service", PROJECT: "notification-service", PORT: "50060" },
  },
  "scheduler-service": {
    dockerfile: "docker/base.Dockerfile",
    image: "ysam090/hrms-scheduler-service:latest",
    args: { APP_DIR: "scheduler-service", PROJECT: "scheduler-service", PORT: "9002" },
  },
  web: {
    dockerfile: "docker/web.Dockerfile",
    image: "ysam090/hrms-web:latest",
    args: {},
  },
};

const [, , command, maybeEnv, maybeService] = process.argv;
let env = "dev";
let service = maybeService ?? maybeEnv;

if (maybeEnv === "prod" || maybeEnv === "production" || maybeEnv === "--prod") {
  env = "prod";
  service = maybeService;
} else if (maybeEnv === "dev" || maybeEnv === "--dev") {
  env = "dev";
  service = maybeService;
} else if (maybeEnv && !COMMANDS.includes(maybeEnv)) {
  service = maybeEnv;
}

if (!command || !COMMANDS.includes(command)) {
  console.error(`Usage: pnpm docker <command> [prod|dev] [service]\n`);
  console.error(`Commands: ${COMMANDS.join(", ")}`);
  process.exit(1);
}

const run = (cmd, options = {}) => {
  console.log(`\n> ${cmd}\n`);
  execSync(cmd, { stdio: "inherit", cwd: ROOT, ...options });
};

const compose = COMPOSE_COMMANDS[env];
const s = service ? ` ${service}` : "";

// Prod pushes must always be multi-arch, regardless of any locally-set
// DOCKER_BUILD_PLATFORMS override (which people often set for faster
// single-arch local/dev builds). Previously this override silently
// disabled the multi-arch push path.
const getPlatforms = (push = false) => {
  if (push && env === "prod") {
    return "linux/amd64,linux/arm64";
  }
  return process.env.DOCKER_BUILD_PLATFORMS || DEFAULT_BUILD_PLATFORMS[env];
};

const buildxBuildCommand = (serviceName, push = false, noCache = false) => {
  const target = PROD_SERVICE_TARGETS[serviceName];
  if (!target) {
    throw new Error(`Unsupported prod service: ${serviceName}`);
  }

  const platforms = getPlatforms(push);
  const pushFlag = push ? "--push" : "--load";
  const cacheFlag = noCache ? "--no-cache" : "";
  const buildArgs = Object.entries(target.args)
    .map(([key, value]) => `--build-arg ${key}=${value}`)
    .join(" ");

  return `docker buildx build ${pushFlag} ${cacheFlag} --platform ${platforms} --file ${target.dockerfile} ${buildArgs} -t ${target.image} .`.trim();
};

const getProdServiceList = () => Object.keys(PROD_SERVICE_TARGETS);
const useBuildxPush = env === "prod" && (process.env.DOCKER_PUSH_MULTI_ARCH || "1").toLowerCase() !== "0";

// IMPORTANT: never push a locally --load'd image directly. `docker buildx
// build --load` can only ever load a single platform into the local Docker
// daemon, so a plain `docker push` of that image would silently replace the
// multi-arch manifest list on the registry with a single-arch image. This
// is what caused "no matching manifest for linux/amd64" on other hosts.
// Always do a fresh multi-platform buildx build straight to --push instead.
const pushProdImage = (serviceName) => {
  const target = PROD_SERVICE_TARGETS[serviceName];
  if (!target) {
    throw new Error(`Unsupported prod service: ${serviceName}`);
  }
  run(buildxBuildCommand(serviceName, true, false));
};

switch (command) {
  case "build":
    run("node scripts/generate-certs.mjs");
    run(`cross-env COMPOSE_PARALLEL_LIMIT=2 ${compose} build${s}`);
    break;

  case "build:force":
    run("node scripts/generate-certs.mjs");
    run(`cross-env COMPOSE_PARALLEL_LIMIT=2 ${compose} build --no-cache${s}`);
    break;

  case "up":
    run("node scripts/generate-certs.mjs");
    if (env === "dev") {
      run(`${compose} up -d mongodb redis`);
    }
    run(`${compose} up -d${s}`);
    break;

  case "down":
    // `docker compose down` doesn't accept a service name — use stop for individual
    service ? run(`${compose} stop ${service}`) : run(`${compose} down`);
    break;

  case "push":
    if (env === "prod") {
      const serviceList = service ? [service] : getProdServiceList();
      for (const svc of serviceList) {
        try {
          if (useBuildxPush) {
            pushProdImage(svc);
          } else {
            run(`${compose} push${s}`);
          }
        } catch (error) {
          console.error(`\nPush failed for ${svc}.`);
          console.error("This is often caused by Docker Hub network/auth issues. Please retry with:");
          console.error(`  docker buildx build --push --platform linux/amd64,linux/arm64 --file ${PROD_SERVICE_TARGETS[svc].dockerfile} ${Object.entries(PROD_SERVICE_TARGETS[svc].args).map(([key, value]) => `--build-arg ${key}=${value}`).join(" ")} -t ${PROD_SERVICE_TARGETS[svc].image} .`);
          throw error;
        }
      }
    } else {
      run(`${compose} push${s}`);
    }
    break;
}
