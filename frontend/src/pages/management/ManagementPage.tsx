import { ArrowUpRight, Archive, BadgePercent, Coins, Snowflake, Hotel, Settings2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export function ManagementPage() {
  return <div className="dashboard-page">
    <div className="dashboard-heading"><div><div className="page-heading"><span className="heading-icon"><Settings2 size={21} aria-hidden="true" /></span><h1>Gestione</h1></div><p className="page-description">Gestisci gli elenchi condivisi tra le sedi.</p></div></div>
    <div className="management-grid">
      <Link className="management-card" to="/management/hotels"><span className="management-card-icon"><Hotel size={25} aria-hidden="true" /></span><h2>Alberghi</h2><p>Aggiungi e rimuovi gli alberghi selezionabili nei noleggi.</p><span className="management-card-action">Gestisci alberghi <ArrowUpRight size={17} aria-hidden="true" /></span></Link>
      <Link className="management-card" to="/management/tariffe"><span className="management-card-icon"><Coins size={25} aria-hidden="true" /></span><h2>Tariffe</h2><p>Configura i prezzi per tipo e durata del noleggio.</p><span className="management-card-action">Gestisci tariffe <ArrowUpRight size={17} aria-hidden="true" /></span></Link>
      <Link className="management-card" to="/management/tariffe-stagionali"><span className="management-card-icon"><Snowflake size={25} aria-hidden="true" /></span><h2>Tariffe stagionali</h2><p>Imposta la consegna comune e i prezzi singolo o pack.</p><span className="management-card-action">Gestisci stagionali <ArrowUpRight size={17} aria-hidden="true" /></span></Link>
      <Link className="management-card" to="/management/promozioni"><span className="management-card-icon"><BadgePercent size={25} aria-hidden="true" /></span><h2>Promozioni</h2><p>Configura gli sconti per una data, un periodo o giorni della settimana.</p><span className="management-card-action">Gestisci promozioni <ArrowUpRight size={17} aria-hidden="true" /></span></Link>
      <Link className="management-card" to="/management/articoli-dismessi"><span className="management-card-icon"><Archive size={25} aria-hidden="true" /></span><h2>Articoli dismessi</h2><p>Consulta il materiale da noleggio dismesso e il suo storico di utilizzo e riparazioni.</p><span className="management-card-action">Vedi articoli dismessi <ArrowUpRight size={17} aria-hidden="true" /></span></Link>
    </div>
  </div>;
}
