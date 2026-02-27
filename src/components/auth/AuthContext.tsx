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

    const syncToken = async (user: User | null) => {
      if (user) {
        try {
          // getIdToken(false) returns cached token if not expired, 
          // but we want to ensure it's not JUST about to expire.
          // getIdToken(true) forces a refresh, but it's expensive.
          // Standard getIdToken() is fine as it refreshes if needed.
          const token = await user.getIdToken();
          // We use a 7-day max-age for the cookie itself so it doesn't disappear 
          // between sessions, but the server will still reject the token if it's expired.
          // The proactive refresh in the client will keep the token fresh.
          document.cookie = `token=${token}; path=/; max-age=604800; SameSite=Lax; Secure`;
        } catch (e) {
          console.error('Error syncing token to cookie:', e);
        }
      } else {
        document.cookie = `token=; path=/; max-age=0; SameSite=Lax; Secure`;
      }
    };

    const unsubscribe = auth.onIdTokenChanged(async (user) => {
      setUser(user);
      setLoading(false);
      await syncToken(user);
    });

    // Proactive refresh: check token every 10 minutes and on visibility change
    const intervalId = setInterval(async () => {
      if (auth.currentUser) {
        await syncToken(auth.currentUser);
      }
    }, 10 * 60 * 1000);

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && auth.currentUser) {
        // Force a refresh check when the user returns to the tab
        await syncToken(auth.currentUser);
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribe();
      clearInterval(intervalId);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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
