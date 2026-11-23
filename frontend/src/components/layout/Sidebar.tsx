import { NavLink } from 'react-router-dom';

import { getNavigationSections } from '../../config/navigation';
import { useAuth } from '../../auth/AuthProvider';
import { LocationSelector } from './LocationSelector';

type SidebarProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
};

export function Sidebar({ collapsed = false, onNavigate }: SidebarProps) {
  const { location } = useAuth();
  const navigationSections = getNavigationSections(location?.name);
  return (
    <>
      <NavLink
        className="workspace"
        to="/dashboard"
        onClick={onNavigate}
        aria-label="SkiRenting — Dashboard"
        title={collapsed ? 'SkiRenting' : undefined}
      >
        <span className="workspace-mark" aria-hidden="true">S</span>
        {!collapsed && (
          <span className="workspace-copy">
            <span className="workspace-name">SkiRenting</span>
            <span className="workspace-description">Gestionale noleggio</span>
          </span>
        )}
      </NavLink>

      <div className="sidebar-location"><LocationSelector compact={collapsed} /></div>

      <nav className="sidebar-navigation" aria-label="Navigazione principale">
        {navigationSections.map((section) => (
          <div className="navigation-section" key={section.id} role="group" aria-label={section.label}>
            {!collapsed && <p className="navigation-label">{section.label}</p>}
            <div className="navigation-section-links">
              {section.items.map(({ href, label, icon: Icon }) => (
                <NavLink
                  key={href}
                  to={href}
                  end={href === '/noleggi' || href === '/noleggi/stagionali'}
                  onClick={onNavigate}
                  title={collapsed ? `${section.label} · ${label}` : undefined}
                  aria-label={collapsed ? `${section.label} · ${label}` : undefined}
                  className={({ isActive }) => `navigation-link${isActive ? ' is-active' : ''}`}
                >
                  <Icon size={16} aria-hidden="true" />
                  {!collapsed && <span>{label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      {!collapsed && <div className="sidebar-footer"><span className="sidebar-footer-dot" />SkiRenting<span className="sidebar-version">v0.1</span></div>}
    </>
  );
}
