import { useSearchParams } from 'react-router-dom';

import { RentalCustomerPage } from './RentalCustomerPage';

export function NewRentalPage() {
  const [params, setParams] = useSearchParams();
  const seasonal = params.get('tipo') === 'stagionale';
  return <>
    <div className="page-mode-switch category-filters" role="group" aria-label="Tipo di nuovo noleggio">
      <button type="button" className={`category-filter${!seasonal?' is-selected':''}`} aria-pressed={!seasonal} onClick={()=>setParams({})}>Giornaliero</button>
      <button type="button" className={`category-filter${seasonal?' is-selected':''}`} aria-pressed={seasonal} onClick={()=>setParams({tipo:'stagionale'})}>Stagionale</button>
    </div>
    <RentalCustomerPage seasonal={seasonal}/>
  </>;
}
