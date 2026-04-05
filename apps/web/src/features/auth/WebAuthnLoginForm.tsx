import { useContext, useRef, useEffect, useState } from "react";
import { InputText } from "primereact/inputtext";
import { UserContext } from "@web/app/providers/UserContext";
import Button from "@web/shared/components/Button";
import { useFormik } from "formik";
import { validationSchema } from "./schemas";
import { AlertContext } from "@web/app/providers/AlertContext";
import LocationConsentDrawer from "@web/shared/components/LocationConsentDrawer";
import apiClient, { setAccessToken } from "@web/core/http/axiosConfig";
import {
  updateFaviconWithDot,
  updateDocumentTitle,
} from "@web/shared/utils/faviconUtils";
import { API_ENDPOINTS } from "@web/shared/constants";

function WebAuthnLoginForm(props) {
  const { setUser } = useContext(UserContext);
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const { setAlert } = useContext(AlertContext);

  const [showConsentDrawer, setShowConsentDrawer] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingWebAuthnData, setPendingWebAuthnData] = useState<{
    username: string;
    options: any;
  } | null>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  // ✅ No isMountedRef

  const updateFaviconAfterLogin = async () => {
    try {
      const res = await apiClient(API_ENDPOINTS.GET_NOTIFICATIONS);
      const notifications = res.data || [];

      updateFaviconWithDot(notifications.length > 0);
      updateDocumentTitle(notifications.length);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      updateFaviconWithDot(false);
      updateDocumentTitle(0);
    }
  };

  const processLogin = (loggedInUser) => {
    setUser(loggedInUser);
    updateFaviconAfterLogin();
  };

  const handleLoginError = (error) => {
    console.error("Login error:", error);
    setAlert({
      open: true,
      message: "Login failed. Please try again.",
      severity: "error",
    });
  };

  const shouldFallbackToPassword = (responseData) => {
    if (responseData.success === false) {
      const message = responseData.message?.toLowerCase() || "";
      return [
        "webauthn credentials not found",
        "no webauthn credentials found",
        "webauthn not configured",
        "no credentials found",
        "credentials not found",
      ].some((msg) => message.includes(msg));
    }
    return false;
  };

  const performWebAuthnLoginWithLocation = async (
    username,
    options,
    geoLocation,
  ) => {
    const { performWebAuthnLogin } = await import("@web/core/webauthn");

    const result = await performWebAuthnLogin(
      username,
      options,
      processLogin,
      handleLoginError,
      setAlert as any,
    );

    // Hydrate in-memory token immediately so subsequent requests don't need
    // to round-trip through the 401 → refresh cycle
    if (result?.success && result?.accessToken) {
      setAccessToken(result.accessToken);
    }
  };

  const handleLocationAllowed = async (geoLocation) => {
    if (!pendingWebAuthnData) return;

    setIsSubmitting(true);
    try {
      await performWebAuthnLoginWithLocation(
        pendingWebAuthnData.username,
        pendingWebAuthnData.options,
        geoLocation,
      );
    } catch (error) {
      handleLoginError(error);
    } finally {
      setPendingWebAuthnData(null);
      setIsSubmitting(false);
    }
  };

  const handleLocationDenied = async () => {
    if (!pendingWebAuthnData) return;

    setIsSubmitting(true);
    try {
      await performWebAuthnLoginWithLocation(
        pendingWebAuthnData.username,
        pendingWebAuthnData.options,
        { latitude: null, longitude: null },
      );
    } catch (error) {
      handleLoginError(error);
    } finally {
      setPendingWebAuthnData(null);
      setIsSubmitting(false);
    }
  };

  const formik = useFormik({
    initialValues: {
      username: props.username,
    },
    validationSchema,
    onSubmit: async (values) => {
      setIsSubmitting(true);
      props.setUsername(values.username);

      try {
        const optionsResponse = await apiClient.post(
          API_ENDPOINTS.WEBAUTHN_LOGIN_OPTIONS,
          { username: values.username },
        );

        if (
          optionsResponse.data.success === true &&
          optionsResponse.data.data
        ) {
          const permissionStatus = await navigator.permissions.query({
            name: "geolocation",
          });

          if (permissionStatus.state === "granted") {
            try {
              const position = await new Promise<GeolocationPosition>(
                (resolve, reject) => {
                  navigator.geolocation.getCurrentPosition(resolve, reject, {
                    timeout: 10000,
                    maximumAge: 60000,
                  });
                },
              );

              await performWebAuthnLoginWithLocation(
                values.username,
                optionsResponse.data.data,
                {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                },
              );
              return;
            } catch {
              await performWebAuthnLoginWithLocation(
                values.username,
                optionsResponse.data.data,
                { latitude: null, longitude: null },
              );
              return;
            }
          }

          if (permissionStatus.state === "denied") {
            setAlert({
              open: true,
              message: "Location blocked. Proceeding without location.",
              severity: "warning",
            });

            await performWebAuthnLoginWithLocation(
              values.username,
              optionsResponse.data.data,
              { latitude: null, longitude: null },
            );
            return;
          }

          // prompt
          setPendingWebAuthnData({
            username: values.username,
            options: optionsResponse.data.data,
          });
          setShowConsentDrawer(true);
          setIsSubmitting(false);
          return;
        }

        if (shouldFallbackToPassword(optionsResponse.data)) {
          setAlert({
            open: true,
            message:
              optionsResponse.data.message || "No biometric credentials found.",
            severity: "error",
          });
          return;
        }

        setAlert({
          open: true,
          message:
            optionsResponse.data.message || "Login failed. Please try again.",
          severity: "error",
        });
      } catch (error) {
        console.error(error);

        const message =
          error?.response?.data?.message || "Login failed. Please try again.";

        setAlert({
          open: true,
          message,
          severity: "error",
        });
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  return (
    <div className="login-form">
      <form onSubmit={formik.handleSubmit}>
        <InputText
          ref={usernameRef}
          name="username"
          value={formik.values.username}
          onChange={formik.handleChange}
          disabled={isSubmitting}
        />

        <Button type="submit" loading={isSubmitting} fullWidth>
          Submit
        </Button>
      </form>

      <LocationConsentDrawer
        showConsentDrawer={showConsentDrawer}
        setShowConsentDrawer={setShowConsentDrawer}
        onAllowLocation={handleLocationAllowed}
        onDenyLocation={handleLocationDenied}
      />
    </div>
  );
}

export default WebAuthnLoginForm;
