import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

interface DashboardData {
  attendances: any[];
  attendanceSummary: any;
  hrActivities: any[];
  calendarEvents: any[];
  stickyNote: string;
  holidays: any[];
  pendingLeaves: any[];
  jobOpenings: any[];
  employeeInsights: any;
  kycInsights: any;
  birthdaysAnniversaries: any[];
}

interface DashboardLoading {
  attendances: boolean;
  attendanceSummary: boolean;
  hrActivities: boolean;
  calendarEvents: boolean;
  stickyNote: boolean;
  holidays: boolean;
  pendingLeaves: boolean;
  jobOpenings: boolean;
  employeeInsights: boolean;
  kycInsights: boolean;
  birthdaysAnniversaries: boolean;
}

interface DashboardContextType {
  data: DashboardData;
  loading: DashboardLoading;
  refetch: () => (() => void) | undefined;
}

const DashboardContext = createContext<DashboardContextType | null>(null);

export function DashboardProvider({
  user,
  children,
}: {
  user: { username?: string } | null;
  children: ReactNode;
}) {
  const currentDate = new Date();
  const month = currentDate.getMonth() + 1;
  const year = currentDate.getFullYear();

  const [data, setData] = useState<DashboardData>({
    attendances: [],
    attendanceSummary: null,
    hrActivities: [],
    calendarEvents: [],
    stickyNote: "",
    holidays: [],
    pendingLeaves: [],
    jobOpenings: [],
    employeeInsights: null,
    kycInsights: null,
    birthdaysAnniversaries: [],
  });

  const [loading, setLoading] = useState<DashboardLoading>({
    attendances: true,
    attendanceSummary: true,
    hrActivities: true,
    calendarEvents: true,
    stickyNote: true,
    holidays: true,
    pendingLeaves: true,
    jobOpenings: true,
    employeeInsights: true,
    kycInsights: true,
    birthdaysAnniversaries: true,
  });

  const fetchDashboardData = useCallback(() => {
    if (!user?.username) return;

    const controller = new AbortController();
    const signal = controller.signal;

    (async () => {
      try {
        const [
          attendancesRes,
          attendanceSummaryRes,
          hrActivitiesRes,
          calendarEventsRes,
          holidaysRes,
          pendingLeavesRes,
          jobOpeningsRes,
          employeeInsightsRes,
          kycInsightsRes,
          birthdaysAnniversariesRes,
        ] = await Promise.allSettled([
          apiClient.get(API_ENDPOINTS.GET_EMPLOYEE_ATTENDANCE(month, year), {
            signal,
          }),
          apiClient.get(
            API_ENDPOINTS.GET_ATTENDANCE_SUMMARY(user.username!, year, month),
            { signal },
          ),
          apiClient.get(API_ENDPOINTS.GET_HR_ACTIVITIES(), { signal }),
          apiClient.get(API_ENDPOINTS.GET_CALENDAR_EVENTS, { signal }),
          apiClient.get(API_ENDPOINTS.GET_HOLIDAYS(year), { signal }),
          apiClient.get(
            API_ENDPOINTS.GET_LEAVE_APPLICATIONS("status=Pending&limit=20"),
            { signal },
          ),
          apiClient.get(API_ENDPOINTS.VIEW_JOB_OPENINGS, { signal }),
          apiClient.get(API_ENDPOINTS.EMPLOYEE_INSIGHTS, { signal }),
          apiClient.get(API_ENDPOINTS.GET_KYC_INSIGHTS, { signal }),
          apiClient.get(
            API_ENDPOINTS.GET_BIRTHDAYS_ANNIVERSARIES(month, year),
            { signal },
          ),
        ]);

        setData((prev) => ({
          ...prev,
          attendances:
            attendancesRes.status === "fulfilled"
              ? attendancesRes.value.data.data
              : prev.attendances,

          attendanceSummary:
            attendanceSummaryRes.status === "fulfilled"
              ? attendanceSummaryRes.value.data.data
              : prev.attendanceSummary,

          hrActivities:
            hrActivitiesRes.status === "fulfilled"
              ? (hrActivitiesRes.value.data.data?.activities ?? [])
              : prev.hrActivities,

          calendarEvents:
            calendarEventsRes.status === "fulfilled"
              ? calendarEventsRes.value.data.data
              : prev.calendarEvents,

          stickyNote: prev.stickyNote,

          holidays:
            holidaysRes.status === "fulfilled"
              ? holidaysRes.value.data.data
              : prev.holidays,

          pendingLeaves:
            pendingLeavesRes.status === "fulfilled"
              ? (pendingLeavesRes.value.data.data ?? [])
              : prev.pendingLeaves,

          jobOpenings:
            jobOpeningsRes.status === "fulfilled"
              ? jobOpeningsRes.value.data.data
              : prev.jobOpenings,

          employeeInsights:
            employeeInsightsRes.status === "fulfilled"
              ? employeeInsightsRes.value.data.data
              : prev.employeeInsights,

          kycInsights:
            kycInsightsRes.status === "fulfilled"
              ? kycInsightsRes.value.data.data
              : prev.kycInsights,

          birthdaysAnniversaries:
            birthdaysAnniversariesRes.status === "fulfilled"
              ? birthdaysAnniversariesRes.value.data.data
              : prev.birthdaysAnniversaries,
        }));

        setLoading({
          attendances: false,
          attendanceSummary: false,
          hrActivities: false,
          calendarEvents: false,
          stickyNote: false,
          holidays: false,
          pendingLeaves: false,
          jobOpenings: false,
          employeeInsights: false,
          kycInsights: false,
          birthdaysAnniversaries: false,
        });
      } catch (error) {
        const err = error as { name?: string; code?: string };
        if (err.name === "CanceledError" || err.code === "ERR_CANCELED") {
          console.log("Dashboard request canceled");
        } else {
          console.error("Dashboard fetch error:", error);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [user?.username, month, year]);

  useEffect(() => {
    const cleanup = fetchDashboardData();
    return () => {
      if (cleanup) cleanup();
    };
  }, [fetchDashboardData]);

  return (
    <DashboardContext.Provider
      value={{ data, loading, refetch: fetchDashboardData }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used inside DashboardProvider");
  }
  return context;
}
