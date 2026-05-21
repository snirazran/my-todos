'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useAuth } from '@/components/auth/AuthContext';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();

  useEffect(() => {
    if (authLoading || adminLoading) return;
    if (!user || !isAdmin) {
      router.replace('/');
    }
  }, [authLoading, adminLoading, user, isAdmin, router]);

  if (authLoading || adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background text-center px-6">
        <div className="p-3 rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-black tracking-tight">Admins only</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          You don't have permission to view this page. Redirecting you home…
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
