// Tenant support handlers against an in-memory master DB (supportFakeDb):
// tenant isolation, authorization, lifecycle, internal-note privacy,
// attachments, duplicate submissions and notifications.
jest.mock("@hrms/db", () => ({
  prisma: require("./supportFakeDb").fakeDb,
}));
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock("@hrms/notifications", () => ({
  notify: jest.fn().mockResolvedValue({ notificationId: "n1", jobIds: {} }),
}));
jest.mock("../services/supportFiles", () => ({
  ...jest.requireActual("../services/supportFiles"),
  presignUpload: jest.fn().mockResolvedValue("https://s3.example/put"),
  presignDownload: jest.fn().mockResolvedValue("https://s3.example/get"),
  inspectUpload: jest.fn(),
  deleteUpload: jest.fn().mockResolvedValue(undefined),
}));

import { notify } from "@hrms/notifications";
import { logger } from "@hrms/logger";
import * as files from "../services/supportFiles";
import * as h from "../handlers/support";
import * as p from "../handlers/platformSupport";
import { requireSupportAgent } from "../middleware/requireSupportAgent";
import { SUPPORT_PERMISSION } from "../services/supportStore";
import { resetFakeDb, table } from "./supportFakeDb";

const id = (n: number) => n.toString(16).padStart(24, "a");
const TENANT_A = id(1);
const TENANT_B = id(2);
const TENANT_PRAESTO = id(3);
const U = {
  aOwner: id(10),
  aAdmin: id(11),
  aHr: id(12),
  aEmployee: id(13),
  aViewer: id(14), // employee with Support:view_org_tickets
  bOwner: id(20),
  agent: id(30), // Praesto employee with PraestoSupport:handle_tickets
  agent2: id(31), // Praesto admin (role alone grants access)
  pPlain: id(32), // Praesto employee without the permission
  pLeaver: id(33), // has the permission, but Terminated
};

const user = (uid: string, tenantId: string, extra: object = {}) => ({
  id: uid,
  tenantId,
  username: `user_${uid.slice(-4)}`,
  email: `${uid.slice(-4)}@example.com`,
  first_name: `First${uid.slice(-2)}`,
  last_name: "Last",
  isSuperUser: false,
  permissions: [],
  employeeStatus: "Active",
  ...extra,
});

function seed() {
  resetFakeDb({
    tenant: [
      {
        id: TENANT_A,
        name: "Acme",
        slug: "acme",
        planTier: "starter",
        subscriptionStatus: "active",
        isActive: true,
        createdAt: new Date(),
      },
      {
        id: TENANT_B,
        name: "Beta",
        slug: "beta",
        planTier: "growth",
        subscriptionStatus: "expired",
        isActive: true,
        createdAt: new Date(),
      },
    ],
    user: [
      user(U.aOwner, TENANT_A),
      user(U.aAdmin, TENANT_A),
      user(U.aHr, TENANT_A),
      user(U.aEmployee, TENANT_A),
      user(U.aViewer, TENANT_A, { permissions: ["Support:view_org_tickets"] }),
      user(U.bOwner, TENANT_B),
      user(U.agent, TENANT_PRAESTO, { permissions: [SUPPORT_PERMISSION] }),
      user(U.agent2, TENANT_PRAESTO),
      user(U.pPlain, TENANT_PRAESTO),
      user(U.pLeaver, TENANT_PRAESTO, {
        permissions: [SUPPORT_PERMISSION],
        employeeStatus: "Terminated",
      }),
      // An owner + superuser of a customer org who also holds the permission
      // string — still not Praesto.
      user(id(21), TENANT_B, {
        isSuperUser: true,
        permissions: ["*:*:*", SUPPORT_PERMISSION],
      }),
    ],
    tenantMembership: [
      {
        id: id(50),
        tenantId: TENANT_PRAESTO,
        userId: U.agent,
        role: "employee",
      },
      { id: id(51), tenantId: TENANT_PRAESTO, userId: U.agent2, role: "admin" },
      {
        id: id(52),
        tenantId: TENANT_PRAESTO,
        userId: U.pPlain,
        role: "employee",
      },
      {
        id: id(53),
        tenantId: TENANT_PRAESTO,
        userId: U.pLeaver,
        role: "employee",
      },
      { id: id(54), tenantId: TENANT_B, userId: id(21), role: "owner" },
    ],
  });
}

