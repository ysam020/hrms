import TabsPanel from "@web/shared/components/TabsPanel";
import { memo, useContext } from "react";
import { UserContext } from "@web/app/providers/UserContext";
import { isHrOrAbove } from "@web/shared/utils/permissions/navAccess";
import ViewAttendances from "./ViewAttendances";
import ViewLeaveApplications from "./ViewLeaveApplications";
import AttendanceCorrection from "./AttendanceCorrection";
import Insights from "./Insights";

function Attendances() {
  const { user } = useContext(UserContext);
  const tabData = [
    { label: "View All Attendances", component: ViewAttendances },
    { label: "View Leave Applications", component: ViewLeaveApplications },
    { label: "Attendance Correction", component: AttendanceCorrection },
    ...(isHrOrAbove(user) ? [{ label: "Insights", component: Insights }] : []),
  ];

  return (
    <TabsPanel
      tabData={tabData}
      tabKey="attendance_tab_value"
      basePath="/attendance"
    />
  );
}

export default memo(Attendances);
