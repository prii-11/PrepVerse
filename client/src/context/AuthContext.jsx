// Authentication context — runtime authentication state for the app.
// The access token is held in memory (module state on the api client) and is
// NEVER persisted to localStorage: the backend contract is a short-lived
// stateless JWT kept client-side for the session only (docs/06 §5.4). On a
// 401 from any API call the auth state is cleared automatically.
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { authService } from '../services/authService';
import { registerUnauthorizedHandler, setAccessToken } from '../services/api';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const clearAuthState = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    registerUnauthorizedHandler(clearAuthState);
  }, [clearAuthState]);

  const login = useCallback(async (credentials) => {
    const { token, user: nextUser } = await authService.login(credentials);
    setAccessToken(token);
    setUser(nextUser);
    return nextUser;
  }, []);

  const signup = useCallback(async (payload) => {
    const { token, user: nextUser } = await authService.register(payload);
    setAccessToken(token);
    setUser(nextUser);
    return nextUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      clearAuthState();
    }
  }, [clearAuthState]);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      login,
      signup,
      logout,
    }),
    [user, loading, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}