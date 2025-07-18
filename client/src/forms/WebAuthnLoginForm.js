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

  // Helper functions (you can define these locally or import them)
  const processLogin = (userData) => {
    // Your existing login success logic
    console.log("Processing login for user:", userData.user);
    setUser(userData.user);
    // Any redirect logic, etc.
  };

  const handleLoginError = (error) => {
    // Your existing error handling logic
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

        console.log("🚀 Starting WebAuthn login process...");

        // ✅ Use the complete WebAuthn login function
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
          console.log("✅ WebAuthn login completed successfully!");
          console.log("User data:", result.user);

          // ✅ Login is already complete! No need to call anything else
          // The session is already created, user is logged in

          // Just update your local state if needed
          if (result.data && result.data.user) {
            setUser(result.data.user);
          }

          // You might want to redirect or update UI here
          // For example: navigate('/dashboard');
        } else {
          // Fall back to regular login if WebAuthn failed
          console.log(
            "❌ WebAuthn login failed, falling back to regular login"
          );
          props.setUseWebAuthn(false);
        }
      } catch (error) {
        console.error("❌ WebAuthn login error:", error);
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
          label="Login with WebAuthn"
          loading={isSubmitting}
          disabled={isSubmitting}
          className="w-full"
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
