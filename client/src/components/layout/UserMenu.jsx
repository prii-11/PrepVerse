// UserMenu — avatar dropdown (Profile / Logout). Only real destinations.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Avatar from '../ui/Avatar';
import { ROUTES } from '../../utils/constants';
import useAuth from '../../hooks/useAuth';

export default function UserMenu() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);
    await auth.logout();
    navigate(ROUTES.login, { replace: true });
  };

  const name = [auth.user?.firstName, auth.user?.lastName].filter(Boolean).join(' ') || 'You';
  const email = auth.user?.email || '';

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center rounded-full transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2"
      >
        <Avatar name={name} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+10px)] z-50 w-56 origin-top-right animate-fade rounded-2xl border border-line bg-paper p-1.5 shadow-pop"
        >
          <div className="border-b border-line px-3 pb-2.5 pt-2">
            <p className="truncate text-sm font-medium text-ink">{name}</p>
            <p className="mt-0.5 truncate text-xs text-muted">{email}</p>
          </div>
          <Link
            to={ROUTES.profile}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="mt-1 block rounded-xl px-3 py-2 text-sm text-ink transition-colors hover:bg-canvas"
          >
            Profile
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="block w-full rounded-xl px-3 py-2 text-left text-sm text-muted transition-colors hover:bg-canvas hover:text-danger"
          >
            Logout
          </button>
        </div>
      ) : null}
    </div>
  );
}
