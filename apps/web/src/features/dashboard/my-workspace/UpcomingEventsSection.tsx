import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import CelebrationIcon from "@mui/icons-material/Celebration";
import EventIcon from "@mui/icons-material/Event";
import dayjs from "dayjs";
import { SectionLabel } from "./components";

export interface UpcomingItem {
  date: string;
  label: string;
  type: "event" | "holiday";
  description?: string;
  time?: string;
}

export function UpcomingEventsSection({
  loading,
  upcoming,
}: {
  loading: boolean;
  upcoming: UpcomingItem[];
}) {
  return (
    <Box sx={{ px: 2, pt: 1.25, pb: 1.5 }}>
      <SectionLabel>Coming Up</SectionLabel>
      {loading ? (
        [...Array(4)].map((_, i) => (
          <Box key={i} sx={{ display: "flex", gap: 1, mb: 0.75 }}>
            <Skeleton variant="rounded" width={30} height={30} />
            <Box sx={{ flex: 1 }}>
              <Skeleton height={13} />
              <Skeleton height={11} width="55%" />
            </Box>
          </Box>
        ))
      ) : upcoming.length === 0 ? (
        <Typography variant="caption" sx={{ color: "text.disabled" }}>
          Nothing scheduled soon
        </Typography>
      ) : (
        upcoming.map((item, i) => {
          const d = dayjs(item.date);
          const daysLeft = d.diff(dayjs().startOf("day"), "day");
          const when =
            daysLeft === 0
              ? "Today"
              : daysLeft === 1
                ? "Tomorrow"
                : d.format("DD MMM");
          const color = item.type === "holiday" ? "#8b5cf6" : "#3b82f6";

          return (
            <Box
              key={i}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                mb: 0.75,
                py: 0.5,
                px: 0.75,
                borderRadius: 1.5,
                transition: "background 0.12s",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <Box
                sx={{
                  width: 30,
                  height: 30,
                  borderRadius: 1,
                  bgcolor: `${color}18`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color,
                }}
              >
                {item.type === "holiday" ? (
                  <CelebrationIcon sx={{ fontSize: 15 }} />
                ) : (
                  <EventIcon sx={{ fontSize: 15 }} />
                )}
              </Box>
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 0.5,
                }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography
                    variant="caption"
                    fontWeight={600}
                    sx={{
                      fontSize: "0.72rem",
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.label}
                  </Typography>
                  {item.description && (
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.disabled",
                        fontSize: "0.6rem",
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.description}
                    </Typography>
                  )}
                </Box>
                <Box sx={{ flexShrink: 0, textAlign: "right" }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: daysLeft <= 1 ? color : "text.secondary",
                      fontSize: "0.62rem",
                      fontWeight: daysLeft <= 1 ? 600 : 400,
                      display: "block",
                    }}
                  >
                    {when}
                  </Typography>
                  {item.time && (
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.disabled",
                        fontSize: "0.6rem",
                        display: "block",
                      }}
                    >
                      {item.time}
                    </Typography>
                  )}
                </Box>
              </Box>
            </Box>
          );
        })
      )}
    </Box>
  );
}
