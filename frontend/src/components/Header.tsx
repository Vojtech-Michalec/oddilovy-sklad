import { Navbar, Nav, Container, Button } from 'react-bootstrap';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotify } from '../contexts/NotificationContext';
import { useDarkMode } from '../hooks/useDarkMode';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { notify } = useNotify();
  const [isDark, toggleDark] = useDarkMode();

  const handleLogout = async () => {
    await logout();
    notify('Byli jste odhlášeni.', 'info');
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <Navbar bg="primary" variant="light" expand="lg" className="shadow-sm mb-4">
      <Container>
        <Navbar.Brand as={Link} to="/dashboard" className="d-flex align-items-center fw-bold">
          <svg
            xmlns="http://www.w3.org/2000/svg" width="24" height="24"
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="me-2 text-warning"
          >
            <path d="M18 21V10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v11"/>
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 1.132-1.803l7.95-3.974a2 2 0 0 1 1.837 0l7.948 3.974A2 2 0 0 1 22 8z"/>
            <path d="M6 13h12"/><path d="M6 17h12"/>
          </svg>
          Oddílový sklad
        </Navbar.Brand>

        <Navbar.Toggle aria-controls="nav-main" />
        <Navbar.Collapse id="nav-main">
          <Nav className="me-auto">
            <Nav.Link as={Link} to="/dashboard" active={isActive('/dashboard')}>
              Úvod
            </Nav.Link>
            <Nav.Link as={Link} to="/borrowings" active={isActive('/borrowings')}>
              Půjčovna
            </Nav.Link>
            <Nav.Link as={Link} to="/equipment" active={isActive('/equipment')}>
              Předměty a odpisy
            </Nav.Link>
            <Nav.Link as={Link} to="/map" active={isActive('/map')}>
              Mapa skladů
            </Nav.Link>
            {/* Admin odkaz se zobrazí jen administrátorům */}
            {user?.role === 'admin' && (
              <Nav.Link as={Link} to="/admin" active={isActive('/admin')}>
                Správa uživatelů
              </Nav.Link>
            )}
          </Nav>

          <Nav className="align-items-center gap-2">
            {/* Dark mode přepínač */}
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={toggleDark}
              title={isDark ? 'Přepnout na světlý režim' : 'Přepnout na tmavý režim'}
              style={{ width: 36, height: 36, padding: 0, fontSize: 16 }}
            >
              {isDark ? '☀️' : '🌙'}
            </Button>

            {/* Jméno přihlášeného uživatele */}
            {user && (
              <span className="text-white-50 small d-none d-lg-inline">
                {user.name}
              </span>
            )}

            <Button variant="outline-light" size="sm" onClick={handleLogout}>
              Odhlásit se
            </Button>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}
