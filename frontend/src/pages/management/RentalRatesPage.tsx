import { ArrowLeft, Coins, Save } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../auth/AuthProvider';
import { apiGet, apiPatch } from '../../lib/api';
import { draftFromRate, pricesFromDraft, rateColumns } from './rental-rates';
import type { RateDraft, RateKey, RentalRate, RentalRateList } from './rental-rates';

export function RentalRatesPage() {
  const { session } = useAuth();
  return session ? <RentalRatesList key={session.access_token} token={session.access_token} /> : <p role="status">Accedi per gestire le tariffe.</p>;
}

function RentalRatesList({ token }: { token: string }) {
  const [data, setData] = useState<RentalRateList | null>(null);
  const [drafts, setDrafts] = useState<Record<string, RateDraft>>({});
  const [category, setCategory] = useState('');
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const saving = useRef(false);
  const saveRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(''); setData(null);
    apiGet<RentalRateList>('/rental-rates', token, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setDrafts(Object.fromEntries(result.rates.map((rate) => [rate.id, draftFromRate(rate)])));
        }
      })
      .catch((cause) => { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : 'Impossibile caricare le tariffe.'); });
    return () => controller.abort();
  }, [token, attempt]);
  useEffect(() => () => saveRequest.current?.abort(), []);

  const order = ['ski', 'snowboard', 'ski_boots', 'snowboard_boots', 'poles', 'helmet', 'goggles', 'avalanche', 'snowshoes', 'sled'];
  const categories = [...(data?.categories || [])].sort((a, b) => (
    (order.includes(a.code) ? order.indexOf(a.code) : order.length) - (order.includes(b.code) ? order.indexOf(b.code) : order.length)
    || a.name.localeCompare(b.name, 'it')
  ));
  const currentCategory = categories.find((entry) => entry.id === category) || categories[0];
  const rows = (data?.rates || []).filter((rate) => rate.group.category.id === currentCategory?.id).sort((a, b) => a.group.name.localeCompare(b.group.name, 'it'));

  function changePrice(id: string, key: RateKey, value: string) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], [key]: value } }));
    setError(''); setSuccess('');
  }

  async function save(rate: RentalRate) {
    if (saving.current) return;
    const prices = pricesFromDraft(drafts[rate.id]);
    if (Object.values(prices).some((value) => value !== null && (!Number.isFinite(value) || value < 0 || value > 9999999999.99))) {
      setError('Inserisci prezzi validi, maggiori o uguali a zero.'); return;
    }
    saving.current = true; setSavingId(rate.id); setError(''); setSuccess('');
    const controller = new AbortController(); saveRequest.current = controller;
    try {
      const updated = await apiPatch<RentalRate>(`/rental-rates/${rate.id}`, token, prices, controller.signal);
      if (!controller.signal.aborted) {
        setData((current) => current && { ...current, rates: current.rates.map((entry) => entry.id === updated.id ? updated : entry) });
        setDrafts((current) => ({ ...current, [updated.id]: draftFromRate(updated) }));
        setSuccess(`Tariffe di ${updated.group.name} salvate.`);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile salvare le tariffe.');
    } finally {
      if (!controller.signal.aborted) { saving.current = false; setSavingId(null); }
    }
  }

  return <div className="dashboard-page">
    <div className="dashboard-heading"><div><div className="page-heading"><span className="heading-icon"><Coins size={21} aria-hidden="true" /></span><h1>Tariffe</h1></div><p className="page-description">Listino noleggio condiviso tra le sedi, diviso per tipo di materiale.</p></div><Link className="sales-button" to="/management"><ArrowLeft size={16} aria-hidden="true" />Gestione</Link></div>
    <p className="rental-inventory-notice">Tutti gli importi sono in €/giorno per la durata indicata. La tariffa 7+ si applica a ogni giorno dei noleggi di almeno sette giorni. Un campo vuoto indica una tariffa da configurare.</p>
    {success && <p className="rental-equipment-message" role="status">{success}</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    {loadError ? <div className="auth-error" role="alert">{loadError}<div><button className="sales-button" type="button" onClick={() => setAttempt((value) => value + 1)}>Riprova</button></div></div> : !data ? <p role="status">Caricamento listino…</p> : <>
      <section className="inventory-categories" aria-labelledby="rates-categories-title"><h2 id="rates-categories-title">Tipo di materiale</h2><div className="category-filters" role="group" aria-label="Tipo di materiale">
        {categories.map((entry) => <button className={`category-filter${entry.id === currentCategory?.id ? ' is-selected' : ''}`} type="button" key={entry.id} disabled={!!savingId} aria-pressed={entry.id === currentCategory?.id} onClick={() => { setCategory(entry.id); setSuccess(''); }}>{entry.name}<span>{data.rates.filter((rate) => rate.group.category.id === entry.id).length}</span></button>)}
      </div></section>
      <section className="rentals-panel" aria-labelledby="rates-list-title"><div className="rentals-panel-heading"><h2 id="rates-list-title">{currentCategory?.name || 'Tariffe'}</h2><span className="rentals-count">{rows.length} gruppi</span></div>
        <div className="rentals-table-scroll" role="region" aria-label="Prezzi giornalieri per gruppo" tabIndex={0}><table className="rentals-table rates-table"><caption className="sr-only">Prezzo giornaliero per gruppo e durata del noleggio</caption><thead><tr><th scope="col">Gruppo</th>{rateColumns.map((column) => <th key={column.key} scope="col">{column.label}<span className="rental-secondary">€/giorno</span></th>)}<th scope="col">Salva</th></tr></thead><tbody>
          {rows.map((rate) => {
            const draft = drafts[rate.id];
            const prices = pricesFromDraft(draft);
            const dirty = rateColumns.some(({ key }) => prices[key] !== rate[key]);
            const configured = rateColumns.filter(({ key }) => rate[key] !== null).length;
            return <tr key={rate.id}><th scope="row"><span className="rental-primary">{rate.group.name}</span><span className="rental-secondary">{configured}/7 tariffe configurate</span></th>
              {rateColumns.map((column) => <td key={column.key}><label className="sr-only" htmlFor={`${rate.id}-${column.key}`}>{rate.group.name} · {column.label} (€/giorno)</label><input className="rate-price-input" id={`${rate.id}-${column.key}`} form={`rate-form-${rate.id}`} type="number" min="0" max="9999999999.99" step="0.01" placeholder="Da configurare" value={draft[column.key]} disabled={!!savingId} onChange={(event) => changePrice(rate.id, column.key, event.target.value)} /></td>)}
              <td><form id={`rate-form-${rate.id}`} onSubmit={(event) => { event.preventDefault(); void save(rate); }}><button className="sales-button" type="submit" disabled={!!savingId || !dirty} aria-label={`Salva tariffe ${rate.group.name}`}><Save size={15} aria-hidden="true" />{savingId === rate.id ? 'Salvataggio…' : 'Salva'}</button></form></td></tr>;
          })}
          {rows.length === 0 && <tr><td colSpan={9}><div className="rentals-empty">Nessun gruppo tariffario per questo tipo di materiale.</div></td></tr>}
        </tbody></table></div>
        <p className="rentals-panel-footer">Salva ogni gruppo dopo le modifiche. I prezzi confermati nei noleggi restano nello storico; questo listino verrà collegato al calcolo del nuovo noleggio.</p>
      </section>
    </>}
  </div>;
}
