import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OrgSetupPage from "@web/features/auth/OrgSetupPage";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import apiClient, { setAccessToken } from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
  setAccessToken: vi.fn(),
}));
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;
const mockSetAccessToken = setAccessToken as unknown as ReturnType<
  typeof vi.fn
>;

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@web/assets/data/LogoDark", () => ({
  default: () => <div>LogoDark</div>,
}));
vi.mock("@web/assets/data/LogoLight", () => ({
  default: () => <div>LogoLight</div>,
}));
vi.mock("@web/features/auth/org-setup/OrgSetupLeftPanel", () => ({
  OrgSetupLeftPanel: () => <div>Stub LeftPanel</div>,
}));
vi.mock("@web/features/auth/org-setup/TenantPicker", () => ({
  TenantPicker: (props: any) => (
    <div>
      Stub TenantPicker
      {props.tenants.map((t: any) => (
        <button key={t.id} onClick={() => props.onSelect(t.id)}>
          select-{t.id}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("@web/features/auth/org-setup/JoinRequestPending", () => ({
  JoinRequestPending: (props: any) => (
    <div>
      Stub JoinRequestPending for {props.tenantName}
      <button onClick={props.onCheckAgain}>check-again</button>
    </div>
  ),
}));
vi.mock("@web/features/auth/org-setup/JoinOfferPrompt", () => ({
  JoinOfferPrompt: (props: any) => (
    <div>
      Stub JoinOfferPrompt for {props.tenantName}
      <button onClick={props.onRequestJoin}>request-join</button>
    </div>
  ),
}));
vi.mock("@web/features/auth/org-setup/OrgDetailsStep", () => ({
  OrgDetailsStep: (props: any) => (
    <div>
      Stub OrgDetailsStep
      <button onClick={props.onContinue}>continue-to-plan</button>
    </div>
  ),
}));
vi.mock("@web/features/auth/org-setup/PlanStep", () => ({
  PlanStep: (props: any) => (
    <div>
      Stub PlanStep
      <button onClick={props.onPayAndCreate}>pay-and-create</button>
    </div>
  ),
}));
vi.mock("@web/features/auth/org-setup/ContactInfoStep", () => ({
  ContactInfoStep: (props: any) => (
    <div>
      Stub ContactInfoStep
      <button onClick={props.onSkip}>skip-contact-info</button>
      <button onClick={props.onSaveAndContinue}>save-contact-info</button>
    </div>
  ),
}));

function renderPage({
  user = {
    id: "u1",
    first_name: "Jane",
    last_name: "Doe",
    email: "jane@x.com",
  },
  setAlert = vi.fn(),
  setUser = vi.fn(),
  path = "/org-setup",
} = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeContext.Provider
        value={{ theme: "light", toggleTheme: vi.fn() } as any}
      >
        <UserContext.Provider
          value={{ user, setUser, handleLogout: vi.fn() } as any}
        >
          <AlertContext.Provider value={{ setAlert } as any}>
            <OrgSetupPage />
          </AlertContext.Provider>
        </UserContext.Provider>
      </ThemeContext.Provider>
    </MemoryRouter>,
  );
}

function setupApi({
  tenants = [],
  domainSuggestion = null,
}: { tenants?: any[]; domainSuggestion?: any } = {}) {
  mockGet.mockImplementation((url: string) => {
    if (url === "/tenants/available")
      return Promise.resolve({ data: { success: true, data: { tenants } } });
    if (url === "/tenants/domain-suggestion")
      return Promise.resolve({
        data: { success: true, data: domainSuggestion ?? {} },
      });
    return Promise.resolve({ data: { success: false } });
  });
}

describe("OrgSetupPage", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockPut.mockReset();
    mockSetAccessToken.mockReset();
    mockNavigate.mockReset();
    localStorage.clear();
    document.getElementById("razorpay-script")?.remove();
    delete (window as any).Razorpay;
  });

  it("shows the tenant picker when the user already has available tenants", async () => {
    setupApi({ tenants: [{ id: "t1", name: "Acme" }] });
    renderPage();
    expect(await screen.findByText("Stub TenantPicker")).toBeInTheDocument();
    expect(screen.getByText("Select your organisation")).toBeInTheDocument();
  });

  it("selects a tenant, stores the access token, and finishes setup", async () => {
    setupApi({ tenants: [{ id: "t1", name: "Acme" }] });
    mockPost.mockResolvedValue({
      data: { success: true, data: { accessToken: "tok" } },
    });
    mockGet.mockImplementation((url: string) => {
      if (url === "/tenants/available")
        return Promise.resolve({
          data: {
            success: true,
            data: { tenants: [{ id: "t1", name: "Acme" }] },
          },
        });
      if (url === "/profile")
        return Promise.resolve({
          data: { success: true, data: { user: { id: "u1" } } },
        });
      return Promise.resolve({ data: { success: false } });
    });
    const {} = renderPage();
    fireEvent.click(await screen.findByText("select-t1"));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/tenants/select", {
        tenantId: "t1",
      }),
    );
    await waitFor(() => expect(mockSetAccessToken).toHaveBeenCalledWith("tok"));
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true }),
    );
  });

  it("shows the join-request-pending view when a request is already pending", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/tenants/available")
        return Promise.resolve({
          data: { success: true, data: { tenants: [] } },
        });
      if (url === "/tenants/domain-suggestion")
        return Promise.resolve({
          data: {
            success: true,
            data: {
              requestStatus: "pending",
              request: { tenantId: "t2", tenantName: "Beta Inc" },
            },
          },
        });
      return Promise.resolve({ data: { success: false } });
    });
    renderPage();
    expect(
      await screen.findByText("Stub JoinRequestPending for Beta Inc"),
    ).toBeInTheDocument();
    expect(screen.getByText("Request pending")).toBeInTheDocument();
  });

  it("shows the join-offer prompt when a domain match is suggested", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/tenants/available")
        return Promise.resolve({
          data: { success: true, data: { tenants: [] } },
        });
      if (url === "/tenants/domain-suggestion")
        return Promise.resolve({
          data: {
            success: true,
            data: {
              suggestion: { tenantId: "t3", tenantName: "Gamma LLC" },
              previousRequestStatus: null,
            },
          },
        });
      return Promise.resolve({ data: { success: false } });
    });
    renderPage();
    expect(
      await screen.findByText("Stub JoinOfferPrompt for Gamma LLC"),
    ).toBeInTheDocument();

    mockPost.mockResolvedValue({ data: { success: true } });
    fireEvent.click(screen.getByText("request-join"));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/tenants/join-requests", {
        tenantId: "t3",
      }),
    );
  });

  it("auto-selects the tenant once a pending join request is approved", async () => {
    let domainCall = 0;
    mockGet.mockImplementation((url: string) => {
      if (url === "/tenants/available")
        return Promise.resolve({
          data: { success: true, data: { tenants: [] } },
        });
      if (url === "/tenants/domain-suggestion") {
        domainCall++;
        if (domainCall === 1) {
          return Promise.resolve({
            data: {
              success: true,
              data: {
                requestStatus: "pending",
                request: { tenantId: "t4", tenantName: "Delta" },
              },
            },
          });
        }
        return Promise.resolve({
          data: {
            success: true,
            data: {
              requestStatus: "approved",
              request: { tenantId: "t4", tenantName: "Delta" },
            },
          },
        });
      }
      if (url === "/profile")
        return Promise.resolve({
          data: { success: true, data: { user: { id: "u1" } } },
        });
      return Promise.resolve({ data: { success: false } });
    });
    mockPost.mockResolvedValue({
      data: { success: true, data: { accessToken: "tok" } },
    });

    renderPage();
    await screen.findByText("Stub JoinRequestPending for Delta");

    fireEvent.click(screen.getByText("check-again"));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/tenants/select", {
        tenantId: "t4",
      }),
    );
  });

  it("walks through the create-org wizard: details -> plan -> pay -> contact info", async () => {
    setupApi({ tenants: [] });
    renderPage();
    expect(await screen.findByText("Stub OrgDetailsStep")).toBeInTheDocument();
    expect(screen.getByText("Set up your organisation")).toBeInTheDocument();

    fireEvent.click(screen.getByText("continue-to-plan"));
    expect(await screen.findByText("Stub PlanStep")).toBeInTheDocument();
    expect(screen.getByText("Choose your plan")).toBeInTheDocument();
  });

  it("creates the subscription and organisation via Razorpay, then advances to contact info", async () => {
    setupApi({ tenants: [] });
    mockPost.mockImplementation((url: string) => {
      if (url === "/payment/create-subscription")
        return Promise.resolve({
          data: {
            success: true,
            data: { subscriptionId: "sub_1", keyId: "rzp_key" },
          },
        });
      if (url === "/tenants")
        return Promise.resolve({
          data: { success: true, data: { accessToken: "org-tok" } },
        });
      return Promise.resolve({ data: { success: false } });
    });
    const fakeScript = document.createElement("script");
    fakeScript.id = "razorpay-script";
    document.body.appendChild(fakeScript);

    let capturedHandler: any;
    const openSpy = vi.fn();
    (window as any).Razorpay = vi.fn(function MockRazorpay(
      this: any,
      options: any,
    ) {
      capturedHandler = options.handler;
      this.open = openSpy;
    });

    renderPage();
    await screen.findByText("Stub OrgDetailsStep");
    fireEvent.click(screen.getByText("continue-to-plan"));
    await screen.findByText("Stub PlanStep");

    fireEvent.click(screen.getByText("pay-and-create"));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/payment/create-subscription", {
        billing: "monthly",
      }),
    );
    expect(openSpy).toHaveBeenCalled();

    // Simulate Razorpay's success callback.
    await capturedHandler({
      razorpay_payment_id: "pay_1",
      razorpay_subscription_id: "sub_1",
      razorpay_signature: "sig_1",
    });

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/tenants",
        expect.objectContaining({
          razorpayPaymentId: "pay_1",
          billing: "monthly",
        }),
      ),
    );
    await waitFor(() =>
      expect(mockSetAccessToken).toHaveBeenCalledWith("org-tok"),
    );
    expect(await screen.findByText("Stub ContactInfoStep")).toBeInTheDocument();
  });

  it("finishes setup when Skip is chosen on the contact info step", async () => {
    setupApi({ tenants: [] });
    mockPost.mockImplementation((url: string) => {
      if (url === "/payment/create-subscription")
        return Promise.resolve({
          data: { success: true, data: { subscriptionId: "s", keyId: "k" } },
        });
      if (url === "/tenants/complete-org-setup")
        return Promise.resolve({
          data: { success: true, data: { accessToken: "final-tok" } },
        });
      return Promise.resolve({ data: { success: false } });
    });
    mockGet.mockImplementation((url: string) => {
      if (url === "/tenants/available")
        return Promise.resolve({
          data: { success: true, data: { tenants: [] } },
        });
      if (url === "/profile")
        return Promise.resolve({
          data: { success: true, data: { user: { id: "u1" } } },
        });
      return Promise.resolve({ data: { success: false } });
    });
    const { setUser } = { setUser: vi.fn() };
    renderPage({ setUser } as any);

    // Jump directly to the contact-info step via the deep-link state.
    await screen.findByText("Stub OrgDetailsStep");
    fireEvent.click(screen.getByText("continue-to-plan"));
    await screen.findByText("Stub PlanStep");

    const fakeScript = document.createElement("script");
    fakeScript.id = "razorpay-script";
    document.body.appendChild(fakeScript);
    let capturedHandler: any;
    (window as any).Razorpay = vi.fn(function MockRazorpay(
      this: any,
      options: any,
    ) {
      capturedHandler = options.handler;
      this.open = vi.fn();
    });
    mockPost.mockImplementation((url: string) => {
      if (url === "/payment/create-subscription")
        return Promise.resolve({
          data: { success: true, data: { subscriptionId: "s", keyId: "k" } },
        });
      if (url === "/tenants")
        return Promise.resolve({
          data: { success: true, data: { accessToken: "org-tok" } },
        });
      if (url === "/tenants/complete-org-setup")
        return Promise.resolve({
          data: { success: true, data: { accessToken: "final-tok" } },
        });
      return Promise.resolve({ data: { success: false } });
    });
    fireEvent.click(screen.getByText("pay-and-create"));
    await waitFor(() => expect(capturedHandler).toBeDefined());
    await capturedHandler({
      razorpay_payment_id: "pay_1",
      razorpay_subscription_id: "sub_1",
      razorpay_signature: "sig_1",
    });
    await screen.findByText("Stub ContactInfoStep");

    fireEvent.click(screen.getByText("skip-contact-info"));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/tenants/complete-org-setup"),
    );
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true }),
    );
  });

  it("resumes a pending setup found via localStorage after a payment completed but the tab closed early", async () => {
    localStorage.setItem(
      "hrms_pending_org_form",
      JSON.stringify({
        orgName: "Acme",
        industry: "",
        companySize: "",
        workWeek: null,
      }),
    );
    mockGet.mockImplementation((url: string) => {
      if (url === "/tenants/available")
        return Promise.resolve({
          data: { success: true, data: { tenants: [] } },
        });
      if (url === "/tenants/domain-suggestion")
        return Promise.resolve({ data: { success: true, data: {} } });
      if (url === "/payment/pending-setup")
        return Promise.resolve({ data: { data: { hasPending: true } } });
      return Promise.resolve({ data: { success: false } });
    });
    mockPost.mockResolvedValue({
      data: { success: true, data: { accessToken: "resumed-tok" } },
    });

    renderPage();

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/tenants/complete-pending-setup",
        expect.objectContaining({ name: "Acme" }),
      ),
    );
    await waitFor(() =>
      expect(mockSetAccessToken).toHaveBeenCalledWith("resumed-tok"),
    );
    expect(localStorage.getItem("hrms_pending_org_form")).toBeNull();
  });
});
