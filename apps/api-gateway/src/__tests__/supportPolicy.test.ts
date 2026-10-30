jest.mock("@hrms/db", () => ({
  prisma: require("./supportFakeDb").fakeDb,
}));
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

import {
  canStaffTransition,
  canViewTicket,
  capabilitiesOf,
  reopenEligibility,
  statusAfterTenantReply,
  tenantListScope,
  tenantTicketView,
  type TenantActor,
} from "../services/supportPolicy";
import {
  sniffContentType,
  validateUploadRequest,
} from "../services/supportFiles";
import { nextTicketNo } from "../services/supportStore";
import {
  createSupportTicketSchema,
  platformSupportReplySchema,
  platformSupportUpdateSchema,
} from "../schemas";
import { fakeDb, resetFakeDb } from "./supportFakeDb";

const actor = (over: Partial<TenantActor> = {}): TenantActor => ({
  userId: "u1",
  tenantId: "t1",
  tenantRole: "employee",
  isSuperUser: false,
  permissions: [],
  ...over,
});
const ticket = {
  tenantId: "t1",
  reporterId: "u2",
  category: "bug_report",
  participantIds: [],
};

describe("capabilities", () => {
  it.each([
    ["owner", { canRaise: true, canViewOrg: true, canViewSecurity: true }],
    ["admin", { canRaise: true, canViewOrg: true, canViewSecurity: false }],
    ["hr", { canRaise: true, canViewOrg: false, canViewSecurity: false }],
    [
      "employee",
      { canRaise: false, canViewOrg: false, canViewSecurity: false },
    ],
  ])("%s", (role, caps) => {
    expect(capabilitiesOf(actor({ tenantRole: role }))).toEqual(caps);
  });

  it("grants by permission and by superuser wildcard", () => {
    expect(
      capabilitiesOf(actor({ permissions: ["Support:raise_tickets"] }))
        .canRaise,
    ).toBe(true);
    expect(capabilitiesOf(actor({ permissions: ["*:*:*"] }))).toEqual({
      canRaise: true,
      canViewOrg: true,
      canViewSecurity: true,
    });
  });
});

describe("ticket visibility", () => {
  it("never crosses tenants, whatever the role", () => {
    expect(
      canViewTicket(
        actor({ tenantId: "t2", tenantRole: "owner", isSuperUser: true }),
        ticket,
      ),
    ).toBe(false);
  });

  it("lets reporters and participants see their ticket", () => {
    expect(canViewTicket(actor({ userId: "u2" }), ticket)).toBe(true);
    expect(canViewTicket(actor(), { ...ticket, participantIds: ["u1"] })).toBe(
      true,
    );
    expect(canViewTicket(actor(), ticket)).toBe(false);
  });

  it("keeps security reports from org-wide viewers without the security grant", () => {
    const sec = { ...ticket, category: "security" };
    expect(canViewTicket(actor({ tenantRole: "admin" }), sec)).toBe(false);
    expect(
      canViewTicket(
        actor({
          tenantRole: "admin",
          permissions: ["Support:view_security_tickets"],
        }),
        sec,
      ),
    ).toBe(true);
  });

  it("scopes lists to the token's tenant", () => {
    expect(tenantListScope(actor(), "mine")).toEqual({
      tenantId: "t1",
      reporterId: "u1",
    });
    expect(tenantListScope(actor(), "org")).toBeNull();
    expect(tenantListScope(actor({ tenantRole: "admin" }), "org")).toEqual({
      tenantId: "t1",
      OR: [{ category: { not: "security" } }, { reporterId: "u1" }],
    });
  });
});

