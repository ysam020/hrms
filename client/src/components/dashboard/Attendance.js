import React, { useEffect, useState, useMemo, useContext } from "react";
import Grid from "@mui/material/Grid2";
import { useNavigate } from "react-router-dom";
import apiClient from "../../config/axiosConfig";
import { UserContext } from "../../contexts/UserContext";

function Attendance() {
  const [data, setData] = useState(null);
  const navigate = useNavigate();
  const { user } = useContext(UserContext);

  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, "0"); // month is 0-indexed

  useEffect(() => {
    async function getData() {
      try {
        const res = await apiClient(
          `/get-attendance-summary/${user.username}/${year}/${month}`,
          {
            withCredentials: true,
          }
        );
        setData(res.data);
      } catch (error) {
        console.error("Error fetching attendance summary:", error);
      }
    }

    getData();
  }, [user?.username, year, month]);

  // Memoized data to avoid unnecessary recalculations
  const memoizedData = useMemo(() => data, [data]);

  // Memoized InfoCol component
  const InfoCol = useMemo(
    () =>
      ({ label, value, className }) =>
        (
          <Grid size={4} className={className}>
            <span className={className}>{value}</span>
            <p className={`${className}-label`}>{label}</p>
          </Grid>
        ),
    []
  );

  return (
    <div
      onClick={() => navigate("/attendance")}
      className="dashboard-container attendance"
      style={{
        cursor: "pointer",
        backgroundImage: "url(/assets/images/m-bg.webp",
      }}
    >
      <Grid container className="attendance-row attendance-row-1">
        <InfoCol
          label="Presents"
          value={memoizedData?.presents}
          className="presents"
        />
        <InfoCol
          label="Leaves"
          value={memoizedData?.leaves}
          className="leaves"
        />
      </Grid>
      <Grid container className="attendance-row attendance-row-2">
        <InfoCol
          label="Paid Leaves"
          value={memoizedData?.paidLeaves}
          className="paid-leaves"
        />
        <InfoCol
          label="Unpaid Leaves"
          value={memoizedData?.unpaidLeaves}
          className="unpaid-leaves"
        />
        <InfoCol
          label="Holidays"
          value={memoizedData?.holidays}
          className="holidays"
        />
      </Grid>
    </div>
  );
}

export default React.memo(Attendance);
