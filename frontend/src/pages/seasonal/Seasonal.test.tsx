import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { SeasonalRatesPage } from './SeasonalRatesPage';
import { SeasonalRentalsPage } from './SeasonalRentalsPage';
import { ManagementPage } from '../management/ManagementPage';
import { RentalCustomerPage } from '../operations/RentalCustomerPage';
import type { RentalItem } from '../inventory/rental-inventory';

const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn()}));
vi.mock('../../auth/AuthProvider',()=>({useAuth:()=>({session:{access_token:'token'},location:{id:'site-a',name:'Madesimo'}})}));
vi.mock('../../lib/api',()=>({apiGet:mocks.get,apiPost:mocks.post,apiPatch:mocks.patch}));
const season={id:'season-one',name:'2026/2027',return_date:'2027-04-30',is_current:true,created_at:'2026-11-23T10:00:00Z'};
const customer={id:'customer',first_name:'Mario',last_name:'Rossi',email:null,phone:null,notes:null};
const ski={id:'ski',code:'ski',name:'Sci'};
const boots={id:'boots',code:'ski_boots',name:'Scarponi sci'};
const poles={id:'poles',code:'poles',name:'Bastoncini'};
const base:RentalItem={id:'ski-item',code:'SCI1',serial_number:null,status:'active',is_bookable:true,is_rentable:true,notes:null,group:{id:'group-ski',name:'RACE'},variant:{id:'v-ski',brand:'Marca',model:'Sci',year:2026,category:ski,ski_details:{length_cm:170},snowboard_details:null,boot_details:null,pole_details:null,helmet_details:null,goggle_details:null,accessory_details:null}};
const boot:RentalItem={...base,id:'boot-item',code:'BOOT1',group:{id:'group-boot',name:'SCARPONI'},variant:{...base.variant,id:'v-boot',model:'Scarpone',category:boots,ski_details:null,boot_details:{size_label:'26'}}};
const pole:RentalItem={...base,id:'pole-item',code:'POLE1',group:{id:'group-pole',name:'BASTONCINI'},variant:{...base.variant,id:'v-pole',model:'Bastoncino',category:poles,ski_details:null,pole_details:{height_cm:120}}};
const items=[base,boot,pole];
const rates=[{id:'rate-ski',group_id:'group-ski',single_price:null,pack_price:null,group:{...base.group,category:ski}},{id:'rate-boot',group_id:'group-boot',single_price:null,pack_price:null,group:{...boot.group,category:boots}}];
const change=(label:string,value:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value}});

beforeEach(()=>{
  mocks.get.mockReset().mockImplementation((path:string)=>Promise.resolve(path==='/seasonal-rentals/settings'?{seasons:[season],current_season:season}:path==='/seasonal-rates'?{rates}:path==='/customers'?[customer]:{categories:[ski,boots,poles],items}));
  mocks.patch.mockReset().mockImplementation((path:string,_token:string,data:object)=>Promise.resolve({...rates.find(rate=>path.endsWith(rate.id)),...data}));
  mocks.post.mockReset();
  HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.setAttribute('open','');});
});
afterEach(cleanup);

it('adds the management card and saves one global delivery date and total single/pack rates',async()=>{
  const card=render(<MemoryRouter><ManagementPage/></MemoryRouter>);
  expect(screen.getByRole('link',{name:/Tariffe stagionali/}).getAttribute('href')).toBe('/management/tariffe-stagionali');
  card.unmount();
  mocks.post.mockResolvedValue({...season,return_date:'2027-05-01'});
  render(<MemoryRouter><SeasonalRatesPage/></MemoryRouter>);
  await screen.findByText('RACE');
  expect(screen.queryByText(/€\/giorno/)).toBeNull();
  change('Imposta data di consegna degli stagionali','2027-05-01');
  fireEvent.click(screen.getByRole('button',{name:'Salva stagione'}));
  await screen.findByText('Stagione e data di consegna salvate.');
  expect(mocks.post).toHaveBeenCalledWith('/seasonal-rentals/settings','token',{id:season.id,name:season.name,return_date:'2027-05-01'},expect.any(AbortSignal));
  change('RACE · Singolo (€)','100');change('RACE · Pack (€)','150');
  fireEvent.click(screen.getByRole('button',{name:'Salva stagionali RACE'}));
  await screen.findByText('Tariffe stagionali di RACE salvate.');
  expect(mocks.patch).toHaveBeenCalledWith('/seasonal-rates/rate-ski','token',{single_price:100,pack_price:150},expect.any(AbortSignal));
  fireEvent.click(screen.getByRole('button',{name:'Scarponi sci'}));
  expect(screen.queryByLabelText('SCARPONI · Pack (€)')).toBeNull();
  expect(screen.getByLabelText('SCARPONI · Singolo (€)')).toBeTruthy();
});

