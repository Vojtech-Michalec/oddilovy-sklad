import { useState } from 'react';
import { Form, Button, Container, Card } from 'react-bootstrap';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useNotify } from '../contexts/NotificationContext';
import { API } from '../api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { notify } = useNotify();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <Container className="d-flex align-items-center justify-content-center vh-100">
        <Card className="p-4 text-center border-0 shadow-sm" style={{ width: 400 }}>
          <p className="text-danger fw-bold">Neplatný odkaz — chybí token.</p>
          <Link to="/login">Zpět na přihlášení</Link>
        </Card>
      </Container>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      notify('Hesla se neshodují.', 'warning');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      notify('Heslo bylo změněno. Přihlaste se.', 'success');
      navigate('/login');
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh' }}>
      <Card style={{ width: 400 }} className="p-4 border rounded shadow-sm">
        <h2 className="text-center mb-4">Nové heslo</h2>

        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Label>Nové heslo <span className="text-muted small">(min. 6 znaků)</span></Form.Label>
            <Form.Control
              type="password" required minLength={6} autoComplete="new-password"
              value={password} onChange={e => setPassword(e.target.value)}
            />
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>Potvrďte heslo</Form.Label>
            <Form.Control
              type="password" required autoComplete="new-password"
              value={confirm} onChange={e => setConfirm(e.target.value)}
            />
          </Form.Group>
          <Button type="submit" variant="primary" className="w-100 py-2 fw-bold" disabled={loading}>
            {loading ? 'Ukládám...' : 'Nastavit heslo'}
          </Button>
        </Form>
      </Card>
    </Container>
  );
}
