import React, { useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Modal from "@mui/material/Modal";
import { AlertContext } from "../../../contexts/AlertContext";
import { style } from "../../../utils/modalStyle";
import Grid from "@mui/material/Grid2";
import UserAutoComplete from "../../customComponents/UserAutoComplete";
import CustomButton from "../../customComponents/CustomButton";
import apiClient from "../../../config/axiosConfig";
import { useFormik } from "formik";
import * as Yup from "yup";
import { InputTextarea } from "primereact/inputtextarea";
import { Dropdown } from "primereact/dropdown";

const validationSchema = Yup.object().shape({
  username: Yup.string()
    .required("Interviewer name is required")
    .min(3, "Name must be at least 3 characters")
    .max(50, "Name must be less than 50 characters"),
});

function InfoModal(props) {
  const { name, email, aadharNo } = props.applicantData;
  const { setAlert } = useContext(AlertContext);
  const [editIndex, setEditIndex] = useState(null);
  const [interviews, setInterviews] = useState(props.interviews);
  const [status, setStatus] = useState(props.status);
  const [feedbackInputs, setFeedbackInputs] = useState({});
  const [statusInputs, setStatusInputs] = useState({});

  const statusOptions = ["Completed", "Cleared"];

  useEffect(() => {
    setInterviews(props.applicantData.interviews);
    setStatus(props.applicantData.status);
  }, [props.applicantData.interviews, props.applicantData.status]);

  const formik = useFormik({
    initialValues: { username: "" },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        const res = await apiClient.put(`/reassign-interviewer`, {
          interviewer: values.username,
          jobTitle: props.jobTitle,
          name: name,
          aadharNo: aadharNo,
          interviewRound: editIndex + 1,
          _id: props._id,
        });

        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });

        setInterviews((prev) =>
          prev.map((interview, i) =>
            i === editIndex
              ? { ...interview, interviewer: values.username }
              : interview
          )
        );

        setEditIndex(null);
        resetForm();
        props.getJobApplications();
      } catch (error) {
        setAlert({
          open: true,
          message:
            error.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : error.response.data.message,
          severity: "error",
        });
      }
    },
  });

  const handleAssignClick = (index) => {
    setEditIndex(index);
  };

  const handleCancelClick = () => {
    setEditIndex(null);
    formik.resetForm();
  };

  const handleFeedbackChange = (index, value) => {
    setFeedbackInputs((prev) => ({ ...prev, [index]: value }));
  };

  const submitFeedback = async (index) => {
    try {
      const feedback = feedbackInputs[index];
      if (!feedback || feedback.trim() === "") {
        setAlert({
          open: true,
          message: "Feedback cannot be empty",
          severity: "warning",
        });
        return;
      }

      const res = await apiClient.put(`/submit-candidate-feedback`, {
        feedback,
        jobTitle: props.jobTitle,
        name: name,
        aadharNo: aadharNo,
        interviewRound: index + 1,
        _id: props._id,
      });

      setAlert({
        open: true,
        message: res.data.message,
        severity: "success",
      });

      setInterviews((prev) =>
        prev.map((interview, i) =>
          i === index ? { ...interview, feedback } : interview
        )
      );

      setFeedbackInputs((prev) => ({ ...prev, [index]: "" }));
      props.getJobApplications();
    } catch (error) {
      setAlert({
        open: true,
        message:
          error.message === "Network Error"
            ? "Network Error, your feedback will be submitted when you're back online"
            : error.response.data.message,
        severity: "error",
      });
    }
  };

  const updateStatus = async (index) => {
    const selectedStatus = statusInputs[index];
    if (!selectedStatus) {
      setAlert({
        open: true,
        message: "Please select a status before updating.",
        severity: "warning",
      });
      return;
    }

    try {
      const res = await apiClient.put(`/update-candidate-status`, {
        status: selectedStatus,
        jobTitle: props.jobTitle,
        name: name,
        aadharNo: aadharNo,
        interviewRound: index + 1,
        _id: props._id,
      });

      setStatus(`Round ${index + 1} ${selectedStatus}`);
      setAlert({
        open: true,
        message: res.data.message,
        severity: "success",
      });

      props.getJobApplications();
    } catch (error) {
      setAlert({
        open: true,
        message:
          error.message === "Network Error"
            ? "Network Error, your status will be submitted when you're back online"
            : error.response.data.message,
        severity: "error",
      });
    }
  };

  // Helper function to check if a specific round should have status dropdown hidden
  const shouldHideStatusDropdown = (roundNumber) => {
    if (!status) return false;

    if (roundNumber === 1) {
      // Hide dropdown for Round 1 if status is Round 1 Cleared or beyond
      return (
        status === "Round 1 Cleared" ||
        status === "Round 2 Scheduled" ||
        status === "Round 2 Rescheduled" ||
        status === "Round 2 Completed" ||
        status === "Round 2 Cleared" ||
        status === "Hired" ||
        status === "Rejected"
      );
    } else if (roundNumber === 2) {
      // Hide dropdown for Round 2 if status is Round 2 Cleared or beyond
      return (
        status === "Applied" ||
        status === "Round 1 Scheduled" ||
        status === "Round 1 Rescheduled" ||
        status === "Round 1 Completed" ||
        status === "Round 2 Cleared" ||
        status === "Hired" ||
        status === "Rejected"
      );
    }

    return false;
  };

  return (
    <Modal
      open={props.open}
      onClose={props.handleClose}
      aria-labelledby="modal-modal-title"
      aria-describedby="modal-modal-description"
      disablePortal
    >
      <Box sx={{ ...style, width: 1200 }}>
        <h2>Applicant details for {props.jobTitle}</h2>
        <br />
        <h3>Candidate Details</h3>
        <Grid container spacing={1}>
          <Grid size={{ xs: 4 }}>
            <p>Name: {name}</p>
          </Grid>
          <Grid size={{ xs: 4 }}>
            <p>Email: {email}</p>
          </Grid>
          <Grid size={{ xs: 4 }}>
            <p>Aadhar No: {aadharNo}</p>
          </Grid>
        </Grid>
        <Grid container spacing={1}>
          <h3>Status: {status}</h3>
        </Grid>
        <Grid container spacing={1}>
          <h3>Interview Details</h3>
        </Grid>
        <form onSubmit={formik.handleSubmit}>
          <Grid container spacing={1}>
            {interviews?.map((interview, index) => (
              <Grid size={{ xs: 6 }} key={index}>
                <p>Interview Round: {index + 1}</p>
                <p>
                  Interview Date and Time: {interview.interviewDate},{" "}
                  {interview.interviewStartTime} - {interview.interviewEndTime}
                </p>
                <p>
                  Interviewer: {interview.interviewer} &nbsp;
                  {!interview.interviewConducted && editIndex !== index && (
                    <span
                      className="link"
                      style={{ fontSize: "14px", cursor: "pointer" }}
                      onClick={() => handleAssignClick(index)}
                    >
                      Assign to someone else
                    </span>
                  )}
                </p>

                {editIndex === index && (
                  <div style={{ margin: "10px 0" }}>
                    <UserAutoComplete formik={formik} />
                    <div style={{ display: "flex", gap: "10px" }}>
                      <CustomButton
                        name="Submit"
                        isSubmitting={formik.isSubmitting}
                      />
                      <button
                        className="btn"
                        type="button"
                        onClick={handleCancelClick}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <p>
                  Interview Conducted:&nbsp;
                  {interview.interviewConducted ? "Yes" : "No"}
                </p>

                <p>
                  Feedback:&nbsp;
                  {interview.feedback ? (
                    interview.feedback
                  ) : (
                    <span style={{ color: "gray" }}>Not provided</span>
                  )}
                </p>

                {!interview.feedback && interview.interviewConducted && (
                  <div style={{ margin: "10px 0" }}>
                    <InputTextarea
                      value={feedbackInputs[index] || ""}
                      onChange={(e) =>
                        handleFeedbackChange(index, e.target.value)
                      }
                      rows={3}
                      cols={40}
                      placeholder="Write feedback..."
                      autoResize
                    />
                    <div style={{ marginTop: "5px" }}>
                      <button
                        className="btn"
                        onClick={() => submitFeedback(index)}
                      >
                        Submit Feedback
                      </button>
                    </div>
                  </div>
                )}

                {/* Only show status dropdown if it should not be hidden */}
                {!shouldHideStatusDropdown(index + 1) && (
                  <div style={{ margin: "10px 0" }}>
                    <Dropdown
                      value={statusInputs[index] || ""}
                      options={statusOptions}
                      placeholder="Select a Status"
                      style={{ width: "100%" }}
                      appendTo={"self"}
                      onChange={(e) =>
                        setStatusInputs((prev) => ({
                          ...prev,
                          [index]: e.value,
                        }))
                      }
                    />

                    <button
                      className="btn"
                      type="button"
                      style={{ marginTop: "5px" }}
                      onClick={() => updateStatus(index)}
                    >
                      Update Status
                    </button>
                  </div>
                )}
              </Grid>
            ))}
          </Grid>
        </form>
      </Box>
    </Modal>
  );
}

export default React.memo(InfoModal);
