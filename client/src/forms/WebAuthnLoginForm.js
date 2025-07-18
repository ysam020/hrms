import React, { useContext, useRef, useEffect, useState } from "react";
import { InputText } from "primereact/inputtext";
import { UserContext } from "../contexts/UserContext";
import CustomButton from "../components/customComponents/CustomButton";
import { useFormik } from "formik";
import { validationSchema } from "../schemas/auth/webAuthnLoginSchema";
import { AlertContext } from "../contexts/AlertContext";
import LocationConsentDrawer from "../components/customComponents/LocationConsentDrawer";

function WebAuthnLoginForm(props) {
  const { setUser } = useContext(UserContext);
  const usernameRef = useRef(null);
  const { setAlert } = useContext(AlertContext);
  const [showConsentDrawer, setShowConsentDrawer] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingLoginData, setPendingLoginData] = useState(null);

  useEffect(() => {
    if (usernameRef.current) {
      usernameRef.current.focus();
    }
  }, []);

  const processLogin = (userData) => {
    setUser(userData.user);
  };

  const handleLoginError = (error) => {
    console.error("Login error:", error);
    setAlert({
      open: true,
      message: "Login failed. Please try again.",
      severity: "error",
    });
  };

  const formik = useFormik({
    initialValues: {
      username: props.username,
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        setIsSubmitting(true);
        props.setUsername(values.username);

        const { performWebAuthnLogin } = await import(
          "../utils/webAuthn/webauthnLogin"
        );

        const result = await performWebAuthnLogin(
          values.username,
          setAlert,
          processLogin, // Pass the success handler
          handleLoginError // Pass the error handler
        );

        if (result.success) {
          if (result.data && result.data.user) {
            setUser(result.data.user);
          }
        } else {
          props.setUseWebAuthn(false);
        }
      } catch (error) {
        setAlert({
          open: true,
          message: "Login failed. Please try again.",
          severity: "error",
        });
        // Fall back to regular login
        props.setUseWebAuthn(false);
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <div className="login-form">
      <form onSubmit={formik.handleSubmit}>
        <div className="form-group">
          <InputText
            ref={usernameRef}
            id="username"
            name="username"
            placeholder="Username"
            value={formik.values.username}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
            className={
              formik.touched.username && formik.errors.username
                ? "p-invalid"
                : ""
            }
            disabled={isSubmitting}
          />
          {formik.touched.username && formik.errors.username && (
            <small className="p-error">{formik.errors.username}</small>
          )}
        </div>

        <CustomButton
          type="submit"
          name="Submit"
          loading={isSubmitting}
          disabled={isSubmitting}
        />
      </form>

      {showConsentDrawer && (
        <LocationConsentDrawer
          visible={showConsentDrawer}
          onHide={() => setShowConsentDrawer(false)}
          pendingLoginData={pendingLoginData}
          setPendingLoginData={setPendingLoginData}
        />
      )}
    </div>
  );
}

export default WebAuthnLoginForm;
