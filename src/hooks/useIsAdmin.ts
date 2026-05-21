import useSWR from 'swr';
import { useAuth } from '@/components/auth/AuthContext';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

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
