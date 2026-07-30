import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import Subscription from "@web/features/subscription/Subscription";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

function tenant(overrides: Partial<any> = {}) {
  return {
    id: "t1",
    name: "Acme Corp",
    plan: "pro",
    billing: "monthly",
    planTier: "starter",
    activeEmployeeCount: 5,
    pendingPlanTier: null,
    pendingBilling: null,
    pendingPlanChangeAt: null,
    subscriptionStatus: "active",
    planActivatedAt: "2026-01-01T00:00:00Z",
    planExpiresAt: "2026-02-01T00:00:00Z",
    razorpaySubscriptionId: null,
    paymentMethod: null,
    paymentMethodSummary: null,
    ...overrides,
  };
}

function renderSubscription(
  setAlert = vi.fn(),
  user: any = { first_name: "Jane", last_name: "Doe", email: "jane@x.com" },
) {
  render(
    <UserContext.Provider value={{ user } as any}>
      <AlertContext.Provider value={{ setAlert } as any}>
        <Subscription />
      </AlertContext.Provider>
    </UserContext.Provider>,
  );
  return { setAlert };
}

describe("Subscription", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    document.getElementById("razorpay-script")?.remove();
    delete (window as any).Razorpay;
  });

  it("shows an error state when the tenant fails to load", async () => {
    mockGet.mockResolvedValue({ data: { success: false } });
    renderSubscription();
    expect(
      await screen.findByText(
        "Failed to load subscription details. Please refresh and try again.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the current plan's billing period and price", async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { tenant: tenant({ billing: "annual" }) } },
    });
    renderSubscription();
    expect(
      await screen.findByText(/Annual plan · ₹86,389\.2\/year/),
    ).toBeInTheDocument();
  });

  it("shows the employee count alongside the price for any tier", async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: {
          tenant: tenant({ planTier: "growth", activeEmployeeCount: 60 }),
        },
      },
    });
    renderSubscription();
    expect(await screen.findByText(/60 employees/)).toBeInTheDocument();
  });

  it("shows the Active status chip for an active subscription", async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: { tenant: tenant({ subscriptionStatus: "active" }) },
      },
    });
    renderSubscription();
    expect(await screen.findByText("Active")).toBeInTheDocument();
  });

  it("shows a grace-period warning with the 7-day deadline", async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: {
          tenant: tenant({
            subscriptionStatus: "grace_period",
            planExpiresAt: "2026-02-01T00:00:00Z",
          }),
        },
      },
    });
    renderSubscription();
    expect(
      await screen.findByText(/Your subscription has lapsed/),
    ).toBeInTheDocument();
    expect(screen.getByText("8 February 2026")).toBeInTheDocument();
  });

  it("shows a banner with the cancel option when a plan change is pending", async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: {
          tenant: tenant({
            pendingPlanTier: "growth",
            pendingBilling: "monthly",
            // Deliberately distinct from planExpiresAt (2026-02-01) so the
            // banner's date and the "Renews on" field aren't the same text.
            pendingPlanChangeAt: "2026-03-01T00:00:00Z",
          }),
        },
      },
    });
    renderSubscription();
    expect(
      await screen.findByText(/Your plan will change to HRMS Growth/),
    ).toBeInTheDocument();
    expect(screen.getByText("1 March 2026")).toBeInTheDocument();
  });

  it("shows an expired banner and the renew section for an expired subscription", async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: { tenant: tenant({ subscriptionStatus: "expired" }) },
      },
    });
    renderSubscription();
    expect(
      await screen.findByText(/Your subscription has expired/),
    ).toBeInTheDocument();
    expect(screen.getByText("Renew Subscription")).toBeInTheDocument();
    expect(
      screen.queryByText("Cancel Subscription", { selector: "span" }),
    ).not.toBeInTheDocument();
    // Change Plan only applies to an active/grace_period subscription.
    expect(
      screen.queryByText("Change Plan", { selector: "h6" }),
    ).not.toBeInTheDocument();
  });

  it("shows a cancelled banner with the access-until date while still within the paid period", async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: {
          tenant: tenant({
            subscriptionStatus: "cancelled",
            planExpiresAt: "2026-12-01T00:00:00Z",
          }),
        },
      },
    });
    renderSubscription();
    expect(await screen.findByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByText(/won't renew/)).toBeInTheDocument();
    // "1 December 2026" appears twice: once in the banner's "until" date,
    // once in the existing "Renews on" field — both read planExpiresAt.
    expect(screen.getAllByText("1 December 2026")).toHaveLength(2);
    expect(screen.queryByText("Renew Subscription")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Cancel Subscription", { selector: "span" }),
    ).not.toBeInTheDocument();
  });

  it("shows an access-ended banner and the renew section once a cancelled subscription's period has passed", async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: {
          tenant: tenant({
            subscriptionStatus: "cancelled",
            planExpiresAt: "2026-01-01T00:00:00Z",
          }),
        },
      },
    });
    renderSubscription();
    expect(
      await screen.findByText(/your access has ended/),
    ).toBeInTheDocument();
    expect(screen.getByText("Renew Subscription")).toBeInTheDocument();
    expect(
      screen.queryByText("Cancel Subscription", { selector: "span" }),
    ).not.toBeInTheDocument();
  });

  it("shows the Cancel Subscription button for a non-expired subscription", async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: { tenant: tenant({ subscriptionStatus: "active" }) },
      },
    });
    renderSubscription();
    expect(
      await screen.findByText("Cancel Subscription", { selector: "span" }),
    ).toBeInTheDocument();
  });

  it("shows the payment method summary and label", async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: {
          tenant: tenant({
            paymentMethod: "upi",
            paymentMethodSummary: "jane@upi",
          }),
        },
      },
    });
    renderSubscription();
    expect(await screen.findByText("jane@upi")).toBeInTheDocument();
    expect(screen.getByText("UPI")).toBeInTheDocument();
  });

  it("cancels the subscription through the confirmation dialog", async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { tenant: tenant() } },
    });
    mockPost.mockResolvedValue({ data: { success: true } });
    const { setAlert } = renderSubscription();
    await screen.findByText("Cancel Subscription", { selector: "span" });

    fireEvent.click(
      screen.getByText("Cancel Subscription", { selector: "span" }),
    );
    expect(screen.getByText("Cancel Subscription?")).toBeInTheDocument();

    fireEvent.click(
      screen.getAllByText("Cancel Subscription", { selector: "span" }).pop()!,
    );

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/payment/cancel-subscription"),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Subscription cancelled.",
      }),
    );
    await waitFor(() =>
      expect(screen.getByText("Cancelled")).toBeInTheDocument(),
    );
  });

  it("keeps the subscription when the confirmation dialog is dismissed", async () => {
    mockGet.mockResolvedValue({
      data: { success: true, data: { tenant: tenant() } },
    });
    renderSubscription();
    await screen.findByText("Cancel Subscription", { selector: "span" });

    fireEvent.click(
      screen.getByText("Cancel Subscription", { selector: "span" }),
    );
    fireEvent.click(
      screen.getByText("Keep Subscription", { selector: "span" }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText("Cancel Subscription?"),
      ).not.toBeInTheDocument(),
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("switches the renew price when toggling between monthly and annual billing", async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: { tenant: tenant({ subscriptionStatus: "expired" }) },
      },
    });
    renderSubscription();
    await screen.findByText("Renew Subscription");
    expect(
      screen.getByText("Pay ₹7,999 & Renew", { selector: "span" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Annual" }));
    expect(
      screen.getByText("Pay ₹86,389.2 & Renew", { selector: "span" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Save 10% vs. monthly")).toBeInTheDocument();
  });

  it("initiates the Razorpay checkout with the selected billing and pre-filled user details", async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: { tenant: tenant({ subscriptionStatus: "expired" }) },
      },
    });
    mockPost.mockResolvedValue({
      data: {
        success: true,
        data: { subscriptionId: "sub_123", keyId: "rzp_test_key" },
      },
    });
    // Pre-seed the script tag so loadRazorpayScript resolves immediately
    // without needing to simulate a real script-load event in jsdom.
    const fakeScript = document.createElement("script");
    fakeScript.id = "razorpay-script";
    document.body.appendChild(fakeScript);

    const openSpy = vi.fn();
    const RazorpayMock = vi.fn(function MockRazorpay(this: any) {
      this.open = openSpy;
    });
    (window as any).Razorpay = RazorpayMock;

    renderSubscription(vi.fn(), {
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@x.com",
    });
    await screen.findByText("Renew Subscription");

    await act(async () => {
      fireEvent.click(
        screen.getByText("Pay ₹7,999 & Renew", { selector: "span" }),
      );
    });

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/payment/create-subscription", {
        billing: "monthly",
      }),
    );
    expect(RazorpayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_id: "sub_123",
        key: "rzp_test_key",
        prefill: { name: "Jane Doe", email: "jane@x.com" },
      }),
    );
    expect(openSpy).toHaveBeenCalled();
  });

  it("shows an error alert when the payment gateway script fails to load", async () => {
    mockGet.mockResolvedValue({
      data: {
        success: true,
        data: { tenant: tenant({ subscriptionStatus: "expired" }) },
      },
    });
    const { setAlert } = renderSubscription();
    await screen.findByText("Renew Subscription");

    // No pre-seeded script and no stubbed image/script load event — the
    // script's onerror never fires in jsdom either, so we simulate the
    // "gateway unavailable" branch by asserting the loader promise itself:
    // loadRazorpayScript only resolves true via a real script id already
    // present, which we deliberately don't add here, then manually fire
    // the script's onerror handler once React has appended it to the DOM.
    fireEvent.click(
      screen.getByText("Pay ₹7,999 & Renew", { selector: "span" }),
    );
    await waitFor(() => {
      const script = document.getElementById("razorpay-script");
      expect(script).not.toBeNull();
    });
    const script = document.getElementById("razorpay-script")!;
    fireEvent.error(script);

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Failed to load payment gateway. Check your connection.",
        }),
      ),
    );
  });

  describe("Change Plan", () => {
    it("disables the Change Plan button when the selected tier/billing matches the current plan", async () => {
      mockGet.mockResolvedValue({
        data: { success: true, data: { tenant: tenant() } },
      });
      renderSubscription();
      await screen.findByText("Change Plan", { selector: "h6" });
      expect(
        screen.getByRole("button", { name: "Change Plan" }),
      ).toBeDisabled();
    });

    it("blocks switching to a lower tier when headcount is over its limit", async () => {
      mockGet.mockResolvedValue({
        data: {
          success: true,
          data: {
            tenant: tenant({ planTier: "enterprise", activeEmployeeCount: 30 }),
          },
        },
      });
      renderSubscription();
      await screen.findByText("Change Plan", { selector: "h6" });

      fireEvent.click(screen.getByRole("button", { name: /Starter/ }));
      expect(
        await screen.findByText(/Starter supports up to 25 employees/),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Change Plan" }),
      ).toBeDisabled();
    });

    it("submits a scheduled (no-payment) plan change and refreshes the tenant", async () => {
      mockGet.mockResolvedValueOnce({
        data: { success: true, data: { tenant: tenant() } },
      });
      mockPost.mockResolvedValueOnce({
        data: {
          success: true,
          message: "Your plan will change on 1 February 2026.",
          data: { requiresPayment: false },
        },
      });
      mockGet.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            tenant: tenant({
              pendingPlanTier: "growth",
              pendingBilling: "monthly",
              pendingPlanChangeAt: "2026-02-01T00:00:00Z",
            }),
          },
        },
      });

      const { setAlert } = renderSubscription();
      await screen.findByText("Change Plan", { selector: "h6" });

      fireEvent.click(screen.getByRole("button", { name: /Growth/ }));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Change Plan" }));
      });

      await waitFor(() =>
        expect(mockPost).toHaveBeenCalledWith("/payment/change-plan", {
          planTier: "growth",
          billing: "monthly",
        }),
      );
      await waitFor(() =>
        expect(setAlert).toHaveBeenCalledWith(
          expect.objectContaining({ severity: "success" }),
        ),
      );
      expect(
        await screen.findByText(/Your plan will change to HRMS Growth/),
      ).toBeInTheDocument();
    });

    it("collects a prorated payment via Razorpay order checkout for an immediate upgrade", async () => {
      mockGet.mockResolvedValueOnce({
        data: { success: true, data: { tenant: tenant() } },
      });
      mockPost.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            requiresPayment: true,
            orderId: "order_123",
            amount: 50000,
            keyId: "rzp_test_key",
          },
        },
      });

      const fakeScript = document.createElement("script");
      fakeScript.id = "razorpay-script";
      document.body.appendChild(fakeScript);

      const openSpy = vi.fn();
      const RazorpayMock = vi.fn(function MockRazorpay(this: any) {
        this.open = openSpy;
      });
      (window as any).Razorpay = RazorpayMock;

      renderSubscription();
      await screen.findByText("Change Plan", { selector: "h6" });

      fireEvent.click(screen.getByRole("button", { name: /Growth/ }));
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Change Plan" }));
      });

      await waitFor(() =>
        expect(RazorpayMock).toHaveBeenCalledWith(
          expect.objectContaining({
            order_id: "order_123",
            amount: 50000,
            key: "rzp_test_key",
          }),
        ),
      );
      expect(openSpy).toHaveBeenCalled();
    });
  });
});
