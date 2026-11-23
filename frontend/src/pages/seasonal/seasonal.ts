import type { RentalQuote } from '../operations/RentalRecapSection';
import type { RentalCategory } from '../inventory/rental-inventory';

export type RentalSeason = { id:string; name:string; return_date:string; is_current:boolean; created_at:string };
export type SeasonalSettings = { seasons:RentalSeason[]; current_season:RentalSeason|null };
export type SeasonalRate = { id:string; group_id:string; single_price:number|null; pack_price:number|null; group:{id:string;name:string;category:RentalCategory} };
export type SeasonalRateList = { rates:SeasonalRate[] };
export type SeasonalBundle = { main_id:string; boot_id:string|null; pole_id:string|null };
export type SeasonalQuote = Omit<RentalQuote,'items'> & { season:RentalSeason; bundles:SeasonalBundle[]; items:(RentalQuote['items'][number]&{price_mode:'single'|'pack'|'included';pack_main_id:string|null})[] };
export const seasonalPackCategory=(code:string)=>['ski','snowboard'].includes(code);
export const localToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome'}).format(new Date());
