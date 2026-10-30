// "Apply by 31 Jul" means applications stay open through all of 31 Jul.
// Deadlines are stored as that day's midnight (UTC or IST depending on how
// the form sent it), so the opening closes a full day after the stored
// instant. Nothing flips status to "Expired" on its own, so public routes
// check this alongside status === "Active".
const DAY_MS = 24 * 60 * 60 * 1000;

export function isPastDeadline(deadline?: string | Date | null): boolean {
  if (!deadline) return false;
  const t = new Date(deadline).getTime();
  return Number.isFinite(t) && t + DAY_MS <= Date.now();
}