it.each([false,true])('automatically creates a seasonal pack with optional poles (%s)',async(withPoles)=>{
  const selectedItems=withPoles?items:[base,boot];
  mocks.post.mockImplementation((path:string,_token:string,data:any)=>{
    if(path.endsWith('/seasonal-bookings'))return Promise.resolve({id:'booking',booking_number:130,starts_on:data.starts_on,ends_on:season.return_date,status:'confirmed',total:'150',paid_amount:'0',balance:'150',rental_kind:'seasonal'});
    const bundled=[base,boot].every(item=>data.inventory_ids.includes(item.id));
    const bundles=bundled?[{main_id:base.id,boot_id:boot.id,pole_id:data.inventory_ids.includes(pole.id)?pole.id:null}]:[];
    const lines=data.inventory_ids.map((id:string)=>{
      const item=items.find(item=>item.id===id)!;
      const amount=bundled?(id===base.id?'150':'0'):(id===base.id?'100':id===boot.id?'50':'30');
      return{inventory_id:id,code:item.code,brand:item.variant.brand,model:item.variant.model,group_name:item.group.name,daily_price:null,amount,price_mode:bundled?(id===base.id?'pack':'included'):'single',pack_main_id:bundled?base.id:null};
    });
    return Promise.resolve({season,bundles,starts_on:data.starts_on,ends_on:season.return_date,days:151,hotel:null,discount_percent:'0',subtotal:String(lines.reduce((sum:number,line:any)=>sum+Number(line.amount),0)),discount_amount:'0',total:String(lines.reduce((sum:number,line:any)=>sum+Number(line.amount),0)),items:lines,missing_rate_codes:[]});
  });
  render(<MemoryRouter><RentalCustomerPage seasonal/></MemoryRouter>);
  await screen.findByLabelText('Consegna stagionale');
  expect((screen.getByLabelText('Consegna stagionale') as HTMLInputElement).readOnly).toBe(true);
  change('Cognome *','Rossi');fireEvent.click(screen.getByRole('button',{name:/Rossi Mario/}));
  change('Data di inizio *','2026-12-01');
  for(const item of selectedItems){
    await screen.findByLabelText('Codice materiale');
    change('Codice materiale',item.code);
    fireEvent.click(screen.getByRole('button',{name:'Aggiungi codice'}));
    await waitFor(()=>expect(screen.getByText(`Articoli selezionati (${items.indexOf(item)+1})`)).toBeTruthy());
  }
  expect(screen.queryByLabelText('Formula SCI1')).toBeNull();
  await waitFor(()=>expect(screen.getByText('Totale stagionale').parentElement?.textContent?.replace(/\s/g,'')).toContain('150,00€'));
  expect(screen.getByText('Pack 1')).toBeTruthy();
  expect(screen.getAllByText('Incluso nel pack 1')).toHaveLength(selectedItems.length-1);
  fireEvent.click(await screen.findByRole('radio',{name:'Paga dopo'}));
  fireEvent.click(screen.getByRole('button',{name:'Conferma stagionale'}));
  await screen.findByRole('heading',{name:'Noleggio stagionale n. 130 confermato'});
  const call=mocks.post.mock.calls.find(call=>call[0].endsWith('/seasonal-bookings'))!;
  expect(call[2]).toMatchObject({season_id:season.id,expected_return_date:season.return_date,inventory_ids:selectedItems.map(item=>item.id),expected_total:'150',payment:null});
  expect(call[2].ends_on).toBeUndefined();
  expect(call[2].bundles).toBeUndefined();
  expect(mocks.get.mock.calls.some(call=>call[0]==='/hotels')).toBe(false);
});

it('keeps empty settings explicit and never invents seasonal prices',async()=>{
  mocks.get.mockResolvedValue({seasons:[],current_season:null});
  render(<MemoryRouter><SeasonalRentalsPage/></MemoryRouter>);
  expect(await screen.findByText(/Nessuna stagione configurata/)).toBeTruthy();
  expect(screen.queryByRole('button',{name:/Apri noleggio/})).toBeNull();
});

it('switches the seasonal list by season while retaining the selected work site',async()=>{
  const old={...season,id:'old-season',name:'2025/2026',return_date:'2026-04-30',is_current:false};
  mocks.get.mockImplementation((path:string)=>Promise.resolve(path==='/seasonal-rentals/settings'?{seasons:[season,old],current_season:season}:[{
    id:path.includes('old-season')?'old-booking':'booking',booking_number:130,customer,starts_on:'2026-12-01',ends_on:'2027-04-30',status:'confirmed',rental_kind:'seasonal',item_count:3,returned_item_count:0,total:'150',paid_amount:'0',balance:'150',discount_percent:'0',
  }]));
  render(<MemoryRouter><SeasonalRentalsPage/></MemoryRouter>);
  await screen.findByText('Mario Rossi');
  expect(mocks.get).toHaveBeenCalledWith('/locations/site-a/seasonal-bookings?season_id=season-one','token',expect.any(AbortSignal));
  change('Stagione',old.id);
  await waitFor(()=>expect(mocks.get).toHaveBeenCalledWith('/locations/site-a/seasonal-bookings?season_id=old-season','token',expect.any(AbortSignal)));
});
