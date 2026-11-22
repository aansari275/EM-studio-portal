import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Ellipsis, Eraser, LayoutGrid, Link2, LogOut, Menu, Ruler, Send, X } from 'lucide-react';
import { signOutUser, currentUserEmail } from '../lib/auth';
import { TabContext, tabForPath, type TabContextValue, type TabKey } from '../lib/tabContext';
import { Library } from '../pages/Library';

/**
 * The studio shell: a sidebar on the left (a drawer under md) and a tab strip
 * above the content, the same model as ERP Desk. Clicking a sidebar item opens
 * that page as a tab, or focuses it when it is already open. Every opened page
 * stays mounted and is only hidden while another tab is in front, so dropped
 * photos, half-filled dialogs, searches and scroll positions survive switching.
 *
 * The URL follows the active tab, so deep links, refresh and back/forward
 * work. Open tabs live in memory only: after a refresh only Library plus the
 * tab in the URL are open. Library is always open and cannot be closed.
 */
const StudioEntries = lazy(() => import('../pages/StudioEntries').then((m) => ({ default: m.StudioEntries })));
const BackgroundRemoval = lazy(() => import('../pages/BackgroundRemoval').then((m) => ({ default: m.BackgroundRemoval })));
const MyLinks = lazy(() => import('../pages/MyLinks').then((m) => ({ default: m.MyLinks })));
const More = lazy(() => import('../pages/More').then((m) => ({ default: m.More })));

type TabDef = { key: TabKey; path: string; label: string; Icon: typeof LayoutGrid; render: () => ReactNode };

const TABS: TabDef[] = [
  { key: 'library', path: '/', label: 'Library', Icon: LayoutGrid, render: () => <Library /> },
  { key: 'custom-rugs', path: '/custom-rugs', label: 'Custom Rugs', Icon: Ruler,
    render: () => <StudioEntries kind="custom-rug" /> },
  { key: 'sample-dispatch', path: '/sample-dispatch', label: 'Sample Dispatch', Icon: Send,
    render: () => <StudioEntries kind="sample-dispatch" /> },
  { key: 'background-removal', path: '/background-removal', label: 'Background Removal', Icon: Eraser,
    render: () => <BackgroundRemoval /> },
  { key: 'links', path: '/links', label: 'My links', Icon: Link2, render: () => <MyLinks /> },
  { key: 'more', path: '/more', label: 'More', Icon: Ellipsis, render: () => <More /> },
];

const BY_KEY = Object.fromEntries(TABS.map((t) => [t.key, t])) as Record<TabKey, TabDef>;

