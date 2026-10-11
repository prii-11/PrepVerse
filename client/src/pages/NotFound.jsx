// NotFound — quiet dead end with a way back into the product.
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import { ROUTES } from '../utils/constants';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-brand">404</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
        The page you are looking for does not exist or has moved.
      </p>
      <div className="mt-6">
        <Button onClick={() => navigate(ROUTES.home)}>Back to Home</Button>
      </div>
    </div>
  );
}
