import { ArrowLeft, BadgePercent, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../auth/AuthProvider';
import { apiDelete, apiGet, apiPost } from '../../lib/api';
import { promotionPeriod, promotionWeekdays } from './promotion';
import type { Promotion } from './promotion';

const createdDate = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Rome' });

export function PromotionsPage() {
  const { session } = useAuth();
  return session ? <PromotionsList key={session.access_token} token={session.access_token} /> : <p role="status">Accedi per gestire le promozioni.</p>;
}

function PromotionsList({ token }: { token: string }) {
  const [promotions, setPromotions] = useState<Promotion[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [mode, setMode] = useState<'date' | 'weekly'>('date');
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [percentage, setPercentage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const operation = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const busy = pending !== null;

  useEffect(() => {
    const controller = new AbortController();
    setPromotions(null); setLoadError('');
    apiGet<Promotion[]>('/promotions', token, controller.signal)
      .then(result => { if (!controller.signal.aborted) setPromotions(result); })
      .catch(cause => { if (!controller.signal.aborted) setLoadError(cause instanceof Error ? cause.message : 'Impossibile caricare le promozioni.'); });
    return () => controller.abort();
  }, [token, attempt]);
  useEffect(() => () => operation.current?.abort(), []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !promotions) return;
    if (!name.trim()) { setError('Inserisci il nome della promozione.'); return; }
    const discount = Number(percentage);
    if (percentage === '' || !Number.isFinite(discount) || discount < 0 || discount > 100) {
      setError('Inserisci una percentuale compresa tra 0 e 100.'); return;
    }
    if ((mode === 'date' && !date) || (mode === 'weekly' && !days.length)) {
      setError('Scegli una data oppure almeno un giorno della settimana.'); return;
    }
    inFlight.current = true; setPending('create'); setError(''); setSuccess('');
    const controller = new AbortController(); operation.current = controller;
    try {
      const promotion = await apiPost<Promotion>('/promotions', token, {
        name: name.trim(),
        promotion_date: mode === 'date' ? date : null,
        weekdays: mode === 'weekly' ? [...days].sort((a,b) => a-b) : [],
        discount_percent: discount,
      }, controller.signal);
      if (!controller.signal.aborted) {
        setPromotions(current => [promotion, ...(current || [])]);
        setName(''); setDate(''); setDays([]); setPercentage(''); setSuccess('Promozione aggiunta.');
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile salvare la promozione.');
    } finally {
      if (!controller.signal.aborted) { inFlight.current = false; setPending(null); }
    }
  }

  async function remove(promotion: Promotion) {
    if (inFlight.current) return;
    inFlight.current = true; setPending(promotion.id); setError(''); setSuccess('');
    const controller = new AbortController(); operation.current = controller;
    try {
      await apiDelete(`/promotions/${promotion.id}`, token, controller.signal);
      if (!controller.signal.aborted) {
        setPromotions(current => current?.filter(entry => entry.id !== promotion.id) || []);
        setSuccess('Promozione rimossa.');
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Impossibile rimuovere la promozione.');
    } finally {
      if (!controller.signal.aborted) { inFlight.current = false; setPending(null); }
    }
  }

  return <div className="dashboard-page">
    <div className="dashboard-heading"><div><div className="page-heading"><span className="heading-icon"><BadgePercent size={21} aria-hidden="true" /></span><h1>Promozioni</h1></div><p className="page-description">Promozioni condivise tra le sedi, per una data singola o per giorni ricorrenti.</p></div><Link className="sales-button" to="/management"><ArrowLeft size={16} aria-hidden="true" />Gestione</Link></div>
    {success && <p className="rental-inventory-notice" role="status">{success}</p>}
    <section className="rentals-panel" aria-labelledby="new-promotion-title">
      <div className="rentals-panel-heading"><h2 id="new-promotion-title">Nuova promozione</h2></div>
      <form className="rental-customer-body promotions-form" onSubmit={create}>
        <fieldset className="rental-form-section" disabled={busy || !promotions}><legend>Periodo e sconto</legend>
          <div className="rental-form-grid">
            <label>Nome promozione<input required maxLength={200} value={name} onChange={event=>setName(event.target.value)} /></label>
            <label>Validità<select value={mode} onChange={event=>{setMode(event.target.value as 'date'|'weekly');setError('');}}><option value="date">Data singola</option><option value="weekly">Ogni settimana</option></select></label>
            {mode === 'date' && <label>Data della promozione<input type="date" required value={date} onChange={event=>setDate(event.target.value)} /></label>}
            <label>Sconto (%)<input type="number" required min="0" max="100" step="0.01" value={percentage} onChange={event=>setPercentage(event.target.value)} /></label>
          </div>
          {mode === 'weekly' && <div className="promotion-weekdays"><p className="rental-form-hint">Scegli uno o più giorni della settimana.</p><div className="category-filters" role="group" aria-label="Giorni della settimana">{promotionWeekdays.map(day=><button className={`category-filter${days.includes(day.value)?' is-selected':''}`} aria-pressed={days.includes(day.value)} type="button" key={day.value} onClick={()=>setDays(current=>current.includes(day.value)?current.filter(value=>value!==day.value):[...current,day.value])}>{day.label}</button>)}</div></div>}
        </fieldset>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="sales-button sales-button-primary" type="submit" disabled={busy || !promotions || !name.trim() || percentage === '' || (mode === 'date' ? !date : !days.length)}><Plus size={16} aria-hidden="true" />{pending === 'create' ? 'Salvataggio…' : 'Aggiungi promozione'}</button>
      </form>
    </section>
    <section className="rentals-panel promotions-list" aria-labelledby="promotions-title">
      <div className="rentals-panel-heading"><h2 id="promotions-title">Elenco promozioni</h2>{promotions && <span className="rentals-count">{promotions.length} promozioni</span>}</div>
      {loadError ? <div className="rentals-empty"><p className="auth-error" role="alert">{loadError}</p><button className="sales-button" type="button" onClick={()=>setAttempt(value=>value+1)}>Riprova promozioni</button></div> : !promotions ? <p className="rentals-empty" role="status">Caricamento promozioni…</p> : <div className="rentals-table-scroll" role="region" aria-label="Promozioni configurate" tabIndex={0}><table className="rentals-table"><thead><tr><th scope="col">Nome</th><th scope="col">Validità</th><th scope="col">Sconto</th><th scope="col">Creata il</th><th scope="col">Azioni</th></tr></thead><tbody>
        {promotions.map(promotion=><tr key={promotion.id}><th scope="row">{promotion.name}</th><td>{promotionPeriod(promotion)}</td><td>{promotion.discount_percent.toLocaleString('it-IT')}%</td><td>{createdDate.format(new Date(promotion.created_at))}</td><td><button className="sales-button" type="button" disabled={busy} aria-label={`Rimuovi promozione ${promotion.name} · ${promotionPeriod(promotion)}`} onClick={()=>void remove(promotion)}><Trash2 size={15} aria-hidden="true" />{pending === promotion.id ? 'Rimozione…' : 'Rimuovi'}</button></td></tr>)}
        {promotions.length === 0 && <tr><td colSpan={5}><div className="rentals-empty">Nessuna promozione configurata.</div></td></tr>}
      </tbody></table></div>}
      <p className="rentals-panel-footer">Le promozioni valgono solo per noleggi di un giorno. Si applica lo sconto più alto tra promozioni valide e albergo, senza sommarli.</p>
    </section>
  </div>;
}
