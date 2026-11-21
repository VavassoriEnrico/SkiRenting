import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useState } from 'react';

import { useAuth } from './AuthProvider';

export function RequireAuth() {
  const auth = useAuth();
  const currentRoute = useLocation();
  const [signOutError, setSignOutError] = useState('');

  if (!auth.session) {
    if (auth.loading) return <div className="auth-loading" role="status">Verifica accesso…</div>;
    return <Navigate to="/login" state={{ from: currentRoute.pathname }} replace />;
  }
  if (auth.loading) return <div className="auth-loading" role="status">Caricamento profilo e sedi…</div>;
  if (auth.error || !auth.operator || !auth.location) {
    return (
      <div className="login-screen">
        <section className="login-card">
          <span className="workspace-mark" aria-hidden="true">S</span>
          <h1>Accesso al gestionale</h1>
          <p className="auth-error" role="alert">{auth.error || 'Profilo non disponibile.'}</p>
          <p>Verifica che il profilo sia collegato alle sedi e che le regole di lettura siano configurate.</p>
          <div className="auth-error-actions">
            <button className="sales-button" type="button" onClick={auth.retry}>Riprova</button>
            <button className="sales-button" type="button" onClick={() => {
              setSignOutError('');
              void auth.signOut().catch((cause: Error) => setSignOutError(cause.message));
            }}>Esci</button>
          </div>
          {signOutError && <p className="auth-error" role="alert">{signOutError}</p>}
        </section>
      </div>
    );
  }
  return <Outlet />;
}