const ROLES: Record<string, [string, string]> = {
  [U.aOwner]: [TENANT_A, "owner"],
  [U.aAdmin]: [TENANT_A, "admin"],
  [U.aHr]: [TENANT_A, "hr"],
  [U.aEmployee]: [TENANT_A, "employee"],
  [U.aViewer]: [TENANT_A, "employee"],
  [U.bOwner]: [TENANT_B, "owner"],
  [U.agent]: [TENANT_PRAESTO, "employee"],
  [U.agent2]: [TENANT_PRAESTO, "admin"],
  [U.pPlain]: [TENANT_PRAESTO, "employee"],
  [U.pLeaver]: [TENANT_PRAESTO, "employee"],
  [id(21)]: [TENANT_B, "owner"],
};

const req = (uid: string, extra: Record<string, any> = {}) =>
  ({
    user: { userId: uid, tenantId: ROLES[uid][0], tenantRole: ROLES[uid][1] },
    body: {},
    query: {},
    params: {},
    ...extra,
  }) as any;

function res() {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.json = jest.fn((body) => {
    r.body = body;
    return r;
  });
  return r;
}
const statusOf = (r: any) => r.status.mock.calls[0][0];
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const NEW_TICKET = {
  category: "bug_report",
  subject: "Payroll export fails",
  description: "Clicking export shows a blank page.",
  priority: "normal",
  attachmentIds: [] as string[],
};

async function createTicket(uid: string, body: Record<string, any> = {}) {
  const r = res();
  await h.createSupportTicket(
    req(uid, { body: { ...NEW_TICKET, ...body } }),
    r,
  );
  return r;
}

async function getTicket(uid: string, ticketId: string) {
  const r = res();
  await h.getSupportTicket(req(uid, { params: { ticketId } }), r);
  return r;
}

async function agentReply(ticketId: string, body: Record<string, any>) {
  const ticket = table("supportTicket").find((t) => t.id === ticketId)!;
  const r = res();
  await p.replyAsAgent(
    req(U.agent, {
      params: { ticketId },
      body: { attachmentIds: [], version: ticket.version, ...body },
    }),
    r,
  );
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.PLATFORM_TENANT_ID = TENANT_PRAESTO;
  seed();
});

// ── Authorization ───────────────────────────────────────────────────────────

describe("raising tickets", () => {
  it("lets owners/admins/HR raise tickets but not ordinary employees", async () => {
    expect(statusOf(await createTicket(U.aOwner))).toBe(201);
    expect(
      statusOf(await createTicket(U.aHr, { subject: "Another issue" })),
    ).toBe(201);
    expect(
      statusOf(await createTicket(U.aEmployee, { subject: "Third one" })),
    ).toBe(403);
  });

  it("takes the tenant from the token, never from the payload", async () => {
    const r = await createTicket(U.aOwner, {
      tenantId: TENANT_B,
      reporterId: U.bOwner,
    });
    expect(statusOf(r)).toBe(201);
    const [ticket] = table("supportTicket");
    expect(ticket.tenantId).toBe(TENANT_A);
    expect(ticket.reporterId).toBe(U.aOwner);
  });

  it("issues PRA-<year>-<6 digit> numbers and starts urgent requests at high", async () => {
    const r = await createTicket(U.aOwner, { priority: "urgent" });
    expect(r.body.data.ticketNo).toMatch(/^PRA-\d{4}-\d{6}$/);
    expect(r.body.data.requestedPriority).toBe("urgent");
    expect(r.body.data.priority).toBe("high");
  });

  it("records a public 'created' activity", async () => {
    await createTicket(U.aOwner);
    expect(table("supportActivity")).toEqual([
      expect.objectContaining({
        type: "created",
        visibility: "public",
        actorId: U.aOwner,
      }),
    ]);
  });

  it("returns the existing ticket for a repeated identical submission", async () => {
    const first = await createTicket(U.aOwner);
    const second = await createTicket(U.aOwner);
    expect(statusOf(second)).toBe(200);
    expect(second.body.data.duplicate).toBe(true);
    expect(second.body.data.ticketNo).toBe(first.body.data.ticketNo);
    expect(table("supportTicket")).toHaveLength(1);
  });
});

