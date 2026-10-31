import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import apiClient, {
  getAccessToken,
  performRefresh,
  setAccessToken,
  setPaymentRequiredHandler,
  setUnauthorizedHandler,
} from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { UserContext } from "@web/app/providers/UserContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import useLogout from "@web/shared/hooks/useLogout";
import hasSubscriptionAccess from "@web/shared/utils/permissions/hasSubscriptionAccess";
import { clearFaviconDot } from "@web/shared/utils/faviconUtils";
import { clearStorageOnSignOut } from "@web/shared/utils/signOutStorage";
import { MotionProvider } from "@next/motion";
import { OfflineProvider, useOfflineSummary } from "@next/offline";
import {
  forgetSession,
  recallSession,
  rememberSession,
} from "@next/offline/session";
import { scopeFromToken } from "@next/offline/state";
import {
  Button,
  ConfirmDialog,
  Dialog,
  LoadingScreen,
  ToastHost,
} from "@next/ui";
import { PUBLIC_PAGES, applyPageMeta, normalizePath } from "./seo";
import { takeReturnPath } from "./returnPath";

// Session orchestration for Praesto Next. Everything security-relevant — the
// in-memory access token, refresh-cookie exchange, CSRF, 401/402 handling —
// is Classic's own module (@web/core/http/axiosConfig). This file only runs
// the same boot sequence Classic's App.tsx runs and exposes the result
// through Classic's own UserContext/AlertContext, so every shared hook works.

function decodeTokenPayload(token: string | null): Record<string, any> | null {
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}

type Alert = {
  open: boolean;
  message: string;
  severity: "error" | "info" | "success" | "warning";
};

