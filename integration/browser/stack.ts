/**
 * Browser verification — the backend for the browser harness, on the
 * ISOLATED containers only (setupEnv.cjs guard): one synthetic tenant + user,
 * two real gateway processes (authenticate + Socket.IO + re-validation), a
 * static server for the bundled page, and a localhost control API the test
 * driver uses to inject failures (kill/restart a gateway, pause MongoDB,
 * terminate the user, mint tokens).
 *
 *   npx tsx --require ./integration/setupEnv.cjs integration/browser/stack.ts <bundleDir>
 */
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import { prisma } from "../../packages/database/dist/index";
import {
  pause as pauseContainer,
  unpause as unpauseContainer,
} from "../helpers/docker";

const TENANT = "7d1000000000000000000001";
const USER = "7d2000000000000000000001";
const oid = (id: string) => ({ $oid: id });
const PORTS: Record<string, number> = { A: 47301, B: 47302 };
const gws: Record<string, ChildProcess | undefined> = {};
const bundleDir = process.argv[2];

function start(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const port = PORTS[name];
    const child = spawn(
      "node",
      ["--import", "tsx", "integration/helpers/gatewayProcess.ts"],
      {
        env: {
          ...process.env,
          PORT: String(port),
          LOG_LEVEL: "error",
          ACCOUNT_ACCESS_TTL_MS: process.env.BR_TTL_MS || "2000",
          SOCKET_REVALIDATE_MS: process.env.BR_REVALIDATE_MS || "3000",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const t = setTimeout(
      () => reject(new Error("gateway start timeout")),
      90_000,
    );
    child.stdout!.on(
      "data",
      (b) =>
        String(b).includes(`READY ${port}`) &&
        (clearTimeout(t), (gws[name] = child), resolve()),
    );
  });
}
const kill = (name: string) =>
  new Promise<void>((r) => {
    const c = gws[name];
    if (!c || c.exitCode != null) return r();
    c.once("exit", () => r());
    c.kill("SIGKILL");
    gws[name] = undefined;
  });

const mint = (expiresIn: string | number) =>
  jwt.sign(
    {
      userId: USER,
      tenantId: TENANT,
      tenantRole: "employee",
      dbName: "hrms-it-acme",
    },
    process.env.ACCESS_JWT_TOKEN!,
    { algorithm: "HS256", expiresIn: expiresIn as any },
  );

async function setStatus(s: string) {
  await prisma.$runCommandRaw({
    update: "users",
    updates: [{ q: { _id: oid(USER) }, u: { $set: { employeeStatus: s } } }],
  });
}

async function main() {
  for (const c of ["tenants", "users", "tenant_memberships"])
    await prisma.$runCommandRaw({ delete: c, deletes: [{ q: {}, limit: 0 }] });
  await prisma.$runCommandRaw({
    insert: "tenants",
    documents: [
      {
        _id: oid(TENANT),
        name: "IT Browser",
        slug: "it-browser",
        dbName: "hrms-it-acme",
        isActive: true,
      },
    ],
  });
  await prisma.$runCommandRaw({
    insert: "users",
    documents: [
      {
        _id: oid(USER),
        username: "it-browser",
        email: "browser@example.test",
        tenantId: oid(TENANT),
        employeeStatus: "Active",
        isSuperUser: false,
        permissions: [],
        role: [],
      },
    ],
  });
  await prisma.$runCommandRaw({
    insert: "tenant_memberships",
    documents: [
      {
        _id: oid("7d3000000000000000000001"),
        tenantId: oid(TENANT),
        userId: oid(USER),
        role: "employee",
      },
    ],
  });
  await start("A");
  await start("B");

  http
    .createServer((req, res) => {
      const f = path.join(
        bundleDir,
        (req.url || "/").split("?")[0] === "/"
          ? "index.html"
          : path.basename(req.url!.split("?")[0]),
      );
      try {
        const body = readFileSync(f);
        res.writeHead(200, {
          "content-type": f.endsWith(".js") ? "text/javascript" : "text/html",
        });
        res.end(body);
      } catch {
        res.writeHead(404).end();
      }
    })
    .listen(47399, "127.0.0.1");

  http
    .createServer(async (req, res) => {
      const u = new URL(req.url!, "http://x");
      const p = u.pathname.split("/").filter(Boolean);
      try {
        let out: unknown = { ok: true };
        if (p[0] === "token")
          out = { token: mint(u.searchParams.get("exp") || "1h"), user: USER };
        else if (p[0] === "status") await setStatus(p[1]);
        else if (p[0] === "kill") await kill(p[1]);
        else if (p[0] === "start") await start(p[1]);
        else if (p[0] === "mongo") {
          if (p[1] === "pause") pauseContainer("praesto-it-mongo");
          else unpauseContainer("praesto-it-mongo");
        } else if (p[0] === "push")
          out = await (
            await fetch(`http://127.0.0.1:${PORTS[p[1]]}/push/${USER}`, {
              method: "POST",
            })
          ).json();
        else if (p[0] === "sockets") {
          // Server-side truth: live socket ids registered for the user (Redis).
          const Redis = (await import("ioredis")).default;
          const r = new Redis(process.env.REDIS_URL!);
          out = {
            entry: await r.hget("user:sockets", USER),
            registryEntries: await r.hlen("user:sockets"),
          };
          await r.quit();
        }
        res
          .writeHead(200, {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
          })
          .end(JSON.stringify(out));
      } catch (e: any) {
        res
          .writeHead(500, { "access-control-allow-origin": "*" })
          .end(String(e?.message || e));
      }
    })
    .listen(47398, "127.0.0.1", () => console.log("STACK READY"));
}

main().catch((e) => (console.error(e), process.exit(1)));
process.on(
  "SIGTERM",
  async () => (await Promise.all(Object.keys(gws).map(kill)), process.exit(0)),
);
