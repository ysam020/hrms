/**
 * Small fake-data helpers shared by the recurring dev-only seeder jobs
 * (seedDailyAttendance, seedHrActivities, seedJobOpenings, seedPayroll).
 * Deliberately not shared with packages/database/src/seed.ts — apps/* don't
 * import from one another in this monorepo, and this is bounded fixture-data
 * logic, not worth a new cross-cutting package for.
 */
import { faker } from "@faker-js/faker";

export const DEPARTMENTS = [
  "Engineering",
  "Human Resources",
  "Sales",
  "Finance",
];

export const DESIGNATIONS_BY_DEPT: Record<string, string[]> = {
  Engineering: ["Software Engineer", "Senior Engineer", "Engineering Manager"],
  "Human Resources": ["HR Executive", "HR Manager"],
  Sales: ["Sales Executive", "Sales Manager"],
  Finance: ["Accountant", "Finance Manager"],
};

export const LEAVE_TYPES = ["PL", "SL", "CL"];

export const HR_ACTIVITY_TITLES = [
  "Town Hall Meeting",
  "Performance Review Cycle",
  "Team Building Event",
  "Benefits Enrollment",
  "Policy Training",
];

export function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export { faker };
