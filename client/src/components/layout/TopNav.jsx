// TopNav — the single top navigation bar (64px, sticky).
// Three zones: brand left · primary tabs center · avatar right.
// Tabs read as application tabs, not buttons: text-first, active underline.
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import Brand from './Brand';
import UserMenu from './UserMenu';
import { NAV_TABS } from '../../utils/constants';
import { cn } from '../../utils/helpers';
import useAuth from '../../hooks/useAuth';

function TabLink({ label, to }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'relative flex h-16 items-center px-3.5 text-sm transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sage',
          isActive ? 'font-medium text-brand-deep' : 'text-muted hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {label}
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand transition-opacity duration-150',
              isActive ? 'opacity-100' : 'opacity-0',
            )}
          />
        </>
      )}
    </NavLink>
  );
}

export default function TopNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const auth = useAuth();
  const name = [auth.user?.firstName, auth.user?.lastName].filter(Boolean).join(' ');

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/85 backdrop-blur-md">
      <div className="relative mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between gap-4 px-5 md:px-8">
        {/* LEFT — brand */}
        <Brand />

        {/* CENTER — primary tab bar */}
        <nav
          className="absolute left-1/2 hidden -translate-x-1/2 items-center md:flex"
          aria-label="Primary"
        >
          {NAV_TABS.map((tab) => (
            <TabLink key={tab.to} {...tab} />
          ))}
        </nav>

        {/* RIGHT — user */}
        <div className="flex items-center gap-2">
          <div className="hidden md:block">
            <UserMenu />
          </div>
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
            className="flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink md:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="size-5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {/* MOBILE — collapsed navigation */}
      {menuOpen ? (
        <nav
          className="border-t border-line bg-paper px-5 pb-4 pt-2 md:hidden"
          aria-label="Primary mobile"
        >
          {NAV_TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                cn(
                  'block rounded-xl px-3 py-2.5 text-[15px]',
                  isActive
                    ? 'bg-sage-soft font-medium text-brand-deep'
                    : 'text-muted hover:bg-canvas hover:text-ink',
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
          <div className="mt-2 flex items-center justify-between border-t border-line pt-3">
            <span className="truncate text-sm text-muted">{auth.user?.email}</span>
            <button
              type="button"
              onClick={async () => {
                setMenuOpen(false);
                await auth.logout();
              }}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger-soft"
            >
              Logout
            </button>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
