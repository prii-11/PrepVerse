// Authentication context with placeholder state and actions for routing protection.
import { createContext, useEffect, useMemo, useState } from 'react';
import { DEMO_USER } from '../utils/constants';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('auth_user');

    if (storedToken && storedUser) {
      setUser(JSON.parse(storedUser));
    }

    setLoading(false);
  }, []);

  const login = async (payload) => {
    const nextUser = payload?.user || DEMO_USER;
    localStorage.setItem('auth_token', payload?.token || 'demo-token');
    localStorage.setItem('auth_user', JSON.stringify(nextUser));
    setUser(nextUser);
    return nextUser;
  };

  const signup = async (payload) => login(payload);

  const logout = async () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      login,
      signup,
      logout,
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
