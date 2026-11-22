import { useEffect, useState } from 'react';

import { useAuth } from '../../auth/AuthProvider';
import { apiGet } from '../../lib/api';
import type { Hotel } from '../management/hotel';
import { RentalSection } from './RentalSection';

export type RentalPeriod = {
  starts_on: string;
  ends_on: string;
  hotel: string;
};

export function RentalPeriodFields({ value, onChange, notes = '', onNotesChange }: {
  value: RentalPeriod;
  onChange: (value: RentalPeriod) => void;
  notes?: string;
  onNotesChange?: (notes: string) => void;
}) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [hotels, setHotels] = useState<Hotel[] | null>(null);
  const [hotelError, setHotelError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setHotelError(''); setHotels(null);
    apiGet<Hotel[]>('/hotels', token, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setHotels(result); })
      .catch((cause) => { if (!controller.signal.aborted) setHotelError(cause instanceof Error ? cause.message : 'Impossibile caricare gli alberghi.'); });
    return () => controller.abort();
  }, [token, attempt]);
  const invalidPeriod = !!(value.starts_on && value.ends_on && value.ends_on < value.starts_on);

  return (
    <RentalSection id="rental-period" title="Periodo e albergo" className="rental-period-panel">
      <div className="rental-customer-body">
        <div className="rental-form-grid rental-period-fields">
          <label>Data di inizio *<input type="date" required value={value.starts_on} onChange={(event) => onChange({ ...value, starts_on: event.target.value })} /></label>
          <label>Rientro previsto *<input type="date" required min={value.starts_on || undefined} value={value.ends_on} aria-invalid={invalidPeriod || undefined} aria-describedby={invalidPeriod ? 'rental-period-error' : undefined} onChange={(event) => onChange({ ...value, ends_on: event.target.value })} /></label>
          <label className="rental-hotel-field">Albergo<select value={value.hotel} disabled={!hotels} onChange={(event) => onChange({ ...value, hotel: event.target.value })}>
            <option value="">Nessun albergo</option>
            {hotels?.map((hotel) => <option key={hotel.id} value={hotel.id}>{hotel.name}</option>)}
          </select></label>
          {onNotesChange && <label className="rental-form-wide">Note prenotazione<textarea maxLength={5000} value={notes} onChange={(event) => onNotesChange(event.target.value)} placeholder="Annotazioni per questo noleggio (facoltative)" /></label>}
        </div>
        {hotelError && <div className="auth-error" role="alert">{hotelError}<div><button className="sales-button" type="button" onClick={() => setAttempt((current) => current + 1)}>Riprova alberghi</button></div></div>}
        {!hotels && !hotelError && <p className="rental-form-hint" role="status">Caricamento alberghi…</p>}
        {invalidPeriod && <p id="rental-period-error" className="auth-error" role="alert">Il rientro previsto non può precedere la data di inizio.</p>}
      </div>
    </RentalSection>
  );
}
