import { Link } from 'react-router-dom';
import type { RentalPeriod } from '../operations/RentalPeriodFields';
import { RentalSection } from '../operations/RentalSection';
import type { RentalSeason } from './seasonal';

export function SeasonalPeriodFields({season,error,period,onChange}:{season:RentalSeason|null;error:string;period:RentalPeriod;onChange:(period:RentalPeriod)=>void}){
  return <RentalSection id="rental-period" title="Stagione e consegna">
    <div className="rental-customer-body">
      {error?<p className="auth-error" role="alert">{error}</p>:!season?<p className="rental-form-hint">Configura prima la stagione e la data comune di consegna in <Link to="/management/tariffe-stagionali">Tariffe stagionali</Link>.</p>:<>
        <div className="rental-form-grid"><label>Stagione<input value={season.name} readOnly/></label><label>Data di inizio *<input type="date" required max={season.return_date} value={period.starts_on} onChange={event=>onChange({...period,starts_on:event.target.value})}/></label><label>Consegna stagionale<input type="date" value={season.return_date} readOnly/></label></div>
        <p className="rental-form-hint">La data di consegna è comune alla stagione e si imposta in Gestione → Tariffe stagionali.</p>
        {period.starts_on>season.return_date&&<p className="auth-error" role="alert">L’inizio non può essere successivo alla consegna stagionale.</p>}
      </>}
    </div>
  </RentalSection>;
}
