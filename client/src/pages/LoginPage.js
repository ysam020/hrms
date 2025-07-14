import React, { useState, useMemo, useCallback } from "react";
import Grid from "@mui/material/Grid2";
import "../styles/login.scss";
import { ErrorBoundary } from "react-error-boundary";
import ErrorFallback from "../components/customComponents/ErrorFallback.js";

const LoginForm = React.lazy(() => import("../forms/LoginForm"));
const ForgotPasswordForm = React.lazy(() =>
  import("../forms/ForgotPasswordForm.js")
);
const WebAuthnLoginForm = React.lazy(() =>
  import("../forms/WebAuthnLoginForm.js")
);

function LoginPage() {
  const [forgotPassword, setForgotPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [isTwoFactorEnabled, setIsTwoFactorEnabled] = useState(false);
  const [useWebAuthn, setUseWebAuthn] = useState(true);

  const leftColStyle = useMemo(
    () => ({
      background: "url(/assets/images/login-bg.webp)",
      backgroundSize: "cover",
    }),
    []
  );

  const toggleForgotPassword = useCallback(() => {
    setForgotPassword((prev) => !prev);
  }, []);

  const memoizedUsername = useMemo(() => username, [username]);
  const memoizedIsTwoFactorEnabled = useMemo(
    () => isTwoFactorEnabled,
    [isTwoFactorEnabled]
  );

  return (
    <Grid container className="login-container" style={{ height: "100vh" }}>
      <Grid size={6} className="login-left-col" style={leftColStyle}></Grid>
      <Grid size={6} className="login-right-col">
        <div className="login-right-col-inner-container">
          <img src={"/assets/images/logo.webp"} alt="logo" width="100%" />

          {!forgotPassword ? (
            <>
              {useWebAuthn ? (
                <ErrorBoundary fallback={<ErrorFallback />}>
                  <WebAuthnLoginForm
                    setUseWebAuthn={setUseWebAuthn}
                    username={memoizedUsername}
                    setUsername={setUsername}
                    setIsTwoFactorEnabled={setIsTwoFactorEnabled}
                  />
                </ErrorBoundary>
              ) : (
                <ErrorBoundary fallback={<ErrorFallback />}>
                  <LoginForm
                    username={memoizedUsername}
                    isTwoFactorEnabled={memoizedIsTwoFactorEnabled}
                  />
                </ErrorBoundary>
              )}
            </>
          ) : (
            <ErrorBoundary fallback={<ErrorFallback />}>
              <ForgotPasswordForm
                username={memoizedUsername}
                setForgotPassword={setForgotPassword}
              />
            </ErrorBoundary>
          )}
        </div>

        {!useWebAuthn && (
          <span className="span-text" onClick={toggleForgotPassword}>
            {forgotPassword ? "Login Instead" : "Forgot Password"}
          </span>
        )}
      </Grid>
    </Grid>
  );
}

export default React.memo(LoginPage);
