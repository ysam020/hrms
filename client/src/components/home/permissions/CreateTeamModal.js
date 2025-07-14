import * as React from "react";
import Box from "@mui/material/Box";
import Modal from "@mui/material/Modal";
import { style } from "../../../utils/modalStyle";
import CustomButton from "../../customComponents/CustomButton";
import { useFormik } from "formik";
import apiClient from "../../../config/axiosConfig";
import { AlertContext } from "../../../contexts/AlertContext";
import FormikInputWrapper from "../../customComponents/InputWrapper";
import Grid from "@mui/material/Grid2";
import { MultiSelect } from "primereact/multiselect";
import useUserList from "../../../hooks/useUserList";

function CreateTeamModal(props) {
  const { setAlert } = React.useContext(AlertContext);
  const userList = useUserList();
  const formik = useFormik({
    initialValues: {
      members: [],
      team_name: "",
    },

    onSubmit: async (values, { resetForm }) => {
      try {
        await apiClient.post(`/create-team`, values);
      } catch (error) {
        setAlert({
          open: true,
          message:
            error.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : error.response.data.message,
          severity: "error",
        });
      } finally {
        resetForm();
        props.getData();
        props.handleClose();
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
        disableEscapeKeyDown
        disablePortal
      >
        <Box sx={style}>
          <form onSubmit={formik.handleSubmit}>
            <Grid container spacing={1}>
              <Grid size={12}>
                <FormikInputWrapper
                  type="text"
                  name="team_name"
                  placeholder="Name of Team"
                  formik={formik}
                />
              </Grid>
            </Grid>

            <Grid container spacing={1}>
              <Grid size={{ xs: 12 }}>
                <MultiSelect
                  value={formik.values.members}
                  onChange={(e) => formik.setFieldValue("members", e.value)}
                  options={userList}
                  placeholder="Select Members"
                  maxSelectedLabels={4}
                  appendTo={"self"}
                  display="chip"
                />
              </Grid>
            </Grid>

            <CustomButton name="Submit" isSubmitting={formik.isSubmitting} />
          </form>
        </Box>
      </Modal>
    </div>
  );
}

export default React.memo(CreateTeamModal);
