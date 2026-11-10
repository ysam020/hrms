// Shared recording harness for the /product-demo videos.
//
// The real Praesto web app (a local dev build) runs in Chromium; every /api
// call is answered in the browser by the marketing library's fictional
// "Halcyon Labs" fixtures (~/Downloads/marketing/tools/fixtures.mjs). No
// request reaches a backend or a database, so recording can't read or
// change anyone's real data, send a notification or run a payroll.
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";

export const MARKETING_TOOLS =
  process.env.MARKETING_TOOLS ||
  path.join(homedir(), "Downloads/marketing/tools");
const req = createRequire(path.join(MARKETING_TOOLS, "package.json"));
export const { chromium } = req("playwright");
const { buildFixtures, morningZone } = await import(
  path.join(MARKETING_TOOLS, "fixtures.mjs")
);

export const BASE = process.env.PRAESTO_URL || "https://localhost:5199";

/** 1440×810 CSS px at 4/3 = 1920×1080 frames: 1080p, UI at a readable size. */
export const VIEWPORT = { width: 1440, height: 810 };
export const SCALE = 4 / 3;

/**
 * Fixtures that behave like the server: lists filter by their `status` and
 * `search` parameters, and approving or rejecting a request changes it, so
 * the list the app re-fetches afterwards shows the new status. Built fresh
 * for every context, so one video's changes never leak into the next.
 */
function liveFixtures(fixtures) {
  const data = (p) =>
    structuredClone(fixtures.find(([re]) => re.test(p))[1].data);
  const kyc = data("/view-all-kycs");
  const assets = data("/assets").assets;
  const wfh = data("/wfh/requests").requests;
  const leave = data("/get-leave-applications");
  const users = data("/get-all-users");
  const resignations = data("/view-resignations");
  const runs = data("/payroll/runs").runs;
  const events = data("/get-calendar-events");
  const param = (url, k) => (url.searchParams.get(k) || "").toLowerCase();
  const is = (v, want) =>
    !want ||
    want === "all" ||
    String(v ?? "")
      .toLowerCase()
      .replace(/_/g, " ") === want.replace(/_/g, " ");
  const finds = (u, q) =>
    !q ||
    [
      u.first_name,
      u.last_name,
      u.firstName,
      u.lastName,
      u.username,
      u.email,
      u.employee?.first_name,
      u.employee?.last_name,
    ]
      .join(" ")
      .toLowerCase()
      .includes(q);
  const body = (req) => {
    try {
      return JSON.parse(req.postData() || "{}");
    } catch {
      return {};
    }
  };
  const decided = (action) =>
    /reject/i.test(action)
      ? "Rejected"
      : /cancel|withdraw/i.test(action)
        ? "Cancelled"
        : "Approved";
  return [
    [
      /^\/view-all-kycs/,
      (url) => {
        const list = kyc.kycs.filter(
          (k) =>
            is(k.kyc_approval, param(url, "status")) &&
            finds(k, param(url, "search")),
        );
        return {
          success: true,
          data: {
            ...kyc,
            kycs: list,
            pagination: {
              ...kyc.pagination,
              total: list.length,
              totalPages: 1,
            },
          },
        };
      },
    ],
    [
      /^\/assets$/,
      (url) => ({
        success: true,
        data: {
          assets: assets.filter(
            (a) =>
              is(a.status, param(url, "status")) &&
              (!param(url, "search") ||
                a.name.toLowerCase().includes(param(url, "search"))),
          ),
        },
      }),
      "GET",
    ],
    [
      /^\/wfh\/requests\/status$/,
      (url, req) => {
        const { requestId, action } = body(req);
        const r = wfh.find((x) => x.id === requestId);
        if (r) r.status = decided(action);
        return { success: true, message: "Request updated." };
      },
    ],
    [
      /^\/wfh\/requests$/,
      (url) => ({
        success: true,
        data: {
          requests: wfh.filter((r) => is(r.status, param(url, "status"))),
        },
      }),
      "GET",
    ],
    [
      /^\/update-leave-status$/,
      (url, req) => {
        const { leaveId, action } = body(req);
        const r = leave.records.find((x) => x.id === leaveId);
        if (r) r.status = decided(action);
        return { success: true, message: "Leave updated." };
      },
    ],
    [
      /^\/get-leave-applications/,
      (url) => {
        const list = leave.records.filter(
          (r) =>
            is(r.status, param(url, "status")) &&
            finds(r, param(url, "search")),
        );
        return {
          success: true,
          data: {
            ...leave,
            records: list,
            pagination: { ...(leave.pagination || {}), total: list.length },
          },
        };
      },
    ],
    [
      /^\/get-all-users/,
      (url) => ({
        success: true,
        data: users.filter((u) => finds(u, param(url, "search"))),
      }),
    ],
    [
      /^\/view-resignations/,
      (url) => ({
        success: true,
        data: resignations.filter((r) => is(r.status, param(url, "status"))),
      }),
    ],
    [
      /^\/add-event$/,
      (url, req) => {
        events.push({ _id: `e${events.length + 1}`, ...body(req) });
        return { success: true, message: "Event added." };
      },
    ],
    [/^\/get-calendar-events/, () => ({ success: true, data: events })],
    [
      /^\/payroll\/runs$/,
      (url) => ({
        success: true,
        data: { runs: runs.filter((r) => is(r.status, param(url, "status"))) },
      }),
      "GET",
    ],
  ];
}

