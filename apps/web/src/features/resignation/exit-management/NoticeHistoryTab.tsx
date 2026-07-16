import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@web/shared/components/Button";
import dayjs from "dayjs";
import type { NoticeEvent } from "./types";

export function NoticeHistoryTab({
  noticeEvents,
  newLastWorkingDay,
  setNewLastWorkingDay,
  renegotiateReason,
  setRenegotiateReason,
  renegotiating,
  onSubmit,
}: {
  noticeEvents: NoticeEvent[];
  newLastWorkingDay: string;
  setNewLastWorkingDay: (v: string) => void;
  renegotiateReason: string;
  setRenegotiateReason: (v: string) => void;
  renegotiating: boolean;
  onSubmit: () => void;
}) {
  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
        <TextField
          label="New last working day"
          type="date"
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
          value={newLastWorkingDay}
          onChange={(e) => setNewLastWorkingDay(e.target.value)}
        />
        <TextField
          label="Reason (optional)"
          size="small"
          value={renegotiateReason}
          onChange={(e) => setRenegotiateReason(e.target.value)}
          sx={{ flex: 1, minWidth: 180 }}
        />
        <Button
          variant="primary"
          size="small"
          onClick={onSubmit}
          disabled={renegotiating || !newLastWorkingDay}
          style={{ marginTop: 0 }}
        >
          Update
        </Button>
      </Box>
      {noticeEvents.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No renegotiations yet.
        </Typography>
      ) : (
        noticeEvents.map((ev) => (
          <Box
            key={ev.id}
            sx={{
              mb: 1,
              pb: 1,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography variant="body2">
              {ev.previousLastWorkingDay
                ? dayjs(ev.previousLastWorkingDay).format("DD MMM YYYY")
                : "—"}
              {" → "}
              {dayjs(ev.newLastWorkingDay).format("DD MMM YYYY")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {ev.reason || "No reason given"} ·{" "}
              {dayjs(ev.createdAt).format("DD MMM YYYY, h:mm A")}
            </Typography>
          </Box>
        ))
      )}
    </Box>
  );
}
