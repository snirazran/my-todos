'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setLoading(false);

      if (user) {
        // Refresh token cookie on auth state change (e.g. initial load or token refresh)
        const token = await user.getIdToken();
        document.cookie = `token=${token}; path=/; max-age=3600; SameSite=Strict`;
      } else {
        // Clear cookie on logout
        document.cookie = `token=; path=/; max-age=0; SameSite=Strict`;
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

// Rename export to match existing usage in layout.tsx if necessary,
// but layout.tsx imports { AuthContext } as a named export.
// Wait, layout.tsx imports `import { AuthContext } from '@/components/auth/AuthContext';`
// and uses it as `<AuthContext>...</AuthContext>`.
// So I should export the component as AuthContext.

export function AuthContextComponent({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

// Re-export as AuthContext to minimize refactoring in layout.tsx
export { AuthContextComponent as AuthContext };
