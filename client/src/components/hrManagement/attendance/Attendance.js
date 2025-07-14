import TabsPanel from "../../customComponents/TabsPanel";
import * as React from "react";
import LeaveApplication from "./LeaveApplication";
import ViewAttendances from "./ViewAttendances";
import ViewLeaveApplications from "./ViewLeaveApplications";
import AttendanceCorrection from "./AttendanceCorrection";

function Appraisal() {
  const tabData = [
    { label: "View All Attendances", component: ViewAttendances },
    { label: "Leave Application", component: LeaveApplication },
    { label: "View Leave Applications", component: ViewLeaveApplications },
    { label: "Attendance Correction", component: AttendanceCorrection },
  ];

  return <TabsPanel tabData={tabData} tabKey="attendance_tab_value" />;
}

export default React.memo(Appraisal);
