import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;

try {
  if (
    typeof window !== 'undefined' ||
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  ) {
    if (firebaseConfig.apiKey) {
      app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
      authInstance = getAuth(app);
    } else {
      console.error(
        'Firebase not initialized: Missing NEXT_PUBLIC_FIREBASE_API_KEY. Check your .env.local or Vercel Environment Variables.',
      );
    }
  }
} catch (error) {
  console.error('Firebase initialization failed:', error);
}

// Cast to Auth to satisfy strict null checks consumers.
// If it's undefined at runtime, it will crash on property access, which is expected.
export const auth = authInstance as Auth;
