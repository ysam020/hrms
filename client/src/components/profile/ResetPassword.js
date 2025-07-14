import React, { useContext, useState } from "react";
import { useFormik } from "formik";
import { validationSchema } from "../../schemas/auth/resetPasswordSchema";
import CustomButton from "../../components/customComponents/CustomButton";
import { AlertContext } from "../../contexts/AlertContext";
import apiClient from "../../config/axiosConfig";
import { Password } from "primereact/password";
import Grid from "@mui/material/Grid2";
import Typography from "@mui/material/Typography";
import PasswordStrength from "../customComponents/PasswordStrength";

function ResetPassword() {
  const { setAlert } = useContext(AlertContext);
  const [passwordScore, setPasswordScore] = useState(0);
  const [strengthLabel, setStrengthLabel] = useState("");

  const formik = useFormik({
    initialValues: {
      password: "",
      new_password: "",
      confirm_password: "",
    },
    validationSchema,
    onSubmit: async (values, { resetForm }) => {
      try {
        const res = await apiClient.put(`/reset-password`, values);

        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
        resetForm();
        setPasswordScore(0);
        setStrengthLabel("");
      } catch (error) {
        setAlert({
          open: true,
          message: error.response.data.message,
          severity: "error",
        });
      }
    },
  });

  return (
    <form onSubmit={formik.handleSubmit} className="profile-container">
      <Grid container spacing={1}>
        <Grid size={12}>
          <Password
            toggleMask
            id="password"
            name="password"
            placeholder="Current Password"
            value={formik.values.password}
            onChange={formik.handleChange}
            feedback={false}
          />
          {formik.touched.password && formik.errors.password && (
            <Typography color="error" variant="caption">
              {formik.errors.password}
            </Typography>
          )}
        </Grid>
      </Grid>

      <Grid container spacing={1}>
        <Grid size={6}>
          <PasswordStrength
            formik={formik}
            name="new_password"
            placeholder="New Password"
            value={formik.values.new_password}
            passwordScore={passwordScore}
            setPasswordScore={setPasswordScore}
            strengthLabel={strengthLabel}
            setStrengthLabel={setStrengthLabel}
          />
          {formik.touched.new_password && formik.errors.new_password && (
            <Typography color="error" variant="caption">
              {formik.errors.new_password}
            </Typography>
          )}
        </Grid>

        <Grid size={6}>
          <PasswordStrength
            formik={formik}
            name="confirm_password"
            placeholder="Confirm Password"
            value={formik.values.confirm_password}
            passwordScore={passwordScore}
            setPasswordScore={setPasswordScore}
            strengthLabel={strengthLabel}
            setStrengthLabel={setStrengthLabel}
          />
          {formik.touched.confirm_password &&
            formik.errors.confirm_password && (
              <Typography color="error" variant="caption">
                {formik.errors.confirm_password}
              </Typography>
            )}
        </Grid>
      </Grid>

      <CustomButton name="Submit" isSubmitting={formik.isSubmitting} />
    </form>
  );
}

export default React.memo(ResetPassword);
