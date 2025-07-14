import React, { useContext } from "react";
import Box from "@mui/material/Box";
import Modal from "@mui/material/Modal";
import { AlertContext } from "../../../contexts/AlertContext";
import { style } from "../../../utils/modalStyle";
import { useFormik } from "formik";
import FormikInputWrapper from "../../customComponents/InputWrapper";
import CustomButton from "../../customComponents/CustomButton";
import apiClient from "../../../config/axiosConfig";
import { validationSchema } from "../../../schemas/hrManagement/jobOpenings/rejectApplication";

function RejectModal(props) {
  const { setAlert } = useContext(AlertContext);
  const { name, aadharNo } = props.applicantData;

  const formik = useFormik({
    initialValues: {
      reason: "",
    },
    validationSchema,
    onSubmit: async (values) => {
      const data = {
        ...values,
        name,
        aadharNo,
        jobTitle: props.jobTitle,
        _id: props._id,
      };

      try {
        const res = await apiClient.put(`/reject-application`, data);

        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });

        // Re-fetch job applications after rejection
        props.getJobApplications();
      } catch (err) {
        setAlert({
          open: true,
          message:
            err.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : err.response.data.message,
          severity: "error",
        });
      }
    },
  });
  return (
    <div>
      <Modal
        open={props.open}
        onClose={props.handleClose}
        aria-labelledby="modal-modal-title"
        aria-describedby="modal-modal-description"
        disablePortal
      >
        <Box sx={style}>
          <form onSubmit={formik.handleSubmit}>
            <h4>Reason for Rejecting</h4>
            <br />
            <FormikInputWrapper
              type="text"
              name="reason"
              placeholder="Reason"
              formik={formik}
            />

            <CustomButton name="Submit" isSubmitting={formik.isSubmitting} />
          </form>
        </Box>
      </Modal>
    </div>
  );
}

export default React.memo(RejectModal);
