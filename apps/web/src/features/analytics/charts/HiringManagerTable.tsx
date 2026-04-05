import React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import LinearProgress from "@mui/material/LinearProgress";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";

import useFetchData from "@web/shared/hooks/useFetchData";
import LoadingState from "@web/shared/components/LoadingState";

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

        <TableContainer sx={{ maxHeight: 400, mt: 2 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>
                    Manager
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={600}>
                    Total Jobs
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={600}>
                    Active
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={600}>
                    Closed
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={600}>
                    Success Rate
                  </Typography>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((manager, index) => (
                <TableRow key={index} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                      {manager.hiringManager || "Unknown"}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Chip
                      label={manager.totalJobs}
                      size="small"
                      variant="outlined"
                      color="primary"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2">
                      {manager.activeJobs}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color="success.main">
                      {manager.closedJobs}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: 1,
                      }}
                    >
                      <LinearProgress
                        variant="determinate"
                        value={manager.successRate}
                        color={getSuccessColor(manager.successRate)}
                        sx={{
                          width: 60,
                          height: 6,
                          borderRadius: 1,
                        }}
                      />
                      <Typography variant="body2" fontWeight={600}>
                        {manager.successRate.toFixed(0)}%
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
};

export default React.memo(HiringManagerTable);
