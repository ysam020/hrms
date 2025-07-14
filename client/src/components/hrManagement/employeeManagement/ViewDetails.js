import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box,
  CircularProgress,
} from "@mui/material";
import { useEffect, useState, useContext, lazy, Suspense } from "react";
import apiClient from "../../../config/axiosConfig";
import { useParams } from "react-router-dom";
import { AlertContext } from "../../../contexts/AlertContext";
import { Calendar } from "primereact/calendar";

// Lazy load components
const UnAuthorisedRoute = lazy(() =>
  import("../../../routes/UnAuthorisedRoute")
);
const downloadSalarySlip = lazy(() =>
  import("../../../utils/downloadSalarySlip")
);
const salaryComponentsImport = import("../../../assets/data/salaryComponents");

function ViewDetails() {
  const { username } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState(null);
  const { setAlert } = useContext(AlertContext);

  const [date, setDate] = useState(() => {
    const today = new Date();
    today.setMonth(today.getMonth() - 1);
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  });
  const [isDownloading, setIsDownloading] = useState(false);
  const [salaryComponents, setSalaryComponents] = useState([]);

  const maxSelectableDate = (() => {
    const today = new Date();
    today.setMonth(today.getMonth() - 1);
    return new Date(today.getFullYear(), today.getMonth(), 1);
  })();

  useEffect(() => {
    async function getData() {
      try {
        const res = await apiClient(`get-employee-details/${username}`);
        setData(res.data);
      } catch (err) {
        setErrorStatus(err.response?.status);
        setAlert({
          open: true,
          message:
            err.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : err.response?.data?.message || "Something went wrong",
          severity: "error",
        });
      } finally {
        setLoading(false);
      }
    }

    async function loadSalaryComponents() {
      const module = await salaryComponentsImport;
      setSalaryComponents(module.salaryComponents);
    }

    getData();
    loadSalaryComponents();
  }, [username, setAlert]);

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "50vh",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (errorStatus === 403) {
    return (
      <Suspense fallback={<div>Loading...</div>}>
        <UnAuthorisedRoute />
      </Suspense>
    );
  }

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Salary Structure
      </Typography>
      <TableContainer
        component={Paper}
        sx={{
          maxWidth: 800,
          mb: 2,
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
          borderRadius: 2,
          p: 1,
        }}
      >
        <Table
          size="small"
          sx={{
            "& .MuiTableCell-root": { padding: "4px 8px" },
            "& tbody tr:last-child td": { borderBottom: "none" },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: "bold", fontSize: "0.875rem" }}>
                Component
              </TableCell>
              <TableCell sx={{ fontWeight: "bold", fontSize: "0.875rem" }}>
                Amount
              </TableCell>
              <TableCell sx={{ fontWeight: "bold", fontSize: "0.875rem" }}>
                Percentage
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {salaryComponents.map((component) => (
              <TableRow key={component.key}>
                <TableCell sx={{ fontWeight: 500, fontSize: ".875rem" }}>
                  {component.label}
                </TableCell>
                <TableCell>
                  {data?.salaryStructure?.[component.key]?.amount ?? "--"}
                </TableCell>
                <TableCell>
                  {data?.salaryStructure?.[component.key]?.percentage ?? "--"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <h4 style={{ marginBottom: "10px" }}>Download Salary Slip</h4>
      <Calendar
        value={date ? new Date(date + "-01") : null}
        onChange={(e) => {
          if (e.value) {
            const year = e.value.getFullYear();
            const month = String(e.value.getMonth() + 1).padStart(2, "0");
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
      <Suspense fallback={<span>Preparing file...</span>}>
        <button
          className="btn"
          onClick={() => downloadSalarySlip(date, username, setIsDownloading)}
          disabled={isDownloading}
        >
          Download
        </button>
      </Suspense>

      <br />
      <Box
        className="flex-div"
        sx={{ mb: 1, display: "flex", alignItems: "center" }}
      >
        Is Super User: {data?.isSuperUser ? "Yes" : "No"}
      </Box>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        Assets Allocated: {data?.assets?.join(", ") || "None"}
      </Typography>
      <Box sx={{ mb: 1 }}>
        Terminated: {data?.employeeStatus === "Terminated" ? "Yes" : "No"}
      </Box>
      {data?.employeeStatus === "Terminated" && (
        <Box sx={{ mb: 1 }}>
          Reason for termination: {data?.reasonForTermination}
        </Box>
      )}
      <Box
        className="flex-div"
        sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1 }}
      >
        Absconded: {data?.employeeStatus === "Absconded" ? "Yes" : "No"}
      </Box>
    </Box>
  );
}

export default ViewDetails;
