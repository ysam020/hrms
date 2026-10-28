import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  PLAN_PRICING,
  PLAN_TIER_LABELS,
  TIER_EMPLOYEE_LIMITS,
  amountPaise,
  formatINR,
  loadRazorpayScript,
  type Billing,
  type PlanTier,
} from "@web/shared/constants/billing";
import {
  Banner,
  Button,
  ConfirmDialog,
  ErrorState,
  Icon,
  KeyValues,
  Page,
  Section,
  SegmentedControl,
  Skeleton,
  StatusBadge,
  type Tone,
  KeyValuesSkeleton,
  TextSkeleton,
} from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";
import s from "./subscription.module.css";

// Subscription (Classic's features/subscription/Subscription.tsx). Pricing,
// tiers and the Razorpay script loader are Classic's billing constants; the
// three checkout flows (renew, prorated upgrade, payment-method change) and
// their confirm endpoints are reproduced exactly, consolidated into one
// checkout helper.

interface Tenant {
  id: string;
  name: string;
  plan: string;
  billing: string | null;
  planTier: string;
  pendingPlanTier: string | null;
  pendingBilling: string | null;
  pendingPlanChangeAt: string | null;
  activeEmployeeCount: number;
  subscriptionStatus: string;
  planActivatedAt: string | null;
  planExpiresAt: string | null;
  razorpaySubscriptionId: string | null;
  paymentMethod: string | null;
  paymentMethodSummary: string | null;
}

const PLAN_FEATURES = [
  "All modules (Attendance, Leave, Payroll, Recruitment)",
  "Analytics & Monitoring dashboards",
  "Role-based permissions",
  "Push notifications",
  "Priority support",
];
const TIERS: PlanTier[] = ["starter", "growth", "enterprise"];
const ACCENT = "#166E96";

const longDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";
const graceDeadline = (expires: string) =>
  longDate(new Date(new Date(expires).getTime() + 7 * 864e5).toISOString());
const safeTier = (t: string): PlanTier =>
  t === "growth" || t === "enterprise" ? t : "starter";
const billingOf = (t: Tenant): Billing =>
  t.billing === "annual" ? "annual" : "monthly";
const STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "success" },
  grace_period: { label: "Grace Period", tone: "warning" },
  cancelling: { label: "Cancelling", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "warning" },
  expired: { label: "Expired", tone: "danger" },
};
const METHOD: Record<string, string> = {
  card: "Card",
  upi: "UPI",
  netbanking: "Net Banking",
  emandate: "e-Mandate",
  nach: "e-Mandate",
  wallet: "Wallet",
};

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_signature: string;
  razorpay_subscription_id?: string;
  razorpay_order_id?: string;
}