describe("lifecycle rules", () => {
  it.each([
    ["open", "in_progress", true],
    ["in_progress", "waiting_for_tenant", true],
    ["waiting_for_tenant", "in_progress", true],
    ["in_progress", "resolved", true],
    ["waiting_for_tenant", "resolved", true],
    ["resolved", "closed", true],
    ["resolved", "in_progress", true],
    ["closed", "in_progress", false],
    ["resolved", "waiting_for_tenant", false],
    ["open", "open", false],
    ["bogus", "open", false],
  ])("%s → %s allowed: %s", (from, to, ok) => {
    expect(canStaffTransition(from, to)).toBe(ok);
  });

  it("wakes waiting tickets on a tenant reply and refuses resolved/closed", () => {
    expect(statusAfterTenantReply("waiting_for_tenant")).toEqual({
      ok: true,
      next: "in_progress",
    });
    expect(statusAfterTenantReply("open")).toEqual({ ok: true, next: "open" });
    expect(statusAfterTenantReply("resolved").ok).toBe(false);
    expect(statusAfterTenantReply("closed").ok).toBe(false);
  });

  it("allows reopening within 14 days of resolution only", () => {
    const now = new Date("2026-10-30T00:00:00Z");
    const days = (n: number) => new Date(now.getTime() - n * 86400000);
    expect(
      reopenEligibility({ status: "resolved", resolvedAt: days(13) }, now).ok,
    ).toBe(true);
    expect(
      reopenEligibility({ status: "resolved", resolvedAt: days(15) }, now).ok,
    ).toBe(false);
    expect(
      reopenEligibility({ status: "closed", resolvedAt: days(1) }, now).ok,
    ).toBe(false);
  });

  it("serialises only allow-listed fields for tenants", () => {
    const view = tenantTicketView({
      id: "x",
      ticketNo: "PRA-2026-000001",
      subject: "s",
      description: "d",
      category: "general",
      requestedPriority: "low",
      priority: "low",
      status: "open",
      reporterId: "u",
      assigneeId: "agent",
      version: 3,
      participantIds: ["u"],
      duplicateOfId: "y",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    for (const k of [
      "assigneeId",
      "version",
      "participantIds",
      "duplicateOfId",
      "tenantId",
    ]) {
      expect(view).not.toHaveProperty(k);
    }
  });
});

describe("attachment checks", () => {
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
  ]);
  it("accepts allowed types and refuses mismatched extensions, SVG and oversize", () => {
    expect(
      validateUploadRequest({
        fileName: "a.PNG",
        contentType: "image/png",
        size: 5,
      }).ok,
    ).toBe(true);
    expect(
      validateUploadRequest({
        fileName: "a.png",
        contentType: "image/jpeg",
        size: 5,
      }).ok,
    ).toBe(false);
    expect(
      validateUploadRequest({
        fileName: "a.svg",
        contentType: "image/svg+xml",
        size: 5,
      }).ok,
    ).toBe(false);
    expect(
      validateUploadRequest({
        fileName: "a.html",
        contentType: "text/plain",
        size: 5,
      }).ok,
    ).toBe(false);
    expect(
      validateUploadRequest({
        fileName: "a.pdf",
        contentType: "application/pdf",
        size: 10 * 1024 * 1024 + 1,
      }).ok,
    ).toBe(false);
    expect(
      validateUploadRequest({
        fileName: "a.pdf",
        contentType: "application/pdf",
        size: 0,
      }).ok,
    ).toBe(false);
  });

  it("trusts bytes, not the declared type", () => {
    expect(sniffContentType(png, "image/png")).toBe("image/png");
    expect(sniffContentType(png, "image/jpeg")).toBeNull();
    expect(sniffContentType(Buffer.from("%PDF-1.7\n"), "application/pdf")).toBe(
      "application/pdf",
    );
    expect(
      sniffContentType(Buffer.from("RIFF\0\0\0\0WEBPVP8 "), "image/webp"),
    ).toBe("image/webp");
    expect(sniffContentType(Buffer.from("MZ\x90\0"), "image/png")).toBeNull();
    expect(
      sniffContentType(Buffer.from("plain log line\n"), "text/plain"),
    ).toBe("text/plain");
    expect(
      sniffContentType(Buffer.from("MZ looks texty"), "text/plain"),
    ).toBeNull();
    expect(
      sniffContentType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x41]), "text/csv"),
    ).toBeNull();
    expect(
      sniffContentType(Buffer.from([0x61, 0x00, 0x62]), "text/plain"),
    ).toBeNull();
    expect(
      sniffContentType(Buffer.from([0xc3, 0x28]), "text/plain"),
    ).toBeNull();
  });
});

describe("request validation", () => {
  const valid = {
    category: "bug_report",
    subject: "Export is broken",
    description: "Steps: click export",
  };
  it("defaults priority and rejects invalid category, priority or extra fields", () => {
    expect(createSupportTicketSchema.parse(valid).priority).toBe("normal");
    expect(
      createSupportTicketSchema.safeParse({ ...valid, category: "hr" }).success,
    ).toBe(false);
    expect(
      createSupportTicketSchema.safeParse({ ...valid, priority: "critical" })
        .success,
    ).toBe(false);
    expect(
      createSupportTicketSchema.safeParse({
        ...valid,
        tenantId: "aaaaaaaaaaaaaaaaaaaaaaaa",
      }).success,
    ).toBe(false);
    expect(
      createSupportTicketSchema.safeParse({ ...valid, subject: "hey" }).success,
    ).toBe(false);
    expect(
      createSupportTicketSchema.safeParse({
        ...valid,
        attachmentIds: Array.from({ length: 6 }, (_, i) =>
          String(i).padStart(24, "a"),
        ),
      }).success,
    ).toBe(false);
  });

  it("requires a version for agent changes and refuses an empty update", () => {
    expect(
      platformSupportUpdateSchema.safeParse({ status: "resolved" }).success,
    ).toBe(false);
    expect(platformSupportUpdateSchema.safeParse({ version: 1 }).success).toBe(
      false,
    );
    expect(
      platformSupportReplySchema.safeParse({
        body: "x",
        visibility: "secret",
        version: 0,
      }).success,
    ).toBe(false);
  });
});

describe("ticket numbers", () => {
  beforeEach(() => resetFakeDb());

  it("stay unique under concurrent creation", async () => {
    const numbers = await Promise.all(
      Array.from({ length: 50 }, () => nextTicketNo(new Date("2026-05-01"))),
    );
    expect(new Set(numbers).size).toBe(50);
    expect(numbers.sort()[0]).toBe("PRA-2026-000001");
  });

  it("restart per year and retry the first-of-year upsert race", async () => {
    const real = fakeDb.$runCommandRaw;
    const spy = jest
      .spyOn(fakeDb, "$runCommandRaw")
      .mockRejectedValueOnce(
        Object.assign(new Error("E11000 duplicate key"), { code: 11000 }),
      )
      .mockImplementation(real);
    expect(await nextTicketNo(new Date("2027-01-01"))).toBe("PRA-2027-000001");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("reads extended-JSON numbers", async () => {
    jest
      .spyOn(fakeDb, "$runCommandRaw")
      .mockResolvedValueOnce({ value: { seq: { $numberInt: "42" } } });
    expect(await nextTicketNo(new Date("2026-01-01"))).toBe("PRA-2026-000042");
  });
});
