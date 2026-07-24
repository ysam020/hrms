// Optimistically reflects a just-registered FCM token in the in-memory user
// object so UserContext.user.fcmTokens stays in sync without waiting for a
// full /profile refetch — used by both the "Enable on this device" button
// (PushNotifications.tsx) and the consent drawer (NotificationConsentDrawer.tsx)
// so granting consent either way updates the same state the same way.
export function upsertFcmTokenInUser(
  prevUser: any,
  token: string,
  deviceFingerprint: string,
  deviceInfo: Record<string, unknown>,
) {
  const existing = Array.isArray(prevUser?.fcmTokens) ? prevUser.fcmTokens : [];
  const idx = existing.findIndex(
    (t: any) => t?.deviceFingerprint === deviceFingerprint,
  );
  const newEntry = {
    token,
    deviceFingerprint,
    deviceInfo,
    lastUsed: new Date(),
    isActive: true,
  };
  const updated =
    idx >= 0
      ? existing.map((t: any, i: number) =>
          i === idx ? { ...t, ...newEntry } : t,
        )
      : [...existing, newEntry];
  return { ...prevUser, fcmTokens: updated };
}
