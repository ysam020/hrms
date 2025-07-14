import { getGeolocation } from "../auth/getGeolocation";

// Step 7: Finalize login and update user state
export async function login(
  values,
  serializedCredential,
  setAlert,
  processLogin,
  handleLoginError,
  setIsSubmitting,
  setShowConsentDrawer,
  setPendingLoginData
) {
  try {
    const geoLocation = await getGeolocation(setAlert, setShowConsentDrawer);

    // If we got null, it means we're waiting for the consent drawer response
    if (geoLocation === null) {
      // Store form values to use when location permission is resolved
      setPendingLoginData(values);
      setIsSubmitting(false);
      return;
    }

    // Continue with login
    await processLogin(values, geoLocation, serializedCredential);
  } catch (error) {
    handleLoginError(error);
    setIsSubmitting(false);
  }
}