export function SessionRoot() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<any>(null);
  const userRef = useRef(user);
  userRef.current = user;
  const [booting, setBooting] = useState(true);
  const [setupPending, setSetupPending] = useState(false);
  // Step 2 (organisation profile) when the organisation exists but isn't finished.
  const setupStart = useRef(0);
  const [subscriptionBlocked, setSubscriptionBlocked] = useState(false);
  const [alert, setAlert] = useState<Alert>({
    open: false,
    message: "",
    severity: "info",
  });
  const initialSearch = useRef(location.search);

  // Setting the user also settles organisation setup: a session that ends
  // (sign-out, or refused by the server) takes "setup pending" with it.
  // Otherwise the guard below would keep sending /login back to /org-setup
  // for someone who signed out mid-setup (no profile is loaded during setup,
  // so `user` was already null and nothing else reset the flag).
  const setSessionUser = useCallback((next: any) => {
    if (!next) {
      setSetupPending(false);
      setupStart.current = 0;
    }
    setUser(next);
  }, []);

  const { handleLogout, confirmOpen, cancelLogout, confirmLogout, loggingOut } =
    useLogout(setSessionUser);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearStorageOnSignOut();
      setSessionUser(null);
    });
    setPaymentRequiredHandler(() => {
      if (hasSubscriptionAccess(userRef.current)) navigate("/subscription");
      else setSubscriptionBlocked(true);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user) setSetupPending(false);
    if (!user) {
      clearFaviconDot();
      setSubscriptionBlocked(false);
    }
  }, [user]);

  // Boot: same sequence as Classic (see apps/web/src/app/App.tsx).
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(initialSearch.current);
    if (params.get("oauth_success") === "1") {
      const t = params.get("access_token");
      if (t) setAccessToken(t);
      window.history.replaceState({}, "", window.location.pathname);
    }
    const boot = async (isRetry = false) => {
      try {
        let token = getAccessToken();
        if (!token) token = await performRefresh();
        if (cancelled) return;
        const payload = decodeTokenPayload(token);
        // No organisation yet, or one still missing its profile: finish
        // setup first (Classic's App.tsx boot does the same).
        if (payload?.pendingSetup) {
          setSetupPending(true);
          if (window.location.pathname !== "/org-setup")
            navigate("/org-setup", { replace: true });
          setBooting(false);
          return;
        }
        if (payload?.tenantId && payload?.orgSetupComplete === false) {
          setupStart.current = 2;
          setSetupPending(true);
          if (window.location.pathname !== "/org-setup")
            navigate("/org-setup", {
              replace: true,
              state: { startAtStep: 2 },
            });
          setBooting(false);
          return;
        }
        const res = await apiClient.get(API_ENDPOINTS.GET_PROFILE);
        if (cancelled) return;
        if (res.data?.success) {
          setUser(res.data.data.user);
          void rememberSession(
            res.data.data.user,
            scopeFromToken(getAccessToken()),
          );
          // Google sign-in returns to "/" (the landing page); carry on into
          // the app rather than leaving the person on the marketing page —
          // to the page that sent them to sign in, if there was one.
          if (
            params.get("oauth_success") === "1" &&
            window.location.pathname === "/"
          )
            navigate(takeReturnPath() ?? "/dashboard", { replace: true });
        }
        setBooting(false);
      } catch (err: any) {
        if (cancelled) return;
        if (!isRetry && err?.response?.status !== 401) {
          setTimeout(() => !cancelled && boot(true), 800);
          return;
        }
        // The server couldn't be reached at all (not a refusal): open in
        // offline mode as the person last signed in on this device, if any.
        // See src/offline/session.ts. The real session is checked as soon as
        // the network returns.
        if (!err?.response) {
          const remembered = await recallSession();
          if (cancelled) return;
          if (remembered)
            setUser({
              ...remembered.user,
              offline: true,
              offlineScope: remembered.scope,
            });
        }
        setBooting(false);
      }
    };
    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  // Revalidate when restored from the back-forward cache.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      flushSync(() => setBooting(true));
      apiClient
        .get(API_ENDPOINTS.GET_PROFILE)
        .then((res) =>
          setSessionUser(res.data?.success ? res.data.data.user : null),
        )
        .catch((err) => {
          if (err?.response?.status === 401) setSessionUser(null);
        })
        .finally(() => setBooting(false));
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  // Offline mode: once the server is reachable, check the real session.
  // Accepted → the full profile replaces the remembered one; refused → out.
  useEffect(() => {
    if (!user?.offline) return;
    let busy = false;
    const verify = async () => {
      if (busy) return;
      busy = true;
      try {
        await performRefresh();
        const res = await apiClient.get(API_ENDPOINTS.GET_PROFILE);
        if (res.data?.success) setUser(res.data.data.user);
      } catch (err: any) {
        if (err?.response?.status === 401) setSessionUser(null);
      } finally {
        busy = false;
      }
    };
    window.addEventListener("online", verify);
    const t = setInterval(() => navigator.onLine && void verify(), 30_000);
    void verify();
    return () => {
      window.removeEventListener("online", verify);
      clearInterval(t);
    };
  }, [user?.offline]);

  // A session that ended (sign-out, or refused) takes its remembered
  // offline profile with it.
  const hadUser = useRef(false);
  useEffect(() => {
    if (user) hadUser.current = true;
    else if (hadUser.current) {
      hadUser.current = false;
      void forgetSession();
    }
  }, [user]);

  useEffect(() => {
    applyPageMeta(location.pathname);
  }, [location.pathname]);

  // The landing and policy pages don't depend on the session, so they show
  // while it's checked rather than behind the boot screen (they usually
  // arrive prerendered, already on screen). A Google sign-in return still
  // waits, since it carries on into the app.
  const showWhileBooting =
    isMarketingPath(location.pathname) &&
    !new URLSearchParams(initialSearch.current).has("oauth_success");

  const userValue = useMemo(
    () => ({ user, setUser: setSessionUser, handleLogout }),
    [user, setSessionUser, handleLogout],
  );
  const alertValue = useMemo(() => ({ alert, setAlert }), [alert]);

  return (
    <MotionProvider>
      <UserContext.Provider value={userValue}>
        <AlertContext.Provider value={alertValue as any}>
          <OfflineProvider user={user}>
            {booting && !showWhileBooting ? (
              <BootScreen />
            ) : setupPending && !user && !isPublicPath(location.pathname) ? (
              <Navigate
                to="/org-setup"
                replace
                state={{ startAtStep: setupStart.current }}
              />
            ) : !setupPending && location.pathname === "/org-setup" ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Outlet />
            )}
          </OfflineProvider>
          <ToastHost />
          <ConfirmDialog
            open={confirmOpen && location.pathname !== "/login"}
            onClose={cancelLogout}
            onConfirm={confirmLogout}
            busy={loggingOut}
            title="Log Out of Praesto?"
            description={<LogoutNote />}
            confirmLabel="Log Out"
          />
          <Dialog
            open={subscriptionBlocked}
            onClose={() => {}}
            title="Subscription Inactive"
            description="Your organisation’s subscription has lapsed. Ask an owner or admin to renew it to keep using Praesto."
            size="sm"
            footer={<Button onClick={handleLogout}>Log Out</Button>}
          />
        </AlertContext.Provider>
      </UserContext.Provider>
    </MotionProvider>
  );
}

/** Say what happens to unsent offline changes before signing out. */
function LogoutNote() {
  const { waiting, attention } = useOfflineSummary();
  const unsent = waiting + attention;
  return (
    <>
      You’ll need to sign in again on this device.
      {unsent > 0 &&
        ` ${unsent} change${unsent === 1 ? " hasn’t" : "s haven’t"} been sent yet. ${unsent === 1 ? "It stays" : "They stay"} on this device, visible only to you, and will be sent the next time you sign in here.`}
    </>
  );
}

function BootScreen() {
  return <LoadingScreen label="Starting Praesto" />;
}

/** Pages reachable while organisation setup is still pending. */
const isPublicPath = (p: string) =>
  p === "/org-setup" ||
  p.startsWith("/careers/") ||
  ["/privacy-policy", "/terms-of-use", "/refund-policy"].includes(p);

/** The prerendered public pages (see ./seo). */
const isMarketingPath = (p: string) =>
  Boolean(PUBLIC_PAGES[normalizePath(p)]?.prerender);

/** Protected area: signed-in users only, otherwise to /login with a return path. */
export function RequireSession({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <UserContext.Consumer>
      {({ user }) =>
        user ? (
          <>{children}</>
        ) : (
          <Navigate to="/login" replace state={{ from: location }} />
        )
      }
    </UserContext.Consumer>
  );
}
