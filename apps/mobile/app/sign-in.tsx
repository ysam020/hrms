import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import Button from "../src/components/Button";
import GoogleIcon from "../src/components/GoogleIcon";
import { useAuth } from "../src/auth/AuthContext";
import { useThemeColors } from "../src/theme/useThemeColors";

export default function SignInScreen() {
  const colors = useThemeColors();
  const {
    signInWithGoogleFlow,
    signInWithBiometrics,
    enableBiometricLogin,
    hasStoredSession,
    biometricAvailable,
    biometricEnabled,
    storedEmail,
    error,
  } = useAuth();

  const [googleLoading, setGoogleLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  const showBiometricOption =
    hasStoredSession && biometricAvailable && biometricEnabled;

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogleFlow();
      if (biometricAvailable && !biometricEnabled) {
        Alert.alert(
          "Enable biometric sign-in?",
          "Use Face ID or your fingerprint to sign in faster next time.",
          [
            { text: "Not now", style: "cancel" },
            { text: "Enable", onPress: () => enableBiometricLogin() },
          ],
        );
      }
    } catch (err: any) {
      Alert.alert("Sign-in failed", err?.message || "Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleBiometricSignIn = async () => {
    setBiometricLoading(true);
    try {
      await signInWithBiometrics();
    } catch (err: any) {
      Alert.alert("Sign-in failed", err?.message || "Please try again.");
    } finally {
      setBiometricLoading(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View
              style={[styles.logoBadge, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.logoBadgeText, { color: colors.onPrimary }]}>
                H
              </Text>
            </View>
            <Text style={[styles.title, { color: colors.textColor }]}>
              HR Management System
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              {showBiometricOption && storedEmail
                ? `Welcome back, ${storedEmail}`
                : "Access your HR dashboard and manage your workforce"}
            </Text>
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.cardBackground,
                borderColor: colors.border,
              },
            ]}
          >
            {showBiometricOption && (
              <>
                <Button
                  title="Sign in with Face ID / Fingerprint"
                  onPress={handleBiometricSignIn}
                  loading={biometricLoading}
                  icon={
                    <Ionicons
                      name="finger-print"
                      size={18}
                      color={colors.onPrimary}
                    />
                  }
                />
                <View style={styles.dividerRow}>
                  <View
                    style={[styles.divider, { backgroundColor: colors.border }]}
                  />
                  <Text
                    style={[
                      styles.dividerText,
                      { color: colors.textSecondary },
                    ]}
                  >
                    or
                  </Text>
                  <View
                    style={[styles.divider, { backgroundColor: colors.border }]}
                  />
                </View>
              </>
            )}

            <Button
              title="Continue with Google"
              variant={showBiometricOption ? "outline" : "primary"}
              onPress={handleGoogleSignIn}
              loading={googleLoading}
              icon={<GoogleIcon />}
            />

            {error && (
              <Text style={[styles.errorText, { color: colors.error }]}>
                {error}
              </Text>
            )}
          </View>

          <View style={styles.footer}>
            <Ionicons
              name="shield-checkmark"
              size={16}
              color={colors.success}
            />
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
              Protected by enterprise-grade security
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    gap: 28,
  },
  header: {
    alignItems: "center",
    gap: 10,
  },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  logoBadgeText: {
    fontSize: 26,
    fontWeight: "700",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 14,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
  },
  errorText: {
    fontSize: 13,
    textAlign: "center",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  footerText: {
    fontSize: 12,
  },
});
