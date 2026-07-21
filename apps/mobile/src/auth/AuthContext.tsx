import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import apiClient, {
  performRefresh,
  setAccessToken,
  setUnauthorizedHandler,
} from "../api/client";
import { fetchProfile, type UserProfile } from "../api/profile";
import { isBiometricAvailable, promptBiometricUnlock } from "./biometric";
import {
  clearSession,
  getStoredEmail,
  getStoredRefreshToken,
  isBiometricLoginEnabled,
  setBiometricLoginEnabled,
  setStoredEmail,
  setStoredRefreshToken,
} from "./secureStorage";
import { signInWithGoogle } from "./googleAuth";

type Status = "bootstrapping" | "signedOut" | "signedIn";

interface AuthContextValue {
  status: Status;
  profile: UserProfile | null;
  // Sign-in screen affordances
  hasStoredSession: boolean;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  storedEmail: string | null;
  // Actions
  signInWithGoogleFlow: () => Promise<void>;
  signInWithBiometrics: () => Promise<void>;
  enableBiometricLogin: () => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return value;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<Status>("bootstrapping");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hasStoredSession, setHasStoredSession] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [storedEmail, setStoredEmailState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const loadProfileAndFinishSignIn = useCallback(async () => {
    const user = await fetchProfile();
    setProfile(user);
    setStatus("signedIn");
  }, []);

  useEffect(() => {
    (async () => {
      const [refreshToken, hardwareAvailable, bioEnabled, email] =
        await Promise.all([
          getStoredRefreshToken(),
          isBiometricAvailable(),
          isBiometricLoginEnabled(),
          getStoredEmail(),
        ]);

      setHasStoredSession(!!refreshToken);
      setBiometricAvailable(hardwareAvailable);
      setBiometricEnabledState(bioEnabled);
      setStoredEmailState(email);
      setUnauthorizedHandler(() => {
        setStatus("signedOut");
        setProfile(null);
      });
      setStatus("signedOut");
    })();
  }, []);

  const signInWithGoogleFlow = useCallback(async () => {
    setError(null);
    try {
      const result = await signInWithGoogle();
      if (result.needsTenantSetup) {
        throw new Error(
          "Your account needs organisation setup — please finish that on the web app first.",
        );
      }
      setAccessToken(result.accessToken);
      if (result.refreshToken) {
        await setStoredRefreshToken(result.refreshToken);
        setHasStoredSession(true);
      }
      await loadProfileAndFinishSignIn();
    } catch (err: any) {
      setAccessToken(null);
      setError(err?.message || "Google sign-in failed");
      throw err;
    }
  }, [loadProfileAndFinishSignIn]);

  const signInWithBiometrics = useCallback(async () => {
    setError(null);
    try {
      const unlocked = await promptBiometricUnlock("Sign in to HRMS");
      if (!unlocked) return;
      await performRefresh();
      await loadProfileAndFinishSignIn();
    } catch (err: any) {
      setError("Biometric sign-in failed — please sign in with Google.");
      throw err;
    }
  }, [loadProfileAndFinishSignIn]);

  const enableBiometricLogin = useCallback(async () => {
    await setBiometricLoginEnabled(true);
    setBiometricEnabledState(true);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiClient.get("/logout");
    } catch {}
    await clearSession();
    setAccessToken(null);
    setHasStoredSession(false);
    setBiometricEnabledState(false);
    setProfile(null);
    setStatus("signedOut");
  }, []);

  useEffect(() => {
    if (profile?.email) {
      setStoredEmail(profile.email);
      setStoredEmailState(profile.email);
    }
  }, [profile?.email]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      profile,
      hasStoredSession,
      biometricAvailable,
      biometricEnabled,
      storedEmail,
      signInWithGoogleFlow,
      signInWithBiometrics,
      enableBiometricLogin,
      signOut,
      error,
      clearError,
    }),
    [
      status,
      profile,
      hasStoredSession,
      biometricAvailable,
      biometricEnabled,
      storedEmail,
      signInWithGoogleFlow,
      signInWithBiometrics,
      enableBiometricLogin,
      signOut,
      error,
      clearError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
