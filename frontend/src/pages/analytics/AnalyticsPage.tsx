import { ChartNoAxesCombined } from 'lucide-react';

export function AnalyticsPage() {
  return (
    <div className="dashboard-page">
      <div className="dashboard-heading">
        <div>
          <div className="page-heading">
            <span className="heading-icon"><ChartNoAxesCombined size={21} aria-hidden="true" /></span>
            <h1>Analytics</h1>
          </div>
          <p className="page-description">Uno spazio dedicato alle analisi del tuo noleggio.</p>
        </div>
      </div>

      <section className="analytics-placeholder" aria-labelledby="analytics-placeholder-title">
        <span className="analytics-placeholder-icon"><ChartNoAxesCombined size={30} aria-hidden="true" /></span>
        <h2 id="analytics-placeholder-title">Le tue analisi, qui</h2>
        <p>Le metriche e i report di questa pagina verranno definiti più avanti.</p>
      </section>
    </div>
  );
}
