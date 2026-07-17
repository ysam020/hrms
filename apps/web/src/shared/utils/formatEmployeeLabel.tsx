/**
 * Standard "Full Name (username)" label used across employee-list-style
 * columns (KYC, Employee List, WFH, Tax Declarations, Attendance, Leave
 * Applications, Resignations, ...) so the same person reads identically
 * everywhere, regardless of which of those two fields a given screen used
 * to show on its own.
 */
function formatEmployeeLabel(
  fullName: string | null | undefined,
  username: string | null | undefined,
): string {
  const trimmedName = (fullName ?? "").trim();
  if (trimmedName && username) return `${trimmedName} (${username})`;
  return trimmedName || username || "—";
}

export default formatEmployeeLabel;
