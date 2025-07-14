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
        const { checkCredentials } = await import(
          "../utils/webAuthn/checkCredentials"
        );
        credentialRes = await checkCredentials(values.username);

        // If server returned an error message, stop here
        if (credentialRes?.message) {
          setAlert({
            open: true,
            message: credentialRes.message,
            severity: "error",
          });
          hasServerError = true; // Mark that we have a server error
          return; // Don't proceed or fall back
        }

        // No credentials, but valid user
        if (!credentialRes.hasCredentials) {
          props.setUseWebAuthn(false);
          props.setIsTwoFactorEnabled(credentialRes.isTwoFactorEnabled);
          return;
        }

        const { getLoginOptions } = await import(
          "../utils/webAuthn/getLoginOptions"
        );
        const loginOptions = await getLoginOptions(values.username);

        if (!loginOptions) {
          props.setUseWebAuthn(false);
          return;
        }

        const { formatLoginOptions } = await import(
          "../utils/webAuthn/formatLoginOptions"
        );
        const formattedOptions = formatLoginOptions(loginOptions);

        const { getCredential } = await import(
          "../utils/webAuthn/getCredential"
        );
        const credential = await getCredential(formattedOptions);

        const { serializeCredential } = await import(
          "../utils/webAuthn/serializeCredential"
        );
        const serializedCredential = serializeCredential(credential);

        const { verifyCredential } = await import(
          "../utils/webAuthn/verifyCredential"
        );
        const isVerified = await verifyCredential(
          values.username,
          serializedCredential
        );

        if (isVerified) {
          const { login } = await import("../utils/webAuthn/login");
          await login(
            values,
            serializedCredential,
            setAlert,
            processLogin,
            handleLoginError,
            setIsSubmitting,
            setShowConsentDrawer,
            setPendingLoginData
          );
        } else {
          props.setUseWebAuthn(false);
        }
      } catch (err) {
        console.error(err);

        // Don't fall back to regular login if we have a server error
        if (hasServerError) {
          return;
        }

        if (err.name === "NotAllowedError") {
          console.warn("User canceled the WebAuthn prompt.");
        }

        // Only fall back to regular login for client-side errors or network issues
        // not for server validation errors (404, 403, etc.)
        if (credentialRes && credentialRes.isTwoFactorEnabled !== undefined) {
          props.setIsTwoFactorEnabled(credentialRes.isTwoFactorEnabled);
        } else {
          console.warn("Could not determine 2FA status, setting to false.");
          props.setIsTwoFactorEnabled(false);
        }

        props.setUseWebAuthn(false);
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
