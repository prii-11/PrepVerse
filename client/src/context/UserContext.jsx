// User context — real profile state backed by the users API. Loads the
// authenticated user's profile on sign-in and exposes update/refresh actions.
// Identity fields (name/email) come from AuthContext; this context owns
// onboarding profile data (targetRole, experienceLevel) only.
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { userService } from '../services/userService';
import useAuth from '../hooks/useAuth';

export const UserContext = createContext(null);

export function UserProvider({ children }) {
  const auth = useAuth();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);

  const refreshProfile = useCallback(async () => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const next = await userService.getProfile();
      setProfile(next);
    } catch (error) {
      setProfileError(error);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (auth.isAuthenticated) {
      refreshProfile();
    } else {
      setProfile(null);
      setProfileError(null);
    }
  }, [auth.isAuthenticated, refreshProfile]);

  const updateProfile = useCallback(async (patch) => {
    const next = await userService.updateProfile(patch);
    setProfile(next);
    return next;
  }, []);

  const value = useMemo(
    () => ({ profile, profileLoading, profileError, refreshProfile, updateProfile }),
    [profile, profileLoading, profileError, refreshProfile, updateProfile],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}