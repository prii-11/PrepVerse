// Authentication layout that centers login and signup screens.
import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F9F5] px-4 py-12 text-[#1F2937]">
      <div className="w-full max-w-[500px] rounded-2xl border border-[#E5E7EB] bg-white p-8 shadow-[0_24px_80px_rgba(85,107,47,0.1)] md:p-10">
        <Outlet />
      </div>
    </div>
  );
}
