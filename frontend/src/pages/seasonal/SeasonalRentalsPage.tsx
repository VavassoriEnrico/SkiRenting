import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { apiGet } from '../../lib/api';
import { RentalsPage } from '../rentals/RentalsPage';
import type { SeasonalSettings } from './seasonal';

export function SeasonalRentalsPage({view='current'}:{view?:'current'|'history'}){
  const {session}=useAuth();
  return session?<SeasonalList key={`${session.access_token}:${view}`} token={session.access_token} view={view}/>:<p role="status">Accedi per vedere gli stagionali.</p>;
}
function SeasonalList({token,view}:{token:string;view:'current'|'history'}){
  const [settings,setSettings]=useState<SeasonalSettings|null>(null);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const [selected,setSelected]=useState('');
  useEffect(()=>{
    const controller=new AbortController();setError('');setSettings(null);
    apiGet<SeasonalSettings>('/seasonal-rentals/settings',token,controller.signal)
      .then(result=>{if(!controller.signal.aborted)setSettings(result);})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Impossibile caricare le stagioni.');});
    return()=>controller.abort();
  },[token,attempt]);
  const season=settings?.seasons.find(entry=>entry.id===selected)||settings?.current_season||settings?.seasons[0];
  if(error||!settings||!season)return <div className="dashboard-page"><div className="page-heading"><h1>Noleggi stagionali</h1></div>{error?<div className="auth-error" role="alert">{error}<button className="sales-button" onClick={()=>setAttempt(value=>value+1)}>Riprova stagioni</button></div>:!settings?<p role="status">Caricamento stagioni…</p>:<p className="rental-inventory-notice">Nessuna stagione configurata. <Link to="/management/tariffe-stagionali">Configura le tariffe stagionali</Link>.</p>}</div>;
  return <><div className="seasonal-list-selector rental-form-grid"><label>Stagione<select value={season.id} onChange={event=>setSelected(event.target.value)}>{settings.seasons.map(entry=><option key={entry.id} value={entry.id}>{entry.name}{entry.is_current?' · corrente':''}</option>)}</select></label></div><RentalsPage view={view} seasonId={season.id} seasonName={season.name}/></>;
}
