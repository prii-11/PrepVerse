// AppShell — the authenticated application frame.
// Single sticky top bar + centered content column (≈1200px). No sidebar.
import { Outlet } from 'react-router-dom';
import TopNav from './TopNav';

export default function AppShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-[1200px] flex-1 px-5 pb-16 pt-8 md:px-8 md:pt-10">
        <Outlet />
      </main>
    </div>
  );
}
