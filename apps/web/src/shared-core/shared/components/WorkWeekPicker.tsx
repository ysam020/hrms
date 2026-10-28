// The work-week model shared by organisation setup and settings.

export type WorkWeekType = "mon_fri" | "mon_sat" | "custom";

export interface WorkWeekValue {
  type: WorkWeekType;
  /** 0=Sun .. 6=Sat */
  workingDays: number[];
}

const MON_FRI = [1, 2, 3, 4, 5];
const MON_SAT = [1, 2, 3, 4, 5, 6];

export function defaultWorkWeek(type: WorkWeekType = "mon_fri"): WorkWeekValue {
  if (type === "mon_sat") return { type, workingDays: MON_SAT };
  if (type === "custom") return { type, workingDays: MON_FRI };
  return { type: "mon_fri", workingDays: MON_FRI };
}
