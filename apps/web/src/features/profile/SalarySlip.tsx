import { useContext, useState } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Grid from "@mui/material/Grid2";
import Receipt from "@mui/icons-material/Receipt";
import CalendarToday from "@mui/icons-material/CalendarToday";
import { Calendar } from "primereact/calendar";
import Button from "@web/shared/components/Button";
import { UserContext } from "@web/app/providers/UserContext";
import { AlertContext } from "@web/app/providers/AlertContext";

function SalarySlip() {
  const { user } = useContext(UserContext);
  const [date, setDate] = useState(() => {
    const today = new Date();
    today.setMonth(today.getMonth() - 1);
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  });
  const [isDownloading, setIsDownloading] = useState(false);
  const { setAlert } = useContext(AlertContext);

  const maxSelectableDate = (() => {
    const today = new Date();
    today.setMonth(today.getMonth() - 1);
    return new Date(today.getFullYear(), today.getMonth(), 1);
  })();

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const { default: downloadSalarySlip } =
        await import("@web/shared/utils/downloadSalarySlip");
      await downloadSalarySlip(date, user.id, setIsDownloading, setAlert);
    } catch (error) {
      console.error("Error downloading salary slip:", error);
      setIsDownloading(false);
    }
  };

  return (
    <Card sx={{ maxWidth: 500, mx: "auto", boxShadow: 2 }}>
      <CardContent sx={{ p: 2 }}>
        {/* Header */}
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <Receipt color="primary" />
          <Typography variant="h6" fontWeight="600">
            Salary Slip Download
          </Typography>
        </Box>

        <Grid container spacing={1}>
          {/* Date Selection */}
          <Grid size={12}>
            <Paper sx={{ p: 1.5, bgcolor: "background.default" }}>
              <Box display="flex" alignItems="center" gap={1} mb={1}>
                <CalendarToday sx={{ fontSize: 18, color: "text.secondary" }} />
                <Typography variant="subtitle2" fontWeight="500">
                  Select Month/Year
                </Typography>
              </Box>
              <Box>
                <Calendar
                  value={date ? new Date(date + "-01") : null}
                  onChange={(e) => {
                    if (e.value) {
                      const year = e.value.getFullYear();
                      const month = String(e.value.getMonth() + 1).padStart(
                        2,
                        "0",
                      );
                      setDate(`${year}-${month}`);
                    } else {
                      setDate("");
                    }
                  }}
                  view="month"
                  dateFormat="mm/yy"
                  maxDate={maxSelectableDate}
                  showIcon
                />
              </Box>
            </Paper>
          </Grid>

          {/* Download Action */}
          <Grid size={12}>
            <Box display="flex" justifyContent="center">
              <Button
                type="submit"
                disabled={isDownloading}
                onClick={handleDownload}
                sx={{
                  minWidth: 180,
                  textTransform: "none",
                  fontWeight: "500",
                }}
              >
                Download Salary Slip
              </Button>
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

export default SalarySlip;
