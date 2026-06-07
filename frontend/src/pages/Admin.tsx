import { useEffect, useState } from 'react';
import { Container, Card, Table, Badge, Spinner, Button, Alert } from 'react-bootstrap';
import Header from '../components/Header';
import { useNotify } from '../contexts/NotificationContext';
import { API } from '../api';

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
  is_active: number;
  is_blocked: number;
  login_count: number;
  last_login_at: string | null;
  last_online: string | null;
  created_at: string;
}

function formatTs(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('cs-CZ', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export default function Admin() {
  const { notify } = useNotify();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API}/api/admin/users`, { credentials: 'include' });
      if (!res.ok) throw new Error('Nepodařilo se načíst uživatele.');
      setUsers(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const toggleBlock = async (user: UserRow) => {
    const action = user.is_blocked ? 'odblokovat' : 'zablokovat';
    if (!confirm(`Opravdu chcete ${action} uživatele ${user.name}?`)) return;

    try {
      const res = await fetch(`${API}/api/admin/users/${user.id}/block`, {
        method: 'PATCH',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      notify(data.message, 'success');
      fetchUsers();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header />
      <Container className="pb-5">
        <h2 className="fw-bold mb-4">Správa uživatelů</h2>

        {error && <Alert variant="danger">{error}</Alert>}

        <Card className="shadow-sm border-1 rounded">
          <Card.Body className="p-0">
            {loading ? (
              <div className="text-center p-5">
                <Spinner animation="border" variant="primary" />
              </div>
            ) : (
              <Table hover responsive className="m-0 align-middle small">
                <thead>
                  <tr>
                    <th className="ps-4">Jméno</th>
                    <th>E-mail</th>
                    <th className="text-center">Role</th>
                    <th className="text-center">Přihlášení</th>
                    <th>Poslední aktivita</th>
                    <th>Registrace</th>
                    <th className="text-center">Stav</th>
                    <th className="pe-4 text-end">Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className={u.is_blocked ? 'table-danger' : ''}>
                      <td className="ps-4 fw-bold">{u.name}</td>
                      <td className="text-muted">{u.email}</td>
                      <td className="text-center">
                        <Badge bg={u.role === 'admin' ? 'warning' : 'secondary'} text="dark">
                          {u.role}
                        </Badge>
                      </td>
                      <td className="text-center">{u.login_count}×</td>
                      <td>{formatTs(u.last_online)}</td>
                      <td>{formatTs(u.created_at)}</td>
                      <td className="text-center">
                        {!u.is_active
                          ? <Badge bg="secondary">Neaktivní</Badge>
                          : u.is_blocked
                            ? <Badge bg="danger">Blokován</Badge>
                            : <Badge bg="success">Aktivní</Badge>}
                      </td>
                      <td className="pe-4 text-end">
                        {u.role !== 'admin' && (
                          <Button
                            size="sm"
                            variant={u.is_blocked ? 'outline-success' : 'outline-danger'}
                            onClick={() => toggleBlock(u)}
                          >
                            {u.is_blocked ? 'Odblokovat' : 'Zablokovat'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
}
