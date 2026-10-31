import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { setAccessToken } from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import {
  defaultWorkWeek,
  type WorkWeekValue,
} from "@web/shared/components/WorkWeekPicker";
import {
  PLAN_PRICING,
  PLAN_TIER_LABELS,
  TIER_EMPLOYEE_LIMITS,
  formatINR,
  loadRazorpayScript,
  type PlanTier,
} from "@web/shared/constants/billing";
import {
  COMPANY_SIZES,
  INDUSTRIES,
  PLAN_FEATURES,
} from "@web/features/auth/org-setup/constants";
import {
  PENDING_FORM_KEY,
  type Billing,
  type PendingOrgForm,
  type Tenant,
} from "@web/features/auth/org-setup/types";
import { states } from "@web/assets/data/statesData";
import { Swap } from "@next/motion";
import {
  Banner,
  Button,
  Field,
  FormGrid,
  Icon,
  SegmentedControl,
  Select,
  Spinner,
  TextArea,
  TextInput,
  fieldSpan2,
} from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";
import { BrandLockup } from "@next/features/auth/BrandMark";
import s from "./public.module.css";

// Organisation setup (Classic's features/auth/OrgSetupPage + org-setup/*).
// Every request, the domain-join rules, the Razorpay subscription checkout,
// the resume-after-closed-tab recovery (PENDING_FORM_KEY) and the token swaps
// are Classic's, step for step. Only the presentation is new.

/** Company size decides the plan tier; the plan step only picks the billing period. */
function planTierForCompanySize(size: string): PlanTier {
  if (size === "26–100") return "growth";
  if (size === "More than 100") return "enterprise";
  return "starter";
}

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const STEPS = ["Organisation", "Plan", "Contact"];

function WorkWeekField({
  value,
  onChange,
}: {
  value: WorkWeekValue;
  onChange: (v: WorkWeekValue) => void;
}) {
  const toggle = (i: number) =>
    onChange({
      type: "custom",
      workingDays: value.workingDays.includes(i)
        ? value.workingDays.filter((d) => d !== i)
        : [...value.workingDays, i].sort(),
    });
  return (
    <Field
      label="Working Days"
      hint="Used for attendance and leave from day one. You can change it later in Settings."
      className={fieldSpan2}
    >
      <div className={s.week}>
        <Select
          aria-label="Work week pattern"
          value={value.type}
          onChange={(e) =>
            onChange(defaultWorkWeek(e.target.value as WorkWeekValue["type"]))
          }
        >
          <option value="mon_fri">Monday to Friday</option>
          <option value="mon_sat">Monday to Saturday</option>
          <option value="custom">Custom</option>
        </Select>
        <div className={s.days} role="group" aria-label="Working days">
          {DAYS.map((d, i) => (
            <button
              key={d}
              type="button"
              className={s.day}
              aria-pressed={value.workingDays.includes(i)}
              aria-label={d}
              onClick={() => toggle(i)}
            >
              {d[0]}
            </button>
          ))}
        </div>
      </div>
    </Field>
  );
}

