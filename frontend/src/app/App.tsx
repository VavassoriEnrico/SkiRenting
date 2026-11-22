import { Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from '../components/layout/AppLayout';
import { AnalyticsPage } from '../pages/analytics/AnalyticsPage';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { CustomersPage } from '../pages/customers/CustomersPage';
import { RentalsPage } from '../pages/rentals/RentalsPage';
import { GeneralInventoryPage } from '../pages/inventory/GeneralInventoryPage';
import { InventoryPage } from '../pages/inventory/InventoryPage';
import { SalesPage } from '../pages/sales/SalesPage';
import { OperationsPage } from '../pages/operations/OperationsPage';
import { RepairsPage } from '../pages/repairs/RepairsPage';
import { ReturnsPage } from '../pages/returns/ReturnsPage';
import { RequireAuth } from '../auth/RequireAuth';
import { LoginPage } from '../pages/login/LoginPage';
import { ManagementPage } from '../pages/management/ManagementPage';
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
        <Route path="/management/hotels" element={<HotelsPage />} />
        <Route path="/management/tariffe" element={<RentalRatesPage />} />
        <Route path="/noleggi" element={<RentalsPage />} />
        <Route path="/vendite" element={<SalesPage />} />
        <Route path="/operativita/noleggi" element={<OperationsPage mode="rental" />} />
        <Route path="/operativita/vendite" element={<OperationsPage mode="sale" />} />
        <Route path="/operativita/rientri" element={<ReturnsPage />} />
        <Route path="/operativita/riparazioni" element={<RepairsPage />} />
        <Route path="/magazzino-generale" element={<GeneralInventoryPage />} />
        <Route path="/materiale-noleggio" element={<InventoryPage key="rental" mode="rental" />} />
        <Route path="/materiale-vendita" element={<InventoryPage key="sale" mode="sale" />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
      </Route>
    </Routes>
  );
}
