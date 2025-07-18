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

  useEffect(() => {
    if (usernameRef.current) {
      usernameRef.current.focus();
    }
  }, []);

  const formik = useFormik({
    initialValues: {
      username: props.username,
    },
    validationSchema,
    onSubmit: async (values) => {
      props.setUsername(values.username);

      let credentialRes;
      let hasServerError = false; // Track if we have a server error

      try {
        setIsSubmitting(true);
        props.setUsername(values.username);

        // Import the new WebAuthn login utility
        const { performWebAuthnLogin } = await import(
          "../utils/webAuthn/webauthnLogin"
        );

        const result = await performWebAuthnLogin(values.username, setAlert);

        if (result.success) {
          // Handle successful login
          console.log("Login successful, user:", result.user);

          // You might want to set user context, redirect, etc.
          // setUser(result.user);
          // navigate('/dashboard');

          // Or proceed with your existing login flow if you need session management
          const { login } = await import("../utils/webAuthn/login");
          await login(
            values,
            result.credential,
            setAlert,
            processLogin, // Your existing function
            handleLoginError, // Your existing function
            setIsSubmitting,
            setShowConsentDrawer,
            setPendingLoginData
          );
        } else {
          // Fall back to regular login or show error
          props.setUseWebAuthn(false);
        }
      } catch (error) {
        console.error("WebAuthn login error:", error);
        setAlert({
          open: true,
          message: "Login failed. Please try again.",
          severity: "error",
        });
        props.setUseWebAuthn(false);
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  const handleLocationAllowed = async (geoLocation) => {
    if (pendingLoginData) {
      setIsSubmitting(true);
      try {
        await processLogin(pendingLoginData, geoLocation);
      } catch (error) {
        handleLoginError(error);
      } finally {
        setPendingLoginData(null);
        setIsSubmitting(false);
      }
    }
  };

  const handleLocationDenied = async (geoLocation) => {
    if (pendingLoginData) {
      setIsSubmitting(true);
      try {
        await processLogin(pendingLoginData, geoLocation);
      } catch (error) {
        handleLoginError(error);
      } finally {
        setPendingLoginData(null);
        setIsSubmitting(false);
      }
    }
  };

  const processLogin = async (values, geolocation, serializedCredential) => {
    const response = await apiClient.post(`/webauthn-login`, {
      username: values.username,
      geolocation,
      userAgent: navigator.userAgent,
      credential: serializedCredential,
    });

    if (response.data.message === "Login successful") {
      setUser(response.data.user);
    } else {
      setAlert({
        open: true,
        message: response.data.message,
        severity: "error",
      });
    }

    await apiClient.post("/unusual-login-detection", { geolocation });
  };

  const handleLoginError = (error) => {
    console.error(error.response?.data?.message || error.message);
    setAlert({
      open: true,
      message: error.response?.data?.message || "Login failed",
      severity: "error",
    });
  };

  return (
    <>
      <form className="login-form" onSubmit={formik.handleSubmit}>
        <InputText
          ref={usernameRef}
          id="username"
          name="username"
          placeholder="Username"
          value={formik.values.username}
          onChange={formik.handleChange}
        />
        {formik.touched.username && formik.errors.username && (
          <small className="p-error">{formik.errors.username}</small>
        )}
        <br />
        <CustomButton
          isSubmitting={formik.isSubmitting || isSubmitting}
          name={"Submit"}
        />
      </form>

      <LocationConsentDrawer
        showConsentDrawer={showConsentDrawer}
        setShowConsentDrawer={setShowConsentDrawer}
        onAllowLocation={handleLocationAllowed}
        onDenyLocation={handleLocationDenied}
      />
    </>
  );
}

export default React.memo(WebAuthnLoginForm);
