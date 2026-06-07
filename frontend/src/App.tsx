import { useEffect, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { NotificationProvider, useNotify } from './contexts/NotificationContext';
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

/**
 * OfflineNotifier — naslouchá zprávám ze Service Workeru.
 *
 * Když SW servíruje API data z cache (uživatel je offline), pošle postMessage
 * s { type: 'OFFLINE_CACHE' }. Tato komponenta zprávu zachytí a zobrazí
 * upozornění přes notify(). Při obnovení připojení zobrazí "zpět online".
 *
 * Musí být uvnitř <NotificationProvider>, proto je jako separátní komponenta.
 */
function OfflineNotifier() {
  const { notify } = useNotify();
  // Ref zabraňuje duplicitní notifikaci, když více API endpointů selže naráz.
  const shownRef = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Zpráva ze SW → zobraz upozornění (jen jednou za offline epizodu)
    const swHandler = (event: MessageEvent) => {
      if (event.data?.type === 'OFFLINE_CACHE' && !shownRef.current) {
        shownRef.current = true;
        notify(
          '📵 Jste offline — zobrazuji data uložená v mezipaměti.',
          'warning',
          0   // 0 = notifikace zůstane, dokud ji uživatel neodmítne (× tlačítko)
        );
      }
    };

    // Návrat online → zruš příznak a informuj uživatele
    const onlineHandler = () => {
      if (shownRef.current) {
        shownRef.current = false;
        notify('✅ Připojení k internetu obnoveno.', 'success', 4000);
      }
    };

    navigator.serviceWorker.addEventListener('message', swHandler);
    window.addEventListener('online', onlineHandler);

    return () => {
      navigator.serviceWorker.removeEventListener('message', swHandler);
      window.removeEventListener('online', onlineHandler);
    };
  }, [notify]);

  return null; // Komponenta nic nevykresluje, jen poslouchá
}

function App() {

  return (
    // AuthProvider: jeden authcheck při startu, sdíleno celou aplikací
    <AuthProvider>
      {/* NotificationProvider: toast notifikace dostupné odkudkoliv */}
      <NotificationProvider>
        {/* Naslouchá offline zprávám ze Service Workeru */}
        <OfflineNotifier />
        <Routes>
          {/* Veřejné routy — dostupné bez přihlášení */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/aktivace" element={<Activation />} />
          <Route path="/zapomenute-heslo" element={<ForgotPassword />} />
          <Route path="/reset-hesla" element={<ResetPassword />} />

          {/* Chráněné routy — ProtectedRoute přesměruje na /login pokud není session */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/borrowings" element={<ProtectedRoute><Borrowings /></ProtectedRoute>} />
          <Route path="/equipment" element={<ProtectedRoute><Equipment /></ProtectedRoute>} />
          <Route path="/map" element={<ProtectedRoute><MapLocations /></ProtectedRoute>} />

          {/* Admin only — ProtectedRoute s requireAdmin přesměruje non-adminy na /dashboard */}
          <Route path="/admin" element={<ProtectedRoute requireAdmin><Admin /></ProtectedRoute>} />
        </Routes>
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;
