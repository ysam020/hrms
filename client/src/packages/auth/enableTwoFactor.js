import apiClient from "../../config/axiosConfig";

export async function enableTwoFactor(
  user,
  setIsTwoFactorEnabled,
  setQr,
  setUser
) {
  try {
    const res = await apiClient(`/enable-two-factor`);

    setQr(res.data.qrCodeImage);
    setIsTwoFactorEnabled(true);
    setUser({
      ...user,
      backupCodes: res.data.backupCodes,
      isTwoFactorEnabled: true,
      qrCodeImage: res.data.qrCodeImage,
    });
  } catch (error) {
    console.error(error);
  }
}
