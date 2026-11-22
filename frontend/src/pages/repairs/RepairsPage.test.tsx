import { cleanup,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { RepairsPage } from './RepairsPage';

const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),auth:{session:{access_token:'token'},location:{id:'site-a',name:'Madesimo'}}}));
vi.mock('../../auth/AuthProvider',()=>({useAuth:()=>mocks.auth}));
vi.mock('../../lib/api',()=>({apiGet:mocks.get,apiPost:mocks.post}));
const repair={id:'repair',rental_inventory_id:'item',repair_type:'wax',sent_at:'2026-11-22T10:00:00Z',notes:'Lavoro',item:{id:'item',code:'+001',variant:{brand:'Marca',model:'Modello',category:{name:'Sci'},ski_details:{length_cm:164}}}};
beforeEach(()=>{mocks.get.mockReset().mockResolvedValue([repair]);mocks.post.mockReset().mockResolvedValue({id:'new'});mocks.auth.location={id:'site-a',name:'Madesimo'};});
afterEach(cleanup);
describe('Riparazioni operative',()=>{
  it('shows current-site jobs and searches by code or brand',async()=>{
    render(<RepairsPage/>);await screen.findByText('+001');
    expect(mocks.get).toHaveBeenCalledWith('/locations/site-a/repairs','token',expect.any(AbortSignal));
    fireEvent.change(screen.getByRole('searchbox'),{target:{value:'NONPRESENTE'}});
    expect(screen.queryByText('+001')).toBeNull();
    expect(screen.getByText('Nessuna riparazione corrisponde alla ricerca.')).toBeTruthy();
  });
  it('registers a repair by code and refreshes the list',async()=>{
    render(<RepairsPage/>);await screen.findByText('+001');
    fireEvent.change(screen.getByLabelText('Codice materiale'),{target:{value:' +002 '}});
    fireEvent.change(screen.getByLabelText('Intervento'),{target:{value:'edges'}});
    fireEvent.click(screen.getByRole('button',{name:'Segna in riparazione'}));
    await screen.findByText('Articolo +002 segnato in riparazione.');
    expect(mocks.post).toHaveBeenCalledWith('/locations/site-a/repairs','token',{repair_id:expect.any(String),code:'+002',repair_type:'edges',notes:null},expect.any(AbortSignal));
    expect((screen.getByLabelText('Codice materiale') as HTMLInputElement).value).toBe('');
  });
  it('keeps the request ID for retry and does not replace load errors with an empty list',async()=>{
    mocks.get.mockRejectedValueOnce(new Error('Errore elenco'));
    mocks.post.mockRejectedValueOnce(new Error('Errore salvataggio')).mockResolvedValueOnce({id:'new'});
    render(<RepairsPage/>);await screen.findByText('Errore elenco');
    expect(screen.queryByText('Nessuna riparazione da effettuare.')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Riprova riparazioni'}));await screen.findByText('+001');
    fireEvent.change(screen.getByLabelText('Codice materiale'),{target:{value:'+002'}});
    fireEvent.click(screen.getByRole('button',{name:'Segna in riparazione'}));await screen.findByText('Errore salvataggio');
    fireEvent.click(screen.getByRole('button',{name:'Segna in riparazione'}));await screen.findByText('Articolo +002 segnato in riparazione.');
    expect(mocks.post.mock.calls[0][2].repair_id).toBe(mocks.post.mock.calls[1][2].repair_id);
  });
});
