import * as admin from 'firebase-admin';

function normalizePrivateKey(privateKey: string) {
  let normalized = privateKey.trim();

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1);
  }

  return normalized.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
}

function getServiceAccountCredential() {
  const {
    FIREBASE_SERVICE_ACCOUNT_JSON_BASE64,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY,
  } = process.env;

  if (FIREBASE_SERVICE_ACCOUNT_JSON_BASE64) {
    const serviceAccount = JSON.parse(
      Buffer.from(FIREBASE_SERVICE_ACCOUNT_JSON_BASE64, 'base64').toString(
        'utf8',
      ),
    ) as admin.ServiceAccount;

    return admin.credential.cert(serviceAccount);
  }

  if (
    !NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    !FIREBASE_CLIENT_EMAIL ||
    !FIREBASE_PRIVATE_KEY
  ) {
    throw new Error(
      'Firebase Admin SDK not configured: Missing environment variables',
    );
  }

  return admin.credential.cert({
    projectId: NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: normalizePrivateKey(FIREBASE_PRIVATE_KEY),
  });
}

function getFirebaseApp() {
  if (!admin.apps.length) {
    const { NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET } = process.env;

    try {
      admin.initializeApp({
        credential: getServiceAccountCredential(),
        storageBucket: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
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

export function getAdminMessaging() {
  getFirebaseApp();
  return admin.messaging();
}

export function getAdminStorage() {
  getFirebaseApp();
  return admin.storage().bucket();
}
