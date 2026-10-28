import type { ReactNode } from "react";
import {
  ListSkeleton,
  MetricsSkeleton,
  ChartBodySkeleton,
  TextSkeleton,
  type IconName,
} from "@next/ui";
import * as W from "./widgets";

// Presentation registry for Today's widgets: how each one is named,
// described, grouped and drawn. It carries no access rules — which widgets a
// person may use, their defaults and their settings come from GET /dashboard
// (api-gateway/src/config/dashboardWidgets.ts). A widget the server lists but
// this registry doesn't know is skipped; one this registry knows but the
// server doesn't list is never rendered.

export type WidgetGroup = "You" | "Your Team" | "People" | "Organisation";

export interface WidgetMeta {
  name: string;
  description: string;
  group: WidgetGroup;
  icon: IconName;
  /** Server widgets: how often their data refreshes. */
  refresh?: "live" | "slow";
  /** Loading placeholder shaped like the widget. */
  skeleton: ReactNode;
  settingLabels?: Record<string, string>;
  formatOption?: (key: string, value: string | number) => string;
  render?: (data: any, ctx: { wide: boolean }) => ReactNode;
}

const days = (_k: string, v: string | number) =>
  typeof v === "number" ? `${v} days` : String(v);

const metricsAndList = (
  <div style={{ display: "grid", gap: 16 }}>
    <MetricsSkeleton count={3} />
    <ListSkeleton rows={3} />
  </div>
);