describe("tenant isolation", () => {
  let ticketId: string;
  beforeEach(async () => {
    ticketId = (await createTicket(U.aOwner)).body.data.id;
  });

  it("hides tenant A's ticket from tenant B (404, not 403)", async () => {
    expect(statusOf(await getTicket(U.bOwner, ticketId))).toBe(404);
  });

  it("refuses tenant B's replies, reopen and close on tenant A's ticket", async () => {
    const r1 = res();
    await h.replyToSupportTicket(
      req(U.bOwner, {
        params: { ticketId },
        body: { body: "hi", attachmentIds: [] },
      }),
      r1,
    );
    const r2 = res();
    await h.reopenSupportTicket(
      req(U.bOwner, { params: { ticketId }, body: { body: "x" } }),
      r2,
    );
    const r3 = res();
    await h.closeSupportTicket(req(U.bOwner, { params: { ticketId } }), r3);
    expect([statusOf(r1), statusOf(r2), statusOf(r3)]).toEqual([404, 404, 404]);
    expect(table("supportMessage")).toHaveLength(0);
  });

  it("never lists another tenant's tickets, even in organisation scope", async () => {
    const r = res();
    await h.listSupportTickets(req(U.bOwner, { query: { scope: "org" } }), r);
    expect(r.body.data.total).toBe(0);
  });

  it("refuses another tenant's attachments", async () => {
    table("supportAttachment").push({
      id: id(500),
      ticketId,
      tenantId: TENANT_A,
      uploaderId: U.aOwner,
      uploaderType: "tenant",
      storageKey: "support/a/x.png",
      fileName: "x.png",
      contentType: "image/png",
      size: 10,
      visibility: "public",
      status: "attached",
      createdAt: new Date(),
    });
    const r = res();
    await h.getSupportAttachmentUrl(
      req(U.bOwner, { params: { attachmentId: id(500) } }),
      r,
    );
    expect(statusOf(r)).toBe(404);
    const ok = res();
    await h.getSupportAttachmentUrl(
      req(U.aOwner, { params: { attachmentId: id(500) } }),
      ok,
    );
    expect(statusOf(ok)).toBe(200);
  });

  it("won't attach an upload that belongs to someone else", async () => {
    table("supportAttachment").push({
      id: id(501),
      ticketId: null,
      tenantId: TENANT_B,
      uploaderId: U.bOwner,
      uploaderType: "tenant",
      storageKey: "support/b/y.png",
      fileName: "y.png",
      contentType: "image/png",
      size: 10,
      visibility: "public",
      status: "ready",
      createdAt: new Date(),
    });
    const r = await createTicket(U.aOwner, {
      subject: "With file",
      attachmentIds: [id(501)],
    });
    expect(statusOf(r)).toBe(400);
    // The whole creation rolled back.
    expect(table("supportTicket")).toHaveLength(1);
    expect(
      table("supportAttachment").find((a) => a.id === id(501))!.status,
    ).toBe("ready");
  });

  it("treats malformed ids as not found", async () => {
    expect(statusOf(await getTicket(U.aOwner, "not-an-id"))).toBe(404);
  });
});

