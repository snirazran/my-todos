import { requireAuth } from '@/lib/auth';

function loadAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email?: string | null) {
  if (!email) return false;
  return loadAdminEmails().has(email.toLowerCase());
}

export async function requireAdmin() {
  const decoded = await requireAuth();
  if (!isAdminEmail(decoded.email)) {
    throw new Error('Forbidden - Not an admin');
  }
  return decoded;
}

export async function requireAdminUserId() {
  const decoded = await requireAdmin();
  return decoded.uid;
}
