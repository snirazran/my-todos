import * as admin from 'firebase-admin';

function getFirebaseApp() {
  if (!admin.apps.length) {
    const {
      NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      FIREBASE_CLIENT_EMAIL,
      FIREBASE_PRIVATE_KEY,
    } = process.env;

    if (
      !NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      !FIREBASE_CLIENT_EMAIL ||
      !FIREBASE_PRIVATE_KEY
    ) {
      throw new Error(
        'Firebase Admin SDK not configured: Missing environment variables',
      );
    }

    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: FIREBASE_CLIENT_EMAIL,
          privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    } catch (error) {
      console.error('Firebase admin initialization error', error);
      throw error;
    }
  }
  return admin.app();
}

export function getAdminAuth() {
  getFirebaseApp();
  return admin.auth();
}
