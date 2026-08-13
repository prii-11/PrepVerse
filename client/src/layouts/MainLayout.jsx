// Primary application layout used for authenticated routes.
import { Outlet } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import Sidebar from '../components/common/Sidebar';
import Footer from '../components/common/Footer';

export default function MainLayout() {
  return (
    <div className="min-h-screen bg-[#F8F9F5] text-[#1F2937]">
      <Navbar />
      <div className="mx-auto flex w-full max-w-7xl gap-4 px-4 py-4 lg:px-6">
        <Sidebar />
        <main className="flex-1 rounded-3xl border border-[#E5E7EB] bg-white p-4 shadow-[0_24px_80px_rgba(85,107,47,0.08)] xl:p-6">
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  );
}
