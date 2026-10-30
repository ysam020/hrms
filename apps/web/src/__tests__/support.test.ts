import { activeEntry, visibleNav } from "@next/app/navigation";
import {
  CATEGORIES,
  DETAIL_FIELDS,
  STAFF_TRANSITIONS,
  canRaiseSupport,
  canViewOrgSupport,
  statusLabel,
} from "@next/features/support/config";
import { checkFile } from "@next/features/support/api";

// Support lives in the Help & Support module ("help"); these are its pages.
const helpPages = (u: any) =>
  (
    visibleNav(u)
      .flat()
      .find((m) => m.id === "help")?.pages ?? []
  ).map((p) => p.id);

describe("support navigation and gates", () => {
  it("puts tickets, the console and shortcuts in one Help & Support section", () => {
    const owner = {
      tenantRole: "owner",
      permissions: [],
      isSupportAgent: true,
    };
    const ids = visibleNav(owner)
      .flat()
      .map((m) => m.id);
    expect(ids.filter((id) => id === "help")).toHaveLength(1);
    expect(ids).not.toContain("support");
    expect(ids).not.toContain("support-console");
    expect(helpPages(owner)).toEqual([
      "support",
      "support-console",
      "help-shortcuts",
    ]);
    // Everyone still has the shortcuts page.
    expect(helpPages({ tenantRole: "employee", permissions: [] })).toEqual([
      "help-shortcuts",
    ]);
  });

  it("shows Praesto Support to owners/admins/HR, not ordinary employees", () => {
    expect(helpPages({ tenantRole: "owner", permissions: [] })).toContain(
      "support",
    );
    expect(helpPages({ tenantRole: "hr", permissions: [] })).toContain(
      "support",
    );
    expect(
      helpPages({ tenantRole: "employee", permissions: [] }),
    ).not.toContain("support");
    expect(
      helpPages({
        tenantRole: "employee",
        permissions: ["Support:raise_tickets"],
      }),
    ).toContain("support");
  });

  it("shows the console only to Praesto agents, never because of a tenant role", () => {
    expect(
      helpPages({ tenantRole: "owner", isSuperUser: true, permissions: [] }),
    ).not.toContain("support-console");
    expect(
      helpPages({
        tenantRole: "employee",
        permissions: [],
        isSupportAgent: true,
      }),
    ).toContain("support-console");
  });

  it("matches ticket pages to the right module", () => {
    expect(activeEntry("/support/tickets/abc")).toMatchObject({
      module: { id: "help" },
      page: { id: "support" },
    });
    expect(activeEntry("/platform/support/tickets/abc").page?.id).toBe(
      "support-console",
    );
    expect(activeEntry("/help").page?.id).toBe("help-shortcuts");
  });

  it("mirrors the server's organisation-scope rule", () => {
    expect(canViewOrgSupport({ tenantRole: "hr", permissions: [] })).toBe(
      false,
    );
    expect(canViewOrgSupport({ tenantRole: "admin", permissions: [] })).toBe(
      true,
    );
    expect(canRaiseSupport({ tenantRole: "employee", permissions: [] })).toBe(
      false,
    );
  });
});

describe("support config", () => {
  it("has the seven categories, each with detail fields defined", () => {
    expect(CATEGORIES.map((c) => c.value)).toEqual([
      "bug_report",
      "technical_issue",
      "billing",
      "feature_request",
      "improvement",
      "general",
      "security",
    ]);
    for (const c of CATEGORIES) expect(DETAIL_FIELDS[c.value]).toBeDefined();
  });

  it("keeps Closed terminal and words the tenant's waiting state for them", () => {
    expect(STAFF_TRANSITIONS.closed).toEqual([]);
    expect(statusLabel("waiting_for_tenant", true)).toBe("Waiting for You");
    expect(statusLabel("waiting_for_tenant")).toBe("Waiting for Tenant");
  });

  it("rejects unsupported, empty and oversized files before upload", () => {
    const file = (name: string, size: number) =>
      new File([new Uint8Array(size)], name);
    expect(checkFile(file("shot.png", 10))).toBeNull();
    expect(checkFile(file("run.exe", 10))).toMatch(/only images/);
    expect(checkFile(file("logo.svg", 10))).toMatch(/only images/);
    expect(checkFile(file("empty.pdf", 0))).toMatch(/empty/);
    expect(checkFile(file("big.pdf", 10 * 1024 * 1024 + 1))).toMatch(/larger/);
  });
});