/**
 * Stands in for the Socket.IO server: the handshake, keep-alive pings, and
 * chat. A message sent with chat:send comes back as chat:message, as the
 * real server broadcasts it, so it appears in the conversation.
 */
async function socketStandIn(context) {
  await context.routeWebSocket(/\/socket\.io\//, (ws) => {
    ws.send(
      "0" +
        JSON.stringify({
          sid: "demo",
          upgrades: [],
          pingInterval: 20000,
          pingTimeout: 60000,
          maxPayload: 1e6,
        }),
    );
    const ping = setInterval(() => {
      try {
        ws.send("2");
      } catch {
        clearInterval(ping);
      }
    }, 20000);
    ws.onClose(() => clearInterval(ping));
    ws.onMessage((raw) => {
      const m = String(raw);
      if (m.startsWith("40"))
        return ws.send("40" + JSON.stringify({ sid: "demo-ns" }));
      if (!m.startsWith("42")) return;
      let ev, data;
      try {
        [ev, data] = JSON.parse(m.slice(2).replace(/^\d+/, ""));
      } catch {
        return;
      }
      if (ev === "chat:send" && data?.roomId)
        ws.send(
          "42" +
            JSON.stringify([
              "chat:message",
              {
                _id: `m${Date.now()}`,
                chatRoom: data.roomId,
                senderId: "u1",
                content: data.content,
                type: data.type || "text",
                fileUrl: data.fileUrl,
                fileName: data.fileName,
                replyTo: data.replyTo,
                createdAt: new Date().toISOString(),
                readBy: [],
              },
            ]),
        );
    });
  });
}

export async function demoContext(browser, extra = []) {
  const { zone, offMin } = morningZone();
  process.env.TZ = zone;
  const { fixtures } = buildFixtures(new Date(), offMin);
  const live = liveFixtures(fixtures);
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    serviceWorkers: "block",
    ignoreHTTPSErrors: true, // the local dev server's self-signed certificate
    // As for a visitor who has allowed notifications (headless otherwise
    // reports them as blocked).
    permissions: ["notifications"],
    colorScheme: "light",
    locale: "en-IN",
    timezoneId: zone,
    reducedMotion: "no-preference",
  });
  const posted = [];
  await context.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname.replace(/^\/api\/v1/, "");
    const method = route.request().method();
    if (method !== "GET") posted.push(`${method} ${p}`);
    const hit = [...extra, ...live, ...fixtures].find(
      ([re, , m]) => re.test(p) && (!m || m === method),
    );
    let body = hit ? hit[1] : { success: true, data: [] };
    if (typeof body === "function") body = await body(url, route.request());
    const status = body && body.__status ? body.__status : 200;
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  // Anything else that would leave the machine (sockets, push, analytics).
  // Long-polling isn't used (the client tries WebSocket first, below).
  await context.route("**/socket.io/**", (r) => r.abort());
  await socketStandIn(context);
  await context.route(
    (u) =>
      /googletagmanager|google-analytics|firebaseio|googleapis|fcmregistrations/.test(
        u.hostname,
      ),
    (r) => r.abort(),
  );
  await context.addInitScript(() => {
    try {
      localStorage.setItem("px-appearance", "light");
    } catch {}
    // Headless Chromium reports notifications as denied even when allowed.
    try {
      Object.defineProperty(Notification, "permission", {
        get: () => "granted",
      });
    } catch {}
  });
  context.posted = posted;
  return context;
}

/** Wait until the page has settled: no skeletons, fonts loaded. */
export async function settle(page, ms = 900) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page
    .waitForFunction(
      () => !document.querySelector('[aria-busy="true"], [data-skeleton]'),
      null,
      { timeout: 6000 },
    )
    .catch(() => {});
  await page.waitForTimeout(ms);
}
