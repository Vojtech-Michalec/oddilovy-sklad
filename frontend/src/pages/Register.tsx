import { useState } from 'react';
import { Form, Button, Container, Card } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { useNotify } from '../contexts/NotificationContext';
import { API } from '../api';

export default function Register() {
  const navigate = useNavigate();
  const { notify } = useNotify();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registrace se nezdařila.');

      notify('Zkontrolujte e-mail a aktivujte účet kliknutím na odkaz.', 'success', 8000);
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
        <h2 className="text-center mb-4">Registrace</h2>

        <Form onSubmit={handleRegister}>
          <Form.Group className="mb-3">
            <Form.Label>Jméno a příjmení</Form.Label>
            <Form.Control
              type="text" required placeholder="Jan Novák"
              value={name} onChange={e => setName(e.target.value)}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>E-mail</Form.Label>
            <Form.Control
              type="email" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)}
            />
          </Form.Group>

          <Form.Group className="mb-4">
            <Form.Label>Heslo <span className="text-muted small">(min. 6 znaků)</span></Form.Label>
            <Form.Control
              type="password" required minLength={6} autoComplete="new-password"
              value={password} onChange={e => setPassword(e.target.value)}
            />
          </Form.Group>

          <Button type="submit" variant="success" className="w-100 mb-3 py-2 fw-bold" disabled={loading}>
            {loading ? 'Vytvářím účet...' : 'Vytvořit účet'}
          </Button>
        </Form>

        <div className="text-center text-muted small">
          Již máte účet?{' '}
          <Link to="/login" className="text-decoration-none">Přihlaste se</Link>
        </div>
      </Card>
    </Container>
  );
}
