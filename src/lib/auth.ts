import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';

export async function requireUserId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Unauthenticated');
  return session.user.id;
}
