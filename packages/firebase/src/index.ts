export { getFirebaseApp, getMessaging } from "./admin";
export {
  sendPushNotifications,
  assertPlatformBroadcastAuthorized,
  PlatformBroadcastNotAuthorizedError,
} from "./sendPushNotifications";
export type {
  PushAudience,
  PlatformBroadcastAuthorization,
} from "./sendPushNotifications";
export { default as admin } from "./admin";
