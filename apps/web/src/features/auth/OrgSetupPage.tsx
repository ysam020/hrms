import {
  useState,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import Grid from "@mui/material/Grid2";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@web/shared/components/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import { useNavigate, useLocation } from "react-router-dom";
import apiClient, { setAccessToken } from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import LogoDark from "@web/assets/data/LogoDark";
import LogoLight from "@web/assets/data/LogoLight";
import {
  defaultWorkWeek,
  type WorkWeekValue,
} from "@web/shared/components/WorkWeekPicker";
import "@web/styles/login.scss";
import { OrgSetupLeftPanel } from "./org-setup/OrgSetupLeftPanel";
import { TenantPicker } from "./org-setup/TenantPicker";
import { JoinRequestPending } from "./org-setup/JoinRequestPending";
import { JoinOfferPrompt } from "./org-setup/JoinOfferPrompt";
import { OrgDetailsStep } from "./org-setup/OrgDetailsStep";
import { PlanStep } from "./org-setup/PlanStep";
import { ContactInfoStep } from "./org-setup/ContactInfoStep";
import { loadRazorpayScript } from "./org-setup/constants";
import {
  PENDING_FORM_KEY,
  type Billing,
  type PendingOrgForm,
  type Tenant,
} from "./org-setup/types";
import type { PlanTier } from "@web/shared/constants/billing";

// The company-size dropdown (OrgDetailsStep) is what decides the plan tier —
// PlanStep no longer lets the user pick a tier directly, it only picks
// monthly vs. annual for whichever tier this resolves to.
function planTierForCompanySize(companySize: string): PlanTier {
  if (companySize === "26–100") return "growth";
  if (companySize === "More than 100") return "enterprise";
  return "starter";
}

export default function OrgSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setAlert } = useContext(AlertContext);
  const { setUser, user, handleLogout } = useContext(UserContext);
  const { theme } = useContext(ThemeContext);

  const [step, setStep] = useState<number>(
    (location.state as any)?.startAtStep ?? 0,
  );
  const [orgName, setOrgName] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [workWeek, setWorkWeek] = useState<WorkWeekValue>(defaultWorkWeek());
  const [billing, setBilling] = useState<Billing>("monthly");
  const [loading, setLoading] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [helpPhone, setHelpPhone] = useState("");
  const [helpEmail, setHelpEmail] = useState("");
  const [officeAddress, setOfficeAddress] = useState("");
  const [website, setWebsite] = useState("");
  const [workState, setWorkState] = useState("");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [fetching, setFetching] = useState(true);
  const [domainSuggestion, setDomainSuggestion] = useState<{
    tenantId: string;
    tenantName: string;
  } | null>(null);
  const [previousRejected, setPreviousRejected] = useState(false);
  const [joinRequestStatus, setJoinRequestStatus] = useState<
    "pending" | "approved" | null
  >(null);
  const [joinRequestTenant, setJoinRequestTenant] = useState<{
    tenantId: string;
    tenantName: string;
  } | null>(null);
  const [checkingDomain, setCheckingDomain] = useState(false);
  const [submittingJoinRequest, setSubmittingJoinRequest] = useState(false);

  const planTier = planTierForCompanySize(companySize);

  const orgNameRef = useRef(orgName);
  const industryRef = useRef(industry);
  const companySizeRef = useRef(companySize);
  const workWeekRef = useRef(workWeek);
  const billingRef = useRef(billing);
  useEffect(() => {
    orgNameRef.current = orgName;
  }, [orgName]);
  useEffect(() => {
    industryRef.current = industry;
  }, [industry]);
  useEffect(() => {
    companySizeRef.current = companySize;
  }, [companySize]);
  useEffect(() => {
    workWeekRef.current = workWeek;
  }, [workWeek]);
  useEffect(() => {
    billingRef.current = billing;
  }, [billing]);

  useEffect(() => {
    apiClient
      .get("/tenants/available")
      .then(async (res) => {
        if (!res.data?.success) return;
        const tenantList: Tenant[] = res.data.data.tenants ?? [];
        setTenants(tenantList);

        if (tenantList.length > 0) return;

        setCheckingDomain(true);
        try {
          const suggestionRes = await apiClient.get(
            API_ENDPOINTS.DOMAIN_SUGGESTION,
          );
          if (suggestionRes.data?.success) {
            const d = suggestionRes.data.data;
            if (
              d.requestStatus === "pending" ||
              d.requestStatus === "approved"
            ) {
              setJoinRequestStatus(d.requestStatus);
              setJoinRequestTenant({
                tenantId: d.request.tenantId,
                tenantName: d.request.tenantName,
              });
            } else if (d.suggestion) {
              setDomainSuggestion({
                tenantId: d.suggestion.tenantId,
                tenantName: d.suggestion.tenantName,
              });
              setPreviousRejected(d.previousRequestStatus === "rejected");
            }
          }
        } catch {
          // non-fatal — falls through to the normal create-org wizard
        }
        setCheckingDomain(false);

        // No tenants yet — check if a payment completed but the tab was closed
        // before POST /tenants finished. Only proceed if we have form data saved
        // (which means the Razorpay handler fired on a previous visit).
        const raw = localStorage.getItem(PENDING_FORM_KEY);
        if (!raw) return;

        try {
          const form = JSON.parse(raw) as PendingOrgForm;
          const setupRes = await apiClient.get(API_ENDPOINTS.PENDING_SETUP);
          if (!setupRes.data?.data?.hasPending) {
            localStorage.removeItem(PENDING_FORM_KEY);
            return;
          }

          setResuming(true);
          const createRes = await apiClient.post(
            API_ENDPOINTS.COMPLETE_PENDING_SETUP,
            {
              name: form.orgName,
              ...(form.industry && { industry: form.industry }),
              ...(form.companySize && { companySize: form.companySize }),
              workWeekPattern: form.workWeek ?? defaultWorkWeek(),
            },
          );
          if (createRes.data?.success) {
            setAccessToken(createRes.data.data.accessToken);
            localStorage.removeItem(PENDING_FORM_KEY);
            setStep(2);
          } else {
            localStorage.removeItem(PENDING_FORM_KEY);
            setAlert({
              open: true,
              message:
                createRes.data?.message ||
                "Failed to resume organisation setup.",
              severity: "error",
            });
          }
        } catch {
          localStorage.removeItem(PENDING_FORM_KEY);
        } finally {
          setResuming(false);
        }
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [setAlert]);

  const finishSetup = useCallback(async () => {
    const res = await apiClient.get(API_ENDPOINTS.GET_PROFILE);
    if (res.data?.success) {
      setUser(res.data.data.user);
      navigate("/", { replace: true });
    }
  }, [setUser, navigate]);

  const handleCompleteOrgSetup = useCallback(async () => {
    try {
      const res = await apiClient.post(API_ENDPOINTS.COMPLETE_ORG_SETUP);
      if (res.data?.success && res.data.data?.accessToken) {
        setAccessToken(res.data.data.accessToken);
      }
    } catch {
      // non-fatal — token will be corrected on next refresh
    }
  }, []);

  const handlePayAndCreate = async () => {
    setLoading(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        setAlert({
          open: true,
          message: "Failed to load payment gateway. Check your connection.",
          severity: "error",
        });
        setLoading(false);
        return;
      }

      const subRes = await apiClient.post(API_ENDPOINTS.CREATE_SUBSCRIPTION, {
        billing,
        planTier,
      });
      if (!subRes.data?.success) {
        setAlert({
          open: true,
          message: "Failed to create subscription.",
          severity: "error",
        });
        setLoading(false);
        return;
      }

      const { subscriptionId, keyId } = subRes.data.data;

      const options = {
        key: keyId,
        subscription_id: subscriptionId,
        name: "Praesto",
        image: `${window.location.origin}/favicon.ico`,
        description: `HRMS Pro – ${billing === "annual" ? "Annual" : "Monthly"} subscription`,
        prefill: {
          name: user
            ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim()
            : "",
          email: user?.email ?? "",
        },
        method: { card: false },
        theme: { color: "#1976d2" },
        handler: (response: {
          razorpay_payment_id: string;
          razorpay_subscription_id: string;
          razorpay_signature: string;
        }) => {
          const name = orgNameRef.current.trim();
          const ind = industryRef.current;
          const size = companySizeRef.current;
          const week = workWeekRef.current;
          const bill = billingRef.current;
          const tier = planTierForCompanySize(companySizeRef.current);

          // Store non-sensitive form data so we can recover if the tab closes
          // before the API call completes. No payment credentials are stored.
          localStorage.setItem(
            PENDING_FORM_KEY,
            JSON.stringify({
              orgName: name,
              industry: ind,
              companySize: size,
              workWeek: week,
            } satisfies PendingOrgForm),
          );

          apiClient
            .post("/tenants", {
              name,
              ...(ind && { industry: ind }),
              ...(size && { companySize: size }),
              workWeekPattern: week,
              billing: bill,
              planTier: tier,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySubscriptionId: response.razorpay_subscription_id,
              razorpaySignature: response.razorpay_signature,
            })
            .then(async (createRes) => {
              if (createRes.data?.success) {
                setAccessToken(createRes.data.data.accessToken);
                localStorage.removeItem(PENDING_FORM_KEY);
                setLoading(false);
                setStep(2);
              } else {
                setAlert({
                  open: true,
                  message:
                    createRes.data?.message || "Failed to create organisation.",
                  severity: "error",
                });
              }
            })
            .catch((err: any) => {
              setAlert({
                open: true,
                message:
                  err.response?.data?.message ||
                  "Failed to create organisation.",
                severity: "error",
              });
            })
            .finally(() => setLoading(false));
        },
        modal: { ondismiss: () => setLoading(false) },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      setAlert({
        open: true,
        message:
          err.response?.data?.message ||
          "Something went wrong. Please try again.",
        severity: "error",
      });
      setLoading(false);
    }
  };

  const handleSelectTenant = async (tenantId: string) => {
    setLoading(true);
    try {
      const res = await apiClient.post(API_ENDPOINTS.SELECT_TENANT, {
        tenantId,
      });
      if (res.data?.success) {
        setAccessToken(res.data.data.accessToken);
        await finishSetup();
      } else {
        setAlert({
          open: true,
          message: res.data?.message || "Failed to select tenant.",
          severity: "error",
        });
      }
    } catch (err: any) {
      setAlert({
        open: true,
        message: err.response?.data?.message || "Failed to select tenant.",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRequestJoin = async () => {
    if (!domainSuggestion) return;
    setSubmittingJoinRequest(true);
    try {
      const res = await apiClient.post(API_ENDPOINTS.JOIN_REQUESTS, {
        tenantId: domainSuggestion.tenantId,
      });
      if (res.data?.success) {
        setJoinRequestStatus("pending");
        setJoinRequestTenant(domainSuggestion);
      } else {
        setAlert({
          open: true,
          message: res.data?.message || "Failed to send join request.",
          severity: "error",
        });
      }
    } catch (err: any) {
      setAlert({
        open: true,
        message: err.response?.data?.message || "Failed to send join request.",
        severity: "error",
      });
    } finally {
      setSubmittingJoinRequest(false);
    }
  };

  const handleCheckAgain = async () => {
    setCheckingDomain(true);
    try {
      const res = await apiClient.get(API_ENDPOINTS.DOMAIN_SUGGESTION);
      if (res.data?.success) {
        const d = res.data.data;
        if (d.requestStatus === "pending" || d.requestStatus === "approved") {
          setJoinRequestStatus(d.requestStatus);
          setJoinRequestTenant({
            tenantId: d.request.tenantId,
            tenantName: d.request.tenantName,
          });
        }
      }
    } catch {
      // non-fatal
    }
    setCheckingDomain(false);
  };

  useEffect(() => {
    if (joinRequestStatus === "approved" && joinRequestTenant) {
      handleSelectTenant(joinRequestTenant.tenantId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinRequestStatus, joinRequestTenant]);

  // A join offer (pending request or a fresh domain-match suggestion) takes
  // priority over the create-org wizard for as long as it exists — a domain
  // that already has an organisation must join it, not spin up a duplicate.
  const showJoinOffer = joinRequestStatus === "pending" || !!domainSuggestion;

  const isCreatingNew =
    !fetching &&
    !checkingDomain &&
    tenants.length === 0 &&
    joinRequestStatus !== "approved" &&
    !showJoinOffer;

  const leftColStyle = useMemo(
    () => ({
      backgroundSize: "cover",
      backgroundPosition: "center",
    }),
    [],
  );

  const rightTitle =
    fetching || checkingDomain
      ? "Loading…"
      : tenants.length > 0
        ? "Select your organisation"
        : showJoinOffer && joinRequestStatus === "pending"
          ? "Request pending"
          : showJoinOffer && domainSuggestion
            ? "Join your team's workspace"
            : step === 0
              ? "Set up your organisation"
              : step === 1
                ? "Choose your plan"
                : "Organisation profile";

  const rightSubtitle =
    !fetching && !checkingDomain
      ? tenants.length > 0
        ? "Choose the organisation you want to log into."
        : showJoinOffer && joinRequestStatus === "pending"
          ? "An admin needs to approve your request before you can continue."
          : showJoinOffer && domainSuggestion
            ? "We found an existing organisation for your email domain."
            : step === 0
              ? "Tell us a bit about your company to get started."
              : step === 1
                ? "All features included. Cancel anytime."
                : "Help your employees find the right contacts. You can update these anytime."
      : null;

  return (
    <Grid container className="login-row">
      <OrgSetupLeftPanel style={leftColStyle} />

      {/* ── Right column ────────────────────────────────────── */}
      <Grid size={6} className="login-right-col">
        <div
          className="login-right-col-inner-container"
          style={{ maxHeight: "90vh", overflowY: "auto" }}
        >
          {/* Logo */}
          <div className="logo-section">
            <div className="logo-container">
              <Box sx={{ width: 200, height: 60 }}>
                {theme === "light" ? <LogoDark /> : <LogoLight />}
              </Box>
            </div>
            <Typography
              variant="h5"
              className="login-title"
              sx={{ fontWeight: 700 }}
            >
              {rightTitle}
            </Typography>
            {rightSubtitle && (
              <Typography variant="body2" className="login-subtitle">
                {rightSubtitle}
              </Typography>
            )}
          </div>

          {/* Stepper */}
          {isCreatingNew && (
            <Stepper activeStep={step} sx={{ mb: 3 }}>
              <Step>
                <StepLabel>Organisation details</StepLabel>
              </Step>
              <Step>
                <StepLabel>Subscription plan</StepLabel>
              </Step>
              <Step>
                <StepLabel>Contact info</StepLabel>
              </Step>
            </Stepper>
          )}

          {/* ── Body ── */}
          {fetching || resuming || checkingDomain ? (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                py: 4,
              }}
            >
              <CircularProgress />
              {resuming && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  textAlign="center"
                >
                  Completing your organisation setup…
                </Typography>
              )}
            </Box>
          ) : joinRequestStatus === "approved" ? (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
                py: 4,
              }}
            >
              <CircularProgress />
              <Typography
                variant="body2"
                color="text.secondary"
                textAlign="center"
              >
                Request approved — taking you in…
              </Typography>
            </Box>
          ) : showJoinOffer && joinRequestStatus === "pending" ? (
            <JoinRequestPending
              tenantName={joinRequestTenant?.tenantName}
              checkingDomain={checkingDomain}
              onCheckAgain={handleCheckAgain}
            />
          ) : showJoinOffer && domainSuggestion ? (
            <JoinOfferPrompt
              tenantName={domainSuggestion.tenantName}
              previousRejected={previousRejected}
              submitting={submittingJoinRequest}
              onRequestJoin={handleRequestJoin}
            />
          ) : tenants.length > 0 ? (
            <TenantPicker
              tenants={tenants}
              loading={loading}
              onSelect={handleSelectTenant}
            />
          ) : step === 0 ? (
            <OrgDetailsStep
              orgName={orgName}
              setOrgName={setOrgName}
              industry={industry}
              setIndustry={setIndustry}
              companySize={companySize}
              setCompanySize={setCompanySize}
              workWeek={workWeek}
              setWorkWeek={setWorkWeek}
              onContinue={() => setStep(1)}
            />
          ) : step === 1 ? (
            <PlanStep
              billing={billing}
              setBilling={setBilling}
              planTier={planTier}
              loading={loading}
              onBack={() => setStep(0)}
              onPayAndCreate={handlePayAndCreate}
            />
          ) : (
            <ContactInfoStep
              helpPhone={helpPhone}
              setHelpPhone={setHelpPhone}
              helpEmail={helpEmail}
              setHelpEmail={setHelpEmail}
              officeAddress={officeAddress}
              setOfficeAddress={setOfficeAddress}
              workState={workState}
              setWorkState={setWorkState}
              website={website}
              setWebsite={setWebsite}
              loading={loading}
              onSkip={async () => {
                await handleCompleteOrgSetup();
                await finishSetup();
                setAlert({
                  open: true,
                  message: "Organisation created!",
                  severity: "success",
                });
              }}
              onSaveAndContinue={async () => {
                setLoading(true);
                try {
                  await apiClient.put(API_ENDPOINTS.ORG_PROFILE, {
                    ...(helpPhone && { helpPhone }),
                    ...(helpEmail && { helpEmail }),
                    ...(officeAddress && { officeAddress }),
                    ...(website && { website }),
                    ...(workState && { workState }),
                  });
                } catch {
                  // non-fatal — continue to app even if save fails
                }
                await handleCompleteOrgSetup();
                await finishSetup();
                setAlert({
                  open: true,
                  message: "Organisation created!",
                  severity: "success",
                });
              }}
            />
          )}

          <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
            <Button variant="ghost" size="small" onClick={handleLogout}>
              Log out
            </Button>
          </Box>
        </div>
      </Grid>
    </Grid>
  );
}
