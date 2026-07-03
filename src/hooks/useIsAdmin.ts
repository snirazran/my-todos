import useSWR from 'swr';
import { useAuth } from '@/components/auth/AuthContext';
import { bootstrapFetcher as fetcher } from '@/lib/bootstrapFetcher';

export function useIsAdmin() {
  const { user, loading } = useAuth();
  const { data, isLoading } = useSWR<{ isAdmin: boolean; email: string | null }>(
    user ? '/api/admin/me' : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  return {
    isAdmin: !!data?.isAdmin,
    isLoading: loading || (!!user && isLoading),
  };
}
