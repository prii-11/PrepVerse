// Top navigation bar for authenticated screens and mobile friendliness.
import { Link } from 'react-router-dom';
import { APP_NAME, ROUTES } from '../../utils/constants';
import Button from './Button';

export default function Navbar() {
  return (
    <header className="border-b border-[#E5E7EB] bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 lg:px-6">
        <Link to={ROUTES.dashboard} className="text-lg font-semibold tracking-tight text-[#556B2F]">
          {APP_NAME}
        </Link>
        <div className="flex items-center gap-3">
          <Link to={ROUTES.profile} className="hidden text-sm text-[#6B7280] hover:text-[#556B2F] sm:inline">
            Profile
          </Link>
          <Button variant="secondary">New Interview</Button>
        </div>
      </div>
    </header>
  );
}
