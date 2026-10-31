import { activeEntry, searchableNav, visibleNav } from "@next/app/navigation";

const modules = (u: any) =>
  visibleNav(u)
    .flat()
    .map((m) => m.id);
const pages = (u: any) =>
  visibleNav(u)
    .flat()
    .flatMap((m) => (m.pages ? m.pages.map((p) => p.id) : [m.id]));

describe("navigation mirrors Classic's route gates", () => {
  it("hides admin and HR areas from a regular employee", () => {
    const employee = {
      tenantRole: "employee",
      permissions: [],
      wfhEnabled: false,
    };
    const m = modules(employee);
    for (const id of [
      "employees",
      "analytics",
      "settings",
      "permissions",
      "recruitment",
      "reports",
      "wfh",
    ]) {
      expect(m).not.toContain(id);
    }
    expect(m).toEqual(
      expect.arrayContaining(["attendance", "leave", "payroll", "kyc"]),
    );
    // HR-only pages inside self-service modules stay hidden.
    expect(pages(employee)).not.toContain("attendance-insights");
    expect(pages(employee)).not.toContain("pay-runs");
    expect(pages(employee)).toContain("pay-slips");
  });

  it("shows HR areas to HR and admin areas to owners", () => {
    expect(modules({ tenantRole: "hr" })).toEqual(
      expect.arrayContaining(["employees", "recruitment", "reports"]),
    );
    expect(modules({ tenantRole: "hr" })).not.toContain("analytics");
    expect(modules({ tenantRole: "owner", wfhEnabled: true })).toEqual(
      expect.arrayContaining(["analytics", "settings", "wfh", "audit"]),
    );
    // Permissions needs superuser or the explicit grant (Classic's canManagePermissions).
    expect(modules({ tenantRole: "owner" })).not.toContain("permissions");
    expect(
      modules({
        tenantRole: "employee",
        permissions: ["Permissions:manage_role_permissions"],
      }),
    ).toContain("permissions");
  });

  it("grants recruitment through a JobOpenings permission alone", () => {
    expect(
      modules({
        tenantRole: "employee",
        permissions: ["JobOpenings:view_job_openings"],
      }),
    ).toContain("recruitment");
  });

  it("flattens pages into ⌘K with their module", () => {
    const entry = searchableNav({ tenantRole: "owner" }).find(
      (e) => e.id === "set-payroll",
    );
    expect(entry).toMatchObject({
      module: "Settings",
      path: "/settings/payroll",
    });
  });

  it("resolves the active module and page", () => {
    expect(activeEntry("/dashboard").module?.id).toBe("today");
    expect(activeEntry("/attendance").page?.id).toBe("attendance-mine");
    expect(activeEntry("/attendance/view-leave-applications").page?.id).toBe(
      "leave-applications",
    );
    expect(activeEntry("/employee-management/jane.doe").page?.id).toBe(
      "employees-directory",
    );
    expect(activeEntry("/view-job-opening/42").page?.id).toBe("jobs");
    expect(activeEntry("/payroll/salary-management/u1").page?.id).toBe(
      "pay-salary",
    );
    expect(activeEntry("/settings").page?.id).toBe("set-company");
  });
});
