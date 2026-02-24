import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Squares2X2Icon,
  ListBulletIcon,
  ArrowsRightLeftIcon,
  Cog6ToothIcon,
  Bars3Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', Icon: Squares2X2Icon },
  { to: '/events',    label: 'Events',    Icon: ListBulletIcon },
  { to: '/mappings',  label: 'Mappings',  Icon: ArrowsRightLeftIcon },
  { to: '/settings',  label: 'Settings',  Icon: Cog6ToothIcon },
];

function NavItem({ to, label, Icon, collapsed, onNavigate }) {
  return (
    <div className="relative group">
      <NavLink
        to={to}
        onClick={onNavigate}
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors
           ${collapsed ? 'justify-center' : ''}
           ${isActive ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`
        }
      >
        <Icon className="w-5 h-5 shrink-0" />
        {!collapsed && <span>{label}</span>}
      </NavLink>
      {collapsed && (
        <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50
          whitespace-nowrap rounded bg-gray-800 text-white text-xs px-2 py-1
          opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {label}
        </span>
      )}
    </div>
  );
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; }
    catch { return false; }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('sidebar-collapsed', String(next)); } catch {}
      return next;
    });
  }

  return (
    <div className="flex h-screen bg-gray-50">

      {/* Mobile top bar — hidden md+ */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 bg-gray-900 text-white
                         flex items-center px-4 z-30 shadow-md">
        <button onClick={() => setDrawerOpen(true)}
                className="p-2 rounded hover:bg-gray-800" aria-label="Open navigation">
          <Bars3Icon className="w-6 h-6" />
        </button>
        <img src="/logo.svg" alt="ImagePulse" className="h-8 w-auto ml-3" />
      </header>

      {/* Mobile backdrop */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-40"
             onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      )}

      {/* Mobile drawer */}
      <aside className={`md:hidden fixed top-0 left-0 h-full w-64 bg-gray-900 text-white
                         flex flex-col z-50 transform transition-transform duration-200
                         ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-4 py-5 border-b border-gray-700 flex items-center justify-between">
          <img src="/logo.svg" alt="ImagePulse" className="h-10 w-auto" />
          <button onClick={() => setDrawerOpen(false)}
                  className="p-1 text-gray-400 hover:text-white" aria-label="Close navigation">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, Icon }) => (
            <NavItem key={to} to={to} label={label} Icon={Icon}
                     collapsed={false} onNavigate={() => setDrawerOpen(false)} />
          ))}
        </nav>
      </aside>

      {/* Desktop sidebar — hidden below md */}
      <aside className={`hidden md:flex flex-col bg-gray-900 text-white
                         transition-[width] duration-200
                         ${collapsed ? 'w-14' : 'w-56'}`}>
        <div className={`border-b border-gray-700 flex items-center
                         ${collapsed ? 'px-0 py-5 justify-center' : 'px-4 py-5'}`}>
          {collapsed
            ? <img src="/logo.svg" alt="IP" className="h-8 w-8 object-cover object-left" />
            : <img src="/logo.svg" alt="ImagePulse" className="h-10 w-auto" />}
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, Icon }) => (
            <NavItem key={to} to={to} label={label} Icon={Icon}
                     collapsed={collapsed} onNavigate={null} />
          ))}
        </nav>
        {/* Collapse toggle */}
        <button onClick={toggleCollapsed}
                className="hidden md:flex items-center justify-center h-10 w-full
                           border-t border-gray-700 text-gray-400 hover:text-white
                           hover:bg-gray-800 transition-colors"
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed
            ? <ChevronRightIcon className="w-4 h-4" />
            : <ChevronLeftIcon className="w-4 h-4" />}
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-4 md:p-8 pt-20 md:pt-8">
        <Outlet />
      </main>

    </div>
  );
}
