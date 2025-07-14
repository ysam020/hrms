import React, { useContext, useEffect, useState } from "react";
import { useFormik } from "formik";
import { InputOtp } from "primereact/inputotp";
import { validationSchema } from "../schemas/auth/updatePasswordSchema";
import CustomButton from "../components/customComponents/CustomButton";
import { AlertContext } from "../contexts/AlertContext";
import apiClient from "../config/axiosConfig";
import PasswordStrength from "../components/customComponents/PasswordStrength";

function ForgotPasswordForm(props) {
  const { setAlert } = useContext(AlertContext);
  const [passwordScore, setPasswordScore] = useState(0);
  const [strengthLabel, setStrengthLabel] = useState("");

  useEffect(() => {
    async function sendOtp() {
      try {
        const res = await apiClient.post(`/send-forgot-password-otp`, {
          username: props.username,
        });

        setAlert({
          open: true,
          message: res?.data?.message,
          severity: "success",
        });
      } catch (err) {
        setAlert({
          open: true,
          message: err?.response?.data?.message,
          severity: "error",
        });
      }
    }

    sendOtp();
    // eslint-disable-next-line
  }, [props.username]);

  const formik = useFormik({
    initialValues: {
      otp: "",
      password: "",
      confirmPassword: "",
    },
    validationSchema: validationSchema,
    onSubmit: async (values) => {
      try {
        const res = await apiClient.put(`/update-password`, {
          username: props.username,
          otp: values.otp,
          password: values.password,
        });

        setAlert({
          open: true,
          message: res.data.message,
          severity: "success",
        });
        if (res.data.message === "Password has been successfully reset") {
          props.setForgotPassword(false);
        }
      } catch (error) {
        if (error?.response && error?.response?.status === 400) {
          setAlert({
            open: true,
            message: error.response.data.message,
            severity: "error",
          });
        } else {
          setAlert({
            open: true,
            message: "An unexpected error occurred. Please try again later.",
            severity: "error",
          });
        }
      }
    },
  });

  return (
    <>
      <form onSubmit={formik.handleSubmit}>
        <span style={{ color: "#0060ae", fontWeight: 800, fontSize: "14px" }}>
          Enter OTP
        </span>
        <br />
        <br />
        <InputOtp
          placeholder="Enter OTP"
          value={formik.values.otp}
          onChange={(e) => formik.setFieldValue("otp", e.value)}
          mask
          integerOnly
          length={6}
        />

        {formik.touched.otp && formik.errors.otp && (
          <small className="p-error">{formik.errors.otp}</small>
        )}
        <br />
        <PasswordStrength
          formik={formik}
          name="password"
          placeholder="Password"
          value={formik.values.password}
          passwordScore={passwordScore}
          setPasswordScore={setPasswordScore}
          strengthLabel={strengthLabel}
          setStrengthLabel={setStrengthLabel}
        />

        {formik.touched.password && formik.errors.password && (
          <small className="p-error">{formik.errors.password}</small>
        )}
        <br />
        <br />
        <PasswordStrength
          formik={formik}
          name="confirmPassword"
          placeholder="confirmPassword"
          value={formik.values.confirmPassword}
          passwordScore={passwordScore}
          setPasswordScore={setPasswordScore}
          strengthLabel={strengthLabel}
          setStrengthLabel={setStrengthLabel}
        />

        {formik.touched.confirmPassword && formik.errors.confirmPassword && (
          <small className="p-error">{formik.errors.confirmPassword}</small>
        )}
        <br />
        <br />
        <CustomButton isSubmitting={formik.isSubmitting} name={"Confirm"} />
      </form>
    </>
  );
}

export default React.memo(ForgotPasswordForm);
