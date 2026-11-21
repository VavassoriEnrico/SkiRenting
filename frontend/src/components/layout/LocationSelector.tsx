import { ChevronDown, MapPin } from 'lucide-react';
import { useId } from 'react';

import { useAuth } from '../../auth/AuthProvider';

export function LocationSelector({ compact = false }: { compact?: boolean }) {
  const { operator, location, selectLocation, switchingLocation, locationError } = useAuth();
  const id = useId();
  return (
    <div className={`location-selector${compact ? ' is-compact' : ''}`}>
      <label htmlFor={`${id}-location`} className={compact ? 'sr-only' : undefined}>Sede di lavoro</label>
      <div className="location-select-control">
        {compact && <MapPin size={19} aria-hidden="true" />}
        <select id={`${id}-location`} title={compact ? `Sede: ${location?.name}` : undefined} value={location?.id ?? ''} onChange={(event) => void selectLocation(event.target.value)} disabled={switchingLocation} aria-busy={switchingLocation} aria-describedby={locationError ? `${id}-error` : undefined}>
          {operator?.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {!compact && <ChevronDown size={15} aria-hidden="true" />}
      </div>
      {locationError && <p className="location-error" id={`${id}-error`} role="alert">{locationError}</p>}
      <span className="sr-only" role="status">{switchingLocation ? 'Cambio sede in corso…' : `Sede attiva: ${location?.name ?? ''}`}</span>
    </div>
  );
}
