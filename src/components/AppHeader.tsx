import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { signOutUser, currentUserEmail } from '../lib/auth';

/**
 * The studio header, shared by the library and the pages beside it. NavLink
 * marks the page in use with aria-current="page". Below the md breakpoint the
 * links fold into a menu button.
 */
const LINKS = [
  { to: '/', label: 'Library', end: true },
  { to: '/custom-rugs', label: 'Custom Rugs' },
  { to: '/sample-dispatch', label: 'Sample Dispatch' },
  { to: '/background-removal', label: 'Background Removal' },
  { to: '/links', label: 'My links' },
  { to: '/more', label: 'More' },
];

const linkCls = ({ isActive }: { isActive: boolean }) =>
  'border-b-[1.5px] pb-0.5 text-[13px] transition-colors ' +
  (isActive ? 'border-[#2F4C69] font-semibold text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-900');

export function AppHeader({ width = 1400 }: { width?: number }) {
  const email = currentUserEmail();
  const [open, setOpen] = useState(false);

  return (
    <header className="mx-auto w-full px-7 pt-6" style={{ maxWidth: width }}>
      <div className="flex items-center gap-5">
        <Link to="/" className="font-serif text-[17px]">
          Eastern Mills
          <span className="ml-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
            Studio
          </span>
        </Link>
        <div className="flex-1" />
        <nav aria-label="Main" className="hidden items-center gap-5 md:flex">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={linkCls}>{l.label}</NavLink>
          ))}
          <button onClick={() => signOutUser()} title={email || undefined}
            className="text-[13px] text-neutral-400 hover:text-neutral-900">
            Sign out
          </button>
        </nav>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="app-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="-mr-2 grid h-11 w-11 place-items-center rounded text-neutral-600 hover:bg-neutral-100 md:hidden">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <nav id="app-menu" aria-label="Main" className="mt-3 border-y border-neutral-100 md:hidden">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} onClick={() => setOpen(false)}
              className={({ isActive }) =>
                'block py-3 text-[15px] ' + (isActive ? 'font-semibold text-neutral-900' : 'text-neutral-600')}>
              {l.label}
            </NavLink>
          ))}
          <button onClick={() => signOutUser()} className="block w-full py-3 text-left text-[15px] text-neutral-400">
            Sign out{email ? ` (${email})` : ''}
          </button>
        </nav>
      )}
    </header>
  );
}
