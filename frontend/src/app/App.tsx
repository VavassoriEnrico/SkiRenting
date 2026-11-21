import { Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from '../components/layout/AppLayout';
import { AnalyticsPage } from '../pages/analytics/AnalyticsPage';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { RentalsPage } from '../pages/rentals/RentalsPage';
import { InventoryPage } from '../pages/inventory/InventoryPage';
import { SalesPage } from '../pages/sales/SalesPage';
import { OperationsPage } from '../pages/operations/OperationsPage';
import { ReturnsPage } from '../pages/returns/ReturnsPage';
import { RequireAuth } from '../auth/RequireAuth';
import { LoginPage } from '../pages/login/LoginPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/noleggi" element={<RentalsPage />} />
        <Route path="/vendite" element={<SalesPage />} />
        <Route path="/operativita/noleggi" element={<OperationsPage mode="rental" />} />
        <Route path="/operativita/vendite" element={<OperationsPage mode="sale" />} />
        <Route path="/operativita/rientri" element={<ReturnsPage />} />
        <Route path="/materiale-noleggio" element={<InventoryPage key="rental" mode="rental" />} />
        <Route path="/materiale-vendita" element={<InventoryPage key="sale" mode="sale" />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
      </Route>
    </Routes>
  );
}
