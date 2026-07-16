import { cloneElement, type ReactElement } from "react";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material";
import type { Theme } from "@mui/material/styles";

export interface StatCard {
  label: string;
  value: number;
  icon: ReactElement;
  color: string;
  breakdown?: { label: string; value: number; color: string }[];
}

export function StatsCards({
  stats,
  loading,
  theme,
}: {
  stats: StatCard[];
  loading: boolean;
  theme: Theme;
}) {
  return (
    <Grid
      container
      spacing={{ xs: 0.75, sm: 1 }}
      sx={{ mb: { xs: 0.75, sm: 1 } }}
    >
      {stats.map((stat, index) => (
        <Grid item xs={6} sm={3} key={index}>
          <Card
            elevation={1}
            sx={{
              transition: "all 0.2s ease-in-out",
              "&:hover": {
                transform: "translateY(-2px)",
                boxShadow: theme.shadows[4],
              },
            }}
          >
            <CardContent
              sx={{
                p: { xs: 1, sm: 1.5 },
                "&:last-child": { pb: { xs: 1, sm: 1.5 } },
              }}
            >
              <Grid container alignItems="center" spacing={{ xs: 0.75, sm: 1 }}>
                <Grid item>
                  <Box
                    sx={{
                      p: { xs: 0.5, sm: 0.5 },
                      borderRadius: 1,
                      backgroundColor: alpha(stat.color, 0.1),
                      color: stat.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {cloneElement(stat.icon, {
                      sx: { fontSize: { xs: "0.9rem", sm: "1rem" } },
                    })}
                  </Box>
                </Grid>
                <Grid item xs>
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 700,
                      color: stat.color,
                      lineHeight: 1,
                      mb: 0.25,
                      fontSize: { xs: "1.1rem", sm: "1.25rem" },
                    }}
                  >
                    {loading ? "—" : stat.value}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: theme.palette.text.secondary,
                      fontSize: { xs: "0.65rem", sm: "0.75rem" },
                    }}
                  >
                    {stat.label}
                  </Typography>
                </Grid>
              </Grid>
              {stat.breakdown && !loading && (
                <Box
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: { xs: 0.5, sm: 0.75 },
                    mt: { xs: 0.75, sm: 1 },
                  }}
                >
                  {stat.breakdown.map((item) => (
                    <Box
                      key={item.label}
                      sx={{ display: "flex", alignItems: "center", gap: 0.4 }}
                    >
                      <Box
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          backgroundColor: item.color,
                          flexShrink: 0,
                        }}
                      />
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: { xs: "0.6rem", sm: "0.7rem" },
                          color: theme.palette.text.secondary,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.value} {item.label}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}
