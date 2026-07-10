import { memo } from "react";
import Box from "@mui/material/Box";
import Tickets from "./Tickets";

/**
 * Helpdesk page — renders the ticket list directly.
 *
 * NOTE: We intentionally do NOT use TabsPanel here. TabsPanel turns a tab
 * label into a URL slug (e.g. "All Tickets" → /helpdesk/all-tickets), which
 * conflicts with the /:ticketId route used by TicketDetail. Since there is
 * currently only one tab, wrapping is unnecessary and causes routing issues.
 * The p:3 below matches the padding TabsPanel's CustomTabPanel would have
 * applied, so this page isn't flush against the viewport edge. height:100%
 * matches CustomTabPanel's own sizing too, so Tickets' DataList can fill it
 * and scroll its rows internally instead of the whole page scrolling.
 */
function Helpdesk() {
  return (
    <Box sx={{ p: 3, height: "100%", boxSizing: "border-box" }}>
      <Tickets />
    </Box>
  );
}

export default memo(Helpdesk);
