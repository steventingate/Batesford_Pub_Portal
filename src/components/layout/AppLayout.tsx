import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../ui/Button';

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/contacts', label: 'Contacts' },
  { path: '/campaigns', label: 'Campaigns' },
  { path: '/settings', label: 'Settings' }
];

export function AppLayout() {
  const { profile, signOut } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>BATESFORD</h1>
        <nav>
          {navItems.map((item) => (
            <NavLink key={item.path} to={item.path} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-10 text-sm text-white/70">
          <div className="font-semibold">{profile?.full_name || 'Team Member'}</div>
          <div className="uppercase tracking-wide text-xs">{profile?.role || 'manager'}</div>
          <Button variant="ghost" className="mt-3" onClick={signOut}>Sign out</Button>
        </div>
      </aside>
      <main className="content-area">
        <Outlet />
      </main>
    </div>
  );
}
