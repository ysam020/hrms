import React, { useContext } from "react";
import Modal from "@mui/material/Modal";
import Paper from "@mui/material/Paper";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Backdrop from "@mui/material/Backdrop";
import Fade from "@mui/material/Fade";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { useFormik } from "formik";
import { z } from "zod";
import { toFormikValidationSchema } from "zod-formik-adapter";
import apiClient from "@web/core/http/axiosConfig";
import FormikInputWrapper from "@web/shared/components/InputWrapper";
import GroupsIcon from "@mui/icons-material/Groups";
import TeamIcon from "@mui/icons-material/Group";
import PeopleIcon from "@mui/icons-material/People";
import PersonIcon from "@mui/icons-material/Person";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import useUserList from "@web/shared/hooks/useUserList";
import { MultiSelect } from "primereact/multiselect";
import { Dropdown } from "primereact/dropdown";
import Button from "@web/shared/components/Button";
import { API_ENDPOINTS } from "@web/shared/constants";

const validationSchema = toFormikValidationSchema(
  z.object({
    team_name: z
      .string()
      .trim()
      .min(2, "Team name must be at least 2 characters")
      .max(50, "Team name must be less than 50 characters"),
    members: z
      .array(z.string())
      .min(1, "Please select at least one team member"),
    team_leader: z.string().min(1, "Team leader is required"),
  }),
);

