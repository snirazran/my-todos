'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';

export function AuthContext({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
