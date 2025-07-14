import React, { useContext, useState, useRef, useEffect } from "react";
import { useFormik } from "formik";
import { UserContext } from "../contexts/UserContext";
import { validationSchema } from "../schemas/auth/loginSchema";
import { InputOtp } from "primereact/inputotp";
import { Password } from "primereact/password";
import CustomButton from "../components/customComponents/CustomButton";
import { AlertContext } from "../contexts/AlertContext";
import apiClient from "../config/axiosConfig";
import LocationConsentDrawer from "../components/customComponents/LocationConsentDrawer";
import { getGeolocation } from "../utils/auth/getGeolocation";

function LoginForm(props) {
  const { setUser } = useContext(UserContext);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [showConsentDrawer, setShowConsentDrawer] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingLoginData, setPendingLoginData] = useState(null);
  const passwordRef = useRef(null);
  const { setAlert } = useContext(AlertContext);

  const formik = useFormik({
    initialValues: {
      username: props.username,
      password: "",
      twoFAToken: "",
      backupCode: "",
    },
    validationSchema: validationSchema(props.isTwoFactorEnabled, useBackupCode),
    onSubmit: async (values) => {
      setIsSubmitting(true);
      try {
        // Get geolocation with permission check
        const geoLocation = await getGeolocation(
          setAlert,
          setShowConsentDrawer
        );

        // If we got null, it means we're waiting for the consent drawer response
        if (geoLocation === null) {
          // Store form values to use when location permission is resolved
          setPendingLoginData(values);
          setIsSubmitting(false);
          return;
        }

        // Continue with login
        await processLogin(values, geoLocation);
      } catch (error) {
        handleLoginError(error);
        setIsSubmitting(false);
      }
    },
  });

  // Handle location consent responses
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

  // Process login with given values and location
  const processLogin = async (values, geoLocation) => {
    const loginRes = await apiClient.post(`/login`, {
      username: values.username,
      password: values.password,
      twoFAToken: useBackupCode ? "" : values.twoFAToken,
      backupCode: useBackupCode ? values.backupCode : "",
      userAgent: navigator.userAgent,
      geolocation: geoLocation,
      isTwoFactorEnabled: props.isTwoFactorEnabled,
      useBackupCode: useBackupCode,
    });

    if (loginRes.data.message === "Login successful") {
      setUser(loginRes.data.user);

      // After successful login, check for unusual location
      await apiClient.post("/unusual-login-detection", {
        geolocation: geoLocation,
      });
    } else {
      setAlert({
        open: true,
        message: loginRes.data.message,
        severity: "error",
      });
      formik.setFieldValue("twoFAToken", "");
      formik.setFieldValue("backupCode", "");
    }
  };

  // Handle login errors
  const handleLoginError = (error) => {
    console.error(error.response?.data?.message || error.message);
    setAlert({
      open: true,
      message: error.response?.data?.message || "Login failed",
      severity: "error",
    });
    formik.setFieldValue("twoFAToken", "");
    formik.setFieldValue("backupCode", "");
  };

  useEffect(() => {
    passwordRef.current?.focus();
  }, []);

  return (
    <>
      <form className="login-form" onSubmit={formik.handleSubmit}>
        {!useBackupCode && (
          <>
            <Password
              ref={passwordRef}
              toggleMask
              id="password"
              name="password"
              placeholder="Password"
              value={formik.values.password}
              onChange={formik.handleChange}
              feedback={false}
              className={
                formik.touched.password && formik.errors.password
                  ? "p-invalid"
                  : ""
              }
            />
            {formik.touched.password && formik.errors.password && (
              <small className="p-error">{formik.errors.password}</small>
            )}
          </>
        )}

        {props.isTwoFactorEnabled && (
          <div>
            {!useBackupCode ? (
              <span>Enter Authenticator token</span>
            ) : (
              <span>Enter Backup Code</span>
            )}
            {!useBackupCode && (
              <>
                <InputOtp
                  placeholder="Enter 6-digit code"
                  value={formik.values.twoFAToken}
                  onChange={(e) => formik.setFieldValue("twoFAToken", e.value)}
                  mask
                  integerOnly
                  length={6}
                />
                {formik.touched.twoFAToken && formik.errors.twoFAToken && (
                  <small className="p-error">{formik.errors.twoFAToken}</small>
                )}
              </>
            )}

            {useBackupCode && (
              <>
                <InputOtp
                  placeholder="Enter Backup Code"
                  value={formik.values.backupCode}
                  onChange={(e) => formik.setFieldValue("backupCode", e.value)}
                  mask
                  length={8}
                />
                {formik.touched.backupCode && formik.errors.backupCode && (
                  <small className="p-error">{formik.errors.backupCode}</small>
                )}
              </>
            )}

            <span
              onClick={() => setUseBackupCode(!useBackupCode)}
              style={{
                cursor: "pointer",
                color: "#0060ae",
                fontWeight: "bold",
                marginTop: "16px",
              }}
            >
              {useBackupCode ? "Use Google Authenticator" : "Use Backup Code"}
            </span>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <CustomButton
            isSubmitting={formik.isSubmitting || isSubmitting}
            name={"Login"}
          />
        </div>
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

export default React.memo(LoginForm);
