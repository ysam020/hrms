import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "../../src/auth/AuthContext";
import { useThemeColors } from "../../src/theme/useThemeColors";
import { fetchProfile, type UserProfile } from "../../src/api/profile";
import StatCard from "../../src/components/StatCard";
import Button from "../../src/components/Button";

export default function DashboardScreen() {
  const colors = useThemeColors();
  const { profile: authProfile, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(authProfile);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    try {
      const user = await fetchProfile();
      setProfile(user);
    } catch {}
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  if (!profile) {
    return (
      <SafeAreaView
        style={[styles.center, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const initial = (profile.fullName || profile.username || "?")
    .charAt(0)
    .toUpperCase();

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>
              Welcome back
            </Text>
            <Text style={[styles.name, { color: colors.textColor }]}>
              {profile.fullName || profile.username}
            </Text>
          </View>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={[styles.avatarText, { color: colors.onPrimary }]}>
              {initial}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.profileCard,
            {
              backgroundColor: colors.cardBackground,
              borderColor: colors.border,
            },
          ]}
        >
          <ProfileRow
            icon="briefcase-outline"
            label="Designation"
            value={profile.designation || "—"}
            colors={colors}
          />
          <ProfileRow
            icon="people-outline"
            label="Department"
            value={profile.department || "—"}
            colors={colors}
          />
          <ProfileRow
            icon="business-outline"
            label="Organisation"
            value={profile.tenantName || "—"}
            colors={colors}
          />
          <ProfileRow
            icon="mail-outline"
            label="Email"
            value={profile.email}
            colors={colors}
            last
          />
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textColor }]}>
          Quick Stats
        </Text>
        <View style={styles.statsGrid}>
          <StatCard
            label="Employment Status"
            value={profile.employeeStatus || "—"}
            accent={colors.success}
          />
          <StatCard
            label="Role"
            value={profile.tenantRole || "—"}
            accent={colors.link}
          />
        </View>

        <View style={styles.logoutWrap}>
          <Button title="Sign Out" variant="outline" onPress={signOut} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileRow({
  icon,
  label,
  value,
  colors,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  colors: ReturnType<typeof useThemeColors>;
  last?: boolean;
}) {
  return (
    <View
      style={[
        rowStyles.row,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <Ionicons name={icon} size={18} color={colors.textSecondary} />
      <Text style={[rowStyles.label, { color: colors.textSecondary }]}>
        {label}
      </Text>
      <Text
        style={[rowStyles.value, { color: colors.textColor }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  label: {
    fontSize: 13,
    width: 100,
  },
  value: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
  },
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, gap: 20, paddingBottom: 40 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  greeting: { fontSize: 13 },
  name: { fontSize: 22, fontWeight: "700", marginTop: 2 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 18, fontWeight: "700" },
  profileCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: 4 },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  logoutWrap: { marginTop: 12 },
});
