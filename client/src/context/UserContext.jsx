// User context that exposes profile and progress data for the dashboard and reports.
import { createContext, useMemo, useState } from 'react';
import { DEMO_USER } from '../utils/constants';

export const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [profile, setProfile] = useState({
    ...DEMO_USER,
    university: 'National Institute of Technology',
    targetCompany: 'Product based company',
    readiness: 72,
  });

  const updateProfile = (updates) => {
    setProfile((current) => ({ ...current, ...updates }));
  };

  const value = useMemo(
    () => ({
      profile,
      updateProfile,
    }),
    [profile],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
