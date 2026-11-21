import { ArrowUpRight, Coins, Hotel, Settings2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export function ManagementPage() {
  return <div className="dashboard-page">
    <div className="dashboard-heading"><div><div className="page-heading"><span className="heading-icon"><Settings2 size={21} aria-hidden="true" /></span><h1>Gestione</h1></div><p className="page-description">Gestisci gli elenchi condivisi tra le sedi.</p></div></div>
    <div className="management-grid">
      <Link className="management-card" to="/management/hotels"><span className="management-card-icon"><Hotel size={25} aria-hidden="true" /></span><h2>Alberghi</h2><p>Aggiungi e rimuovi gli alberghi selezionabili nei noleggi.</p><span className="management-card-action">Gestisci alberghi <ArrowUpRight size={17} aria-hidden="true" /></span></Link>
      <Link className="management-card" to="/management/tariffe"><span className="management-card-icon"><Coins size={25} aria-hidden="true" /></span><h2>Tariffe</h2><p>Configura i prezzi giornalieri per tipo di materiale e durata del noleggio.</p><span className="management-card-action">Gestisci tariffe <ArrowUpRight size={17} aria-hidden="true" /></span></Link>
    </div>
  </div>;
}
