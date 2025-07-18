import React, { useContext, useState } from "react";
import Box from "@mui/material/Box";
import Modal from "@mui/material/Modal";
import dayjs from "dayjs";
import { useFormik } from "formik";
import * as Yup from "yup";
import { AlertContext } from "../../../contexts/AlertContext";
import apiClient from "../../../config/axiosConfig";
import { style } from "../../../utils/modalStyle";
import CustomButton from "../../customComponents/CustomButton";
import { Calendar } from "primereact/calendar";
import UserAutoComplete from "../../customComponents/UserAutoComplete";
import Grid from "@mui/material/Grid2";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import { useEffect } from "react";

function ScheduleInterviewModal({
  open,
  handleClose,
  getJobApplications,
  applicantData,
  _id,
}) {
  const [mode, setMode] = React.useState("schedule");
  const { setAlert } = useContext(AlertContext);
  const { name, email, round } = applicantData;
  const [userList, setUserList] = useState([]);

  useEffect(() => {
    let isMounted = true;

    async function getUsers() {
      try {
        const response = await apiClient.get("/get-interviewer-list");

        // Only update state if component is still mounted
        if (isMounted) {
          setUserList(response.data);
        }
      } catch (error) {
        console.error("Error fetching user list:", error);
      }
    }

    getUsers();

    return () => {
      isMounted = false;
    };
  }, []);

  const validationSchema = Yup.object({
    username: Yup.string().required("Please select an interviewer"),
    dateTime: Yup.date().required("Please select date and time"),
  });

  const formik = useFormik({
    initialValues: { username: "", dateTime: null },
    validationSchema,
    onSubmit: async (values) => {
      const startDate = values.dateTime;
      const endDate = new Date(startDate.getTime() + 1 * 60 * 60000); // 1 hour duration
      const formatDate = (date) => dayjs(date).format("YYYYMMDDTHHmmss");

      try {
        let res;
        if (mode === "schedule") {
          res = await apiClient.put(`/schedule-interview`, {
            email,
            name,
            interviewer: values.username,
            interviewDateTime: startDate,
            interviewStartTime: formatDate(startDate),
            interviewEndTime: formatDate(endDate),
            _id,
          });
        } else if (mode === "reschedule") {
          res = await apiClient.put(`/reschedule-interview`, {
            email,
            name,
            interviewer: values.username,
            interviewDateTime: startDate,
            interviewStartTime: formatDate(startDate),
            interviewEndTime: formatDate(endDate),
            _id,
          });
        } else {
          throw new Error("Invalid mode");
        }

        handleClose();
        getJobApplications();
        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
      } catch (err) {
        setAlert({
          open: true,
          message:
            err.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : err.response?.data?.message ||
                "Error submitting interview details",
          severity: "error",
        });
      }
    },
  });

  return (
    <Modal
      open={open}
      onClose={handleClose}
      aria-labelledby="modal-modal-title"
      disablePortal
    >
      <Box sx={style}>
        <Grid container spacing={1}>
          <Grid size={{ xs: 12 }}>
            <h3>Schedule/Reschedule Round {round} Interview</h3>
          </Grid>
        </Grid>

        <form onSubmit={formik.handleSubmit}>
          <Grid container spacing={1}>
            <Grid size={{ xs: 12 }}>
              <UserAutoComplete
                formik={formik}
                placeholder="Select Interviewer"
                customUserList={userList}
              />
            </Grid>
          </Grid>

          <Calendar
            value={formik.values.dateTime}
            onChange={(e) => formik.setFieldValue("dateTime", e.value)}
            showTime
            hourFormat="24"
            dateFormat="dd/mm/yy"
            appendTo="self"
            minDate={new Date()} // Disable past dates
            disabledDays={[0]} // 0 represents Sunday
            timeOnly={false}
            showButtonBar
            stepMinute={15}
            style={{ width: "100%" }}
            placeholder="Select interview date and time"
          />
          {formik.errors.dateTime && (
            <p style={{ color: "#f15c6d" }}>{formik.errors.dateTime}</p>
          )}

          <FormControlLabel
            control={
              <Checkbox
                checked={mode === "reschedule"}
                onChange={(e) => {
                  const newMode = e.target.checked ? "reschedule" : "schedule";
                  setMode(newMode);
                  // Removed formik.setFieldValue("username", "") to prevent reset
                }}
              />
            }
            label={"Reschedule Interview"}
          />
          <br />
          <CustomButton name="Submit" isSubmitting={formik.isSubmitting} />
        </form>
      </Box>
    </Modal>
  );
}

export default React.memo(ScheduleInterviewModal);
