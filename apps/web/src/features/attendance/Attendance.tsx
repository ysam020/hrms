import TabsPanel from "@web/shared/components/TabsPanel";
import * as React from "react";
import LeaveApplication from "./LeaveApplication";
import ViewAttendances from "./ViewAttendances";
import ViewLeaveApplications from "./ViewLeaveApplications";
import AttendanceCorrection from "./AttendanceCorrection";
import Insights from "./Insights";

function Attendances() {
  const tabData = [
    { label: "View All Attendances", component: ViewAttendances },
    { label: "Leave Application", component: LeaveApplication },
    { label: "View Leave Applications", component: ViewLeaveApplications },
    { label: "Attendance Correction", component: AttendanceCorrection },
    { label: "Insights", component: Insights },
  ];

  return (
    <TabsPanel
      tabData={tabData}
      tabKey="attendance_tab_value"
      basePath="/attendance"
    />
  );
}

export default React.memo(Attendances);
