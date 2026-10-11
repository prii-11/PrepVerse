// Route guard that blocks unauthenticated users from protected screens.
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Spinner from '../components/ui/Spinner';
import useAuth from '../hooks/useAuth';
import { ROUTES } from '../utils/constants';

export default function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  if (auth?.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-6 text-sage" />
      </div>
    );
  }

  if (!auth?.isAuthenticated) {
    return <Navigate to={ROUTES.login} replace state={{ from: location }} />;
  }

  return <Outlet />;
}
