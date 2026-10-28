import { useContext } from "react";
import { UserContext } from "@web/app/providers/UserContext";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import { isHrOrAbove } from "@web/shared/utils/permissions/navAccess";
import type { Tone } from "@next/ui";

// Vocabulary and permission rule from Classic's helpdesk module.
export const CATEGORIES = [
  "IT",
  "Payroll",
  "Leave",
  "Onboarding",
  "HR",
  "Other",
];
export const PRIORITIES = ["low", "medium", "high", "critical"];
export const STATUSES = ["open", "in_progress", "resolved", "closed"];
export const label = (v?: string) =>
  v ? v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "—";
export const priorityTone = (p?: string): Tone =>
  p === "critical" ? "danger" : p === "high" ? "warning" : "neutral";
export const statusTone = (s?: string): Tone =>
  s === "open"
    ? "accent"
    : s === "in_progress"
      ? "warning"
      : s === "resolved" || s === "closed"
        ? "success"
        : "neutral";

export function useCanManageHelpdesk() {
  const { user } = useContext(UserContext);
  return (
    isHrOrAbove(user) ||
    hasPermission(
      "Helpdesk",
      "manage",
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    )
  );
}
