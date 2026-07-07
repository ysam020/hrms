import { memo } from "react";
import Tickets from "./Tickets";

/**
 * Helpdesk page — renders the ticket list directly.
 *
 * NOTE: We intentionally do NOT use TabsPanel here. TabsPanel turns a tab
 * label into a URL slug (e.g. "All Tickets" → /helpdesk/all-tickets), which
 * conflicts with the /:ticketId route used by TicketDetail. Since there is
 * currently only one tab, wrapping is unnecessary and causes routing issues.
 */
function Helpdesk() {
  return <Tickets />;
}

export default memo(Helpdesk);
