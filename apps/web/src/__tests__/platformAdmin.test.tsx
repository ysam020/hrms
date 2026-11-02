import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { UserContext } from "@web/app/providers/UserContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import { activeEntry, searchableNav, visibleNav } from "@next/app/navigation";
import PlatformOverview from "@next/features/platform-admin/Overview";
import { PlatformTenantDetail } from "@next/features/platform-admin/Tenants";
import {
  canOpenConsole,
  consoleHome,
} from "@next/features/platform-admin/shared";

// Praesto Platform Console in the web app: who sees it, its own sidebar,
// loading/empty/error states, the date range driving requests, and the
// confirmation in front of the one billing action. The gateway is replaced
// by hand-answered axios calls; fixtures are fictional.

const api = { get: vi.fn(), post: vi.fn() };
vi.mock("@next/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@next/lib/api")>();
  return {
    ...actual,
    apiClient: {
      get: (...a: any[]) => api.get(...a),
      post: (...a: any[]) => api.post(...a),
    },
  };
});

const ALL = [
  "view_overview",
  "view_tenants",
  "view_billing",
  "manage_billing",
  "view_audit_logs",
];
const owner = {
  tenantName: "Praesto",
  tenantRole: "owner",
  platformAdmin: ALL,
};
const finance = {
  tenantName: "Praesto",
  tenantRole: "employee",
  platformAdmin: ["view_overview", "view_billing"],
};
// A customer's owner and superuser: the server sends no platform grants.
const customerOwner = {
  tenantName: "Halcyon Labs",
  tenantRole: "owner",
  isSuperUser: true,
  permissions: ["*:*:*"],
  platformAdmin: [],
};

const ids = (u: any, path?: string) =>
  visibleNav(u, path)
    .flat()
    .flatMap((m) => (m.pages ? m.pages.map((p) => p.id) : [m.id]));

describe("console navigation", () => {
  it("is offered only to people with a platform grant", () => {
    expect(ids(customerOwner)).not.toContain("platform-console");
    expect(canOpenConsole(customerOwner)).toBe(false);
    expect(searchableNav(customerOwner).map((e) => e.id)).not.toContain(
      "pa-revenue",
    );
    expect(ids(owner)).toContain("platform-console");
  });

  it("switches to its own sidebar, filtered by grant", () => {
    expect(ids(owner, "/platform-admin")).toEqual(
      expect.arrayContaining([
        "pa-overview",
        "pa-tenants",
        "pa-subscriptions",
        "pa-payments",
        "pa-revenue",
        "pa-audit",
      ]),
    );
    const f = ids(finance, "/platform-admin/revenue");
    expect(f).toContain("pa-revenue");
    expect(f).not.toContain("pa-tenants");
    expect(f).not.toContain("pa-audit");
    expect(ids(owner, "/dashboard")).not.toContain("pa-overview");
    expect(activeEntry("/platform-admin/tenants/abc").module?.id).toBe(
      "pa-tenants",
    );
  });

  it("sends people without the overview grant to a page they can open", () => {
    expect(consoleHome({ platformAdmin: ["view_billing"] })).toBe(
      "/platform-admin/subscriptions",
    );
  });
});

function renderAt(path: string, user: any, element: ReactNode, route: string) {
  const setAlert = vi.fn();
  render(
    <UserContext.Provider value={{ user } as any}>
      <AlertContext.Provider value={{ setAlert } as any}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={route} element={element} />
          </Routes>
        </MemoryRouter>
      </AlertContext.Provider>
    </UserContext.Provider>,
  );
  return { setAlert };
}

const range = {
  from: "2026-08-04T18:30:00.000Z",
  to: "2026-11-02T06:30:00.000Z",
  bucket: "week",
};
const overview = (billing: any) => ({
  data: {
    data: {
      range,
      tenants: {
        total: 12,
        newInRange: 3,
        growth: 50,
        withAccess: 10,
        withoutAccess: 2,
        accountActive: 12,
        accountInactive: 0,
        signedInInRange: 9,
        registrations: [{ key: "2026-10-27", value: 2 }],
      },
      employees: {
        records: 340,
        active: 320,
        inactive: 20,
        activeInTenantsWithAccess: 300,
        averagePerTenant: 28.3,
        userAccounts: 310,
        addedInRange: 40,
        growth: null,
        added: [],
      },
      subscriptions: {
        paying: 7,
        trialing: 2,
        pastDue: 1,
        cancelled: 1,
        expired: 1,
        renewingSoon: 2,
        endingSoon: 0,
        trialsEndingSoon: 1,
        byStatus: { active: 7, trialing: 2 },
        byPlan: { starter: 5, growth: 2 },
        byBilling: { monthly: 6, annual: 1 },
      },
      trials: {
        rate: 0.5,
        converted: 1,
        ended: 2,
        started: 3,
        expiredUnconverted: 1,
      },
      conversions: [],
      billing,
      unavailable: [
        { metric: "Churn and renewal rate", reason: "No history." },
      ],
    },
  },
});

