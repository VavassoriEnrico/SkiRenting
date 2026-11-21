import { ChartNoAxesColumnIncreasing, ChevronDown, House } from 'lucide-react';
import { useState } from 'react';

import { StatCard } from '../../components/ui/StatCard';
import { financeCards, operationalSections, periods } from './demo-data';
import type { Period } from './demo-data';

export function DashboardPage() {
  const [period, setPeriod] = useState<Period>('week');
  const data = periods[period];
  const maxRentals = Math.max(...data.bars.map((bar) => bar.value));

  return (
    <div className="dashboard-page">
      <div className="dashboard-heading">
        <div>
          <div className="page-heading">
            <span className="heading-icon"><House size={21} aria-hidden="true" /></span>
            <h1>Dashboard</h1>
          </div>
          <p className="page-description">Tutto il tuo noleggio, a colpo d’occhio.</p>
        </div>
        <span className="demo-badge"><span aria-hidden="true" />Dati dimostrativi</span>
      </div>

      <div className="stats-sections">
        {operationalSections.map((section) => (
          <section
            key={section.id}
            className="stats-section tone-indigo"
            aria-labelledby={`${section.id}-title`}
          >
            <div className="section-heading">
              <h2 id={`${section.id}-title`}>{section.title}</h2>
              <p>{section.subtitle}</p>
            </div>
            <div className="stats-grid">
              {section.items.map((item) => <StatCard key={item.label} {...item} />)}
            </div>
          </section>
        ))}

        <section className="stats-section tone-indigo" aria-labelledby="finance-title">
          <div className="section-heading section-heading-with-control">
            <div>
              <h2 id="finance-title">Incassi</h2>
              <p>L’andamento economico del noleggio</p>
            </div>
            <div className="period-select">
              <label className="sr-only" htmlFor="finance-period">Periodo incassi e noleggi</label>
              <select id="finance-period" value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
                {Object.entries(periods).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </div>
          </div>
          <div className="stats-grid" aria-live="polite" aria-atomic="true">
            {financeCards(period).map((item) => <StatCard key={item.label} {...item} />)}
          </div>
        </section>
      </div>

      <div className="charts-grid">
        <section className="chart-card rentals-chart" aria-labelledby="rentals-chart-title">
          <div className="chart-heading">
            <div>
              <p className="chart-eyebrow">Andamento noleggi</p>
              <h2 id="rentals-chart-title">Noleggi nel periodo</h2>
              <p className="chart-subtitle">{data.label} · dati dimostrativi</p>
            </div>
            <ChartNoAxesColumnIncreasing size={22} aria-hidden="true" />
          </div>
          <div className="bar-chart" role="img" aria-label={
            `Noleggi, ${data.label}: ${data.bars.map((bar) => `${bar.label}: ${bar.value}`).join(', ')}`
          }>
            {data.bars.map((bar) => (
              <div className="bar-column" key={bar.label}>
                <div className="bar-track">
                  <div className="chart-bar" style={{ height: `${bar.value / maxRentals * 85}%` }}>
                    <span>{bar.value}</span>
                  </div>
                </div>
                <span className="bar-label">{bar.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="chart-card equipment-chart" aria-labelledby="equipment-chart-title">
          <div className="chart-heading">
            <div>
              <p className="chart-eyebrow">Parco attrezzatura</p>
              <h2 id="equipment-chart-title">Stato degli articoli</h2>
              <p className="chart-subtitle">Una vista sulla disponibilità complessiva</p>
            </div>
          </div>
          <div className="equipment-overview">
            <div className="donut-chart" role="img" aria-label="240 articoli: 176 disponibili, 48 a noleggio, 16 in manutenzione">
              <div className="donut-center"><strong>240</strong><span>articoli totali</span></div>
            </div>
            <ul className="chart-legend">
              <li><span className="legend-dot available" /><span>Disponibili</span><strong>176</strong></li>
              <li><span className="legend-dot rented" /><span>A noleggio</span><strong>48</strong></li>
              <li><span className="legend-dot maintenance" /><span>In manutenzione</span><strong>16</strong></li>
            </ul>
          </div>
        </section>
      </div>

      <p className="dashboard-footnote">Anteprima con dati di esempio, in attesa di definire le funzionalità del gestionale.</p>
    </div>
  );
}
