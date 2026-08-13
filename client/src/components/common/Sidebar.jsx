// Sidebar navigation for the authenticated application experience.
import { NavLink } from 'react-router-dom';
import { ROUTES } from '../../utils/constants';
import { cn } from '../../utils/helpers';

const links = [
  { to: ROUTES.dashboard, label: 'Dashboard' },
  { to: ROUTES.resumeUpload, label: 'Resume Upload' },
  { to: ROUTES.resumeAnalysis, label: 'Resume Analysis' },
  { to: ROUTES.interviewSetup, label: 'Interview Setup' },
  { to: ROUTES.interviewScreen, label: 'Interview Screen' },
  { to: ROUTES.interviewReport, label: 'Interview Report' },
  { to: ROUTES.practicePlan, label: 'Practice Plan' },
  { to: ROUTES.progress, label: 'Progress' },
];

export default function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 rounded-3xl border border-[#E5E7EB] bg-white p-4 shadow-[0_20px_50px_rgba(85,107,47,0.06)] lg:block">
      <nav className="space-y-2">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              cn(
                'block rounded-2xl px-4 py-3 text-sm transition-all duration-300',
                isActive ? 'bg-[#F8F9F5] text-[#556B2F] shadow-inner' : 'text-[#6B7280] hover:bg-[#F8F9F5] hover:text-[#556B2F]',
              )
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
