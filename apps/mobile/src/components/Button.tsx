import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ReactNode } from "react";
import { useThemeColors } from "../theme/useThemeColors";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "outline";
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
}

export default function Button({
  title,
  onPress,
  variant = "primary",
  icon,
  loading = false,
  disabled = false,
}: ButtonProps) {
  const colors = useThemeColors();
  const isPrimary = variant === "primary";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: isPrimary ? colors.primary : "transparent",
          borderColor: isPrimary ? colors.primary : colors.border,
          opacity: disabled || loading ? 0.6 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={isPrimary ? colors.onPrimary : colors.textColor}
        />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text
            style={[
              styles.label,
              { color: isPrimary ? colors.onPrimary : colors.textColor },
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
  },
});
