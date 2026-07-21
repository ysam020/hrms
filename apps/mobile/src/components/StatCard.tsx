import { StyleSheet, Text, View } from "react-native";
import { useThemeColors } from "../theme/useThemeColors";

interface StatCardProps {
  label: string;
  value: string;
  accent?: string;
}

export default function StatCard({ label, value, accent }: StatCardProps) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.cardBackground, borderColor: colors.border },
      ]}
    >
      {accent && <View style={[styles.accent, { backgroundColor: accent }]} />}
      <Text style={[styles.value, { color: colors.textColor }]}>{value}</Text>
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexBasis: "47%",
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 4,
    overflow: "hidden",
  },
  accent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  value: {
    fontSize: 24,
    fontWeight: "700",
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
  },
});
