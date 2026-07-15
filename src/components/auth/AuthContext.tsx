'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { User } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import {
  clearSessionCookie,
  establishSessionCookie,
  sessionCookieNeedsRefresh,
} from '@/lib/authCookie';
import { useFrogodoroStore } from '@/lib/frogodoroStore';

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

  useEffect(() => {
    if (!auth) {
      console.error(
        'Firebase Auth is not initialized. Check your environment variables (NEXT_PUBLIC_FIREBASE_API_KEY).',
      );
      useFrogodoroStore.getState().resetLocalTimer();
      setLoading(false);
      return;
    }

    const ensureSessionCookie = async (user: User) => {
      if (!sessionCookieNeedsRefresh()) return;
      try {
        await establishSessionCookie(user);
      } catch (e) {
        console.error('Error establishing session cookie:', e);
      }
    };

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setUser(user);
      if (user) {
        await ensureSessionCookie(user);
      } else {
        // Logout is local to this device. Hide and erase its persisted timer
        // state without calling stopTimer(), which would clear the shared
        // server timer that another signed-in device may still be using.
        useFrogodoroStore.getState().resetLocalTimer();
        await clearSessionCookie();
      }
      setLoading(false);
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && auth.currentUser) {
        void ensureSessionCookie(auth.currentUser);
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribe();
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

export function AuthContextComponent({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

export { AuthContextComponent as AuthContext };
