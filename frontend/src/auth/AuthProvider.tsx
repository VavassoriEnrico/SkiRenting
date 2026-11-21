import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { apiGet } from '../lib/api';
import type { Location, OperatorSession } from '../lib/api';
import { supabase } from '../lib/supabase';

type AuthState = {
  session: Session | null;
  operator: OperatorSession | null;
  location: Location | null;
  loading: boolean;
  error: string;
  locationError: string;
  switchingLocation: boolean;
  retry: () => void;
  selectLocation: (id: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
const locationKey = (userId: string) => `skirenting.location.${userId}`;

function readLocation(userId: string) {
  try { return sessionStorage.getItem(locationKey(userId)); } catch { return null; }
}

function saveLocation(userId: string, id: string | null) {
  try {
    if (id) sessionStorage.setItem(locationKey(userId), id);
    else sessionStorage.removeItem(locationKey(userId));
  } catch { /* Il selettore funziona anche quando lo storage non è disponibile. */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [operator, setOperator] = useState<OperatorSession | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [error, setError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [switchingLocation, setSwitchingLocation] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const selectionRequest = useRef<AbortController | null>(null);
  const token = session?.access_token;
  const userId = session?.user.id;

  useEffect(() => {
    if (!supabase) return;
    // Il callback aggiorna solo lo stato; le richieste API avvengono nell'effetto sotto.
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    selectionRequest.current?.abort();
    setSwitchingLocation(false);
    setLocationError('');
    setError('');
    if (!token || !userId) {
      setOperator(null);
      setLocation(null);
      setLoadingProfile(false);
      return;
    }

    const controller = new AbortController();
    setLoadingProfile(true);
    apiGet<OperatorSession>('/me', token, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        const savedId = readLocation(userId);
        const nextLocation = data.locations.find((item) => item.id === savedId) ?? data.locations[0];
        if (!nextLocation || data.profile.id !== userId) throw new Error('Profilo o sedi non disponibili.');
        setOperator(data);
        setLocation(nextLocation);
        saveLocation(userId, nextLocation.id);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setOperator(null);
        setLocation(null);
        setError(cause instanceof Error ? cause.message : 'Impossibile caricare il profilo.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingProfile(false); });
    return () => {
      controller.abort();
      selectionRequest.current?.abort();
    };
  }, [token, userId, retryCount]);

  async function selectLocation(id: string) {
    if (!token || !userId || id === location?.id) return;
    if (!operator?.locations.some((item) => item.id === id)) {
      setLocationError('Sede non autorizzata.');
      return;
    }
    selectionRequest.current?.abort();
    const controller = new AbortController();
    selectionRequest.current = controller;
    setSwitchingLocation(true);
    setLocationError('');
    try {
      // Il backend verifica il collegamento anche se l'ID viene modificato nel browser.
      const nextLocation = await apiGet<Location>(`/me/locations/${id}`, token, controller.signal);
      if (controller.signal.aborted) return;
      setLocation(nextLocation);
      saveLocation(userId, nextLocation.id);
    } catch (cause) {
      if (!controller.signal.aborted) setLocationError(cause instanceof Error ? cause.message : 'Cambio sede non riuscito.');
    } finally {
      if (!controller.signal.aborted) setSwitchingLocation(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
    if (signOutError) throw new Error('Uscita non riuscita. Riprova.');
    if (userId) saveLocation(userId, null);
    selectionRequest.current?.abort();
    setSession(null);
    setOperator(null);
    setLocation(null);
  }

  const loading = !ready || loadingProfile || Boolean(session && operator?.profile.id !== userId && !error);
  return (
    <AuthContext.Provider value={{
      session, operator, location, loading, error, locationError, switchingLocation,
      retry: () => setRetryCount((count) => count + 1), selectLocation, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth deve essere usato dentro AuthProvider.');
  return auth;
}
