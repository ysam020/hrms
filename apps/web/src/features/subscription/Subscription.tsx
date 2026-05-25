import { useState, useContext, useEffect, useRef } from "react";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ToggleButton from "@mui/material/ToggleButton";
import Alert from "@mui/material/Alert";
import CheckIcon from "@mui/icons-material/Check";
import ScienceIcon from "@mui/icons-material/Science";
import CreditCardIcon from "@mui/icons-material/CreditCard";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import PhoneAndroidIcon from "@mui/icons-material/PhoneAndroid";
import WalletIcon from "@mui/icons-material/Wallet";
import { alpha } from "@mui/material/styles";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";

interface Tenant {
  id: string;
  name: string;
  plan: string;
  billing: string | null;
  subscriptionStatus: string;
  planActivatedAt: string | null;
  planExpiresAt: string | null;
  razorpaySubscriptionId: string | null;
  paymentMethod: string | null;
  paymentMethodSummary: string | null;
}

type Billing = "monthly" | "annual";

const PRICES = {
  monthly: { display: "₹999", sub: "per month", amount: 99900 },
  annual: {
    display: "₹9,999",
    sub: "per year",
    savings: "Save ₹2,989 (25%)",
    amount: 999900,
  },
};

const PLAN_FEATURES = [
  "All modules (Attendance, Leave, Payroll, Recruitment)",
  "Unlimited employees",
  "Analytics & Monitoring dashboards",
  "Role-based permissions",
  "Push notifications",
  "Priority support",
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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function graceDeadline(planExpiresAt: string): string {
  const d = new Date(
    new Date(planExpiresAt).getTime() + 7 * 24 * 60 * 60 * 1000,
  );
  return formatDate(d.toISOString());
}

function paymentMethodIcon(method: string | null) {
  switch (method) {
    case "card":
      return <CreditCardIcon fontSize="small" />;
    case "upi":
      return <PhoneAndroidIcon fontSize="small" />;
    case "netbanking":
    case "emandate":
    case "nach":
      return <AccountBalanceIcon fontSize="small" />;
    case "wallet":
      return <WalletIcon fontSize="small" />;
    default:
      return <CreditCardIcon fontSize="small" />;
  }
}

function paymentMethodLabel(method: string | null): string {
  switch (method) {
    case "card":
      return "Card";
    case "upi":
      return "UPI";
    case "netbanking":
      return "Net Banking";
    case "emandate":
    case "nach":
      return "e-Mandate";
    case "wallet":
      return "Wallet";
    default:
      return "Payment Method";
  }
}

function statusLabel(s: string) {
  if (s === "active") return "Active";
  if (s === "grace_period") return "Grace Period";
  return "Expired";
}

function statusColor(s: string): "success" | "warning" | "error" {
  if (s === "active") return "success";
  if (s === "grace_period") return "warning";
  return "error";
}

export default function Subscription() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [renewBilling, setRenewBilling] = useState<Billing>("monthly");
  const [renewing, setRenewing] = useState(false);

  const renewBillingRef = useRef(renewBilling);
  useEffect(() => {
    renewBillingRef.current = renewBilling;
  }, [renewBilling]);

  useEffect(() => {
    apiClient
      .get(API_ENDPOINTS.MY_TENANT)
      .then((res) => {
        if (res.data?.success) setTenant(res.data.data.tenant);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await apiClient.post(API_ENDPOINTS.CANCEL_SUBSCRIPTION);
      if (res.data?.success) {
        setTenant((prev) =>
          prev ? { ...prev, subscriptionStatus: "expired" } : prev,
        );
        setAlert({
          open: true,
          message: "Subscription cancelled.",
          severity: "success",
        });
        setCancelOpen(false);
      } else {
        setAlert({
          open: true,
          message: res.data?.message || "Failed to cancel.",
          severity: "error",
        });
      }
    } catch (err: any) {
      setAlert({
        open: true,
        message:
          err.response?.data?.message || "Failed to cancel subscription.",
        severity: "error",
      });
    } finally {
      setCancelling(false);
    }
  };

  const handleRenew = async () => {
    setRenewing(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        setAlert({
          open: true,
          message: "Failed to load payment gateway. Check your connection.",
          severity: "error",
        });
        setRenewing(false);
        return;
      }

      const subRes = await apiClient.post(API_ENDPOINTS.CREATE_SUBSCRIPTION, {
        billing: renewBillingRef.current,
      });
      if (!subRes.data?.success) {
        setAlert({
          open: true,
          message: "Failed to create subscription.",
          severity: "error",
        });
        setRenewing(false);
        return;
      }

      const { subscriptionId, keyId } = subRes.data.data;

      const options = {
        key: keyId,
        subscription_id: subscriptionId,
        name: "HRMS",
        description: `HRMS Pro – ${renewBillingRef.current === "annual" ? "Annual" : "Monthly"} subscription`,
        prefill: {
          name: user
            ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim()
            : "",
          email: user?.email ?? "",
        },
        theme: { color: "#1976d2" },
        handler: (response: {
          razorpay_payment_id: string;
          razorpay_subscription_id: string;
          razorpay_signature: string;
        }) => {
          const bill = renewBillingRef.current;
          apiClient
            .post("/payment/reactivate-subscription", {
              billing: bill,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySubscriptionId: response.razorpay_subscription_id,
              razorpaySignature: response.razorpay_signature,
            })
            .then((reactivateRes) => {
              if (reactivateRes.data?.success) {
                setAlert({
                  open: true,
                  message: "Subscription renewed successfully!",
                  severity: "success",
                });
                return apiClient.get(API_ENDPOINTS.MY_TENANT);
              }
              setAlert({
                open: true,
                message: reactivateRes.data?.message || "Renewal failed.",
                severity: "error",
              });
              return null;
            })
            .then((meRes) => {
              if (meRes?.data?.success) setTenant(meRes.data.data.tenant);
            })
            .catch((err: any) => {
              setAlert({
                open: true,
                message: err.response?.data?.message || "Renewal failed.",
                severity: "error",
              });
            })
            .finally(() => setRenewing(false));
        },
        modal: { ondismiss: () => setRenewing(false) },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err.response?.data?.message || "Something went wrong.",
        severity: "error",
      });
      setRenewing(false);
    }
  };

  const isExpired = ["expired"].includes(tenant?.subscriptionStatus ?? "");
  const price = PRICES[renewBilling];

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : !tenant ? (
        <Alert severity="error">
          Failed to load subscription details. Please refresh and try again.
        </Alert>
      ) : (
        <>
          {/* Current plan card */}
          <Paper elevation={2} sx={{ p: 3, mb: 3 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                mb: 2,
              }}
            >
              <Box>
                <Typography variant="h6" fontWeight={700}>
                  HRMS Pro
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {tenant.billing === "annual" ? "Annual" : "Monthly"} plan ·{" "}
                  {tenant.billing === "annual"
                    ? PRICES.annual.display
                    : PRICES.monthly.display}
                  {tenant.billing === "annual" ? "/year" : "/month"}
                </Typography>
              </Box>
              <Chip
                label={statusLabel(tenant.subscriptionStatus)}
                color={statusColor(tenant.subscriptionStatus)}
                size="small"
                sx={{ fontWeight: 600 }}
              />
            </Box>

            {tenant.subscriptionStatus === "grace_period" &&
              tenant.planExpiresAt && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Your subscription has lapsed. Renew before{" "}
                  <strong>{graceDeadline(tenant.planExpiresAt)}</strong> to
                  avoid losing access.
                </Alert>
              )}

            {tenant.subscriptionStatus === "expired" && (
              <Alert severity="error" sx={{ mb: 2 }}>
                Your subscription has expired. Renew below to restore access.
              </Alert>
            )}

            <Divider sx={{ my: 2 }} />

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 2,
              }}
            >
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                >
                  Activated
                </Typography>
                <Typography variant="body2" fontWeight={500}>
                  {formatDate(tenant.planActivatedAt)}
                </Typography>
              </Box>
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                >
                  {tenant.subscriptionStatus === "expired"
                    ? "Expired on"
                    : "Renews on"}
                </Typography>
                <Typography variant="body2" fontWeight={500}>
                  {formatDate(tenant.planExpiresAt)}
                </Typography>
              </Box>
              {tenant.razorpaySubscriptionId && (
                <Box sx={{ gridColumn: "1 / -1" }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                  >
                    Subscription ID
                  </Typography>
                  <Typography
                    variant="body2"
                    fontFamily="monospace"
                    sx={{ wordBreak: "break-all", color: "text.secondary" }}
                  >
                    {tenant.razorpaySubscriptionId}
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Payment method */}
            {tenant.paymentMethod && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  sx={{ mb: 1 }}
                >
                  Payment Method
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    p: 1.5,
                    borderRadius: 1.5,
                    border: 1,
                    borderColor: "divider",
                    bgcolor: "action.hover",
                  }}
                >
                  <Box sx={{ color: "text.secondary", display: "flex" }}>
                    {paymentMethodIcon(tenant.paymentMethod)}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {tenant.paymentMethodSummary}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {paymentMethodLabel(tenant.paymentMethod)}
                    </Typography>
                  </Box>
                  <Chip
                    label="Active"
                    size="small"
                    color="success"
                    variant="outlined"
                    sx={{ fontSize: "0.7rem" }}
                  />
                </Box>
              </>
            )}

            {!isExpired && tenant.subscriptionStatus !== "expired" && (
              <Box sx={{ mt: 3, display: "flex", justifyContent: "flex-end" }}>
                <Button
                  variant="outlined"
                  color="error"
                  size="small"
                  onClick={() => setCancelOpen(true)}
                >
                  Cancel Subscription
                </Button>
              </Box>
            )}
          </Paper>

          {/* Renew section — shown when expired */}
          {isExpired && (
            <Paper elevation={2} sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Renew Subscription
              </Typography>

              {/* Test mode notice */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  bgcolor: (t) => alpha(t.palette.warning.main, 0.1),
                  border: 1,
                  borderColor: "warning.light",
                  borderRadius: 1.5,
                  px: 1.5,
                  py: 1,
                  mb: 2,
                }}
              >
                <ScienceIcon fontSize="small" color="warning" />
                <Typography
                  variant="caption"
                  color="warning.dark"
                  fontWeight={500}
                >
                  Test mode — use Razorpay test card{" "}
                  <Box component="span" fontFamily="monospace" fontWeight={700}>
                    4111 1111 1111 1111
                  </Box>{" "}
                  · Any future date · Any CVV
                </Typography>
              </Box>

              {/* Billing toggle */}
              <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
                <ToggleButtonGroup
                  value={renewBilling}
                  exclusive
                  size="small"
                  onChange={(_, v) => v && setRenewBilling(v)}
                >
                  <ToggleButton value="monthly" sx={{ px: 3 }}>
                    Monthly
                  </ToggleButton>
                  <ToggleButton value="annual" sx={{ px: 3 }}>
                    Annual
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>

              {/* Plan card */}
              <Box
                sx={{
                  border: 2,
                  borderColor: "primary.main",
                  borderRadius: 2,
                  p: 2,
                  mb: 2,
                  bgcolor: (t) => alpha(t.palette.primary.main, 0.04),
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    mb: 1,
                  }}
                >
                  <Box>
                    <Typography variant="subtitle1" fontWeight={700}>
                      HRMS Pro
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Full-featured HR management
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "right" }}>
                    <Typography
                      variant="h6"
                      fontWeight={800}
                      color="primary.main"
                    >
                      {price.display}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {price.sub}
                    </Typography>
                    {renewBilling === "annual" && "savings" in price && (
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

                <Divider sx={{ my: 1 }} />

                <List dense disablePadding>
                  {PLAN_FEATURES.map((f) => (
                    <ListItem key={f} disableGutters sx={{ py: 0.25 }}>
                      <ListItemIcon sx={{ minWidth: 26 }}>
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

              <Button
                variant="contained"
                fullWidth
                size="large"
                disabled={renewing}
                onClick={handleRenew}
              >
                {renewing ? (
                  <CircularProgress size={22} color="inherit" />
                ) : (
                  `Pay ${price.display} & Renew`
                )}
              </Button>
            </Paper>
          )}
        </>
      )}

      {/* Cancel confirmation dialog */}
      <Dialog
        open={cancelOpen}
        onClose={() => !cancelling && setCancelOpen(false)}
        maxWidth="xs"
        fullWidth
        slots={{ transition: SlideUpTransition }}
        transitionDuration={{ enter: 280, exit: 200 }}
      >
        <DialogTitle>Cancel Subscription?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Your subscription will be cancelled immediately and your team will
            lose access to all HRMS features. This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCancelOpen(false)} disabled={cancelling}>
            Keep Subscription
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleCancel}
            disabled={cancelling}
          >
            {cancelling ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              "Cancel Subscription"
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