function PlanCard({
  tier,
  billing,
  amount,
  limit,
}: {
  tier: PlanTier;
  billing: Billing;
  amount: number;
  limit?: number | null;
}) {
  const features =
    limit === undefined
      ? PLAN_FEATURES
      : [
          limit === null ? "Unlimited employees" : `Up to ${limit} employees`,
          ...PLAN_FEATURES,
        ];
  return (
    <div className={s.plan}>
      <div className={s.planHead}>
        <div>
          <p className="px-headline">HRMS {PLAN_TIER_LABELS[tier]}</p>
          <p className="px-meta">Full-featured HR management</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p className={`px-title px-num ${s.price}`}>{formatINR(amount)}</p>
          <p className="px-meta">
            {billing === "annual" ? "per year" : "per month"}
          </p>
        </div>
      </div>
      <ul className={s.features}>
        {features.map((f) => (
          <li key={f}>
            <Icon name="check" className={s.check} />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Subscription() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const [tenant, setTenant] = useState<Tenant | null | undefined>(undefined);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState<
    "cancel" | "renew" | "change" | "method" | null
  >(null);
  const [renewBilling, setRenewBilling] = useState<Billing>("monthly");
  const [changeTier, setChangeTier] = useState<PlanTier>("starter");
  const [changeBilling, setChangeBilling] = useState<Billing>("monthly");
  // Razorpay's handler fires long after render; read the live choice from a ref (as Classic does).
  const renewRef = useRef(renewBilling);
  renewRef.current = renewBilling;

  const fail = (err: unknown, fallback: string) =>
    setAlert({
      open: true,
      message: (err as any)?.response ? errorMessage(err) : fallback,
      severity: "error",
    });
  const fetchTenant = useCallback(
    () =>
      apiClient
        .get(API_ENDPOINTS.MY_TENANT)
        .then((res) => {
          const t: Tenant | undefined = res.data?.data?.tenant;
          if (!t) return setTenant((prev) => prev ?? null);
          setTenant(t);
          setChangeTier(safeTier(t.planTier));
          setChangeBilling(billingOf(t));
        })
        .catch(() => setTenant((prev) => prev ?? null)),
    [],
  );
  useEffect(() => {
    fetchTenant();
  }, [fetchTenant]);

  /** Opens Razorpay Checkout; on payment, posts the confirm call and refreshes. */
  const checkout = async (
    kind: "renew" | "change" | "method",
    options: Record<string, unknown>,
    confirm: (
      r: RazorpayResponse,
    ) => Promise<{ data?: { success?: boolean; message?: string } }>,
    messages: { ok: string; failed: string },
  ) => {
    if (!(await loadRazorpayScript())) {
      setAlert({
        open: true,
        message:
          "The payment window couldn’t load. Check your connection and try again.",
        severity: "error",
      });
      setBusy(null);
      return;
    }
    const rzp = new (window as any).Razorpay({
      name: "Praesto",
      image: `${window.location.origin}/favicon.ico`,
      prefill: {
        name: user
          ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim()
          : "",
        email: user?.email ?? "",
      },
      theme: { color: ACCENT },
      ...options,
      handler: (response: RazorpayResponse) => {
        confirm(response)
          .then((res) => {
            if (res.data?.success) {
              setAlert({
                open: true,
                message: messages.ok,
                severity: "success",
              });
              return fetchTenant();
            }
            setAlert({
              open: true,
              message: res.data?.message || messages.failed,
              severity: "error",
            });
          })
          .catch((err) => fail(err, messages.failed))
          .finally(() => setBusy(null));
      },
      modal: { ondismiss: () => setBusy(null) },
    });
    rzp.open();
    void kind;
  };

  const renew = async () => {
    setBusy("renew");
    try {
      const res = await apiClient.post(API_ENDPOINTS.CREATE_SUBSCRIPTION, {
        billing: renewRef.current,
      });
      if (!res.data?.success) throw new Error();
      const { subscriptionId, keyId } = res.data.data;
      await checkout(
        "renew",
        {
          key: keyId,
          subscription_id: subscriptionId,
          description: `HRMS ${renewRef.current === "annual" ? "Annual" : "Monthly"} subscription`,
          method: { card: false },
        },
        (r) =>
          apiClient.post(API_ENDPOINTS.REACTIVATE_SUBSCRIPTION, {
            billing: renewRef.current,
            razorpayPaymentId: r.razorpay_payment_id,
            razorpaySubscriptionId: r.razorpay_subscription_id,
            razorpaySignature: r.razorpay_signature,
          }),
        { ok: "Subscription renewed.", failed: "Renewal didn’t go through." },
      );
    } catch (err) {
      fail(err, "The subscription couldn’t be created. Try again.");
      setBusy(null);
    }
  };

  const changePlan = async () => {
    setBusy("change");
    const tier = changeTier;
    const billing = changeBilling;
    try {
      const res = await apiClient.post(API_ENDPOINTS.CHANGE_PLAN, {
        planTier: tier,
        billing,
      });
      if (!res.data?.success) {
        setAlert({
          open: true,
          message: res.data?.message || "The plan couldn’t be changed.",
          severity: "error",
        });
        return setBusy(null);
      }
      const data = res.data.data;
      if (!data?.requiresPayment) {
        setAlert({
          open: true,
          message: res.data?.message || "Plan change scheduled.",
          severity: "success",
        });
        await fetchTenant();
        return setBusy(null);
      }
      await checkout(
        "change",
        {
          key: data.keyId,
          order_id: data.orderId,
          amount: data.amount,
          currency: "INR",
          description: "Plan upgrade — prorated charge",
        },
        (r) =>
          apiClient.post(API_ENDPOINTS.CONFIRM_PLAN_UPGRADE, {
            razorpayOrderId: r.razorpay_order_id,
            razorpayPaymentId: r.razorpay_payment_id,
            razorpaySignature: r.razorpay_signature,
            planTier: tier,
            billing,
          }),
        { ok: "Plan upgraded.", failed: "The upgrade didn’t go through." },
      );
    } catch (err) {
      fail(err, "The plan couldn’t be changed.");
      setBusy(null);
    }
  };

  const changeMethod = async () => {
    setBusy("method");
    try {
      const res = await apiClient.post(
        API_ENDPOINTS.START_PAYMENT_METHOD_CHANGE,
      );
      if (!res.data?.success) {
        setAlert({
          open: true,
          message:
            res.data?.message || "The payment method change couldn’t start.",
          severity: "error",
        });
        return setBusy(null);
      }
      const { subscriptionId, keyId } = res.data.data;
      await checkout(
        "method",
        {
          key: keyId,
          subscription_id: subscriptionId,
          description: "HRMS subscription — payment method update",
          // Card only: UPI/e-Mandate subscriptions can't have their plan changed
          // later, which is the reason this flow exists (Classic's note).
          method: {
            card: true,
            netbanking: false,
            wallet: false,
            upi: false,
            paylater: false,
            emi: false,
          },
        },
        (r) =>
          apiClient.post(API_ENDPOINTS.CONFIRM_PAYMENT_METHOD_CHANGE, {
            razorpayPaymentId: r.razorpay_payment_id,
            razorpaySubscriptionId: r.razorpay_subscription_id,
            razorpaySignature: r.razorpay_signature,
          }),
        {
          ok: "Payment method updated.",
          failed: "The payment method couldn’t be updated.",
        },
      );
    } catch (err) {
      fail(err, "The payment method couldn’t be updated.");
      setBusy(null);
    }
  };

  const cancelPendingChange = async () => {
    if (!tenant) return;
    setBusy("change");
    try {
      const res = await apiClient.post(API_ENDPOINTS.CHANGE_PLAN, {
        planTier: safeTier(tenant.planTier),
        billing: billingOf(tenant),
      });
      if (res.data?.success) {
        setAlert({
          open: true,
          message: "Scheduled plan change cancelled.",
          severity: "success",
        });
        await fetchTenant();
      } else
        setAlert({
          open: true,
          message:
            res.data?.message || "The scheduled change couldn’t be cancelled.",
          severity: "error",
        });
    } catch (err) {
      fail(err, "The scheduled change couldn’t be cancelled.");
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy("cancel");
    try {
      const res = await apiClient.post(API_ENDPOINTS.CANCEL_SUBSCRIPTION);
      if (res.data?.success) {
        setTenant((t) => t && { ...t, subscriptionStatus: "cancelled" });
        setAlert({
          open: true,
          message: "Subscription cancelled.",
          severity: "success",
        });
        setCancelOpen(false);
      } else
        setAlert({
          open: true,
          message:
            res.data?.message || "The subscription couldn’t be cancelled.",
          severity: "error",
        });
    } catch (err) {
      fail(err, "The subscription couldn’t be cancelled.");
    } finally {
      setBusy(null);
    }
  };

  if (tenant === undefined)
    return (
      <Page title="Subscription" width="reading">
        <div style={{ display: "grid", gap: 32 }}>
          <div style={{ display: "grid", gap: 14 }}>
            <Skeleton width={180} height={26} />
            <Skeleton width={240} height={13} />
            <KeyValuesSkeleton rows={4} />
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            <Skeleton width={140} height={20} />
            <Skeleton width={300} height={32} radius={8} />
            <TextSkeleton lines={4} lastWidth="45%" />
          </div>
        </div>
      </Page>
    );
  if (tenant === null)
    return (
      <Page title="Subscription" width="reading">
        <ErrorState
          message="Subscription details didn’t load."
          onRetry={fetchTenant}
        />
      </Page>
    );

  const tier = safeTier(tenant.planTier);
  const status = tenant.subscriptionStatus;
  const accessEnded =
    status === "cancelled" &&
    (!tenant.planExpiresAt || new Date(tenant.planExpiresAt) <= new Date());
  const isExpired = status === "expired" || accessEnded;
  const canChangePlan = status === "active" || status === "grace_period";
  const changeLimit = TIER_EMPLOYEE_LIMITS[changeTier];
  const blockedByHeadcount =
    changeLimit !== null && tenant.activeEmployeeCount > changeLimit;
  const isSameAsCurrent =
    changeTier === tier &&
    changeBilling === billingOf(tenant) &&
    !tenant.pendingPlanTier;
  const badge = accessEnded
    ? { label: "Cancelled", tone: "danger" as Tone }
    : (STATUS[status] ?? STATUS.expired);

  return (
    <Page title="Subscription" width="reading">
      <section className={s.current}>
        <div className={s.planHead}>
          <div>
            <h2 className="px-title">HRMS {PLAN_TIER_LABELS[tier]}</h2>
            <p className="px-secondary px-callout">
              {billingOf(tenant) === "annual" ? "Annual" : "Monthly"} ·{" "}
              <span className="px-num">
                {formatINR(amountPaise(tier, billingOf(tenant)))}
              </span>
              {billingOf(tenant) === "annual" ? "/year" : "/month"} ·{" "}
              {tenant.activeEmployeeCount} employees
            </p>
          </div>
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        </div>

        {tenant.pendingPlanTier && tenant.pendingPlanChangeAt && (
          <Banner icon="calendar">
            <span
              className="px-row"
              style={{ justifyContent: "space-between", width: "100%" }}
            >
              <span>
                Changes to HRMS{" "}
                {PLAN_TIER_LABELS[safeTier(tenant.pendingPlanTier)]} (
                {tenant.pendingBilling === "annual" ? "Annual" : "Monthly"}) on{" "}
                <strong>{longDate(tenant.pendingPlanChangeAt)}</strong>.
              </span>
              <Button
                size="small"
                variant="plain"
                busy={busy === "change"}
                onClick={cancelPendingChange}
              >
                Keep Current Plan
              </Button>
            </span>
          </Banner>
        )}
        {status === "grace_period" && tenant.planExpiresAt && (
          <Banner tone="warning">
            Your subscription has lapsed. Renew before{" "}
            <strong>{graceDeadline(tenant.planExpiresAt)}</strong> to keep
            access.
          </Banner>
        )}
        {status === "expired" && (
          <Banner tone="danger">
            Your subscription has expired. Renew below to restore access.
          </Banner>
        )}
        {status === "cancelled" && !accessEnded && tenant.planExpiresAt && (
          <Banner tone="warning">
            Cancelled and won’t renew. Your team keeps access until{" "}
            <strong>{longDate(tenant.planExpiresAt)}</strong>.
          </Banner>
        )}
        {accessEnded && (
          <Banner tone="danger">
            Your subscription was cancelled and access has ended. Resubscribe
            below to continue.
          </Banner>
        )}

        <KeyValues
          items={[
            ["Activated", longDate(tenant.planActivatedAt)],
            [
              status === "expired" ? "Expired" : "Renews",
              longDate(tenant.planExpiresAt),
            ],
            ...(tenant.razorpaySubscriptionId
              ? ([
                  [
                    "Subscription ID",
                    <span
                      style={{
                        fontFamily: "var(--px-font-mono)",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {tenant.razorpaySubscriptionId}
                    </span>,
                  ],
                ] as [string, React.ReactNode][])
              : []),
            ...(tenant.paymentMethod
              ? ([
                  [
                    "Payment Method",
                    <span>
                      {tenant.paymentMethodSummary}{" "}
                      <span className="px-meta">
                        · {METHOD[tenant.paymentMethod] ?? "Payment method"}
                      </span>
                    </span>,
                  ],
                ] as [string, React.ReactNode][])
              : []),
          ]}
        />
        {tenant.paymentMethod &&
          ["upi", "emandate", "nach"].includes(tenant.paymentMethod) && (
            <p className="px-meta">Switch to a card to make plan changes.</p>
          )}
        <div className="px-row" style={{ justifyContent: "space-between" }}>
          {tenant.paymentMethod && canChangePlan ? (
            <Button
              busy={busy === "method"}
              disabled={busy !== null && busy !== "method"}
              onClick={changeMethod}
            >
              Change Payment Method
            </Button>
          ) : (
            <span />
          )}
          {!isExpired && status !== "cancelled" && (
            <Button variant="tintedDanger" onClick={() => setCancelOpen(true)}>
              Cancel Subscription
            </Button>
          )}
        </div>
      </section>

      {canChangePlan && (
        <Section title="Change Plan">
          <div style={{ display: "grid", gap: 12 }}>
            <SegmentedControl
              role="radiogroup"
              label="Plan"
              value={changeTier}
              onChange={setChangeTier}
              segments={TIERS.map((t) => ({
                value: t,
                label:
                  TIER_EMPLOYEE_LIMITS[t] === null
                    ? PLAN_TIER_LABELS[t]
                    : `${PLAN_TIER_LABELS[t]} (≤${TIER_EMPLOYEE_LIMITS[t]})`,
              }))}
            />
            <SegmentedControl
              role="radiogroup"
              label="Billing"
              value={changeBilling}
              onChange={setChangeBilling}
              segments={[
                { value: "monthly", label: "Monthly" },
                { value: "annual", label: "Annual" },
              ]}
            />
            {blockedByHeadcount && (
              <Banner tone="warning">
                {PLAN_TIER_LABELS[changeTier]} supports up to {changeLimit}{" "}
                employees. You have {tenant.activeEmployeeCount}.
              </Banner>
            )}
            <PlanCard
              tier={changeTier}
              billing={changeBilling}
              amount={amountPaise(changeTier, changeBilling)}
              limit={changeLimit}
            />
            <p className="px-meta">
              Upgrading the tier on the same billing period charges the prorated
              difference now. Downgrades and billing-period changes take effect
              at your next renewal, with no charge today.
            </p>
            <Button
              variant="primary"
              busy={busy === "change"}
              disabled={busy !== null || isSameAsCurrent || blockedByHeadcount}
              onClick={changePlan}
            >
              Change Plan
            </Button>
          </div>
        </Section>
      )}

      {isExpired && (
        <Section title="Renew Subscription">
          <div style={{ display: "grid", gap: 12 }}>
            <SegmentedControl
              role="radiogroup"
              label="Billing"
              value={renewBilling}
              onChange={setRenewBilling}
              segments={[
                { value: "monthly", label: "Monthly" },
                { value: "annual", label: "Annual · Save 10%" },
              ]}
            />
            <PlanCard
              tier={tier}
              billing={renewBilling}
              amount={PLAN_PRICING[tier][renewBilling]}
            />
            <Button
              variant="primary"
              busy={busy === "renew"}
              disabled={busy !== null}
              onClick={renew}
            >
              Pay {formatINR(PLAN_PRICING[tier][renewBilling])} and Renew
            </Button>
            <p className="px-meta" style={{ textAlign: "center" }}>
              By continuing you agree to the{" "}
              <Link to="/terms-of-use">Terms of Use</Link> and{" "}
              <Link to="/refund-policy">Refund Policy</Link>.
            </p>
          </div>
        </Section>
      )}

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={cancel}
        busy={busy === "cancel"}
        title="Cancel your subscription?"
        description={
          tenant.planExpiresAt
            ? `It stops renewing. Your team keeps full access until ${longDate(tenant.planExpiresAt)}, then you’ll need to resubscribe.`
            : "It stops renewing. This can’t be undone."
        }
        confirmLabel="Cancel Subscription"
      />
    </Page>
  );
}
