import { CalendarPlus, ShoppingCart } from 'lucide-react';

const workflows = {
  rental: {
    title: 'Nuovo noleggio',
    description: 'Lo spazio operativo per creare e gestire un noleggio.',
    icon: CalendarPlus,
    steps: [
      { title: 'Cliente', description: 'Dati anagrafici, contatti, albergo, note e foto del documento.' },
      { title: 'Materiale e periodo', description: 'Date del noleggio e assegnazione degli esemplari tramite codice.' },
      { title: 'Pagamenti', description: 'Registrazione degli importi e dello storico dei pagamenti separati.' },
      { title: 'Preparazione e rientro', description: 'Gestione della consegna e del rientro del materiale.' },
    ],
  },
  sale: {
    title: 'Nuova vendita',
    description: 'Lo spazio operativo per effettuare una vendita.',
    icon: ShoppingCart,
    steps: [
      { title: 'Cliente', description: 'Nome, cognome, cellulare ed email prima della selezione del materiale.' },
      { title: 'Materiale', description: 'Selezione degli articoli del magazzino vendita tramite codice univoco.' },
      { title: 'Pagamento e conferma', description: 'Scelta del metodo di pagamento e conferma della vendita.' },
      { title: 'Ricevuta e magazzino', description: 'Aggiornamento delle disponibilità e generazione della ricevuta.' },
    ],
  },
};

export function OperationsPage({ mode }: { mode: keyof typeof workflows }) {
  const workflow = workflows[mode];
  const Icon = workflow.icon;

  return (
    <div className="dashboard-page">
      <div className="dashboard-heading">
        <div>
          <div className="page-heading"><span className="heading-icon"><Icon size={21} aria-hidden="true" /></span><h1>{workflow.title}</h1></div>
          <p className="page-description">{workflow.description}</p>
        </div>
        <span className="demo-badge"><span aria-hidden="true" />In preparazione</span>
      </div>
      <section className="operations-preview" aria-labelledby="workflow-title">
        <h2 id="workflow-title">Il flusso da realizzare</h2>
        <p className="page-description">Questa pagina ospiterà la funzione operativa. Il flusso non è ancora attivo.</p>
        <ol className="operations-steps">
          {workflow.steps.map((step, index) => (
            <li key={step.title}><span className="operation-step-number" aria-hidden="true">{index + 1}</span><div><h3>{step.title}</h3><p>{step.description}</p></div></li>
          ))}
        </ol>
      </section>
    </div>
  );
}
