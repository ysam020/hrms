import admin from "firebase-admin";

/**
 * Returns the default Firebase app, initializing it on first call.
 * Safe to call from multiple modules — init only runs once.
 */
export function getFirebaseApp(): admin.app.App {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      } as admin.ServiceAccount),
    });
  }
  return admin.app();
}

export function getMessaging(): admin.messaging.Messaging {
  return getFirebaseApp().messaging();
}

export default admin;
