export const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  available: { color: "#059669", bg: "rgba(5,150,105,0.15)" },
  assigned: { color: "#6366f1", bg: "rgba(99,102,241,0.15)" },
  maintenance: { color: "#d97706", bg: "rgba(217,119,6,0.15)" },
  retired: { color: "#64748b", bg: "rgba(100,116,139,0.15)" },
};

export const CONDITION_OPTIONS = [
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "damaged", label: "Damaged" },
];
