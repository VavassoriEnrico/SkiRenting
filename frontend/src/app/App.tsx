import { Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from '../components/layout/AppLayout';
import { AnalyticsPage } from '../pages/analytics/AnalyticsPage';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { CustomersPage } from '../pages/customers/CustomersPage';
import { UnifiedRentalsPage } from '../pages/rentals/UnifiedRentalsPage';
import { UnifiedInventoryPage } from '../pages/inventory/UnifiedInventoryPage';
import { SalesPage } from '../pages/sales/SalesPage';
import { OperationsPage } from '../pages/operations/OperationsPage';
import { RepairsPage } from '../pages/repairs/RepairsPage';
import { ReturnsPage } from '../pages/returns/ReturnsPage';
import { RequireAuth } from '../auth/RequireAuth';
import { LoginPage } from '../pages/login/LoginPage';
import { RetiredItemsPage } from '../pages/management/RetiredItemsPage';
import { ManagementPage } from '../pages/management/ManagementPage';
import { SeasonalRatesPage } from '../pages/seasonal/SeasonalRatesPage';
import { NewRentalPage } from '../pages/operations/NewRentalPage';
import { PromotionsPage } from '../pages/management/PromotionsPage';
import { HotelsPage } from '../pages/management/HotelsPage';
import { RentalRatesPage } from '../pages/management/RentalRatesPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/clienti" element={<CustomersPage />} />
        <Route path="/management" element={<ManagementPage />} />
        <Route path="/management/articoli-dismessi" element={<RetiredItemsPage />} />
        <Route path="/management/tariffe-stagionali" element={<SeasonalRatesPage/>}/>
        <Route path="/management/promozioni" element={<PromotionsPage />} />
        <Route path="/management/hotels" element={<HotelsPage />} />
        <Route path="/management/tariffe" element={<RentalRatesPage />} />
        <Route path="/noleggi/stagionali/attuali" element={<Navigate to="/noleggi/attuali?tipo=stagionale" replace/>}/>
        <Route path="/noleggi/stagionali" element={<Navigate to="/noleggi?tipo=stagionale" replace/>}/>
        <Route path="/noleggi/attuali" element={<UnifiedRentalsPage view="current" />} />
        <Route path="/noleggi" element={<UnifiedRentalsPage view="history" />} />
        <Route path="/vendite" element={<SalesPage />} />
        <Route path="/operativita/noleggi-stagionali" element={<Navigate to="/operativita/noleggi?tipo=stagionale" replace/>}/>
        <Route path="/operativita/noleggi" element={<NewRentalPage />} />
        <Route path="/operativita/vendite" element={<OperationsPage mode="sale" />} />
        <Route path="/operativita/rientri" element={<ReturnsPage />} />
        <Route path="/operativita/riparazioni" element={<RepairsPage />} />
        <Route path="/magazzino-generale" element={<UnifiedInventoryPage general/>} />
        <Route path="/magazzino-generale-vendite" element={<Navigate to="/magazzino-generale?tipo=vendita" replace/>} />
        <Route path="/magazzino-sede" element={<UnifiedInventoryPage/>} />
        <Route path="/materiale-noleggio" element={<Navigate to="/magazzino-sede" replace/>} />
        <Route path="/materiale-vendita" element={<Navigate to="/magazzino-sede?tipo=vendita" replace/>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
      </Route>
    </Routes>
  );
}
