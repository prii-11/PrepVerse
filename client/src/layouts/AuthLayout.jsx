// AuthLayout — centered card wrapper for login and signup.
import { Outlet } from 'react-router-dom';
import { BrandMark } from '../components/layout/Brand';

export default function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-[480px] animate-rise rounded-2xl border border-line bg-paper p-8 shadow-card md:p-10">
        <div className="mb-8 flex items-center gap-2.5">
          <BrandMark />
          <span className="text-[17px] font-semibold tracking-tight text-ink">PrepVerse</span>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
