import { useState } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import {
  Squares2X2Icon,
  ListBulletIcon,
  MapIcon,
  Cog6ToothIcon,
  Bars3Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import pkg from '../../package.json';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', Icon: Squares2X2Icon },
  { to: '/events',    label: 'Events',    Icon: ListBulletIcon },
  { to: '/mappings',  label: 'Mappings',  Icon: MapIcon },
  { to: '/settings',  label: 'Settings',  Icon: Cog6ToothIcon },
];

const PAGE_LABELS = {
  '/dashboard': 'Dashboard',
  '/events':    'Events',
  '/mappings':  'Mappings',
  '/settings':  'Settings',
};

function GitHubIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function Breadcrumb() {
  const { pathname } = useLocation();
  const label = PAGE_LABELS[pathname] ?? '';
  return (
    <div className="bg-white border-b border-gray-200 px-4 md:px-8 py-2.5 flex items-center gap-2 text-sm shrink-0">
      <Link to="/dashboard" className="text-gray-400 hover:text-gray-600 transition-colors">
        ImagePulse
      </Link>
      {label && (
        <>
          <span className="text-gray-300">/</span>
          <span className="text-gray-700 font-medium">{label}</span>
        </>
      )}
    </div>
  );
}

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
        <div className="px-4 py-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="ImagePulse" className="h-8 w-auto shrink-0" />
            <span className="font-semibold text-white text-lg leading-none">ImagePulse</span>
          </div>
          <button onClick={() => setDrawerOpen(false)}
                  className="p-1 text-gray-400 hover:text-white shrink-0" aria-label="Close navigation">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, Icon }) => (
            <NavItem key={to} to={to} label={label} Icon={Icon}
                     collapsed={false} onNavigate={() => setDrawerOpen(false)} />
          ))}
        </nav>
        {/* Mobile drawer footer */}
        <div className="border-t border-gray-700 px-4 py-3 flex items-center gap-2 text-xs text-gray-400">
          <GitHubIcon className="w-4 h-4 shrink-0" />
          <a href="https://github.com/dschoepel/imagepulse" target="_blank" rel="noreferrer"
             className="hover:text-white transition-colors truncate">
            ImagePulse
          </a>
          <span className="ml-auto shrink-0">v{pkg.version}</span>
        </div>
      </aside>

      {/* Desktop sidebar — hidden below md */}
      <aside className={`hidden md:flex flex-col bg-gray-900 text-white
                         transition-[width] duration-200
                         ${collapsed ? 'w-14' : 'w-56'}`}>

        {/* Sidebar header — logo + name + collapse toggle */}
        {collapsed ? (
          <div className="border-b border-gray-700 flex flex-col items-center gap-2 py-3">
            <img src="/logo.svg" alt="IP" className="h-8 w-8 object-cover object-left" />
            <button onClick={toggleCollapsed}
                    className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-gray-800"
                    aria-label="Expand sidebar">
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="border-b border-gray-700 flex items-center gap-2 px-3 py-3">
            <img src="/logo.svg" alt="ImagePulse" className="h-8 w-auto shrink-0" />
            <span className="font-semibold text-white text-base leading-none flex-1 min-w-0 truncate">
              ImagePulse
            </span>
            <button onClick={toggleCollapsed}
                    className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-gray-800 shrink-0"
                    aria-label="Collapse sidebar">
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, Icon }) => (
            <NavItem key={to} to={to} label={label} Icon={Icon}
                     collapsed={collapsed} onNavigate={null} />
          ))}
        </nav>

        {/* Sidebar footer — GitHub link + version */}
        <div className={`border-t border-gray-700 py-3 flex items-center gap-2 text-xs text-gray-400
                         ${collapsed ? 'flex-col justify-center px-0' : 'px-4'}`}>
          <GitHubIcon className="w-4 h-4 shrink-0" />
          {!collapsed && (
            <>
              <a href="https://github.com/dschoepel/imagepulse" target="_blank" rel="noreferrer"
                 className="hover:text-white transition-colors truncate">
                ImagePulse
              </a>
              <span className="ml-auto shrink-0">v{pkg.version}</span>
            </>
          )}
        </div>
      </aside>

      {/* Right column: breadcrumb bar + page content */}
      <div className="flex-1 flex flex-col min-h-0 pt-14 md:pt-0">
        <Breadcrumb />
        <main className="flex-1 overflow-auto p-4 md:p-8">
          <Outlet />
        </main>
      </div>

    </div>
  );
}