describe("visibility inside an organisation", () => {
  let hrTicket: string;
  let securityTicket: string;
  beforeEach(async () => {
    hrTicket = (await createTicket(U.aHr)).body.data.id;
    securityTicket = (
      await createTicket(U.aHr, {
        category: "security",
        subject: "Possible XSS in chat",
      })
    ).body.data.id;
  });

  const list = async (uid: string, scope: string) => {
    const r = res();
    await h.listSupportTickets(req(uid, { query: { scope } }), r);
    return r;
  };

  it("restricts organisation scope to permitted users", async () => {
    expect(statusOf(await list(U.aEmployee, "org"))).toBe(403);
    expect((await list(U.aEmployee, "mine")).body.data.total).toBe(0);
    expect(statusOf(await getTicket(U.aEmployee, hrTicket))).toBe(404);
  });

  it("shows an admin the organisation's tickets but not someone else's security report", async () => {
    const r = await list(U.aAdmin, "org");
    expect(r.body.data.tickets.map((t: any) => t.id)).toEqual([hrTicket]);
    expect(statusOf(await getTicket(U.aAdmin, securityTicket))).toBe(404);
  });

  it("shows the owner every ticket including security reports", async () => {
    const r = await list(U.aOwner, "org");
    expect(r.body.data.total).toBe(2);
    expect(statusOf(await getTicket(U.aOwner, securityTicket))).toBe(200);
  });

  it("honours Support:view_org_tickets for non-admins", async () => {
    const r = await list(U.aViewer, "org");
    expect(r.body.data.tickets.map((t: any) => t.id)).toEqual([hrTicket]);
  });

  it("separates my tickets from organisation tickets", async () => {
    const mine = await list(U.aHr, "mine");
    expect(mine.body.data.total).toBe(2);
    expect(mine.body.data.tickets.every((t: any) => t.isMine)).toBe(true);
  });

  it("counts stats within the chosen scope", async () => {
    const r = res();
    await h.getSupportStats(req(U.aAdmin, { query: { scope: "org" } }), r);
    expect(r.body.data).toEqual({
      total: 1,
      open: 1,
      awaitingYou: 0,
      resolved: 0,
    });
  });

  it("ignores a superuser flag from a different organisation's user record", async () => {
    table("user").find((u) => u.id === U.aEmployee)!.isSuperUser = true;
    table("user").find((u) => u.id === U.aEmployee)!.tenantId = TENANT_B;
    expect(statusOf(await list(U.aEmployee, "org"))).toBe(403);
  });
});

describe("filters and pagination", () => {
  beforeEach(async () => {
    for (let i = 0; i < 5; i++) {
      await createTicket(U.aOwner, {
        subject: `Issue number ${i}`,
        category: i % 2 ? "billing" : "bug_report",
      });
    }
  });

  it("paginates server-side and filters by category and search", async () => {
    const page2 = res();
    await h.listSupportTickets(
      req(U.aOwner, { query: { page: "2", limit: "2" } }),
      page2,
    );
    expect(page2.body.data.total).toBe(5);
    expect(page2.body.data.tickets).toHaveLength(2);

    const billing = res();
    await h.listSupportTickets(
      req(U.aOwner, { query: { category: "billing" } }),
      billing,
    );
    expect(billing.body.data.total).toBe(2);

    const search = res();
    await h.listSupportTickets(
      req(U.aOwner, { query: { search: "number 3" } }),
      search,
    );
    expect(search.body.data.total).toBe(1);
  });

  it("rejects unknown filter values", async () => {
    const r = res();
    await h.listSupportTickets(
      req(U.aOwner, { query: { status: "deleted" } }),
      r,
    );
    expect(statusOf(r)).toBe(400);
  });
});

// ── Conversation & internal notes ───────────────────────────────────────────

describe("internal notes", () => {
  let ticketId: string;
  beforeEach(async () => {
    ticketId = (await createTicket(U.aOwner)).body.data.id;
    await agentReply(ticketId, {
      body: "Looks like a renderer bug",
      visibility: "internal",
    });
    await agentReply(ticketId, {
      body: "Can you share a screenshot?",
      visibility: "public",
    });
  });

  it("never returns internal notes or internal activity to the tenant", async () => {
    const r = await getTicket(U.aOwner, ticketId);
    const payload = JSON.stringify(r.body);
    expect(payload).not.toContain("renderer bug");
    expect(r.body.data.messages.map((m: any) => m.body)).toEqual([
      "Can you share a screenshot?",
    ]);
    expect(
      r.body.data.activities.some((a: any) => a.type === "note_added"),
    ).toBe(false);
    // Allow-listed ticket fields only.
    expect(r.body.data.ticket).not.toHaveProperty("assigneeId");
    expect(r.body.data.ticket).not.toHaveProperty("version");
  });

  it("shows agents both, labelled by visibility", async () => {
    const r = res();
    await p.getPlatformSupportTicket(req(U.agent, { params: { ticketId } }), r);
    expect(r.body.data.messages.map((m: any) => m.visibility)).toEqual([
      "internal",
      "public",
    ]);
  });

  it("keeps internal-note attachments away from the tenant", async () => {
    table("supportAttachment").push({
      id: id(600),
      ticketId,
      tenantId: TENANT_A,
      uploaderId: U.agent,
      uploaderType: "staff",
      storageKey: "support/staff/z.png",
      fileName: "z.png",
      contentType: "image/png",
      size: 10,
      visibility: "internal",
      status: "attached",
      createdAt: new Date(),
    });
    const r = res();
    await h.getSupportAttachmentUrl(
      req(U.aOwner, { params: { attachmentId: id(600) } }),
      r,
    );
    expect(statusOf(r)).toBe(404);
    const detail = await getTicket(U.aOwner, ticketId);
    expect(detail.body.data.attachments).toEqual([]);
  });

  it("does not let a tenant user post an internal note", async () => {
    const r = res();
    await h.replyToSupportTicket(
      req(U.aOwner, {
        params: { ticketId },
        body: { body: "x", visibility: "internal", attachmentIds: [] },
      }),
      r,
    );
    expect(statusOf(r)).toBe(201);
    expect(table("supportMessage").at(-1)!.visibility).toBe("public");
  });
});

