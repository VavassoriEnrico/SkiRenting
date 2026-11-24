import { useSearchParams } from 'react-router-dom';

import { GeneralInventoryPage } from './GeneralInventoryPage';
import { InventoryPage } from './InventoryPage';

export function UnifiedInventoryPage({general=false}:{general?:boolean}) {
  const [params,setParams]=useSearchParams();
  const mode=params.get('tipo')==='vendita'?'sale':'rental';
  return <>
    <div className="page-mode-switch category-filters" role="group" aria-label={general?'Tipo di magazzino generale':'Tipo di magazzino sede'}>
      <button type="button" className={`category-filter${mode==='rental'?' is-selected':''}`} aria-pressed={mode==='rental'} onClick={()=>setParams({})}>Noleggio</button>
      <button type="button" className={`category-filter${mode==='sale'?' is-selected':''}`} aria-pressed={mode==='sale'} onClick={()=>setParams({tipo:'vendita'})}>Vendita</button>
    </div>
    {general?<GeneralInventoryPage mode={mode}/>:<InventoryPage key={mode} mode={mode}/>}
  </>;
}