describe("overview page", () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
  });

  it("shows KPIs, and no revenue to someone without billing access", async () => {
    api.get.mockResolvedValue(overview(null));
    renderAt(
      "/platform-admin",
      { ...finance, platformAdmin: ["view_overview"] },
      <PlatformOverview />,
      "/platform-admin",
    );
    expect(await screen.findByText("Organisations")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.queryByText("MRR (Run-Rate)")).not.toBeInTheDocument();
    expect(screen.getByText("Churn and renewal rate")).toBeInTheDocument();
    expect(api.get.mock.calls[0][0]).toBe("/platform/admin/overview?range=90d");
  });

  it("refetches with the chosen range", async () => {
    api.get.mockResolvedValue(overview(null));
    renderAt("/platform-admin", owner, <PlatformOverview />, "/platform-admin");
    await screen.findByText("Organisations");
    fireEvent.click(screen.getByRole("radio", { name: "30 Days" }));
    await waitFor(() =>
      expect(api.get.mock.calls.map((c) => c[0])).toContain(
        "/platform/admin/overview?range=30d",
      ),
    );
  });

  it("says when the payment ledger is empty instead of showing zeros silently", async () => {
    api.get.mockResolvedValue(
      overview({
        mrr: {
          mrr: 0,
          payingTenants: 0,
          fromMonthly: 0,
          fromAnnual: 0,
          atRisk: 0,
          nonRenewing: 0,
        },
        billedMrr: { now: 0, growth: null },
        collections: {},
        netSeries: [],
        paymentSeries: { successful: [], failed: [] },
        ledger: { payments: 0, earliestPaymentAt: null },
      }),
    );
    renderAt("/platform-admin", owner, <PlatformOverview />, "/platform-admin");
    expect(
      await screen.findByText("No payments recorded yet"),
    ).toBeInTheDocument();
  });

  it("shows an error with a retry", async () => {
    api.get.mockRejectedValueOnce({
      response: { data: { message: "Forbidden" } },
    });
    api.get.mockResolvedValue(overview(null));
    renderAt("/platform-admin", owner, <PlatformOverview />, "/platform-admin");
    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
    expect(await screen.findByText("Organisations")).toBeInTheDocument();
  });
});

const tenantDetail = {
  data: {
    data: {
      organisation: {
        id: "t1",
        name: "Halcyon Labs",
        slug: "halcyon",
        createdAt: "2026-05-01",
        isActive: true,
        owner: null,
      },
      workforce: {
        records: 20,
        active: 18,
        inactive: 2,
        byStatus: { Active: 18, Resigned: 2 },
        userAccounts: 19,
      },
      subscription: {
        status: "grace_period",
        hasAccess: true,
        kind: "paid",
        planTier: "starter",
        billing: "monthly",
        monthlyValue: 0,
        hasRazorpaySubscription: true,
      },
      payments: [],
      usage: {
        lastSignInAt: null,
        signInsLast30Days: 0,
        openSupportTickets: 0,
        last30Days: null,
      },
      audit: [],
    },
  },
};

describe("tenant detail", () => {
  beforeEach(() => {
    api.get.mockReset().mockResolvedValue(tenantDetail);
    api.post.mockReset().mockResolvedValue({ data: { message: "Synced." } });
  });

  it("loads the tenant from the URL", async () => {
    renderAt(
      "/platform-admin/tenants/t1",
      owner,
      <PlatformTenantDetail />,
      "/platform-admin/tenants/:tenantId",
    );
    expect(await screen.findAllByText("Halcyon Labs")).not.toHaveLength(0);
    expect(api.get).toHaveBeenCalledWith(
      "/platform/admin/tenants/t1",
      expect.anything(),
    );
  });

  it("asks for confirmation and a reason before syncing", async () => {
    const { setAlert } = renderAt(
      "/platform-admin/tenants/t1",
      owner,
      <PlatformTenantDetail />,
      "/platform-admin/tenants/:tenantId",
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Sync from Razorpay" }),
    );
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sync Now" }));
    expect(api.post).not.toHaveBeenCalled(); // no reason yet
    expect(setAlert).toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Renewal charged but locked" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sync Now" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/platform/admin/tenants/t1/sync", {
        reason: "Renewal charged but locked",
      }),
    );
  });

  it("offers no sync to someone without billing-management rights", async () => {
    renderAt(
      "/platform-admin/tenants/t1",
      finance,
      <PlatformTenantDetail />,
      "/platform-admin/tenants/:tenantId",
    );
    await screen.findAllByText("Halcyon Labs");
    expect(
      screen.queryByRole("button", { name: "Sync from Razorpay" }),
    ).not.toBeInTheDocument();
  });
});
