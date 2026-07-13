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
import TextField from "@mui/material/TextField";
import Button from "@web/shared/components/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ToggleButton from "@mui/material/ToggleButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import CheckIcon from "@mui/icons-material/Check";
import PeopleIcon from "@mui/icons-material/People";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import AssessmentIcon from "@mui/icons-material/Assessment";
import WorkIcon from "@mui/icons-material/Work";
import { alpha } from "@mui/material/styles";
import { useNavigate, useLocation } from "react-router-dom";
import apiClient, { setAccessToken } from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import LogoDark from "@web/assets/data/LogoDark";
import LogoLight from "@web/assets/data/LogoLight";
import WorkWeekPicker, {
  defaultWorkWeek,
  type WorkWeekValue,
} from "@web/shared/components/WorkWeekPicker";
import "@web/styles/login.scss";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  role: string;
}

// Only non-sensitive form fields — no payment credentials.
const PENDING_FORM_KEY = "hrms_pending_org_form";

interface PendingOrgForm {
  orgName: string;
  industry: string;
  companySize: string;
  workWeek: WorkWeekValue;
}

type Billing = "monthly" | "annual";

const INDUSTRIES = [
  "Technology",
  "Healthcare",
  "Finance & Banking",
  "Education",
  "Retail & E-commerce",
  "Manufacturing",
  "Construction",
  "Hospitality & Travel",
  "Professional Services",
  "Non-profit",
  "Other",
];

const COMPANY_SIZES = [
  "1–10",
  "11–50",
  "51–200",
  "201–500",
  "501–1000",
  "1000+",
];

const PLAN_FEATURES = [
  "All modules (Attendance, Leave, Payroll, Recruitment)",
  "Unlimited employees",
  "Analytics & Monitoring dashboards",
  "Role-based permissions",
  "Push notifications",
  "Priority support",
];

const PRICES = {
  monthly: { display: "₹999", sub: "per month", amount: 99900 },
  annual: {
    display: "₹9,999",
    sub: "per year",
    savings: "Save ₹2,989 (25%)",
    amount: 999900,
  },
};