const SIDEBAR_W = 220;

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeKey = tabForPath(location.pathname) ?? 'library';

  // Open tabs, in strip order. Library first and always present.
  const [open, setOpen] = useState<TabKey[]>(() => (activeKey === 'library' ? ['library'] : ['library', activeKey]));
  // The query string each tab last had, so returning to My links keeps ?new=.
  const searches = useRef<Partial<Record<TabKey, string>>>({});
  useEffect(() => { searches.current[activeKey] = location.search; }, [activeKey, location.search]);

  // A new URL for a tab that is not open (sidebar, deep link, back/forward)
  // opens it. Only on a change of path: right after closing the active tab the
  // old path is still current for a render (navigation runs in a transition),
  // and it must not reopen what was just closed. Adjusting state during render
  // is React's documented way to derive state from a changing value.
  const [seenPath, setSeenPath] = useState(location.pathname);
  if (location.pathname !== seenPath) {
    setSeenPath(location.pathname);
    if (!open.includes(activeKey)) setOpen([...open, activeKey]);
  }

  const hrefFor = useCallback((k: TabKey) => BY_KEY[k].path + (searches.current[k] || ''), []);
  const activate = useCallback((k: TabKey) => {
    if (k !== activeKey) navigate(hrefFor(k));
  }, [activeKey, hrefFor, navigate]);

  // Per tab: a guard message when closing it would lose work.
  const [guards, setGuards] = useState<Partial<Record<TabKey, string | null>>>({});
  const [confirming, setConfirming] = useState<TabKey | null>(null);

  const reallyClose = useCallback((k: TabKey) => {
    const i = open.indexOf(k);
    const next = open.filter((x) => x !== k);
    setOpen(next);
    setGuards((g) => ({ ...g, [k]: null }));
    delete searches.current[k];
    if (k === activeKey) navigate(hrefFor(next[Math.max(0, i - 1)] || 'library'));
  }, [open, activeKey, hrefFor, navigate]);

  const close = useCallback((k: TabKey) => {
    if (k === 'library') return;
    if (guards[k]) setConfirming(k);
    else reallyClose(k);
  }, [guards, reallyClose]);

  // Scroll per tab: hidden panels lose scrollTop, so keep it and put it back.
  const scrolls = useRef<Partial<Record<TabKey, number>>>({});
  const panels = useRef<Partial<Record<TabKey, HTMLDivElement | null>>>({});
  useLayoutEffect(() => {
    const el = panels.current[activeKey];
    if (el) el.scrollTop = scrolls.current[activeKey] || 0;
  }, [activeKey]);

  // Moving focus into the newly shown tab's strip button keeps keyboard users oriented.
  const tabRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({});
  const onStripKey = (e: React.KeyboardEvent) => {
    const i = open.indexOf(activeKey);
    let to: TabKey | undefined;
    if (e.key === 'ArrowRight') to = open[(i + 1) % open.length];
    else if (e.key === 'ArrowLeft') to = open[(i - 1 + open.length) % open.length];
    else if (e.key === 'Home') to = open[0];
    else if (e.key === 'End') to = open[open.length - 1];
    else if (e.key === 'Delete' && activeKey !== 'library') { e.preventDefault(); close(activeKey); return; }
    if (!to) return;
    e.preventDefault();
    activate(to);
    tabRefs.current[to]?.focus();
  };

  const [drawer, setDrawer] = useState(false);

  return (
    <div className="bg-white text-neutral-900">
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-neutral-200 bg-neutral-50/60 md:flex"
        style={{ width: SIDEBAR_W }}
      >
        <SideNav onPick={() => {}} />
      </aside>

      <div className="flex h-[100dvh] min-w-0 flex-col md:pl-[220px]">
        <MobileBar open={drawer} setOpen={setDrawer} />

        <div
          role="tablist"
          aria-label="Open pages"
          onKeyDown={onStripKey}
          className="flex shrink-0 items-end gap-1 overflow-x-auto border-b border-neutral-200 px-3 pt-2 md:px-5 md:pt-3"
        >
          {open.map((k) => {
            const t = BY_KEY[k];
            const on = k === activeKey;
            return (
              <div key={k} role="presentation"
                className={'group flex shrink-0 items-center rounded-t-md border border-b-0 ' +
                  (on ? 'relative -mb-px border-neutral-200 bg-white' : 'border-transparent hover:bg-neutral-50')}>
                <button
                  ref={(el) => { tabRefs.current[k] = el; }}
                  role="tab"
                  id={`tab-${k}`}
                  aria-selected={on}
                  aria-controls={`panel-${k}`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => activate(k)}
                  className={'whitespace-nowrap py-2 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#2F4C69] ' +
                    (k === 'library' ? 'px-3.5 ' : 'pl-3.5 pr-1.5 ') +
                    (on ? 'font-semibold text-neutral-900' : 'text-neutral-500 hover:text-neutral-900')}
                >
                  {t.label}
                </button>
                {k !== 'library' && (
                  <button
                    type="button"
                    tabIndex={on ? 0 : -1}
                    onClick={() => close(k)}
                    aria-label={`Close ${t.label}`}
                    title={`Close ${t.label}`}
                    className="mr-1.5 grid h-6 w-6 place-items-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4C69]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="relative min-h-0 flex-1">
          {open.map((k) => (
            <TabPanel key={k} k={k} active={k === activeKey}
              setGuards={setGuards}
              panelRef={(el) => { panels.current[k] = el; }}
              onScroll={(top) => { scrolls.current[k] = top; }} />
          ))}
        </div>
      </div>

      {drawer && <Drawer onClose={() => setDrawer(false)} />}

      {confirming && (
        <ConfirmClose
          label={BY_KEY[confirming].label}
          message={guards[confirming] || ''}
          onCancel={() => setConfirming(null)}
          onConfirm={() => { const k = confirming; setConfirming(null); reallyClose(k); }}
        />
      )}
    </div>
  );
}

function TabPanel({ k, active, setGuards, panelRef, onScroll }: {
  k: TabKey; active: boolean;
  setGuards: React.Dispatch<React.SetStateAction<Partial<Record<TabKey, string | null>>>>;
  panelRef: (el: HTMLDivElement | null) => void;
  onScroll: (top: number) => void;
}) {
  const setGuard = useCallback((message: string | null) =>
    setGuards((g) => (g[k] === message ? g : { ...g, [k]: message })), [k, setGuards]);
  const ctx = useMemo<TabContextValue>(() => ({ active, setGuard }), [active, setGuard]);
  // render() is stable per key; memo keeps the page from re-rendering on every shell render.
  const page = useMemo(() => BY_KEY[k].render(), [k]);
  return (
    <div
      ref={panelRef}
      role="tabpanel"
      id={`panel-${k}`}
      aria-labelledby={`tab-${k}`}
      hidden={!active}
      onScroll={(e) => onScroll(e.currentTarget.scrollTop)}
      className="absolute inset-0 overflow-y-auto overflow-x-hidden"
    >
      <TabContext.Provider value={ctx}>
        <Suspense fallback={<p className="py-16 text-center text-sm text-neutral-400">Loading…</p>}>
          {page}
        </Suspense>
      </TabContext.Provider>
    </div>
  );
}

function Brand() {
  return (
    <Link to="/" className="font-serif text-[17px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F4C69]">
      Eastern Mills
      <span className="ml-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-neutral-400">Studio</span>
    </Link>
  );
}

const itemCls = ({ isActive }: { isActive: boolean }) =>
  'flex items-center gap-3 rounded-md px-3 py-2 text-[13.5px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4C69] ' +
  (isActive
    ? 'bg-white font-semibold text-neutral-900 shadow-[inset_2px_0_0_#2F4C69] ring-1 ring-neutral-200'
    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900');

function SideNav({ onPick, firstRef }: { onPick: () => void; firstRef?: React.Ref<HTMLAnchorElement> }) {
  const email = currentUserEmail();
  return (
    <>
      <div className="px-5 pb-6 pt-6"><Brand /></div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3">
        <ul className="space-y-0.5">
          {TABS.map((t, i) => (
            <li key={t.key}>
              <NavLink to={t.path} end={t.path === '/'} onClick={onPick} className={itemCls}
                ref={i === 0 ? firstRef : undefined}>
                <t.Icon className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.7} aria-hidden="true" />
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="border-t border-neutral-200 px-3 py-3">
        <button onClick={() => signOutUser()} title={email || undefined}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4C69]">
          <LogOut className="h-4 w-4 shrink-0 opacity-70" strokeWidth={1.7} aria-hidden="true" />
          <span className="min-w-0">
            Sign out
            {email && <span className="block truncate text-[11.5px] text-neutral-400">{email}</span>}
          </span>
        </button>
      </div>
    </>
  );
}

function MobileBar({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-neutral-100 px-4 py-2 md:hidden">
      <Brand />
      <div className="flex-1" />
      <button type="button" id="app-menu-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="app-drawer"
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="-mr-2 grid h-11 w-11 place-items-center rounded text-neutral-600 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2F4C69]">
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
    </div>
  );
}

function Drawer({ onClose }: { onClose: () => void }) {
  const first = useRef<HTMLAnchorElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'Tab' && panel.current) {
        // keep focus inside the drawer while it is open
        const f = panel.current.querySelectorAll<HTMLElement>('a[href], button');
        if (!f.length) return;
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.getElementById('app-menu-button')?.focus();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[45] md:hidden">
      <button type="button" aria-label="Close menu" tabIndex={-1} onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/30" />
      <div ref={panel} id="app-drawer" role="dialog" aria-modal="true" aria-label="Menu"
        className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-white shadow-xl">
        <SideNav onPick={onClose} firstRef={first} />
      </div>
    </div>
  );
}

function ConfirmClose({ label, message, onCancel, onConfirm }: {
  label: string; message: string; onCancel: () => void; onConfirm: () => void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onCancel(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" role="alertdialog"
      aria-modal="true" aria-labelledby="confirm-close-title" aria-describedby="confirm-close-text">
      <div className="w-full max-w-sm rounded-md bg-white p-6 shadow-xl">
        <h2 id="confirm-close-title" className="font-serif text-[19px]">Close {label}?</h2>
        <p id="confirm-close-text" className="mt-2 text-[13.5px] text-neutral-600">{message}</p>
        <div className="mt-5 flex justify-end gap-3">
          <button ref={cancel} onClick={onCancel}
            className="rounded-sm border border-neutral-300 px-3 py-1.5 text-[13px] hover:bg-neutral-50">Keep it open</button>
          <button onClick={onConfirm}
            className="rounded-sm bg-red-700 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-red-800">Close tab</button>
        </div>
      </div>
    </div>
  );
}
