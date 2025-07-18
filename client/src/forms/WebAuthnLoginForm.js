import React, { useContext, useRef, useEffect, useState } from "react";
import { InputText } from "primereact/inputtext";
import { UserContext } from "../contexts/UserContext";
import CustomButton from "../components/customComponents/CustomButton";
import { useFormik } from "formik";
import { validationSchema } from "../schemas/auth/webAuthnLoginSchema";
import { AlertContext } from "../contexts/AlertContext";
import LocationConsentDrawer from "../components/customComponents/LocationConsentDrawer";
import apiClient from "../config/axiosConfig";

function WebAuthnLoginForm(props) {
  const { setUser } = useContext(UserContext);
  const usernameRef = useRef(null);
  const { setAlert } = useContext(AlertContext);
  const [showConsentDrawer, setShowConsentDrawer] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingLoginData, setPendingLoginData] = useState(null);

  // Add isMounted ref to track component mount status
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (usernameRef.current) {
      usernameRef.current.focus();
    }
  }, []);

  // Cleanup effect to prevent state updates after unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const processLogin = (userData) => {
    if (isMountedRef.current) {
      setUser(userData.user);
    }
  };

  const handleLoginError = (error) => {
    console.error("Login error:", error);
    if (isMountedRef.current) {
      setAlert({
        open: true,
        message: "Login failed. Please try again.",
        severity: "error",
      });
    }
  };

  const formik = useFormik({
    initialValues: {
      username: props.username,
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        if (isMountedRef.current) {
          setIsSubmitting(true);
          props.setUsername(values.username);
        }

        // First, check if user exists and get their status
        const optionsResponse = await apiClient.post(
          "/webauthn-login-options",
          {
            username: values.username,
          }
        );

        // Only proceed if component is still mounted
        if (!isMountedRef.current) return;

        // Handle different error scenarios
        if (optionsResponse.data.error) {
          const { message, fallbackToPassword } = optionsResponse.data;

          // If fallbackToPassword is true, it means no WebAuthn credentials - fall back to password login
          if (fallbackToPassword) {
            if (isMountedRef.current) {
              props.setIsTwoFactorEnabled(
                optionsResponse.data.isTwoFactorEnabled
              );
              props.setUseWebAuthn(false);
            }
            return;
          }

          // For other errors (user not found, employee status issues), show error and don't fallback
          if (isMountedRef.current) {
            setAlert({
              open: true,
              message: message,
              severity: "error",
            });
          }
          return;
        }

        // If we get here, user exists and has WebAuthn credentials, proceed with WebAuthn login
        const { performWebAuthnLogin } = await import("@hrms/webauthn");

        const result = await performWebAuthnLogin(
          values.username,
          setAlert,
          processLogin,
          handleLoginError
        );

        // Only update state if component is still mounted
        if (isMountedRef.current) {
          if (result.success) {
            if (result.data && result.data.user) {
              setUser(result.data.user);
            }
          } else {
            // WebAuthn authentication failed, but don't fallback to password
            // The error is already shown by performWebAuthnLogin
          }
        }
      } catch (error) {
        console.error("WebAuthn login error:", error);

        // Only update state if component is still mounted
        if (!isMountedRef.current) return;

        // Check if it's a network error or server error
        if (error.response) {
          const { data } = error.response;

          // If fallbackToPassword is true, fall back to password login
          if (data.fallbackToPassword) {
            if (isMountedRef.current) {
              props.setIsTwoFactorEnabled(data.isTwoFactorEnabled);
              props.setUseWebAuthn(false);
            }
            return;
          }

          // For other errors, show the error message
          if (isMountedRef.current) {
            setAlert({
              open: true,
              message: data.message || "Login failed. Please try again.",
              severity: "error",
            });
          }
        } else {
          // Network or other errors
          if (isMountedRef.current) {
            setAlert({
              open: true,
              message: "Login failed. Please try again.",
              severity: "error",
            });
          }
        }
      } finally {
        if (isMountedRef.current) {
          setIsSubmitting(false);
        }
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
