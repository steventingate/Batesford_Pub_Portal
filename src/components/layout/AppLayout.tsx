import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Button } from '../ui/Button';

type NavItem = {
  path: string;
  label: string;
  icon: JSX.Element;
};

function Icon({ path }: { path: string }) {
  return (
    <svg className="nav-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}

const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: <Icon path="M4 13h7V4H4zm9 7h7v-9h-7zm0-11h7V4h-7zM4 20h7v-5H4z" /> },
  { path: '/guests', label: 'Guests', icon: <Icon path="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m18 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" /> },
  { path: '/segments', label: 'Segments', icon: <Icon path="M3 7h8v8H3zm10 0h8v5h-8zm0 7h8v3h-8zM3 17h8v4H3z" /> },
  { path: '/campaigns', label: 'Campaigns', icon: <Icon path="m4 7 8-4 8 4-8 4-8-4Zm0 5 8 4 8-4M4 17l8 4 8-4" /> },
  { path: '/vouchers', label: 'Vouchers', icon: <Icon path="M4 12h16M6 7h12v10H6zM9 7v10m6-10v10" /> },
  { path: '/events', label: 'Events', icon: <Icon path="M8 2v4m8-4v4M4 10h16M6 6h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" /> },
  { path: '/insights', label: 'Insights', icon: <Icon path="M4 19h16M7 16V9m5 7V5m5 11v-6" /> },
  { path: '/automations', label: 'Automations', icon: <Icon path="M12 2v5m0 10v5M4.93 4.93l3.54 3.54m7.06 7.06 3.54 3.54M2 12h5m10 0h5M4.93 19.07l3.54-3.54m7.06-7.06 3.54-3.54" /> },
  { path: '/reports', label: 'Reports', icon: <Icon path="M6 3h9l5 5v13H6zM14 3v6h6M9 13h6M9 17h6" /> },
  { path: '/traces', label: 'Traces', icon: <Icon path="M4 6h16M4 12h10M4 18h7" /> },
  { path: '/engagement', label: 'Engagement', icon: <Icon path="M6 12a6 6 0 0 1 12 0c0 6-6 9-6 9s-6-3-6-9Z" /> },
  { path: '/settings', label: 'Settings', icon: <Icon path="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8 4 .9 1.6-1.8 3.1-1.8-.3a7.9 7.9 0 0 1-1.4.8l-.5 1.8h-3.6l-.5-1.8a7.9 7.9 0 0 1-1.4-.8l-1.8.3L3.1 13.6 4 12l-.9-1.6 1.8-3.1 1.8.3a7.9 7.9 0 0 1 1.4-.8l.5-1.8h3.6l.5 1.8a7.9 7.9 0 0 1 1.4.8l1.8-.3 1.8 3.1Z" /> }
];

export function AppLayout() {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const activeLabel = useMemo(() => {
    const current = navItems.find((item) => item.path !== '/' ? location.pathname.startsWith(item.path) : location.pathname === '/');
    return current?.label ?? 'Dashboard';
  }, [location.pathname]);

  const closeNav = () => setMobileOpen(false);

  return (
    <div className="app-shell">
      {mobileOpen ? <button className="sidebar-backdrop" aria-label="Close navigation" onClick={closeNav} /> : null}
      <aside className={`sidebar${mobileOpen ? ' is-open' : ''}`}>
        <div className="rounded-[28px] border border-white/10 bg-white/[0.03] px-4 py-4 shadow-glow">
          <div className="muted-kicker mb-2">Venue Intelligence</div>
          <h1>Batesford Hotel</h1>
          <p className="mt-2 text-sm text-muted">Guest Wi-Fi Admin</p>
        </div>

        <div className="rounded-[24px] border border-emerald-300/15 bg-[#0c1717]/70 px-4 py-4 shadow-glow">
          <div className="muted-kicker mb-2">Venue</div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Batesford Hotel</div>
              <div className="mt-1 text-xs text-muted">Guest Wi-Fi Admin</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>

        <nav className="flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={closeNav}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="rounded-[28px] border border-emerald-300/10 bg-emerald-400/[0.08] p-4 shadow-glow">
          <div className="muted-kicker">Campaign Ready</div>
          <h3 className="mt-2 font-display text-lg text-white">Use captured guest data well</h3>
          <p className="mt-2 text-sm text-muted">Emails, mobiles, consent, postcode catchment, and repeat visits stay visible for campaigns, events, and newsletters.</p>
          <NavLink to="/campaigns" onClick={closeNav}>
            <Button className="mt-4 w-full">Open Campaigns</Button>
          </NavLink>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">{profile?.full_name || 'James Mitchell'}</div>
              <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">{profile?.role || 'Owner'}</div>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            <NavLink to="/settings" onClick={closeNav}>
              <Button variant="outline" className="w-full">Settings</Button>
            </NavLink>
            <Button variant="outline" className="w-full" onClick={toggleTheme}>
              {theme === 'light' ? 'Dark mode' : 'Light mode'}
            </Button>
          </div>
          <Button variant="ghost" className="mt-4 w-full" onClick={signOut}>Sign out</Button>
        </div>
      </aside>

      <main className="content-area">
        <div className="mobile-only mb-5">
          <div className="glass-panel p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="muted-kicker">Batesford Hotel</div>
                <div className="mt-1 font-display text-lg text-white">{activeLabel}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-outline px-3"
                  aria-label="Toggle theme"
                  onClick={toggleTheme}
                >
                  {theme === 'light' ? 'Dark' : 'Light'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-icon"
                  aria-label="Open navigation"
                  onClick={() => setMobileOpen(true)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
