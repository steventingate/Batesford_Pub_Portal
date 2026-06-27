import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import ContactDetail from './pages/ContactDetail';
import Campaigns from './pages/Campaigns';
import CampaignNew from './pages/CampaignNew';
import CampaignDetail from './pages/CampaignDetail';
import Settings from './pages/Settings';
import Debug from './pages/Debug';
import Traces from './pages/Traces';
import Automations from './pages/Automations';
import Analytics from './pages/Analytics';
import Engagement from './pages/Engagement';
import Segments from './pages/Segments';
import Reports from './pages/Reports';
import Vouchers from './pages/Vouchers';
import Events from './pages/Events';

export default function App() {
  return (
    <Routes>
      <Route path="/debug" element={<Debug />} />
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="guests" element={<Contacts />} />
          <Route path="guests/:id" element={<ContactDetail />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="contacts/:id" element={<ContactDetail />} />
          <Route path="campaigns" element={<Campaigns />} />
          <Route path="campaigns/new" element={<CampaignNew />} />
          <Route path="campaigns/:id" element={<CampaignDetail />} />
          <Route path="vouchers" element={<Vouchers />} />
          <Route path="events" element={<Events />} />
          <Route path="automations" element={<Automations />} />
          <Route path="insights" element={<Analytics />} />
          <Route path="analytics" element={<Navigate to="/insights" replace />} />
          <Route path="reports" element={<Reports />} />
          <Route path="traces" element={<Traces />} />
          <Route path="engagement" element={<Engagement />} />
          <Route path="segments" element={<Segments />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
