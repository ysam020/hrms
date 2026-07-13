import {
  lazy,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Grid from "@mui/material/Grid2";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Button from "@web/shared/components/Button";
import CheckCircle from "@mui/icons-material/CheckCircle";
import People from "@mui/icons-material/People";
import Shield from "@mui/icons-material/Shield";
import Analytics from "@mui/icons-material/Analytics";
import KeyIcon from "@mui/icons-material/Key";

import "@web/styles/login.scss";
import { motion } from "framer-motion";
import { ErrorBoundary } from "react-error-boundary";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import LogoDark from "@web/assets/data/LogoDark";
import Box from "@mui/material/Box";
import LogoLight from "@web/assets/data/LogoLight";
const WebAuthnLoginForm = lazy(() => import("./WebAuthnLoginForm"));

// VIEW STATES
const VIEW = {
  DEFAULT: "default", // Google button + options
  WEBAUTHN: "webauthn", // Security key / biometric
};

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useContext(ThemeContext);
  const { setAlert } = useContext(AlertContext);

  const [view, setView] = useState(VIEW.DEFAULT);

  // Detect OAuth error from redirect query params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const oauthError = params.get("error");

    if (oauthError) {
      setAlert({
        open: true,
        message: decodeURIComponent(oauthError),
        severity: "error",
      });
      navigate("/login", { replace: true });
    }
  }, []);

  const leftColStyle = useMemo(
    () => ({
      backgroundSize: "cover",
      backgroundPosition: "center",
    }),
    [],
  );

  const handleGoogleSignIn = useCallback(() => {
    window.location.href = `${import.meta.env.VITE_SERVER_URL || ""}/api/v1/auth/google`;
  }, []);

  const features = [
    {
      icon: <Shield sx={{ fontSize: 24 }} />,
      title: "Secure Employee Data",
      description:
        "GDPR-compliant data protection with role-based access controls",
      color: "#4caf50",
    },
    {
      icon: <Analytics sx={{ fontSize: 24 }} />,
      title: "Smart HR Analytics",
      description:
        "Data-driven insights for workforce planning and performance",
      color: "#2196f3",
    },
    {
      icon: <People sx={{ fontSize: 24 }} />,
      title: "Complete HR Suite",
      description:
        "From recruitment to retirement - manage your entire employee lifecycle",
      color: "#ff9800",
    },
  ];

  const title = "Sign In to Continue";
  const subtitle = "Access your HR dashboard and manage your workforce";

  return (
    <Grid container className="login-row">
      {/* Left Column */}
      <Grid size={6} className="login-left-col" style={leftColStyle}>
        <motion.div
          className="login-left-content"
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{
            type: "spring",
            stiffness: 280,
            damping: 26,
            mass: 0.9,
          }}
        >
          <div className="login-left-header">
            <div className="company-badge">
              <People sx={{ fontSize: 20, mr: 1 }} />
              <Typography
                variant="body2"
                className="main-heading"
                sx={{ fontWeight: 600 }}
              >
                HR Management System
              </Typography>
            </div>
            <Typography variant="h3" className="main-heading">
              Empower Your
              <br />
              <span className="gradient-text">People & Culture</span>
            </Typography>
            <Typography variant="body1" className="sub-heading">
              Transform your HR operations with our comprehensive human resource
              management platform designed for modern workplaces.
            </Typography>
          </div>

          <div className="features-grid">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                className="feature-card"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 26,
                  delay: 0.12 + index * 0.06,
                }}
              >
                <div className="feature-icon" style={{ color: feature.color }}>
                  {feature.icon}
                </div>
                <div className="feature-content">
                  <Typography variant="subtitle2" className="feature-title">
                    {feature.title}
                  </Typography>
                  <Typography variant="caption" className="feature-description">
                    {feature.description}
                  </Typography>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="stats-section">
            <div className="stat-item">
              <Typography variant="h4" className="stat-number">
                10K+
              </Typography>
              <Typography variant="caption" className="stat-label">
                Companies Trust Us
              </Typography>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <Typography variant="h4" className="stat-number">
                2M+
              </Typography>
              <Typography variant="caption" className="stat-label">
                Employees Managed
              </Typography>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <Typography variant="h4" className="stat-number">
                50%
              </Typography>
              <Typography variant="caption" className="stat-label">
                Time Saved on HR Tasks
              </Typography>
            </div>
          </div>
        </motion.div>
      </Grid>

      {/* Right Column */}
      <Grid size={6} className="login-right-col">
        <motion.div
          className="login-right-col-inner-container"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{
            type: "spring",
            stiffness: 280,
            damping: 26,
            mass: 0.9,
            delay: 0.06,
          }}
        >
          {/* Logo */}
          <div className="logo-section">
            <div className="logo-container">
              <Box sx={{ width: 200, height: 60 }}>
                {theme === "light" ? <LogoDark /> : <LogoLight />}
              </Box>
            </div>
            <Typography variant="h5" className="login-title">
              {title}
            </Typography>
            <Typography variant="body2" className="login-subtitle">
              {subtitle}
            </Typography>
          </div>

          <Divider sx={{ my: 3, borderColor: "var(--text-input-border)" }} />

          {/* Form area */}
          <div className="form-container">
            {/* default: Google sign-in */}
            {view === VIEW.DEFAULT && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {/* Google Sign-In button */}
                <Button
                  fullWidth
                  variant="primary"
                  onClick={handleGoogleSignIn}
                  style={{
                    paddingTop: 11.2,
                    paddingBottom: 11.2,
                    borderRadius: "8px",
                    backgroundColor: "var(--card-background)",
                    color: "var(--text-color)",
                    border: "1px solid var(--text-input-border)",
                    fontWeight: 500,
                    fontSize: "14px",
                    textTransform: "none",
                    letterSpacing: 0.25,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                  }}
                  icon={
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 48 48"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        fill="#4285F4"
                        d="M47.5 24.6c0-1.6-.1-3.1-.4-4.6H24v8.7h13.2c-.6 3-2.3 5.5-4.8 7.2v6h7.8c4.6-4.2 7.3-10.5 7.3-17.3z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.5 0 12-2.1 16-5.8l-7.8-6c-2.2 1.5-5 2.3-8.2 2.3-6.3 0-11.6-4.2-13.5-10H2.5v6.2C6.5 42.6 14.7 48 24 48z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.5 28.5c-.5-1.5-.8-3.1-.8-4.8s.3-3.3.8-4.8v-6.2H2.5A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.5 10.7l8-6.2z"
                      />
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C35.9 2.4 30.4 0 24 0 14.7 0 6.5 5.4 2.5 13.3l8 6.2C12.4 13.7 17.7 9.5 24 9.5z"
                      />
                    </svg>
                  }
                >
                  <span style={{ marginLeft: "5px" }}>Sign in with Google</span>
                </Button>

                <Divider
                  sx={{ my: 1, borderColor: "var(--text-input-border)" }}
                >
                  <Typography
                    variant="caption"
                    sx={{ color: "var(--text-color)", opacity: 0.6 }}
                  >
                    or
                  </Typography>
                </Divider>

                {/* Security key / WebAuthn option */}
                <Button
                  fullWidth
                  variant="outline"
                  icon={<KeyIcon aria-hidden="true" />}
                  onClick={() => setView(VIEW.WEBAUTHN)}
                  style={{
                    paddingTop: 9.6,
                    paddingBottom: 9.6,
                    borderRadius: "8px",
                    borderColor: "var(--text-input-border)",
                    color: "var(--text-color)",
                    fontWeight: 500,
                    fontSize: "13px",
                    textTransform: "none",
                  }}
                >
                  <span style={{ marginLeft: "5px" }}>
                    Use Security Key / Biometric
                  </span>
                </Button>
              </div>
            )}

            {/* WebAuthn */}
            {view === VIEW.WEBAUTHN && (
              <>
                <ErrorBoundary fallback={<ErrorFallback />}>
                  <WebAuthnLoginForm
                    username=""
                    setUsername={() => {}}
                    setIsTwoFactorEnabled={() => {}}
                    setUseWebAuthn={(val) => {
                      if (!val) setView(VIEW.DEFAULT);
                    }}
                  />
                </ErrorBoundary>

                <Divider
                  sx={{ my: 2, borderColor: "var(--text-input-border)" }}
                >
                  <Typography
                    variant="caption"
                    sx={{ color: "var(--text-color)", opacity: 0.6 }}
                  >
                    or
                  </Typography>
                </Divider>

                <Button
                  fullWidth
                  variant="primary"
                  onClick={handleGoogleSignIn}
                  style={{
                    paddingTop: 11.2,
                    paddingBottom: 11.2,
                    borderRadius: "8px",
                    backgroundColor: "var(--card-background)",
                    color: "var(--text-color)",
                    border: "1px solid var(--text-input-border)",
                    fontWeight: 500,
                    fontSize: "14px",
                    textTransform: "none",
                    letterSpacing: 0.25,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                  }}
                  icon={
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 48 48"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path
                        fill="#4285F4"
                        d="M47.5 24.6c0-1.6-.1-3.1-.4-4.6H24v8.7h13.2c-.6 3-2.3 5.5-4.8 7.2v6h7.8c4.6-4.2 7.3-10.5 7.3-17.3z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.5 0 12-2.1 16-5.8l-7.8-6c-2.2 1.5-5 2.3-8.2 2.3-6.3 0-11.6-4.2-13.5-10H2.5v6.2C6.5 42.6 14.7 48 24 48z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.5 28.5c-.5-1.5-.8-3.1-.8-4.8s.3-3.3.8-4.8v-6.2H2.5A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.5 10.7l8-6.2z"
                      />
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C35.9 2.4 30.4 0 24 0 14.7 0 6.5 5.4 2.5 13.3l8 6.2C12.4 13.7 17.7 9.5 24 9.5z"
                      />
                    </svg>
                  }
                >
                  <span style={{ marginLeft: "5px" }}>Sign in with Google</span>
                </Button>
              </>
            )}
          </div>

          {/* Security badge */}
          <div className="security-badge">
            <CheckCircle
              sx={{ fontSize: 16, color: "#4caf50", mr: 1 }}
              aria-hidden="true"
            />
            <Typography
              variant="caption"
              sx={{ color: "var(--text-color)", opacity: 0.8 }}
            >
              Protected by enterprise-grade security
            </Typography>
          </div>

          {/* Legal links */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              gap: 2,
              mt: 2.5,
            }}
          >
            {[
              { label: "Privacy Policy", href: "/privacy-policy" },
              { label: "Terms of Use", href: "/terms-of-use" },
              { label: "Refund Policy", href: "/refund-policy" },
            ].map((link) => (
              <Typography
                key={link.href}
                component="a"
                href={link.href}
                variant="caption"
                sx={{
                  color: "var(--text-color)",
                  opacity: 0.6,
                  textDecoration: "none",
                  "&:hover": { opacity: 1, textDecoration: "underline" },
                }}
              >
                {link.label}
              </Typography>
            ))}
          </Box>
        </motion.div>
      </Grid>
    </Grid>
  );
}

export default memo(LoginPage);
