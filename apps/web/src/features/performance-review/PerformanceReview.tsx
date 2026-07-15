import { memo, useContext } from "react";
import TabsPanel from "@web/shared/components/TabsPanel";
import { UserContext } from "@web/app/providers/UserContext";
import { canManageReviews } from "@web/shared/utils/permissions/navAccess";
import PerformanceReviewCycles from "./PerformanceReviewCycles";
import Reviews from "./Reviews";

function PerformanceReview() {
  const { user } = useContext(UserContext);
  const canManage = canManageReviews(user);

  const tabData = [
    ...(canManage
      ? [{ label: "Review Cycles", component: PerformanceReviewCycles }]
      : []),
    { label: "Reviews", component: Reviews },
  ];

  return (
    <TabsPanel
      tabData={tabData}
      tabKey="performance_review_tab_value"
      basePath="/performance-reviews"
    />
  );
}

export default memo(PerformanceReview);
