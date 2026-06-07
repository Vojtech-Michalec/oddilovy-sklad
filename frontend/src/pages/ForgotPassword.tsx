import { useState } from 'react';
import { Form, Button, Container, Card } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useNotify } from '../contexts/NotificationContext';
import { API } from '../api';

export default function ForgotPassword() {
  const { notify } = useNotify();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSent(true);
      notify('Pokud e-mail existuje, byl odeslán odkaz pro reset hesla.', 'success', 8000);
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh' }}>
      <Card style={{ width: 400 }} className="p-4 shadow-sm border rounded shadow-sm">
        <h2 className="text-center mb-2">Zapomenuté heslo</h2>
        <p className="text-muted text-center small mb-4">
          Zadejte svůj e-mail a my vám pošleme odkaz pro reset hesla.
        </p>

        {!sent ? (
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-4">
              <Form.Label>E-mail</Form.Label>
              <Form.Control
                type="email" required autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)}
              />
            </Form.Group>
            <Button type="submit" variant="primary" className="w-100 mb-3 py-2 fw-bold" disabled={loading}>
              {loading ? 'Odesílám...' : 'Odeslat odkaz'}
            </Button>
          </Form>
        ) : (
          <p className="text-center text-success">
            Odkaz byl odeslán. Zkontrolujte svůj e-mail.
          </p>
        )}

        <div className="text-center text-muted small">
          <Link to="/login" className="text-decoration-none">Zpět na přihlášení</Link>
        </div>
      </Card>
    </Container>
  );
}
