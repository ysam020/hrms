import { memo } from "react";
import Box from "@mui/material/Box";
import ViewHrActivities from "./ViewHrActivities";

/**
 * HR Activities page — renders the activities list directly.
 *
 * NOTE: We intentionally do NOT use TabsPanel here (mirrors Helpdesk.tsx).
 * Since "Add New Activity" was folded into an in-page modal, there is only
 * one tab left, so wrapping it in TabsPanel would show a single, pointless
 * tab. The p:3 below matches the padding TabsPanel's CustomTabPanel would
 * have applied, so this page isn't flush against the viewport edge;
 * height:100% matches CustomTabPanel's own sizing too, so
 * ViewHrActivities' DataList can fill it and scroll its rows internally
 * instead of the whole page scrolling.
 */
function HrActivities() {
  return (
    <Box sx={{ p: 3, height: "100%", boxSizing: "border-box" }}>
      <ViewHrActivities />
    </Box>
  );
}

export default memo(HrActivities);
