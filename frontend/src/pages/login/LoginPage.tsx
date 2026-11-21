import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../../auth/AuthProvider';
import { supabase } from '../../lib/supabase';

export function LoginPage() {
  const { session, loading } = useAuth();
  const route = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const savedPath = (route.state as { from?: string } | null)?.from;
  const destination = savedPath?.startsWith('/') && !savedPath.startsWith('//') && savedPath !== '/login' ? savedPath : '/dashboard';

  useEffect(() => { document.title = 'Accedi · SkiRenting'; }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || submitting) return;
    setError('');
    setSubmitting(true);
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (loginError) setError('Accesso non riuscito. Verifica email e password e riprova.');
    } catch {
      setError('Servizio di accesso non raggiungibile. Riprova tra poco.');
    } finally { setSubmitting(false); }
  }

  if (session) return <Navigate to={destination} replace />;
  if (loading) return <div className="auth-loading" role="status">Verifica accesso…</div>;

  return (
    <div className="login-screen">
      <section className="login-card" aria-labelledby="login-title">
        <span className="workspace-mark" aria-hidden="true">S</span>
        <p className="login-eyebrow">SkiRenting</p>
        <h1 id="login-title">Accedi al gestionale</h1>
        <p>Usa il tuo account per lavorare nelle sedi autorizzate.</p>
        {!supabase && <p className="auth-error" role="alert">Configura VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY nel file frontend/.env, poi riavvia il frontend.</p>}
        <form onSubmit={handleSubmit}>
          <label htmlFor="login-email">Email</label>
          <input id="login-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} disabled={!supabase || submitting} />
          <label htmlFor="login-password">Password</label>
          <div className="login-password-field">
            <input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} disabled={!supabase || submitting} />
            <button type="button" className="icon-button" aria-label={showPassword ? 'Nascondi password' : 'Mostra password'} aria-pressed={showPassword} aria-controls="login-password" disabled={!supabase || submitting} onClick={() => setShowPassword((visible) => !visible)}>
              {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="sales-button sales-button-primary" type="submit" disabled={!supabase || submitting}><LogIn size={17} aria-hidden="true" />{submitting ? 'Accesso in corso…' : 'Accedi'}</button>
        </form>
      </section>
    </div>
  );
}
