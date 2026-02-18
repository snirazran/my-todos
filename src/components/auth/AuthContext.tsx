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
    if (!auth) {
      console.error(
        'Firebase Auth is not initialized. Check your environment variables (NEXT_PUBLIC_FIREBASE_API_KEY).',
      );
      setLoading(false);
      return;
    }

    const unsubscribe = auth.onIdTokenChanged(async (user) => {
      setUser(user);
      setLoading(false);

      if (user) {
        const token = await user.getIdToken();
        // Set cookie with 1 hour expiration (matches Firebase token lifetime)
        // But onIdTokenChanged will fire again when token refreshes, updating this.
        document.cookie = `token=${token}; path=/; max-age=3600; SameSite=Strict`;
      } else {
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
