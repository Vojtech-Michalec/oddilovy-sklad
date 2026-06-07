import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { API } from '../api';

export default function Activation() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState<string>('Probíhá aktivace účtu, čekejte prosím...');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Neplatný odkaz: Chybí aktivační token.');
      return;
    }

    const activateAccount = async () => {
      try {
        const apiUrl = `${API}/api/auth/activate?token=${token}`;
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const data = await response.json();

        if (response.ok) {
          setStatus('success');
          setMessage(data.message || 'Účet byl úspěšně aktivován.');
        } else {
          setStatus('error');
          setMessage(data.error || 'Při aktivaci došlo k chybě.');
        }
      } catch (err) {
        setStatus('error');
        setMessage('Nepodařilo se spojit se serverem. Zkuste to prosím později.');
        console.error('Chyba při aktivaci:', err);
      }
    };
    activateAccount();
  }, [token]);

  return (
    <div className="d-flex flex-column align-items-center justify-content-center vh-100 p-3">
      <div className="card border rounded shadow-sm w-100" style={{ maxWidth: '450px' }}>
        <div className="card-body p-5 text-center">
          <h1 className="h3 fw-bold mb-4">Aktivace účtu</h1>

          {/* STAV: Načítání */}
          {status === 'loading' && (
            <div className="text-primary">
              <div className="spinner-border mb-3" role="status" style={{ width: '3rem', height: '3rem' }}>
                <span className="visually-hidden">Načítání...</span>
              </div>
              <p className="mb-0 fs-5">{message}</p>
            </div>
          )}

          {/* STAV: Úspěch */}
          {status === 'success' && (
            <div className="text-success">
              <svg className="mx-auto mb-3" width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="mb-4 fs-5">{message}</p>
              <Link 
                to="/login" 
                className="btn btn-primary px-4 py-2 fw-semibold"
              >
                Přejít k přihlášení
              </Link>
            </div>
          )}

          {/* STAV: Chyba */}
          {status === 'error' && (
            <div className="text-danger">
              <svg className="mx-auto mb-3" width="64" height="64" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <p className="mb-4 fs-5">{message}</p>
              <Link 
                to="/" 
                className="btn btn-secondary px-4 py-2 fw-semibold"
              >
                Zpět na hlavní stránku
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}