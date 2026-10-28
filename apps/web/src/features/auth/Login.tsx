import { useContext, useEffect, useRef, useState, type FormEvent } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { webAuthnLoginSchema } from "@web/shared/schemas";
import { setAccessToken } from "@web/core/http/axiosConfig";
import { Swap } from "@next/motion";
import { Banner, Button, Field, Icon, TextInput } from "@next/ui";
import { apiClient } from "@next/lib/api";
import { rememberReturnPath } from "@next/app/returnPath";
import { BrandLockup } from "./BrandMark";
import { Showcase } from "./Showcase";
import s from "./Login.module.css";

/**
 * Sign-in. The flows are Classic's, unchanged: Google OAuth through the
 * gateway (`/api/v1/auth/google`), and passkeys through @web/core/webauthn
 * with the shared zod schema. Praesto has no password sign-in, so there are
 * no password, "forgot password" or "remember me" controls. Choosing an
 * organisation happens after sign-in, on /org-setup.
 */

/** Passkey failures, in words that don't reveal anything about the account. */
function passkeyMessage(err: unknown): string {
  const msg = (err as Error)?.message ?? "";
  if (/cancelled or timed out|aborted/i.test(msg))
    return "Passkey sign-in was cancelled. Try again when you’re ready.";
  if (/not supported/i.test(msg))
    return "This browser or device can’t use passkeys. Continue with Google instead.";
  if (/secure connection/i.test(msg))
    return "Passkeys need a secure (HTTPS) connection.";
  return "That passkey couldn’t sign you in. Check your username and try again.";
}

function requestMessage(err: any): string {
  if (!err?.response)
    return "Praesto can’t be reached. Check your connection and try again.";
  if (err.response.status === 429)
    return "Too many attempts. Wait a minute, then try again.";
  return "Sign-in isn’t available right now. Try again in a moment.";
}

export default function Login() {
  const { setUser } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState<"choose" | "passkey">("choose");
  const [username, setUsername] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"google" | "passkey" | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const continuing = Boolean(
    (location.state as any)?.from?.pathname &&
    (location.state as any).from.pathname !== "/",
  );

  useEffect(() => {
    document.title = "Sign In · Praesto";
    // The gateway's OAuth callback returns failures as ?error=…; show them in
    // the form (Classic used a toast) and drop the param from the URL.
    const err = params.get("error");
    if (err) {
      setOauthError(decodeURIComponent(err));
      navigate("/login", { replace: true, state: location.state });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Back from Google (bfcache) leaves the button spinning otherwise.
  useEffect(() => {
    const reset = () => setBusy(null);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  const google = () => {
    if (busy) return;
    setBusy("google");
    const from = (location.state as any)?.from;
    rememberReturnPath(from ? `${from.pathname}${from.search ?? ""}` : null);
    window.location.href = `${import.meta.env.VITE_SERVER_URL || ""}/api/v1/auth/google`;
  };

  const showPasskey = () => {
    setOauthError(null);
    setStep("passkey");
  };
  const showChoices = () => {
    setStep("choose");
    setFieldError(null);
    setFormError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const parsed = webAuthnLoginSchema.safeParse({ username });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Enter your username.");
      return;
    }
    setFieldError(null);
    setFormError(null);
    setBusy("passkey");
    try {
      let opts;
      try {
        opts = await apiClient.post(API_ENDPOINTS.WEBAUTHN_LOGIN_OPTIONS, {
          username,
        });
      } catch (err) {
        setFormError(requestMessage(err));
        return;
      }
      if (!opts.data?.success || !opts.data?.data) {
        setFieldError(
          "No passkey is set up for this username. Check the spelling, or continue with Google.",
        );
        return;
      }
      const { performWebAuthnLogin } = await import("@web/core/webauthn");
      let failure: unknown = null;
      const result = await performWebAuthnLogin(
        username,
        opts.data.data,
        (u: any) => setUser(u),
        (err: unknown) => {
          failure = err;
        },
        // Success toasts only; failures are shown in the form instead.
        ((a: { severity: string }) =>
          a.severity === "success" && setAlert(a as any)) as any,
      );
      if (result?.success && result?.accessToken)
        setAccessToken(result.accessToken);
      else if (!result?.success)
        setFormError(passkeyMessage(failure ?? result?.error));
    } catch (err) {
      setFormError(passkeyMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={s.screen}>
      <Showcase />

      <main className={s.auth}>
        <header className={s.authBrand}>
          <BrandLockup size={26} />
        </header>

        <section
          className={`${s.form} px-enter`}
          aria-labelledby="signin-title"
        >
          <div className={s.heading}>
            <h1 id="signin-title" className={s.title}>
              Welcome back
            </h1>
            <p className={s.subtitle}>
              {continuing
                ? "Sign in to continue where you left off."
                : "Sign in to continue to your Praesto workspace."}
            </p>
          </div>

          {oauthError && (
            <Banner tone="danger">
              <span className={s.bannerText}>
                Google sign-in didn’t complete. {oauthError}
              </span>
            </Banner>
          )}

          <Swap id={step}>
            {step === "choose" ? (
              <div className={s.methods}>
                <Button
                  variant="primary"
                  size="large"
                  block
                  className={s.cta}
                  busy={busy === "google"}
                  disabled={busy !== null}
                  onClick={google}
                >
                  <GoogleG />
                  Continue with Google
                </Button>
                <div className={s.or} role="separator" aria-label="or">
                  <span>or</span>
                </div>
                <Button
                  size="large"
                  block
                  className={s.cta}
                  icon="key"
                  disabled={busy !== null}
                  onClick={showPasskey}
                >
                  Sign in with a Passkey
                </Button>
              </div>
            ) : (
              <form
                className={s.methods}
                onSubmit={submit}
                noValidate
                aria-describedby={formError ? "signin-error" : undefined}
              >
                <button
                  ref={backRef}
                  type="button"
                  className={s.back}
                  onClick={showChoices}
                  disabled={busy !== null}
                >
                  <Icon name="chevronLeft" size={14} />
                  All sign-in options
                </button>
                <Field label="Username" error={fieldError}>
                  <TextInput
                    data-autofocus
                    autoFocus
                    name="username"
                    autoComplete="username webauthn"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="go"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (fieldError) setFieldError(null);
                    }}
                    className={s.input}
                  />
                </Field>
                <div aria-live="polite" id="signin-error">
                  {formError && <p className={s.formError}>{formError}</p>}
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  size="large"
                  block
                  className={s.cta}
                  busy={busy === "passkey"}
                >
                  Continue with Passkey
                </Button>
                <p className={s.hint}>
                  Your device will ask you to confirm it’s you.
                </p>
              </form>
            )}
          </Swap>
        </section>

        <footer className={s.footer}>
          <nav aria-label="Legal" className={s.legal}>
            <Link to="/privacy-policy">Privacy</Link>
            <Link to="/terms-of-use">Terms</Link>
            <Link to="/refund-policy">Refunds</Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}

/** Google's "G" mark (brand guidelines: unmodified colors, on a light chip). */
function GoogleG() {
  return (
    <span className={s.gChip} aria-hidden="true">
      <svg viewBox="0 0 18 18" width="14" height="14">
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
        />
        <path
          fill="#FBBC05"
          d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
        />
      </svg>
    </span>
  );
}
