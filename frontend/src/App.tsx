import { Routes, Route, Navigate } from 'react-router-dom';
import { NotificationProvider } from './contexts/NotificationContext';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Borrowings from './pages/Borrowings';
import Equipment from './pages/Equipment';
import MapLocations from './pages/Map';
import Activation from './pages/Activation';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Admin from './pages/Admin';

function App() {

  return (
    <AuthProvider>
      <NotificationProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/aktivace" element={<Activation />} />
          <Route path="/zapomenute-heslo" element={<ForgotPassword />} />
          <Route path="/reset-hesla" element={<ResetPassword />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/borrowings" element={<ProtectedRoute><Borrowings /></ProtectedRoute>} />
          <Route path="/equipment" element={<ProtectedRoute><Equipment /></ProtectedRoute>} />
          <Route path="/map" element={<ProtectedRoute><MapLocations /></ProtectedRoute>} />

          <Route path="/admin" element={<ProtectedRoute requireAdmin><Admin /></ProtectedRoute>} />
        </Routes>
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;