const LEFT_FEATURES = [
  {
    icon: <PeopleIcon sx={{ fontSize: 22 }} />,
    title: "Employee Lifecycle",
    description:
      "From onboarding to offboarding — manage your entire workforce in one place.",
    color: "#4caf50",
  },
  {
    icon: <EventAvailableIcon sx={{ fontSize: 22 }} />,
    title: "Attendance & Leave",
    description:
      "Automated tracking, smart approvals, and real-time visibility for teams.",
    color: "#2196f3",
  },
  {
    icon: <AssessmentIcon sx={{ fontSize: 22 }} />,
    title: "Payroll & Analytics",
    description:
      "Accurate payslips and actionable workforce insights — all in one dashboard.",
    color: "#ff9800",
  },
  {
    icon: <WorkIcon sx={{ fontSize: 22 }} />,
    title: "Recruitment",
    description:
      "Post openings, track candidates, and hire faster with structured pipelines.",
    color: "#e91e63",
  },
];

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.getElementById("razorpay-script")) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "razorpay-script";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
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
  const [dismissedSuggestion, setDismissedSuggestion] = useState(false);

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
  // priority over the create-org wizard until the user explicitly dismisses
  // it via "Create a separate organisation instead".
  const showJoinOffer =
    !dismissedSuggestion &&
    (joinRequestStatus === "pending" || !!domainSuggestion);

  const isCreatingNew =
    !fetching &&
    !checkingDomain &&
    tenants.length === 0 &&
    joinRequestStatus !== "approved" &&
    !showJoinOffer;
  const price = PRICES[billing];

  const leftColStyle = useMemo(
    () => ({
      background: "url(/assets/images/login-bg.webp)",
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
      {/* ── Left column ─────────────────────────────────────── */}
      <Grid size={6} className="login-left-col" style={leftColStyle}>
        <div className="login-left-content">
          <div className="login-left-header">
            <div className="company-badge">
              <PeopleIcon sx={{ fontSize: 20, mr: 1 }} />
              <Typography
                variant="body2"
                className="main-heading"
                sx={{ fontWeight: 600 }}
              >
                HR Management System
              </Typography>
            </div>

            <Typography variant="h3" className="main-heading">
              Your Workspace,
              <br />
              <span className="gradient-text">Your Way</span>
            </Typography>

            <Typography variant="body1" className="sub-heading">
              Set up your organisation in minutes and unlock a complete suite of
              HR tools built for modern teams.
            </Typography>
          </div>

          <div className="features-grid">
            {LEFT_FEATURES.map((f, i) => (
              <div key={i} className="feature-card">
                <div className="feature-icon" style={{ color: f.color }}>
                  {f.icon}
                </div>
                <div className="feature-content">
                  <Typography variant="subtitle2" className="feature-title">
                    {f.title}
                  </Typography>
                  <Typography variant="caption" className="feature-description">
                    {f.description}
                  </Typography>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Grid>

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
            /* Waiting on admin approval */
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Typography variant="body2" sx={{ color: "var(--text-color)" }}>
                Your request to join{" "}
                <strong>{joinRequestTenant?.tenantName}</strong> is waiting for
                approval from an admin. Check back once they've reviewed it.
              </Typography>
              <Button
                variant="primary"
                fullWidth
                size="large"
                disabled={checkingDomain}
                loading={checkingDomain}
                onClick={handleCheckAgain}
                style={{
                  borderRadius: "8px",
                  paddingTop: 11.2,
                  paddingBottom: 11.2,
                  textTransform: "none",
                  fontWeight: 600,
                  fontSize: 15,
                }}
              >
                Check again
              </Button>
              <Divider sx={{ my: 1, borderColor: "var(--text-input-border)" }}>
                <Typography
                  variant="caption"
                  sx={{ color: "var(--text-color)", opacity: 0.6 }}
                >
                  or
                </Typography>
              </Divider>
              <Typography
                variant="body2"
                textAlign="center"
                sx={{
                  color: "var(--text-color)",
                  opacity: 0.7,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
                onClick={() => setDismissedSuggestion(true)}
              >
                Create a separate organisation instead
              </Typography>
            </Box>
          ) : showJoinOffer && domainSuggestion ? (
            /* Fresh domain-match offer */
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {previousRejected && (
                <Typography variant="caption" sx={{ color: "warning.main" }}>
                  Your previous request was declined.
                </Typography>
              )}
              <Typography variant="body2" sx={{ color: "var(--text-color)" }}>
                <strong>{domainSuggestion.tenantName}</strong> already has a
                workspace for your email domain. Request to join, or create a
                separate organisation.
              </Typography>
              <Button
                variant="primary"
                fullWidth
                size="large"
                disabled={submittingJoinRequest}
                loading={submittingJoinRequest}
                onClick={handleRequestJoin}
                style={{
                  borderRadius: "8px",
                  paddingTop: 11.2,
                  paddingBottom: 11.2,
                  textTransform: "none",
                  fontWeight: 600,
                  fontSize: 15,
                }}
              >
                Request to join
              </Button>
              <Divider sx={{ my: 1, borderColor: "var(--text-input-border)" }}>
                <Typography
                  variant="caption"
                  sx={{ color: "var(--text-color)", opacity: 0.6 }}
                >
                  or
                </Typography>
              </Divider>
              <Typography
                variant="body2"
                textAlign="center"
                sx={{
                  color: "var(--text-color)",
                  opacity: 0.7,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
                onClick={() => setDismissedSuggestion(true)}
              >
                Create a separate organisation instead
              </Typography>
            </Box>
          ) : tenants.length > 0 ? (
            /* Existing tenant picker */
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {tenants.map((t) => (
                <Button
                  key={t.id}
                  variant="outline"
                  fullWidth
                  disabled={loading}
                  onClick={() => handleSelectTenant(t.id)}
                  style={{
                    justifyContent: "space-between",
                    paddingTop: 12,
                    paddingBottom: 12,
                    paddingLeft: 16,
                    paddingRight: 16,
                    borderRadius: "8px",
                    borderColor: "var(--text-input-border)",
                    color: "var(--text-color)",
                  }}
                >
                  <Box sx={{ textAlign: "left" }}>
                    <Typography
                      fontWeight={600}
                      color="var(--text-color-secondary)"
                    >
                      {t.name}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="var(--text-color)"
                      sx={{ opacity: 0.6 }}
                    >
                      {t.slug}
                    </Typography>
                  </Box>
                  <Chip
                    label={t.role}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                </Button>
              ))}
            </Box>
          ) : step === 0 ? (
            /* Step 1: Organisation details */
            <>
              <TextField
                label="Organisation name"
                fullWidth
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && orgName.trim() && setStep(1)
                }
                placeholder="Acme Corp"
                sx={{
                  mb: 2,
                  "& .MuiOutlinedInput-root": { borderRadius: "8px" },
                }}
              />

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Industry</InputLabel>
                <Select
                  value={industry}
                  label="Industry"
                  onChange={(e) => setIndustry(e.target.value)}
                  sx={{ borderRadius: "8px" }}
                >
                  {INDUSTRIES.map((i) => (
                    <MenuItem key={i} value={i}>
                      {i}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Company size</InputLabel>
                <Select
                  value={companySize}
                  label="Company size"
                  onChange={(e) => setCompanySize(e.target.value)}
                  sx={{ borderRadius: "8px" }}
                >
                  {COMPANY_SIZES.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s} employees
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Box sx={{ mb: 3 }}>
                <WorkWeekPicker value={workWeek} onChange={setWorkWeek} />
              </Box>

              <Button
                variant="primary"
                fullWidth
                size="large"
                disabled={!orgName.trim()}
                onClick={() => setStep(1)}
                style={{
                  borderRadius: "8px",
                  paddingTop: 11.2,
                  paddingBottom: 11.2,
                  fontWeight: 600,
                  textTransform: "none",
                  fontSize: 15,
                }}
              >
                Continue
              </Button>
            </>
          ) : step === 1 ? (
            /* Step 2: Plan + payment */
            <>
              {/* Billing toggle */}
              <Box sx={{ display: "flex", justifyContent: "center", mb: 2.5 }}>
                <ToggleButtonGroup
                  value={billing}
                  exclusive
                  size="small"
                  onChange={(_, v) => v && setBilling(v)}
                  sx={{
                    "& .MuiToggleButton-root": {
                      borderRadius: "8px",
                      px: 3,
                      textTransform: "none",
                      fontWeight: 500,
                    },
                  }}
                >
                  <ToggleButton value="monthly">Monthly</ToggleButton>
                  <ToggleButton value="annual">Annual</ToggleButton>
                </ToggleButtonGroup>
              </Box>

              {/* Plan card */}
              <Box
                sx={{
                  border: 2,
                  borderColor: "primary.main",
                  borderRadius: "10px",
                  p: 2.5,
                  mb: 2.5,
                  bgcolor: (t) => alpha(t.palette.primary.main, 0.04),
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    mb: 1.5,
                  }}
                >
                  <Box>
                    <Typography variant="h6" fontWeight={700}>
                      HRMS Pro
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Full-featured HR management
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "right" }}>
                    <Typography
                      variant="h5"
                      fontWeight={800}
                      color="primary.main"
                    >
                      {price.display}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {price.sub}
                    </Typography>
                    {billing === "annual" && "savings" in price && (
                      <Typography
                        variant="caption"
                        display="block"
                        color="success.main"
                        fontWeight={600}
                      >
                        {price.savings}
                      </Typography>
                    )}
                  </Box>
                </Box>

                <Divider
                  sx={{ my: 1.5, borderColor: "var(--text-input-border)" }}
                />

                <List dense disablePadding>
                  {PLAN_FEATURES.map((f) => (
                    <ListItem key={f} disableGutters sx={{ py: 0.3 }}>
                      <ListItemIcon sx={{ minWidth: 28 }}>
                        <CheckIcon fontSize="small" color="success" />
                      </ListItemIcon>
                      <ListItemText
                        primary={f}
                        primaryTypographyProps={{ variant: "body2" }}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>

              <Box sx={{ display: "flex", gap: 1.5 }}>
                <Button
                  variant="outline"
                  fullWidth
                  onClick={() => setStep(0)}
                  disabled={loading}
                  style={{
                    borderRadius: "8px",
                    borderColor: "var(--text-input-border)",
                    color: "var(--text-color)",
                    textTransform: "none",
                    fontWeight: 500,
                  }}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  fullWidth
                  size="large"
                  disabled={loading}
                  onClick={handlePayAndCreate}
                  loading={loading}
                  style={{
                    borderRadius: "8px",
                    paddingTop: 11.2,
                    paddingBottom: 11.2,
                    textTransform: "none",
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  {`Pay ${price.display} & Continue`}
                </Button>
              </Box>
            </>
          ) : (
            /* Step 3: Contact info */
            <>
              <TextField
                label="Help phone number"
                fullWidth
                value={helpPhone}
                onChange={(e) => setHelpPhone(e.target.value)}
                placeholder="+91 98765 43210"
                sx={{
                  mb: 2,
                  "& .MuiOutlinedInput-root": { borderRadius: "8px" },
                }}
              />
              <TextField
                label="Help email address"
                fullWidth
                type="email"
                value={helpEmail}
                onChange={(e) => setHelpEmail(e.target.value)}
                placeholder="hr@yourcompany.com"
                sx={{
                  mb: 2,
                  "& .MuiOutlinedInput-root": { borderRadius: "8px" },
                }}
              />
              <TextField
                label="Office address"
                fullWidth
                multiline
                rows={2}
                value={officeAddress}
                onChange={(e) => setOfficeAddress(e.target.value)}
                placeholder="123 Main Street, Mumbai, Maharashtra 400001"
                sx={{
                  mb: 2,
                  "& .MuiOutlinedInput-root": { borderRadius: "8px" },
                }}
              />
              <TextField
                label="Website"
                fullWidth
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://yourcompany.com"
                sx={{
                  mb: 3,
                  "& .MuiOutlinedInput-root": { borderRadius: "8px" },
                }}
              />
              <Box sx={{ display: "flex", gap: 1.5 }}>
                <Button
                  variant="outline"
                  fullWidth
                  disabled={loading}
                  onClick={async () => {
                    await handleCompleteOrgSetup();
                    await finishSetup();
                    setAlert({
                      open: true,
                      message: "Organisation created!",
                      severity: "success",
                    });
                  }}
                  style={{
                    borderRadius: "8px",
                    borderColor: "var(--text-input-border)",
                    color: "var(--text-color)",
                    textTransform: "none",
                    fontWeight: 500,
                  }}
                >
                  Skip
                </Button>
                <Button
                  variant="primary"
                  fullWidth
                  size="large"
                  disabled={loading}
                  loading={loading}
                  onClick={async () => {
                    setLoading(true);
                    try {
                      await apiClient.put(API_ENDPOINTS.ORG_PROFILE, {
                        ...(helpPhone && { helpPhone }),
                        ...(helpEmail && { helpEmail }),
                        ...(officeAddress && { officeAddress }),
                        ...(website && { website }),
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
                  style={{
                    borderRadius: "8px",
                    paddingTop: 11.2,
                    paddingBottom: 11.2,
                    textTransform: "none",
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  Save & Continue
                </Button>
              </Box>
            </>
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
