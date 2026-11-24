import { useSearchParams } from 'react-router-dom';

import { SeasonalRentalsPage } from '../seasonal/SeasonalRentalsPage';
import { RentalsPage } from './RentalsPage';

export function UnifiedRentalsPage({view}:{view:'current'|'history'}) {
  const [params,setParams]=useSearchParams();
  const type=params.get('tipo');
  const selected=type==='giornaliero'||type==='stagionale'?type:'tutti';
  return <>
    <div className="page-mode-switch category-filters" role="group" aria-label="Tipo di noleggio">
      {[['tutti','Tutti'],['giornaliero','Giornalieri'],['stagionale','Stagionali']].map(([value,label])=>
        <button key={value} type="button" className={`category-filter${selected===value?' is-selected':''}`} aria-pressed={selected===value} onClick={()=>setParams(value==='tutti'?{}:{tipo:value})}>{label}</button>)}
    </div>
    {selected==='stagionale'?<SeasonalRentalsPage view={view}/>:<RentalsPage view={view} rentalKind={selected==='tutti'?'all':'daily'}/>}
  </>;
}