export const REGISTRY: Record<string, WidgetMeta> = {
  "my-day": {
    name: "Your Day",
    description: "Punch in and out, hours today and your month at a glance.",
    group: "You",
    icon: "clock",
    skeleton: <TextSkeleton lines={3} />,
  },
  approvals: {
    name: "Needs Your Decision",
    description: "Requests waiting for your approval.",
    group: "You",
    icon: "inbox",
    skeleton: <ListSkeleton rows={3} avatar trailing />,
  },
  "team-today": {
    name: "Team Today",
    description:
      "Who on your team is in, remote, on leave or not punched in yet.",
    group: "Your Team",
    icon: "people",
    refresh: "live",
    skeleton: metricsAndList,
    settingLabels: { team: "Team" },
    render: (data, { wide }) => <W.TeamToday data={data} wide={wide} />,
  },
  "team-leave": {
    name: "Team Leave Ahead",
    description: "Approved and pending leave on your team.",
    group: "Your Team",
    icon: "leave",
    refresh: "slow",
    skeleton: <ListSkeleton rows={4} trailing />,
    settingLabels: { days: "Look Ahead" },
    formatOption: days,
    render: (data) => <W.TeamLeave data={data} />,
  },
  "org-today": {
    name: "Organisation Today",
    description:
      "How many people are in, remote, on leave or not punched in yet.",
    group: "Organisation",
    icon: "today",
    refresh: "live",
    skeleton: <MetricsSkeleton count={4} />,
    settingLabels: { department: "Department" },
    render: (data) => <W.OrgToday data={data} />,
  },
  "hr-queue": {
    name: "People Ops Queue",
    description:
      "KYC, resignations, tickets and other queues you work through.",
    group: "People",
    icon: "inbox",
    refresh: "slow",
    skeleton: <ListSkeleton rows={4} trailing />,
    render: (data) => <W.HrQueue data={data} />,
  },
  workforce: {
    name: "Workforce",
    description:
      "Active headcount, this month’s joiners and leavers, departments.",
    group: "Organisation",
    icon: "people",
    refresh: "slow",
    skeleton: <MetricsSkeleton count={3} />,
    render: (data) => <W.Workforce data={data} />,
  },
  "joiners-leavers": {
    name: "Joining and Leaving",
    description: "Who joins and who leaves in the next 30 days.",
    group: "People",
    icon: "door",
    refresh: "slow",
    skeleton: <ListSkeleton rows={4} />,
    render: (data) => <W.JoinersLeavers data={data} />,
  },
  "headcount-trend": {
    name: "Headcount Trend",
    description: "Month-end headcount, joiners and leavers.",
    group: "Organisation",
    icon: "chart",
    refresh: "slow",
    skeleton: <ChartBodySkeleton kind="columns" />,
    settingLabels: { months: "Period" },
    formatOption: (_k, v) => `${v} months`,
    render: (data) => <W.HeadcountTrend data={data} />,
  },
  "attendance-trend": {
    name: "Attendance Trend",
    description: "Share of active employees who punched in, per working day.",
    group: "Organisation",
    icon: "chart",
    refresh: "slow",
    skeleton: <ChartBodySkeleton kind="columns" />,
    settingLabels: { days: "Period" },
    formatOption: days,
    render: (data) => <W.AttendanceTrend data={data} />,
  },
  hiring: {
    name: "Hiring",
    description: "Open roles, applications by stage, interviews and offers.",
    group: "People",
    icon: "briefcase",
    refresh: "slow",
    skeleton: metricsAndList,
    render: (data) => <W.Hiring data={data} />,
  },
  payroll: {
    name: "Payroll",
    description: "Where the latest payroll run stands, with its totals.",
    group: "People",
    icon: "banknote",
    refresh: "slow",
    skeleton: <MetricsSkeleton count={3} />,
    render: (data) => <W.Payroll data={data} />,
  },
  "review-cycle": {
    name: "Review Cycle",
    description: "Progress of the active performance review cycle.",
    group: "People",
    icon: "star",
    refresh: "slow",
    skeleton: <TextSkeleton lines={3} />,
    render: (data) => <W.ReviewCycle data={data} />,
  },
  "org-admin": {
    name: "Organisation Admin",
    description: "Requests to join, your plan, renewal and seats.",
    group: "Organisation",
    icon: "gear",
    refresh: "slow",
    skeleton: <ListSkeleton rows={3} trailing />,
    render: (data) => <W.OrgAdmin data={data} />,
  },
  "leave-balance": {
    name: "Leave Balance",
    description: "Days left by leave type and your upcoming leave.",
    group: "You",
    icon: "leave",
    refresh: "slow",
    skeleton: <MetricsSkeleton count={3} />,
    render: (data) => <W.LeaveBalance data={data} />,
  },
  "my-requests": {
    name: "My Requests",
    description:
      "Your leave, work-from-home, ticket and advance requests in progress.",
    group: "You",
    icon: "doc",
    refresh: "slow",
    skeleton: <ListSkeleton rows={3} trailing />,
    render: (data) => <W.MyRequests data={data} />,
  },
  "my-reviews": {
    name: "My Reviews",
    description: "Your performance review, and reviews you need to write.",
    group: "You",
    icon: "star",
    refresh: "slow",
    skeleton: <ListSkeleton rows={2} />,
    render: (data) => <W.MyReviews data={data} />,
  },
  payslip: {
    name: "Latest Payslip",
    description: "Net pay from your most recent payslip.",
    group: "You",
    icon: "banknote",
    refresh: "slow",
    skeleton: <MetricsSkeleton count={1} />,
    render: (data) => <W.Payslip data={data} />,
  },
  announcements: {
    name: "Announcements",
    description: "The latest company announcements.",
    group: "Organisation",
    icon: "megaphone",
    skeleton: <TextSkeleton lines={4} />,
  },
  agenda: {
    name: "Coming Up",
    description: "Holidays, events, birthdays and work anniversaries.",
    group: "Organisation",
    icon: "calendar",
    skeleton: <ListSkeleton rows={4} />,
  },
};

export const GROUP_ORDER: WidgetGroup[] = [
  "You",
  "Your Team",
  "People",
  "Organisation",
];

/** Where each widget's "see all" link goes, shown in its header. */
export const HEADER_LINK: Record<string, { to: string; label: string }> = {
  approvals: { to: "/approvals", label: "All Approvals" },
  announcements: { to: "/hr-activities", label: "See All" },
  agenda: { to: "/calendar", label: "Calendar" },
};