// ── Lifecycle ───────────────────────────────────────────────────────────────

describe("lifecycle", () => {
  let ticketId: string;
  const ticket = () => table("supportTicket").find((t) => t.id === ticketId)!;
  beforeEach(async () => {
    ticketId = (await createTicket(U.aOwner)).body.data.id;
  });

  it("moves to Waiting for Tenant on an agent reply and back on the tenant's reply", async () => {
    expect(
      statusOf(
        await agentReply(ticketId, {
          body: "Need more info",
          visibility: "public",
        }),
      ),
    ).toBe(201);
    expect(ticket().status).toBe("waiting_for_tenant");
    expect(ticket().firstResponseAt).toBeInstanceOf(Date);

    const r = res();
    await h.replyToSupportTicket(
      req(U.aOwner, {
        params: { ticketId },
        body: { body: "Here it is", attachmentIds: [] },
      }),
      r,
    );
    expect(ticket().status).toBe("in_progress");
    expect(
      table("supportActivity")
        .filter((a) => a.type === "status_changed")
        .map((a) => [a.fromValue, a.toValue]),
    ).toEqual([
      ["open", "waiting_for_tenant"],
      ["waiting_for_tenant", "in_progress"],
    ]);
  });

  it("leaves status alone for internal notes", async () => {
    await agentReply(ticketId, { body: "note", visibility: "internal" });
    expect(ticket().status).toBe("open");
    expect(ticket().firstResponseAt).toBeNull();
  });

  it("enforces staff transitions on the server", async () => {
    const bad = res();
    ticket().status = "closed";
    await p.updateTicketAsAgent(
      req(U.agent, {
        params: { ticketId },
        body: { status: "in_progress", version: ticket().version },
      }),
      bad,
    );
    expect(statusOf(bad)).toBe(400);

    ticket().status = "open";
    const good = res();
    await p.updateTicketAsAgent(
      req(U.agent, {
        params: { ticketId },
        body: { status: "resolved", version: ticket().version },
      }),
      good,
    );
    expect(statusOf(good)).toBe(200);
    expect(ticket().resolvedAt).toBeInstanceOf(Date);
  });

  it("rejects a stale version instead of overwriting (409)", async () => {
    const stale = ticket().version;
    const first = res();
    await p.updateTicketAsAgent(
      req(U.agent, {
        params: { ticketId },
        body: { priority: "low", version: stale },
      }),
      first,
    );
    const second = res();
    await p.updateTicketAsAgent(
      req(U.agent2, {
        params: { ticketId },
        body: { priority: "urgent", version: stale },
      }),
      second,
    );
    expect(statusOf(first)).toBe(200);
    expect(statusOf(second)).toBe(409);
    expect(ticket().priority).toBe("low");
  });

  it("lets the tenant reopen a recently resolved ticket, not an old or open one", async () => {
    const reopen = async () => {
      const r = res();
      await h.reopenSupportTicket(
        req(U.aOwner, { params: { ticketId }, body: { body: "Still broken" } }),
        r,
      );
      return r;
    };
    expect(statusOf(await reopen())).toBe(400); // open

    Object.assign(ticket(), {
      status: "resolved",
      resolvedAt: new Date(Date.now() - 40 * 86400000),
    });
    expect(statusOf(await reopen())).toBe(400); // past the window

    Object.assign(ticket(), { resolvedAt: new Date() });
    expect(statusOf(await reopen())).toBe(200);
    expect(ticket()).toMatchObject({
      status: "in_progress",
      reopenCount: 1,
      resolvedAt: null,
    });
    expect(table("supportActivity").some((a) => a.type === "reopened")).toBe(
      true,
    );
  });

  it("refuses tenant replies on closed tickets", async () => {
    ticket().status = "closed";
    const r = res();
    await h.replyToSupportTicket(
      req(U.aOwner, {
        params: { ticketId },
        body: { body: "hello", attachmentIds: [] },
      }),
      r,
    );
    expect(statusOf(r)).toBe(400);
  });

  it("assigns only to support agents and logs assignment internally", async () => {
    const notAgent = res();
    await p.updateTicketAsAgent(
      req(U.agent, {
        params: { ticketId },
        body: { assigneeId: U.aOwner, version: ticket().version },
      }),
      notAgent,
    );
    expect(statusOf(notAgent)).toBe(400);

    const ok = res();
    await p.updateTicketAsAgent(
      req(U.agent, {
        params: { ticketId },
        body: { assigneeId: U.agent2, version: ticket().version },
      }),
      ok,
    );
    expect(ticket().assigneeId).toBe(U.agent2);
    const assigned = table("supportActivity").find(
      (a) => a.type === "assigned",
    )!;
    expect(assigned.visibility).toBe("internal");
    const tenantView = await getTicket(U.aOwner, ticketId);
    expect(
      tenantView.body.data.activities.some((a: any) => a.type === "assigned"),
    ).toBe(false);
  });

  it("records priority changes publicly", async () => {
    const r = res();
    await p.updateTicketAsAgent(
      req(U.agent, {
        params: { ticketId },
        body: { priority: "urgent", version: ticket().version },
      }),
      r,
    );
    expect(
      table("supportActivity").find((a) => a.type === "priority_changed"),
    ).toMatchObject({
      fromValue: "normal",
      toValue: "urgent",
      visibility: "public",
    });
  });

  it("closes duplicates only against the same organisation's tickets", async () => {
    const other = (await createTicket(U.bOwner)).body.data;
    const cross = res();
    await p.markDuplicate(
      req(U.agent, {
        params: { ticketId },
        body: {
          duplicateOfTicketNo: other.ticketNo,
          version: ticket().version,
        },
      }),
      cross,
    );
    expect(statusOf(cross)).toBe(400);

    const sibling = (
      await createTicket(U.aOwner, { subject: "Same issue again" })
    ).body.data;
    const ok = res();
    await p.markDuplicate(
      req(U.agent, {
        params: { ticketId },
        body: {
          duplicateOfTicketNo: sibling.ticketNo,
          version: ticket().version,
        },
      }),
      ok,
    );
    expect(statusOf(ok)).toBe(200);
    expect(ticket()).toMatchObject({
      status: "closed",
      duplicateOfId: sibling.id,
    });
  });
});

