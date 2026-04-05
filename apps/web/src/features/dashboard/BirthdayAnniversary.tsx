import React, { useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import CakeIcon from "@mui/icons-material/Cake";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import dayjs from "dayjs";
import { useDashboard } from "@web/app/providers/DashboardContext";

function BirthdayAnniversary() {
  const { data, loading } = useDashboard();
  const isLoading = loading.birthdaysAnniversaries;
  const todayDay = dayjs().date();

  // Split into today, upcoming, and past
  const { todayItems, upcoming, past } = useMemo(() => {
    const allItems = Array.isArray(data.birthdaysAnniversaries)
      ? data.birthdaysAnniversaries
      : [];
    const t: any[] = [],
      u: any[] = [],
      p: any[] = [];
    for (const item of allItems) {
      if (item.day === todayDay) t.push(item);
      else if (item.day > todayDay) u.push(item);
      else p.push(item);
    }
    return { todayItems: t, upcoming: u, past: p };
  }, [data.birthdaysAnniversaries, todayDay]);

  const visibleItems = [...todayItems, ...upcoming, ...past];

  const initials = (name) =>
    name
      .split(" ")
      .map((p) => p[0]?.toUpperCase())
      .join("")
      .slice(0, 2);

  const avatarColor = (username, type) => {
    const hue =
      (username || "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) %
      360;
    return type === "birthday"
      ? `hsl(${hue},55%,48%)`
      : `hsl(${(hue + 40) % 360},50%,44%)`;
  };

  const dayLabel = (day) => {
    if (day === todayDay) return "Today";
    if (day === todayDay + 1) return "Tomorrow";
    if (day > todayDay) return `${dayjs().format("MMM")} ${day}`;
    return `${dayjs().format("MMM")} ${day}`;
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <Box
        sx={{
          px: 1.5,
          py: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <AutoAwesomeIcon sx={{ fontSize: 15, color: "#f59e0b" }} />
          <Typography variant="subtitle2" fontWeight={700}>
            Birthdays & Anniversaries
          </Typography>
        </Box>
        {!isLoading && (
          <Box sx={{ display: "flex", gap: 0.5 }}>
            {todayItems.length > 0 && (
              <Chip
                size="small"
                label={`🎉 ${todayItems.length} today`}
                sx={{
                  height: 18,
                  fontSize: "0.62rem",
                  bgcolor: "rgba(245,158,11,0.15)",
                  color: "#d97706",
                  fontWeight: 700,
                  "& .MuiChip-label": { px: 0.75 },
                }}
              />
            )}
            {visibleItems.length > 0 && (
              <Chip
                size="small"
                label={visibleItems.length}
                sx={{
                  height: 18,
                  fontSize: "0.65rem",
                  "& .MuiChip-label": { px: 0.75 },
                }}
              />
            )}
          </Box>
        )}
      </Box>

      {/* List */}
      <Box sx={{ flex: 1, overflow: "auto" }}>
        {isLoading ? (
          [...Array(4)].map((_, i) => (
            <Box
              key={i}
              sx={{
                px: 1.5,
                py: 0.75,
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <Skeleton variant="circular" width={32} height={32} />
              <Box sx={{ flex: 1 }}>
                <Skeleton height={13} width="50%" />
                <Skeleton height={11} width="70%" sx={{ mt: 0.25 }} />
              </Box>
              <Skeleton width={48} height={18} sx={{ borderRadius: 1 }} />
            </Box>
          ))
        ) : visibleItems.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: 0.75,
              color: "text.disabled",
            }}
          >
            <CakeIcon sx={{ fontSize: 30, opacity: 0.3 }} />
            <Typography variant="caption">Nothing this month</Typography>
          </Box>
        ) : (
          visibleItems.map((item, i) => {
            const isToday = item.day === todayDay;
            const isPast = item.day < todayDay;
            const isBirthday = item.type === "birthday";

            return (
              <Box
                key={i}
                sx={{
                  px: 1.5,
                  py: 0.75,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  opacity: isPast ? 0.45 : 1,
                  bgcolor: isToday ? "rgba(245,158,11,0.06)" : "transparent",
                  borderLeft: isToday
                    ? "3px solid #f59e0b"
                    : "3px solid transparent",
                  transition: "background 0.12s",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    bgcolor: avatarColor(item.username, item.type),
                    flexShrink: 0,
                  }}
                >
                  {initials(item.name)}
                </Avatar>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    sx={{
                      fontSize: "0.78rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary", fontSize: "0.67rem" }}
                  >
                    {item.department && `${item.department} · `}
                    {isBirthday ? "Birthday" : `${item.years}yr anniversary`}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 0.3,
                    flexShrink: 0,
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.3,
                      bgcolor: isBirthday
                        ? "rgba(59,130,246,0.1)"
                        : "rgba(245,158,11,0.1)",
                      borderRadius: 1,
                      px: 0.6,
                      py: 0.2,
                    }}
                  >
                    {isBirthday ? (
                      <CakeIcon sx={{ fontSize: 10, color: "#3b82f6" }} />
                    ) : (
                      <EmojiEventsIcon
                        sx={{ fontSize: 10, color: "#f59e0b" }}
                      />
                    )}
                    <Typography
                      sx={{
                        fontSize: "0.6rem",
                        fontWeight: 700,
                        color: isBirthday ? "#3b82f6" : "#d97706",
                      }}
                    >
                      {isBirthday ? "Birthday" : "Anniv."}
                    </Typography>
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: "0.62rem",
                      color: isToday ? "#f59e0b" : "text.secondary",
                      fontWeight: isToday ? 700 : 400,
                    }}
                  >
                    {dayLabel(item.day)}
                  </Typography>
                </Box>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}

export default React.memo(BirthdayAnniversary);