function CreateTeamModal(props) {
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const userList = useUserList();

  const formik = useFormik({
    initialValues: {
      members: [] as string[],
      team_name: "",
      team_leader: "",
    },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        const res = await apiClient.post(API_ENDPOINTS.CREATE_TEAM, {
          team_name: values.team_name.trim(),
          members: values.members,
          team_leader: values.team_leader,
        });

        setAlert({
          open: true,
          message: res.data?.message || "Team created successfully",
          severity: "success",
        });
      } catch (error) {
        setAlert({
          open: true,
          message:
            error.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : error.response?.data?.message ||
                "An error occurred while creating the team",
          severity: "error",
        });
      } finally {
        resetForm();
        props.getData && props.getData();
        props.handleClose();
      }
    },
  });

  // Reset team leader if not in selected members
  React.useEffect(() => {
    if (
      formik.values.team_leader &&
      !formik.values.members.includes(formik.values.team_leader)
    ) {
      formik.setFieldValue("team_leader", "");
    }
  }, [formik.values.members, formik.values.team_leader]);

  const modalStyle = {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: { xs: "90%", sm: 600 },
    maxHeight: "90vh",
    overflow: "auto",
    outline: 0,
  };

  return (
    <Modal
      open={props.open}
      onClose={props.handleClose}
      closeAfterTransition
      disablePortal
      BackdropComponent={Backdrop}
      BackdropProps={{
        timeout: 200,
        sx: {
          backgroundColor: "rgba(0, 0, 0, 0.4)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        },
      }}
    >
      <Fade in={props.open} timeout={200}>
        <Paper
          elevation={8}
          sx={{
            ...modalStyle,
            borderRadius: 3,
            backgroundColor: "background.paper",
            border:
              theme === "light" ? "1px solid #e5e7eb" : "1px solid #374151",
          }}
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
                  bgcolor: "secondary.main",
                  color: "secondary.contrastText",
                  borderRadius: 1.5,
                  display: "flex",
                }}
              >
                <GroupsIcon fontSize="small" />
              </Box>
              <Box>
                <Typography
                  variant="h6"
                  fontWeight={600}
                  sx={{ fontSize: "1.1rem" }}
                >
                  Create New Team
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <TeamIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                  <Typography variant="caption" color="text.secondary">
                    Team Management
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>

          {/* Form */}
          <Box sx={{ p: 2.5, pt: 0 }}>
            <form onSubmit={formik.handleSubmit}>
              <Stack spacing={2}>
                {/* Team Name Section */}
                <Box>
                  <Typography
                    variant="h6"
                    color="text.secondary"
                    gutterBottom
                    sx={{ mb: 1 }}
                  >
                    <TeamIcon
                      sx={{ fontSize: 16, mr: 0.5, verticalAlign: "middle" }}
                    />
                    Team Name
                  </Typography>

                  <FormikInputWrapper
                    type="text"
                    name="team_name"
                    placeholder="Enter team name (e.g., Development Team, Marketing Squad)"
                    formik={formik}
                    inputProps={{
                      autoFocus: true,
                      maxLength: 50,
                    }}
                  />
                </Box>

                {/* Team Members Section */}
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
                    Team Members
                  </Typography>

                  <MultiSelect
                    value={formik.values.members}
                    onChange={(e) => formik.setFieldValue("members", e.value)}
                    options={userList}
                    placeholder="Select team members..."
                    maxSelectedLabels={3}
                    appendTo="self"
                    display="chip"
                    filter
                    filterBy="label"
                    style={{ width: "100%" }}
                    panelStyle={{ maxHeight: "200px" }}
                    scrollHeight="200px"
                  />

                  {/* Validation Error */}
                  {formik.touched.members && formik.errors.members && (
                    <Typography
                      variant="caption"
                      color="error"
                      sx={{
                        mt: 0.5,
                        display: "block",
                        color: "#f15c6d",
                        fontSize: 14,
                      }}
                    >
                      {formik.errors.members}
                    </Typography>
                  )}

                  {/* Selection Summary */}
                  {formik.values.members &&
                    formik.values.members.length > 0 && (
                      <Box
                        sx={{
                          mt: 1.5,
                          p: 1.5,
                          bgcolor: "success.light",
                          borderRadius: 1,
                          border: "1px solid",
                          borderColor: "success.main",
                        }}
                      >
                        <Typography
                          variant="caption"
                          color="success.dark"
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                          }}
                        >
                          <CheckCircleIcon sx={{ fontSize: 14 }} />
                          {formik.values.members.length} member(s) selected
                          {formik.values.members.length > 3 &&
                            ` (${formik.values.members.length - 3} more...)`}
                        </Typography>
                      </Box>
                    )}
                </Box>

                {/* Team Leader Section */}
                <Box>
                  <Typography
                    variant="h6"
                    color="text.secondary"
                    gutterBottom
                    sx={{ mb: 1 }}
                  >
                    <PersonIcon
                      sx={{ fontSize: 16, mr: 0.5, verticalAlign: "middle" }}
                    />
                    Team Leader
                  </Typography>

                  <Dropdown
                    value={formik.values.team_leader}
                    onChange={(e) =>
                      formik.setFieldValue("team_leader", e.value)
                    }
                    options={formik.values.members}
                    placeholder="Select team leader..."
                    style={{ width: "100%" }}
                    disabled={formik.values.members.length === 0}
                    emptyMessage="Please select team members first"
                    appendTo={"self"}
                  />

                  {/* Validation Error */}
                  {formik.touched.team_leader && formik.errors.team_leader && (
                    <Typography
                      variant="caption"
                      sx={{
                        mt: 0.5,
                        display: "block",
                        color: "#f15c6d",
                        fontSize: 14,
                      }}
                    >
                      {formik.errors.team_leader}
                    </Typography>
                  )}

                  {/* Helper Text */}
                  {formik.values.members.length === 0 && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ mt: 0.5, display: "block" }}
                    >
                      Select team members first to choose a team leader
                    </Typography>
                  )}

                  {/* Leader Selection Summary */}
                  {formik.values.team_leader && (
                    <Box
                      sx={{
                        mt: 1.5,
                        p: 1.5,
                        bgcolor: "primary.light",
                        borderRadius: 1,
                        border: "1px solid",
                        borderColor: "primary.main",
                      }}
                    >
                      <Typography
                        variant="caption"
                        color="primary.dark"
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 0.5,
                        }}
                      >
                        <PersonIcon sx={{ fontSize: 14 }} />
                        {`${formik.values.team_leader} 
                        selected as team leader`}
                      </Typography>
                    </Box>
                  )}
                </Box>

                {/* Guidelines */}
                <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 1 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mb: 1 }}
                  >
                    <strong>What's Next:</strong>
                  </Typography>
                  <Typography variant="caption">
                    After creating the team, you can add or remove team members
                    and change the team leader as needed.
                  </Typography>
                </Box>

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={
                    !formik.values.team_name.trim() ||
                    !formik.values.members.length ||
                    !formik.values.team_leader ||
                    formik.isSubmitting
                  }
                >
                  Create Team
                </Button>
              </Stack>
            </form>
          </Box>
        </Paper>
      </Fade>
    </Modal>
  );
}

export default React.memo(CreateTeamModal);
