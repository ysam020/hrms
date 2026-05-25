import { memo, useContext } from "react";
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
import AddCircleIcon from "@mui/icons-material/AddCircle";
import SecurityIcon from "@mui/icons-material/Security";
import Button from "@web/shared/components/Button";
import { API_ENDPOINTS } from "@web/shared/constants";

const validationSchema = toFormikValidationSchema(
  z.object({
    name: z
      .string()
      .trim()
      .min(2, "Role name must be at least 2 characters")
      .max(50, "Role name must be less than 50 characters")
      .regex(/^[a-zA-Z\s]+$/, "Role name can only contain letters and spaces"),
  }),
);

function CreateRoleModal(props) {
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);

  const formik = useFormik({
    initialValues: {
      name: "",
    },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        const res = await apiClient.post(API_ENDPOINTS.CREATE_ROLE, {
          name: values.name.trim(),
        });

        setAlert({
          open: true,
          message: res.data?.message || "Role created successfully",
          severity: "success",
        });
      } catch (error) {
        setAlert({
          open: true,
          message:
            error.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : error.response?.data?.message ||
                "An error occurred while creating the role",
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
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: { xs: "90%", sm: 480 },
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
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  borderRadius: 1.5,
                  display: "flex",
                }}
              >
                <AddCircleIcon fontSize="small" />
              </Box>
              <Box>
                <Typography
                  variant="h6"
                  fontWeight={600}
                  sx={{ fontSize: "1.1rem" }}
                >
                  Create New Role
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <SecurityIcon
                    sx={{ fontSize: 14, color: "text.secondary" }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    Role & Permissions Management
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>

          {/* Form */}
          <Box sx={{ p: 2.5, pt: 0 }}>
            <form onSubmit={formik.handleSubmit}>
              <Stack spacing={2}>
                {/* Role Name Input */}
                <Box>
                  <Typography
                    variant="h6"
                    color="text.secondary"
                    gutterBottom
                    sx={{ mb: 1 }}
                  >
                    <SecurityIcon
                      sx={{ fontSize: 16, mr: 0.5, verticalAlign: "middle" }}
                    />
                    Role Information
                  </Typography>

                  <FormikInputWrapper
                    type="text"
                    name="name"
                    placeholder="Enter role name (e.g., Manager, Developer, Admin)"
                    formik={formik}
                    inputProps={{
                      autoFocus: true,
                      maxLength: 50,
                    }}
                  />
                </Box>

                {/* Guidelines */}
                <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 1 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mb: 1 }}
                  >
                    <strong>Next Step:</strong>
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    component="div"
                  >
                    After creating the role, you can assign specific permissions
                    and add users to this role from the permissions management
                    page.
                  </Typography>
                </Box>

                {/* Character Counter */}
                {formik.values.name && (
                  <Box sx={{ textAlign: "right" }}>
                    <Typography variant="caption" color="text.secondary">
                      {formik.values.name.length}/50 characters
                    </Typography>
                  </Box>
                )}

                {/* Submit Button */}
                <Button type="submit" disabled={formik.isSubmitting}>
                  Create Role
                </Button>
              </Stack>
            </form>
          </Box>
        </Paper>
      </Fade>
    </Modal>
  );
}

export default memo(CreateRoleModal);
