import { PanelLeftClose } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { getNavigationSections } from '../../config/navigation';
import { useAuth } from '../../auth/AuthProvider';

import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  const { location } = useAuth();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenu = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const section = getNavigationSections(location?.name).find((entry) => entry.items.some((item) => (item.href === pathname || pathname.startsWith(`${item.href}/`))));
    const page = section?.items.find((item) => (item.href === pathname || pathname.startsWith(`${item.href}/`)));
    document.title = page ? `${page.label} · ${section?.label} · SkiRenting` : 'SkiRenting';
  }, [pathname, location?.name]);

  useEffect(() => {
    const dialog = mobileMenu.current;
    if (mobileOpen && !dialog?.open) dialog?.showModal();
    if (!mobileOpen && dialog?.open) dialog.close();
  }, [mobileOpen]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => {
      if (media.matches) setMobileOpen(false);
    };
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, []);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Vai al contenuto</a>
      <aside
        id="desktop-sidebar"
        className={`sidebar desktop-sidebar${collapsed ? ' is-collapsed' : ''}`}
        aria-label="Menu laterale"
      >
        <Sidebar collapsed={collapsed} />
      </aside>

      <dialog
        ref={mobileMenu}
        className="mobile-drawer"
        aria-label="Menu di navigazione"
        onCancel={() => setMobileOpen(false)}
        onClose={() => setMobileOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX > bounds.right || event.clientY > bounds.bottom) {
              setMobileOpen(false);
            }
          }
        }}
      >
        <div className="sidebar mobile-sidebar">
          <button className="close-menu" type="button" onClick={() => setMobileOpen(false)}>
            <PanelLeftClose size={16} aria-hidden="true" />
            Chiudi menu
          </button>
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </div>
      </dialog>

      <div className="app-inset">
        <Header
          collapsed={collapsed}
          onToggleSidebar={() => setCollapsed((value) => !value)}
          onOpenMobileMenu={() => setMobileOpen(true)}
        />
        <main id="main-content" className="app-content" tabIndex={-1}>
          <Outlet key={location?.id} />
        </main>
      </div>
    </div>
  );
}
