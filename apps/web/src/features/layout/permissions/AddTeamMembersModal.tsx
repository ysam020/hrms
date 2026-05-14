import React, { useContext } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import { AlertContext } from "@web/app/providers/AlertContext";
import { useFormik } from "formik";
import apiClient from "@web/core/http/axiosConfig";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import PeopleIcon from "@mui/icons-material/People";
import InfoIcon from "@mui/icons-material/Info";
import useUserList from "@web/shared/hooks/useUserList";
import { MultiSelect } from "primereact/multiselect";
import Button from "@web/shared/components/Button";
import CustomModal from "@web/shared/components/Modal";
import { API_ENDPOINTS } from "@web/shared/constants";

function AddTeamMembersModal(props) {
  const { setAlert } = useContext(AlertContext);
  const userList = useUserList();

  const formik = useFormik({
    initialValues: {
      members: [],
    },
    onSubmit: async (values, { resetForm }) => {
      if (!values.members || values.members.length === 0) {
        setAlert({
          open: true,
          message: "Please select at least one team member",
          severity: "warning",
        });
        return;
      }

      try {
        const res = await apiClient.put(API_ENDPOINTS.ADD_TEAM_MEMBERS, {
          members: values.members,
          teamId: props._id,
        });

        setAlert({
          open: true,
          message: res.data?.message || "Team members added successfully",
          severity: "success",
        });
      } catch (error) {
        setAlert({
          open: true,
          message:
            error.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : error.response?.data?.message || "An error occurred",
          severity: "error",
        });
      } finally {
        resetForm();
        props.getData && props.getData();
        props.handleClose();
      }
    },
  });

  const modalStyle = {
    width: { xs: "90%", sm: 520 },
  };

  return (
    <CustomModal
      open={props.open}
      handleClose={props.handleClose}
      modalStyle={modalStyle}
      disablePortal
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 2.5,
          pb: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box
            sx={{
              p: 0.75,
              bgcolor: "success.main",
              color: "success.contrastText",
              borderRadius: 1.5,
              display: "flex",
            }}
          >
            <GroupAddIcon fontSize="small" />
          </Box>
          <Box>
            <Typography
              variant="h6"
              fontWeight={600}
              sx={{ fontSize: "1.1rem" }}
            >
              Add Team Members
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <PeopleIcon sx={{ fontSize: 14, color: "text.secondary" }} />
              <Typography variant="caption" color="text.secondary">
                {props.teamName || "Team Management"}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Form */}
      <Box sx={{ p: 2.5, pt: 0 }}>
        <form onSubmit={formik.handleSubmit}>
          <Stack spacing={1}>
            {/* Team Members Selection */}
            <Box>
              <Typography
                variant="h6"
                color="text.secondary"
                gutterBottom
                sx={{ mb: 1 }}
              >
                <PeopleIcon
                  sx={{ fontSize: 16, mr: 0.5, verticalAlign: "middle" }}
                />
                Select Team Members
              </Typography>

              <MultiSelect
                value={formik.values.members}
                onChange={(e) => formik.setFieldValue("members", e.value)}
                options={userList}
                optionLabel="label"
                optionValue="value"
                placeholder="Choose team members..."
                maxSelectedLabels={3}
                appendTo="self"
                display="chip"
                filter
                filterBy="label"
                style={{ width: "100%" }}
                panelStyle={{ maxHeight: "200px" }}
                scrollHeight="200px"
              />

              {/* Selection Summary */}
              {formik.values.members && formik.values.members.length > 0 && (
                <Box
                  sx={{
                    mt: 1,
                    p: 1.5,
                    bgcolor: "action.hover",
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {formik.values.members.length} member(s) selected
                    {formik.values.members.length > 3 &&
                      ` (${formik.values.members.length - 3} more...)`}
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Available Users Info */}
            <Box
              sx={{
                p: 1.5,
                bgcolor: "info.dark",
                borderRadius: 1,
                border: "1px solid",
                borderColor: "info.main",
              }}
            >
              <Typography
                variant="caption"
                sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
              >
                <InfoIcon sx={{ fontSize: 14 }} />
                {userList?.length || 0} users available for selection
              </Typography>
            </Box>

            {/* Submit Button */}
            <Button type="submit" loading={formik.isSubmitting}>
              Add Selected Members
            </Button>
          </Stack>
        </form>
      </Box>
    </CustomModal>
  );
}

export default React.memo(AddTeamMembersModal);
