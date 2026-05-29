import { cookies } from 'next/headers';
import { getAdminAuth } from '@/lib/firebaseAdmin';

export async function requireAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  if (!token) {
    throw new Error('Unauthenticated - No token cookie found');
  }

  try {
    const decodedToken = await getAdminAuth().verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying Firebase token:', error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Unknown token verification error';
    throw new Error(`Unauthenticated - Invalid token - ${message}`);
  }
}

export async function requireUserId() {
  const decoded = await requireAuth();
  return decoded.uid;
}
