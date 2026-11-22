import type { RentalItem } from '../inventory/rental-inventory';
export const repairTypes = { edges:'Lamine', wax:'Sciolina', edges_and_wax:'Lamine e sciolina', other:'Altro' } as const;
export type RepairType = keyof typeof repairTypes;
export type OpenRepair = { id:string; repair_type:RepairType; sent_at:string };
export type Repair = OpenRepair & { rental_inventory_id:string; notes:string|null; item:RentalItem };
