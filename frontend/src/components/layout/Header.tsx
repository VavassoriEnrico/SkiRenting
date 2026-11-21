import { LogOut, PanelLeft, Snowflake } from 'lucide-react';
import { useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';

type HeaderProps = {
  collapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMobileMenu: () => void;
};

export function Header({ collapsed, onToggleSidebar, onOpenMobileMenu }: HeaderProps) {
  const { operator, session, signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSignOut() {
    setLeaving(true);
    setError('');
    try { await signOut(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Uscita non riuscita.'); }
    finally { setLeaving(false); }
  }

  return (
    <header className="app-header">
      <div className="header-leading">
        <button
          type="button"
          className="icon-button desktop-menu-toggle"
          onClick={onToggleSidebar}
          aria-label={collapsed ? 'Espandi sidebar' : 'Comprimi sidebar'}
          aria-expanded={!collapsed}
          aria-controls="desktop-sidebar"
        >
          <PanelLeft size={17} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-button mobile-menu-toggle"
          onClick={onOpenMobileMenu}
          aria-label="Apri menu"
          aria-haspopup="dialog"
        >
          <PanelLeft size={17} aria-hidden="true" />
        </button>
        <div className="header-title"><span>Il tuo spazio di lavoro</span><strong>SkiRenting</strong></div>
      </div>
      <div className="header-account">
        <div className="header-identity">
          <span className="header-avatar"><Snowflake size={21} aria-hidden="true" /></span>
          <span className="header-identity-copy">
            <strong>{operator?.profile.name}</strong>
            <span>{session?.user.email}</span>
          </span>
        </div>
        <button type="button" className="icon-button" title="Esci" aria-label="Esci dal gestionale" disabled={leaving} onClick={() => void handleSignOut()}>
          <LogOut size={18} aria-hidden="true" />
        </button>
        {error && <p className="header-signout-error" role="alert">{error}</p>}
      </div>
    </header>
  );
}
