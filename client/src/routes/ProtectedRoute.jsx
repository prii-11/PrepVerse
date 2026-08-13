// Route guard that blocks unauthenticated users from protected screens.
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import { ROUTES } from '../utils/constants';

export default function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  if (auth?.loading) {
    return <div className="p-6 text-sm text-[#6B7280]">Loading access...</div>;
  }

  if (!auth?.isAuthenticated) {
    return <Navigate to={ROUTES.login} replace state={{ from: location }} />;
  }

  return <Outlet />;
}
