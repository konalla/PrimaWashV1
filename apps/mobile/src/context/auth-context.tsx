import type { AuthSession, RequestAuthCodeResponse } from '@prima-wash/contracts';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { primaApi, setApiAccessToken } from '@/lib/api';
import { clearStoredSession, readStoredSession, writeStoredSession } from '@/lib/session-storage';

interface AuthContextValue {
  readonly loading: boolean;
  readonly session?: AuthSession;
  requestCode(identifier: string): Promise<RequestAuthCodeResponse>;
  verifyCode(challengeId: string, code: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthSession>();

  useEffect(() => {
    void restoreSession();

    async function restoreSession() {
      try {
        const stored = await readStoredSession();

        if (!stored) {
          return;
        }

        const parsed = JSON.parse(stored) as AuthSession;
        setApiAccessToken(parsed.accessToken);
        const verified = parsed.refreshToken
          ? await primaApi.refreshSession({ refreshToken: parsed.refreshToken })
          : await primaApi.session();
        const restored = {
          ...verified,
          refreshToken: verified.refreshToken ?? parsed.refreshToken,
          refreshExpiresAt: verified.refreshExpiresAt ?? parsed.refreshExpiresAt,
        };
        setApiAccessToken(restored.accessToken);
        setSession(restored);
        await writeStoredSession(JSON.stringify(restored));
      } catch {
        setApiAccessToken(undefined);
        await clearStoredSession();
      } finally {
        setLoading(false);
      }
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      session,
      requestCode: (identifier) => primaApi.requestAuthCode(identifier),
      verifyCode: async (challengeId, code) => {
        const verified = await primaApi.verifyAuthCode(challengeId, code);
        setApiAccessToken(verified.accessToken);
        setSession(verified);
        await writeStoredSession(JSON.stringify(verified));
      },
      logout: async () => {
        try {
          await primaApi.logout();
        } finally {
          setApiAccessToken(undefined);
          setSession(undefined);
          await clearStoredSession();
        }
      },
    }),
    [loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