export default function OrgSetup() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setAlert } = useContext(AlertContext);
  const { setUser, user, handleLogout } = useContext(UserContext);
  const [step, setStep] = useState<number>(
    (location.state as any)?.startAtStep ?? 0,
  );
  const [orgName, setOrgName] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [workWeek, setWorkWeek] = useState<WorkWeekValue>(defaultWorkWeek());
  const [billing, setBilling] = useState<Billing>("monthly");
  const [contact, setContact] = useState({
    helpPhone: "",
    helpEmail: "",
    officeAddress: "",
    website: "",
    workState: "",
  });
  const [loading, setLoading] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [fetching, setFetching] = useState(true);
  const [checkingDomain, setCheckingDomain] = useState(false);
  const [suggestion, setSuggestion] = useState<{
    tenantId: string;
    tenantName: string;
  } | null>(null);
  const [previousRejected, setPreviousRejected] = useState(false);
  const [joinStatus, setJoinStatus] = useState<"pending" | "approved" | null>(
    null,
  );
  const [joinTenant, setJoinTenant] = useState<{
    tenantId: string;
    tenantName: string;
  } | null>(null);
  const [requesting, setRequesting] = useState(false);
  // The server decides trial eligibility (one per organisation) and length;
  // null until asked, or if the check fails — then only "pay now" is offered.
  const [trialOffer, setTrialOffer] = useState<{
    eligible: boolean;
    trialDays: number;
    message?: string;
  } | null>(null);
  const planTier = planTierForCompanySize(companySize);

  // Razorpay's handler fires long after render; read the live form from a ref.
  const form = useRef({ orgName, industry, companySize, workWeek, billing });
  form.current = { orgName, industry, companySize, workWeek, billing };

  // The open checkout, so leaving setup (signing out, or setup finishing
  // elsewhere) closes it instead of leaving Razorpay's overlay over the
  // next screen. A payment that already went through is unaffected: its
  // handler saved the form first, and setup resumes from it on next sign-in.
  const checkout = useRef<{ close?: () => void } | null>(null);
  // False once setup is left (e.g. signed out): a response that lands
  // afterwards mustn't put a session back into this tab.
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
      try {
        checkout.current?.close?.();
      } catch {
        // Already closed.
      }
      checkout.current = null;
    },
    [],
  );

  const fail = (err: unknown, fallback: string) =>
    setAlert({
      open: true,
      message: (err as any)?.response ? errorMessage(err) : fallback,
      severity: "error",
    });

  useEffect(() => {
    document.title = "Set Up · Praesto";
    apiClient
      .get("/tenants/available")
      .then(async (res) => {
        if (!res.data?.success) return;
        const list: Tenant[] = res.data.data.tenants ?? [];
        setTenants(list);
        if (list.length > 0) return;
        setCheckingDomain(true);
        try {
          const sr = await apiClient.get(API_ENDPOINTS.DOMAIN_SUGGESTION);
          if (sr.data?.success) {
            const d = sr.data.data;
            if (
              d.requestStatus === "pending" ||
              d.requestStatus === "approved"
            ) {
              setJoinStatus(d.requestStatus);
              setJoinTenant({
                tenantId: d.request.tenantId,
                tenantName: d.request.tenantName,
              });
            } else if (d.suggestion) {
              setSuggestion({
                tenantId: d.suggestion.tenantId,
                tenantName: d.suggestion.tenantName,
              });
              setPreviousRejected(d.previousRequestStatus === "rejected");
            }
          }
        } catch {
          // non-fatal: falls through to the create wizard
        }
        setCheckingDomain(false);
        // Payment may have completed with the tab closed before POST /tenants
        // finished; the saved form (no payment data) lets setup resume.
        const raw = localStorage.getItem(PENDING_FORM_KEY);
        if (!raw) return;
        try {
          const saved = JSON.parse(raw) as PendingOrgForm;
          const pending = await apiClient.get(API_ENDPOINTS.PENDING_SETUP);
          if (!pending.data?.data?.hasPending)
            return localStorage.removeItem(PENDING_FORM_KEY);
          setResuming(true);
          const created = await apiClient.post(
            API_ENDPOINTS.COMPLETE_PENDING_SETUP,
            {
              name: saved.orgName,
              ...(saved.industry && { industry: saved.industry }),
              ...(saved.companySize && { companySize: saved.companySize }),
              workWeekPattern: saved.workWeek ?? defaultWorkWeek(),
            },
          );
          localStorage.removeItem(PENDING_FORM_KEY);
          if (!alive.current) return;
          if (created.data?.success) {
            setAccessToken(created.data.data.accessToken);
            setStep(2);
          } else
            setAlert({
              open: true,
              message:
                created.data?.message || "Organisation setup couldn’t resume.",
              severity: "error",
            });
        } catch {
          localStorage.removeItem(PENDING_FORM_KEY);
        } finally {
          setResuming(false);
        }
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [setAlert]);

  const finish = useCallback(async () => {
    const res = await apiClient.get(API_ENDPOINTS.GET_PROFILE);
    if (res.data?.success) {
      setUser(res.data.data.user);
      navigate("/dashboard", { replace: true });
    }
  }, [setUser, navigate]);

  const completeOrgSetup = useCallback(async () => {
    try {
      const res = await apiClient.post(API_ENDPOINTS.COMPLETE_ORG_SETUP);
      if (alive.current && res.data?.success && res.data.data?.accessToken)
        setAccessToken(res.data.data.accessToken);
    } catch {
      // non-fatal: the token is corrected on the next refresh
    }
  }, []);

  const fetchTrialOffer = useCallback(() => {
    apiClient
      .get(API_ENDPOINTS.TRIAL_ELIGIBILITY)
      .then((res) => {
        if (res.data?.success && alive.current) setTrialOffer(res.data.data);
      })
      .catch(() => {
        // non-fatal: the plan step falls back to paying now
      });
  }, []);

  // Refused by the server after all (the check is advisory until the
  // organisation is created): show why, and drop the trial offer.
  const trialRefused = (err: unknown) => {
    const data = (err as any)?.response?.data;
    if (data?.code !== "TRIAL_NOT_ELIGIBLE") return false;
    setTrialOffer((o) => o && { ...o, eligible: false, message: data.message });
    setAlert({ open: true, message: data.message, severity: "warning" });
    return true;
  };

  const payAndCreate = async (trial: boolean) => {
    setLoading(true);
    try {
      if (!(await loadRazorpayScript())) {
        setAlert({
          open: true,
          message:
            "The payment window couldn’t load. Check your connection and try again.",
          severity: "error",
        });
        return setLoading(false);
      }
      const sub = await apiClient.post(API_ENDPOINTS.CREATE_SUBSCRIPTION, {
        billing,
        planTier,
        ...(trial && { trial: true }),
      });
      if (!sub.data?.success) {
        setAlert({
          open: true,
          message: "The subscription couldn’t be created. Try again.",
          severity: "error",
        });
        return setLoading(false);
      }
      const { subscriptionId, keyId } = sub.data.data;
      const rzp = new (window as any).Razorpay({
        key: keyId,
        subscription_id: subscriptionId,
        name: "Praesto",
        image: `${window.location.origin}/favicon.ico`,
        description: trial
          ? `HRMS ${PLAN_TIER_LABELS[planTier]} – free trial, then ${billing === "annual" ? "annual" : "monthly"} subscription`
          : `HRMS Pro – ${billing === "annual" ? "Annual" : "Monthly"} subscription`,
        prefill: {
          name: user
            ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim()
            : "",
          email: user?.email ?? "",
        },
        method: { card: false },
        theme: { color: "#166E96" },
        handler: (r: {
          razorpay_payment_id: string;
          razorpay_subscription_id: string;
          razorpay_signature: string;
        }) => {
          const f = form.current;
          const name = f.orgName.trim();
          localStorage.setItem(
            PENDING_FORM_KEY,
            JSON.stringify({
              orgName: name,
              industry: f.industry,
              companySize: f.companySize,
              workWeek: f.workWeek,
            } satisfies PendingOrgForm),
          );
          apiClient
            .post("/tenants", {
              name,
              ...(f.industry && { industry: f.industry }),
              ...(f.companySize && { companySize: f.companySize }),
              workWeekPattern: f.workWeek,
              billing: f.billing,
              planTier: planTierForCompanySize(f.companySize),
              razorpayPaymentId: r.razorpay_payment_id,
              razorpaySubscriptionId: r.razorpay_subscription_id,
              razorpaySignature: r.razorpay_signature,
            })
            .then((res) => {
              if (res.data?.success) {
                localStorage.removeItem(PENDING_FORM_KEY);
                if (!alive.current) return;
                setAccessToken(res.data.data.accessToken);
                setStep(2);
              } else
                setAlert({
                  open: true,
                  message:
                    res.data?.message ||
                    "The organisation couldn’t be created.",
                  severity: "error",
                });
            })
            .catch((err) => {
              if (trialRefused(err)) localStorage.removeItem(PENDING_FORM_KEY);
              else fail(err, "The organisation couldn’t be created.");
            })
            .finally(() => setLoading(false));
        },
        modal: {
          ondismiss: () => {
            checkout.current = null;
            setLoading(false);
          },
        },
      });
      checkout.current = rzp;
      rzp.open();
    } catch (err) {
      if (!trialRefused(err)) fail(err, "Something went wrong. Try again.");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (step === 1 && !trialOffer) fetchTrialOffer();
  }, [step, trialOffer, fetchTrialOffer]);

  const selectTenant = async (tenantId: string) => {
    setLoading(true);
    try {
      const res = await apiClient.post(API_ENDPOINTS.SELECT_TENANT, {
        tenantId,
      });
      if (res.data?.success) {
        setAccessToken(res.data.data.accessToken);
        await finish();
      } else
        setAlert({
          open: true,
          message: res.data?.message || "That organisation couldn’t be opened.",
          severity: "error",
        });
    } catch (err) {
      fail(err, "That organisation couldn’t be opened.");
    } finally {
      setLoading(false);
    }
  };

  const requestJoin = async () => {
    if (!suggestion) return;
    setRequesting(true);
    try {
      const res = await apiClient.post(API_ENDPOINTS.JOIN_REQUESTS, {
        tenantId: suggestion.tenantId,
      });
      if (res.data?.success) {
        setJoinStatus("pending");
        setJoinTenant(suggestion);
      } else
        setAlert({
          open: true,
          message: res.data?.message || "The request couldn’t be sent.",
          severity: "error",
        });
    } catch (err) {
      fail(err, "The request couldn’t be sent.");
    } finally {
      setRequesting(false);
    }
  };

  const checkAgain = async () => {
    setCheckingDomain(true);
    try {
      const res = await apiClient.get(API_ENDPOINTS.DOMAIN_SUGGESTION);
      const d = res.data?.data;
      if (
        res.data?.success &&
        (d.requestStatus === "pending" || d.requestStatus === "approved")
      ) {
        setJoinStatus(d.requestStatus);
        setJoinTenant({
          tenantId: d.request.tenantId,
          tenantName: d.request.tenantName,
        });
      }
    } catch {
      // non-fatal
    }
    setCheckingDomain(false);
  };

  useEffect(() => {
    if (joinStatus === "approved" && joinTenant)
      selectTenant(joinTenant.tenantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinStatus, joinTenant]);

  const saveContactAndFinish = async (save: boolean) => {
    setLoading(true);
    if (save) {
      const body = Object.fromEntries(
        Object.entries(contact).filter(([, v]) => v),
      );
      try {
        await apiClient.put(API_ENDPOINTS.ORG_PROFILE, body);
      } catch {
        // non-fatal: continue into the app (Classic does the same)
      }
    }
    await completeOrgSetup();
    await finish();
    setAlert({
      open: true,
      message: "Organisation created.",
      severity: "success",
    });
    setLoading(false);
  };

  // A domain match (pending request or fresh suggestion) takes priority: a
  // domain that already has an organisation joins it, not a duplicate.
  const showJoinOffer = joinStatus === "pending" || Boolean(suggestion);
  const busyState = fetching || resuming || checkingDomain;
  const creating =
    !busyState &&
    tenants.length === 0 &&
    joinStatus !== "approved" &&
    !showJoinOffer;

  const view = busyState
    ? "loading"
    : joinStatus === "approved"
      ? "approved"
      : showJoinOffer && joinStatus === "pending"
        ? "pending"
        : showJoinOffer
          ? "offer"
          : tenants.length > 0
            ? "tenants"
            : `step${step}`;

  const heading: Record<string, [string, string?]> = {
    loading: [resuming ? "Finishing Setup" : "One Moment"],
    approved: ["Request Approved", "Taking you in…"],
    pending: [
      "Request Pending",
      "An admin needs to approve your request before you can continue.",
    ],
    offer: [
      "Join Your Team",
      "There’s already an organisation for your email domain.",
    ],
    tenants: [
      "Choose an Organisation",
      "Pick the organisation you want to sign in to.",
    ],
    step0: ["Set Up Your Organisation", "Tell us a little about your company."],
    step1: trialOffer?.eligible
      ? [
          "Start Your Free Trial",
          `Every feature, free for ${trialOffer.trialDays} days. Cancel any time before it ends.`,
        ]
      : ["Choose Billing", "Every feature is included. Cancel any time."],
    step2: [
      "Organisation Profile",
      "Help your team find the right contacts. You can change these later.",
    ],
  };
  const [title, subtitle] = heading[view];
  const limit = TIER_EMPLOYEE_LIMITS[planTier];
  const price = formatINR(PLAN_PRICING[planTier][billing]);
  // Display only — the server sets the real trial end when it creates the
  // subscription, from the same trialDays.
  const trialEndDate = trialOffer?.eligible
    ? new Date(Date.now() + trialOffer.trialDays * 864e5).toLocaleDateString(
        "en-IN",
        {
          day: "numeric",
          month: "long",
          year: "numeric",
        },
      )
    : null;

  return (
    <div className={s.setup}>
      <main className={s.card}>
        <div className={s.brand}>
          <BrandLockup size={26} />
        </div>
        {creating && (
          <ol className={s.steps} aria-label="Setup progress">
            {STEPS.map((label, i) => (
              <li
                key={label}
                data-state={
                  i < step ? "done" : i === step ? "current" : undefined
                }
                aria-current={i === step ? "step" : undefined}
              >
                <span className={s.stepDot}>
                  {i < step ? <Icon name="check" size={12} /> : i + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>
        )}
        <header>
          <h1 className="px-title">{title}</h1>
          {subtitle && (
            <p className="px-secondary" style={{ marginTop: 4 }}>
              {subtitle}
            </p>
          )}
        </header>
        <Swap id={view}>
          {view === "loading" || view === "approved" ? (
            <div className={s.center}>
              <Spinner
                size="large"
                label={
                  resuming ? "Completing your organisation setup…" : "Loading"
                }
                showLabel={resuming}
              />
            </div>
          ) : view === "pending" ? (
            <div className={s.stack}>
              <p>
                Your request to join <strong>{joinTenant?.tenantName}</strong>{" "}
                is waiting for an admin to approve it. Check back once they’ve
                reviewed it.
              </p>
              <Button busy={checkingDomain} onClick={checkAgain}>
                Check Again
              </Button>
            </div>
          ) : view === "offer" ? (
            <div className={s.stack}>
              {previousRejected && (
                <Banner tone="warning">
                  Your previous request was declined.
                </Banner>
              )}
              <p>
                <strong>{suggestion?.tenantName}</strong> already has a
                workspace for your email domain. Ask to join it to continue.
              </p>
              <Button variant="primary" busy={requesting} onClick={requestJoin}>
                Request to Join
              </Button>
            </div>
          ) : view === "tenants" ? (
            <ul className={s.tenants}>
              {tenants.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={s.tenant}
                    disabled={loading}
                    onClick={() => selectTenant(t.id)}
                  >
                    <span className={s.tenantMark}>
                      {t.name.charAt(0).toUpperCase()}
                    </span>
                    <span
                      style={{
                        display: "grid",
                        flex: 1,
                        minWidth: 0,
                        textAlign: "left",
                      }}
                    >
                      <span className="px-headline px-truncate">{t.name}</span>
                      <span
                        className="px-meta"
                        style={{ textTransform: "capitalize" }}
                      >
                        {t.role}
                      </span>
                    </span>
                    <Icon name="chevronRight" />
                  </button>
                </li>
              ))}
            </ul>
          ) : step === 0 ? (
            <form
              className={s.stack}
              onSubmit={(e) => {
                e.preventDefault();
                if (orgName.trim()) setStep(1);
              }}
            >
              <FormGrid columns={2}>
                <Field label="Organisation Name" className={fieldSpan2}>
                  <TextInput
                    data-autofocus
                    autoFocus
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Acme Corp"
                    autoComplete="organization"
                  />
                </Field>
                <Field label="Industry" optional>
                  <Select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                  >
                    <option value="">Choose…</option>
                    {INDUSTRIES.map((i) => (
                      <option key={i}>{i}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Company Size" hint="Decides your plan">
                  <Select
                    value={companySize}
                    onChange={(e) => setCompanySize(e.target.value)}
                  >
                    <option value="">Choose…</option>
                    {COMPANY_SIZES.map((c) => (
                      <option key={c} value={c}>
                        {c} employees
                      </option>
                    ))}
                  </Select>
                </Field>
                <WorkWeekField value={workWeek} onChange={setWorkWeek} />
              </FormGrid>
              <Button
                type="submit"
                variant="primary"
                disabled={!orgName.trim()}
              >
                Continue
              </Button>
            </form>
          ) : step === 1 ? (
            <div className={s.stack}>
              <SegmentedControl
                role="radiogroup"
                label="Billing"
                value={billing}
                onChange={setBilling}
                segments={[
                  { value: "monthly", label: "Monthly" },
                  { value: "annual", label: "Annual" },
                ]}
              />
              <div className={s.plan}>
                <div className={s.planHead}>
                  <div>
                    <p className="px-headline">
                      HRMS {PLAN_TIER_LABELS[planTier]}
                    </p>
                    <p className="px-meta">Full-featured HR management</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p className="px-title px-num">
                      {formatINR(PLAN_PRICING[planTier][billing])}
                    </p>
                    <p className="px-meta">
                      {billing === "annual" ? "per year" : "per month"}
                    </p>
                  </div>
                </div>
                <ul className={s.features}>
                  {[
                    limit === null
                      ? "Unlimited employees"
                      : `Up to ${limit} employees`,
                    ...PLAN_FEATURES,
                  ].map((f) => (
                    <li key={f}>
                      <Icon name="check" className={s.check} /> {f}
                    </li>
                  ))}
                </ul>
              </div>
              {trialOffer?.eligible ? (
                <p className="px-callout">
                  Nothing is charged today. You’ll authorise UPI Autopay or an
                  e-Mandate now (your bank may run a small verification that’s
                  refunded); <span className="px-num">{price}</span> is
                  collected on <strong>{trialEndDate}</strong> and{" "}
                  {billing === "annual" ? "every year" : "every month"} after,
                  unless you cancel from the Subscription page before then.
                </p>
              ) : (
                trialOffer?.message && <Banner>{trialOffer.message}</Banner>
              )}
              <div className={s.actions}>
                <Button onClick={() => setStep(0)} disabled={loading}>
                  Back
                </Button>
                {trialOffer?.eligible ? (
                  <Button
                    variant="primary"
                    busy={loading}
                    onClick={() => payAndCreate(true)}
                  >
                    Start {trialOffer.trialDays}-Day Free Trial
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    busy={loading}
                    onClick={() => payAndCreate(false)}
                  >
                    Pay {price} and Create
                  </Button>
                )}
              </div>
              {trialOffer?.eligible && (
                <div style={{ textAlign: "center" }}>
                  <Button
                    variant="plain"
                    size="small"
                    disabled={loading}
                    onClick={() => payAndCreate(false)}
                  >
                    Skip the Trial and Pay {price} Now
                  </Button>
                </div>
              )}
              <p className="px-meta" style={{ textAlign: "center" }}>
                By continuing you agree to the{" "}
                <a href="/terms-of-use">Terms of Use</a> and{" "}
                <a href="/refund-policy">Refund Policy</a>.
              </p>
            </div>
          ) : (
            <form
              className={s.stack}
              onSubmit={(e) => {
                e.preventDefault();
                saveContactAndFinish(true);
              }}
            >
              <FormGrid columns={2}>
                <Field label="Help Phone" optional>
                  <TextInput
                    type="tel"
                    value={contact.helpPhone}
                    onChange={(e) =>
                      setContact((c) => ({ ...c, helpPhone: e.target.value }))
                    }
                    placeholder="+91 98765 43210"
                    autoComplete="tel"
                  />
                </Field>
                <Field label="Help Email" optional>
                  <TextInput
                    type="email"
                    value={contact.helpEmail}
                    onChange={(e) =>
                      setContact((c) => ({ ...c, helpEmail: e.target.value }))
                    }
                    placeholder="hr@yourcompany.com"
                  />
                </Field>
                <Field label="Office Address" optional className={fieldSpan2}>
                  <TextArea
                    rows={2}
                    value={contact.officeAddress}
                    onChange={(e) =>
                      setContact((c) => ({
                        ...c,
                        officeAddress: e.target.value,
                      }))
                    }
                    placeholder="123 Main Street, Mumbai 400001"
                  />
                </Field>
                <Field label="State" optional>
                  <Select
                    value={contact.workState}
                    onChange={(e) =>
                      setContact((c) => ({ ...c, workState: e.target.value }))
                    }
                  >
                    <option value="">Choose…</option>
                    {states.map((st: string) => (
                      <option key={st}>{st}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Website" optional>
                  <TextInput
                    type="url"
                    value={contact.website}
                    onChange={(e) =>
                      setContact((c) => ({ ...c, website: e.target.value }))
                    }
                    placeholder="https://yourcompany.com"
                  />
                </Field>
              </FormGrid>
              <div className={s.actions}>
                <Button
                  disabled={loading}
                  onClick={() => saveContactAndFinish(false)}
                >
                  Skip for Now
                </Button>
                <Button type="submit" variant="primary" busy={loading}>
                  Save and Continue
                </Button>
              </div>
            </form>
          )}
        </Swap>
        <div style={{ textAlign: "center" }}>
          <Button variant="plain" size="small" onClick={handleLogout}>
            Log Out
          </Button>
        </div>
      </main>
    </div>
  );
}
