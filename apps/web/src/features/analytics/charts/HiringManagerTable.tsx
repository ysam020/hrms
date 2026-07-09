import React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import LinearProgress from "@mui/material/LinearProgress";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";

import useFetchData from "@web/shared/hooks/useFetchData";
import LoadingState from "@web/shared/components/LoadingState";
import DataList from "@web/shared/components/DataList";

const HiringManagerTable = ({ theme }) => {
  const { data, loading } = useFetchData(
    "/get-hiring-manager-performance",
    "get",
    [],
  );

  if (loading) {
    return (
      <Card>
        <CardContent>
          <LoadingState message="Loading manager performance..." />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Hiring Manager Performance
          </Typography>
          <Alert severity="info">No hiring manager data available</Alert>
        </CardContent>
      </Card>
    );
  }

  const getSuccessColor = (rate) => {
    if (rate >= 70) return "success";
    if (rate >= 50) return "warning";
    return "error";
  };

  return (
    <Card elevation={2}>
      <CardContent>
        <Typography variant="h6" fontWeight={600} gutterBottom>
          Hiring Manager Performance
        </Typography>
        <Typography variant="caption" color="text.secondary" gutterBottom>
          Success rate based on closed positions
        </Typography>

        <Box sx={{ mt: 2 }}>
          <DataList
            ariaLabel="Hiring manager performance"
            variant="rows"
            data={data}
            getRowId={(m: any) => m.hiringManager}
            columns={[
              {
                key: "hiringManager",
                label: "Manager",
                primary: true,
                render: (m: any) => m.hiringManager || "Unknown",
              },
              {
                key: "totalJobs",
                label: "Total Jobs",
                render: (m: any) => (
                  <Chip
                    label={m.totalJobs}
                    size="small"
                    variant="outlined"
                    color="primary"
                  />
                ),
              },
              { key: "activeJobs", label: "Active" },
              {
                key: "closedJobs",
                label: "Closed",
                render: (m: any) => (
                  <Box component="span" sx={{ color: "success.main" }}>
                    {m.closedJobs}
                  </Box>
                ),
              },
              {
                key: "successRate",
                label: "Success Rate",
                render: (m: any) => (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={m.successRate}
                      color={getSuccessColor(m.successRate)}
                      sx={{ width: 60, height: 6, borderRadius: 1 }}
                    />
                    <Typography variant="body2" fontWeight={600}>
                      {m.successRate.toFixed(0)}%
                    </Typography>
                  </Box>
                ),
              },
            ]}
          />
        </Box>
      </CardContent>
    </Card>
  );
};

export default React.memo(HiringManagerTable);
