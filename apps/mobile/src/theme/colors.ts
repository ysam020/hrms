// Mirrors the CSS custom properties in apps/web/src/styles/constants.scss
// so the mobile app reads as the same product, not a reskin.
export const lightColors = {
  background: "#f9fafb",
  cardBackground: "#ffffff",
  cardBackgroundSecondary: "#efefef",
  textColor: "#000000",
  textSecondary: "#5b6570",
  border: "#d1d5db",
  primary: "#111b21",
  onPrimary: "#ffffff",
  link: "#0060ae",
  success: "#153525",
  successBg: "#90c8ac",
  error: "#851e1e",
  errorBg: "#ff9494",
  warningBg: "#ffd87f",
  warningText: "#5e4305",
};

export const darkColors = {
  background: "#111b21",
  cardBackground: "#212e35",
  cardBackgroundSecondary: "#1c262a",
  textColor: "#e6e8e9",
  textSecondary: "#a5a9ab",
  border: "rgba(81, 81, 81, 1)",
  primary: "#e6e8e9",
  onPrimary: "#111b21",
  link: "#88d0fa",
  success: "#90c8ac",
  successBg: "#153525",
  error: "#ff9494",
  errorBg: "#851e1e",
  warningBg: "#5e4305",
  warningText: "#ffd87f",
};

export type ThemeColors = typeof lightColors;