// ── Platform access ─────────────────────────────────────────────────────────

describe("platform access", () => {
  it("refuses a tenant owner and an unauthenticated request, admits an agent", async () => {
    const next = jest.fn();
    const owner = res();
    await requireSupportAgent(req(U.aOwner), owner, next);
    expect(statusOf(owner)).toBe(403);

    const anon = res();
    await requireSupportAgent(
      { ...req(U.aOwner), user: undefined },
      anon,
      next,
    );
    expect(statusOf(anon)).toBe(401);
    expect(next).not.toHaveBeenCalled();

    await requireSupportAgent(req(U.agent), res(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  const allowed = async (uid: string, tenantId?: string) => {
    const r = res();
    const next = jest.fn();
    const request = req(uid);
    if (tenantId) request.user.tenantId = tenantId;
    await requireSupportAgent(request, r, next);
    return next.mock.calls.length === 1;
  };

  it("derives access from Praesto's own organisation", async () => {
    expect(await allowed(U.agent)).toBe(true); // permission
    expect(await allowed(U.agent2)).toBe(true); // Praesto admin
    expect(await allowed(U.pPlain)).toBe(false); // Praesto, no permission
    expect(await allowed(U.pLeaver)).toBe(false); // former employee
  });

  it("never grants access from another organisation, even with the permission string", async () => {
    expect(await allowed(id(21))).toBe(false);
    // A Praesto user acting in another org's session doesn't carry it over.
    expect(await allowed(U.agent, TENANT_A)).toBe(false);
  });

  it("revokes access as soon as the permission is removed", async () => {
    table("user").find((u) => u.id === U.agent)!.permissions = [];
    expect(await allowed(U.agent)).toBe(false);
  });

  it("is closed to everyone when PLATFORM_TENANT_ID is unset or malformed", async () => {
    delete process.env.PLATFORM_TENANT_ID;
    expect(await allowed(U.agent2)).toBe(false);
    process.env.PLATFORM_TENANT_ID = "praesto";
    expect(await allowed(U.agent2)).toBe(false);
  });

  it("offers only people with access as assignees", async () => {
    const r = res();
    await p.listSupportAgents(req(U.agent), r);
    expect(r.body.data.map((a: any) => a.id).sort()).toEqual(
      [U.agent, U.agent2].sort(),
    );
  });

  it("logs security-report views internally, once per window", async () => {
    const t = (await createTicket(U.aOwner, { category: "security" })).body
      .data;
    for (let i = 0; i < 2; i++) {
      await p.getPlatformSupportTicket(
        req(U.agent, { params: { ticketId: t.id } }),
        res(),
      );
    }
    const views = table("supportActivity").filter(
      (a) => a.type === "security_viewed",
    );
    expect(views).toHaveLength(1);
    expect(views[0].visibility).toBe("internal");
  });

  it("finds tickets by organisation name and reports defined metrics", async () => {
    await createTicket(U.aOwner);
    await createTicket(U.bOwner, { subject: "Beta problem" });
    const r = res();
    await p.listPlatformSupportTickets(
      req(U.agent, { query: { search: "beta" } }),
      r,
    );
    expect(r.body.data.tickets.map((t: any) => t.tenantName)).toEqual(["Beta"]);

    const stats = res();
    await p.getPlatformSupportStats(req(U.agent), stats);
    expect(stats.body.data.counts).toMatchObject({
      total: 2,
      open: 2,
      unassigned: 2,
    });
    expect(stats.body.data.metrics).toMatchObject({
      avgFirstResponseHours: null,
      firstResponseSample: 0,
    });
  });
});

// ── Attachments ─────────────────────────────────────────────────────────────

describe("attachments", () => {
  const PNG = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2,
  ]);

  async function upload(body: Record<string, any>) {
    const r = res();
    await h.createSupportUpload(req(U.aOwner, { body }), r);
    return r;
  }

  it("rejects unsupported and oversized files before issuing a URL", async () => {
    expect(
      statusOf(
        await upload({
          fileName: "x.exe",
          contentType: "application/octet-stream",
          size: 10,
        }),
      ),
    ).toBe(400);
    expect(
      statusOf(
        await upload({
          fileName: "x.svg",
          contentType: "image/svg+xml",
          size: 10,
        }),
      ),
    ).toBe(400);
    expect(
      statusOf(
        await upload({
          fileName: "x.png",
          contentType: "image/png",
          size: 11 * 1024 * 1024,
        }),
      ),
    ).toBe(400);
    expect(files.presignUpload).not.toHaveBeenCalled();
  });

  it("verifies the uploaded bytes and deletes a disguised file", async () => {
    const created = await upload({
      fileName: "shot.png",
      contentType: "image/png",
      size: 10,
    });
    expect(statusOf(created)).toBe(201);
    const attachmentId = created.body.data.attachmentId;
    expect(table("supportAttachment")[0].storageKey).toMatch(
      new RegExp(`^support/${TENANT_A}/[0-9a-f-]{36}\\.png$`),
    );

    (files.inspectUpload as jest.Mock).mockResolvedValueOnce({
      size: 10,
      head: Buffer.from("MZ\x90\x00 this is an exe"),
    });
    const bad = res();
    await h.completeSupportUpload(
      req(U.aOwner, { params: { attachmentId } }),
      bad,
    );
    expect(statusOf(bad)).toBe(400);
    expect(files.deleteUpload).toHaveBeenCalled();
    expect(table("supportAttachment")[0].status).toBe("rejected");
  });

  it("marks a genuine image ready and attaches it to a ticket", async () => {
    const created = await upload({
      fileName: "shot.png",
      contentType: "image/png",
      size: 10,
    });
    const attachmentId = created.body.data.attachmentId;
    (files.inspectUpload as jest.Mock).mockResolvedValueOnce({
      size: 10,
      head: PNG,
    });
    const done = res();
    await h.completeSupportUpload(
      req(U.aOwner, { params: { attachmentId } }),
      done,
    );
    expect(statusOf(done)).toBe(200);

    const t = await createTicket(U.aOwner, { attachmentIds: [attachmentId] });
    expect(statusOf(t)).toBe(201);
    expect(table("supportAttachment")[0]).toMatchObject({
      status: "attached",
      ticketId: t.body.data.id,
      visibility: "public",
    });
  });

  it("rejects a file whose real size differs from the declared one", async () => {
    const created = await upload({
      fileName: "shot.png",
      contentType: "image/png",
      size: 10,
    });
    (files.inspectUpload as jest.Mock).mockResolvedValueOnce({
      size: 20,
      head: PNG,
    });
    const r = res();
    await h.completeSupportUpload(
      req(U.aOwner, {
        params: { attachmentId: created.body.data.attachmentId },
      }),
      r,
    );
    expect(statusOf(r)).toBe(400);
  });
});

// ── Notifications ───────────────────────────────────────────────────────────

describe("notifications", () => {
  const notifyMock = notify as jest.Mock;
  const recipientsOf = () =>
    notifyMock.mock.calls.flatMap(([o]) => o.recipients ?? []);

  it("tells every agent about a new unassigned ticket", async () => {
    await createTicket(U.aOwner);
    await flush();
    expect(new Set(recipientsOf())).toEqual(new Set([U.agent, U.agent2]));
    const inApp = notifyMock.mock.calls.find(([o]) => o.inApp)[0];
    expect(inApp.tenantId).toBe(TENANT_PRAESTO);
    expect(inApp.push.enabled).toBe(true);
    expect(inApp.pushTargets.length).toBeGreaterThan(0);
  });

  it("notifies the reporter of a public reply but nobody in the tenant of an internal note", async () => {
    const t = (await createTicket(U.aOwner)).body.data;
    await flush();
    notifyMock.mockClear();

    await agentReply(t.id, { body: "secret triage", visibility: "internal" });
    await flush();
    expect(recipientsOf()).not.toContain(U.aOwner);
    expect(JSON.stringify(notifyMock.mock.calls)).not.toContain(
      "secret triage",
    );

    await agentReply(t.id, { body: "Please retry now", visibility: "public" });
    await flush();
    expect(recipientsOf()).toContain(U.aOwner);
    const tenantCall = notifyMock.mock.calls.find(
      ([o]) => o.tenantId === TENANT_A,
    )[0];
    expect(tenantCall.event).toBe("supportTicketReply");
  });

  it("routes a tenant reply to the assignee only", async () => {
    const t = (await createTicket(U.aOwner)).body.data;
    table("supportTicket")[0].assigneeId = U.agent2;
    await flush();
    notifyMock.mockClear();
    const r = res();
    await h.replyToSupportTicket(
      req(U.aOwner, {
        params: { ticketId: t.id },
        body: { body: "more", attachmentIds: [] },
      }),
      r,
    );
    await flush();
    expect(new Set(recipientsOf())).toEqual(new Set([U.agent2]));
  });

  it("never puts a security report's subject into notifications", async () => {
    await createTicket(U.aOwner, {
      category: "security",
      subject: "Token leak in export URL",
    });
    await flush();
    expect(JSON.stringify(notifyMock.mock.calls)).not.toContain("Token leak");
  });

  it("still creates the ticket when notification queuing fails, and logs it as failed", async () => {
    notifyMock.mockRejectedValue(new Error("redis down"));
    const r = await createTicket(U.aOwner);
    await flush();
    expect(statusOf(r)).toBe(201);
    expect(JSON.stringify(r.body)).not.toMatch(/notif/i);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("support notification"),
      expect.anything(),
    );
    notifyMock.mockResolvedValue({ notificationId: "n1", jobIds: {} });
  });
});
