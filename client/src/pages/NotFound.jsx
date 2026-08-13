// 404 page shown when no route matches the current URL.
import { Link } from 'react-router-dom';
import Button from '../components/common/Button';
import { ROUTES } from '../utils/constants';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center text-[#1F2937]">
      <div className="max-w-md rounded-3xl border border-[#E5E7EB] bg-white p-8 shadow-[0_24px_80px_rgba(85,107,47,0.08)]">
        <p className="text-sm uppercase tracking-[0.3em] text-[#6B8E23]">404</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#1F2937]">Page not found</h1>
        <p className="mt-3 text-sm text-[#6B7280]">The route you requested does not exist in this starter frontend.</p>
        <div className="mt-6">
          <Link to={ROUTES.dashboard}><Button>Back to Dashboard</Button></Link>
        </div>
      </div>
    </div>
  );
}
