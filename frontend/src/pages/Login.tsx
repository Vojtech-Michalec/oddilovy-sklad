import { useState } from 'react';
import { Form, Button, Container, Card } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotify } from '../contexts/NotificationContext';
import { API } from '../api';

export default function Login() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const { notify } = useNotify();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Přihlášení se nezdařilo.');
      await refresh();
      notify(`Vítej, ${data.user.name}!`, 'success');
      navigate('/dashboard');
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh' }}>
      <Card style={{ width: 400 }} className="p-4 border rounded shadow-sm">
        <h2 className="text-center mb-4">Přihlášení</h2>

        <Form onSubmit={handleLogin}>
          <Form.Group className="mb-3">
            <Form.Label>E-mail</Form.Label>
            <Form.Control
              type="email" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)}
            />
          </Form.Group>

          <Form.Group className="mb-4">
            <Form.Label>Heslo</Form.Label>
            <Form.Control
              type="password" required autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)}
            />
          </Form.Group>

          <Button type="submit" variant="primary" className="w-100 mb-3 py-2 fw-bold" disabled={loading}>
            {loading ? 'Přihlašování...' : 'Přihlásit se'}
          </Button>
        </Form>

        <div className="text-center text-muted small">
          <Link to="/zapomenute-heslo" className="text-decoration-none">Zapomenuté heslo?</Link>
          {' · '}
          Nemáte účet?{' '}
          <Link to="/register" className="text-decoration-none">Zaregistrujte se</Link>
        </div>
      </Card>
    </Container>
  );
}
