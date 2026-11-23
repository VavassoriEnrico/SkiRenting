import { ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';

import { apiGet } from '../../lib/api';
import { rateColumns } from '../management/rental-rates';
import type { RentalRate, RentalRateList } from '../management/rental-rates';

const currency = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

export function RentalInventoryRates({ token, groupId, groupName }: { token: string; groupId: string; groupName: string }) {
  const [requested, setRequested] = useState(false);
  const [rate, setRate] = useState<RentalRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setRate(null);
    apiGet<RentalRateList>('/rental-rates', token, controller.signal)
      .then(result => {
        if (!controller.signal.aborted) {
          setRate(result.rates.find(entry => entry.group_id === groupId) || null);
          setLoading(false);
        }
      })
      .catch(cause => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Impossibile caricare le tariffe.');
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [requested, token, groupId, attempt]);

  return <details className="sale-detail-section inventory-tariff-section" onToggle={event => {
    if (event.currentTarget.open) setRequested(true);
  }}>
    <summary>Tariffa<ChevronDown size={18} aria-hidden="true" /></summary>
    <div className="inventory-tariff-body">
      <p className="rental-form-hint">Gruppo: {groupName} · Prezzi al giorno in base alla durata del noleggio.</p>
      {loading ? <p role="status">Caricamento tariffe…</p> : error ? <div><p className="auth-error" role="alert">{error}</p><button className="sales-button" type="button" onClick={() => setAttempt(value => value + 1)}>Riprova tariffe</button></div> : <>
        <dl className="sale-details-grid">
          {rateColumns.map(({ key, label }) => <div key={key}><dt>{label}</dt><dd>{rate?.[key] == null ? 'Non impostata' : `${currency.format(rate[key]!)} / giorno`}</dd></div>)}
        </dl>
        <p className="rental-form-hint">Tariffe base del listino, prima degli eventuali sconti. La fascia 7+ vale per ogni giorno dei noleggi di almeno sette giorni.</p>
      </>}
    </div>
  </details>;
}
