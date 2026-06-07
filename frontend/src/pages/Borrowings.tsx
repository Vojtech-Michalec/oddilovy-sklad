import { useEffect, useState } from 'react';
import { Container, Card, Table, Badge, Spinner, Alert, Button, Modal, Form } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useNotify } from '../contexts/NotificationContext';
import { todayIso, tomorrowIso, formatCz } from '../utils/dateHelpers';
import { API } from '../api';
import {
  findReservationConflicts,
  type BorrowingConflict,
  type ConflictWarning
} from '../utils/borrowHelpers';

interface EquipmentItem {
  id: number;
  name: string;
  category: string;
  total_quantity: number;
  available_quantity: number;
  location_name: string;
}

interface LocationItem { id: number; name: string; }


export default function Borrowings() {
  const navigate = useNavigate();
  const { notify } = useNotify();

  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [userRole, setUserRole] = useState<string>('user');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newQuantity, setNewQuantity] = useState(1);
  const [newLocationId, setNewLocationId] = useState<number | ''>('');

  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<EquipmentItem | null>(null);
  const [removeQuantity, setRemoveQuantity] = useState(1);
  const [removeReason, setRemoveReason] = useState('');

  const [showBorrowModal, setShowBorrowModal] = useState(false);
  const [borrowItem, setBorrowItem] = useState<EquipmentItem | null>(null);
  const [borrowQuantity, setBorrowQuantity] = useState(1);
  const [dateFrom, setDateFrom] = useState(tomorrowIso());
  const [dateTo, setDateTo] = useState('');
  const [borrowStatus, setBorrowStatus] = useState<'active' | 'reservation'>('reservation');
  const [borrowNote, setBorrowNote] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingWarnings, setPendingWarnings] = useState<ConflictWarning[]>([]);

  const [conflicts, setConflicts] = useState<BorrowingConflict[]>([]);
  const [loadingConflicts, setLoadingConflicts] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const authRes = await fetch(`${API}/api/auth/authcheck`, { credentials: 'include' });
      if (authRes.status === 401) { navigate('/login'); return; }
      const authData = await authRes.json();
      setUserRole(authData.user.role);

      const eqRes = await fetch(`${API}/api/equipment`, { credentials: 'include' });
      if (!eqRes.ok) throw new Error('Nepodařilo se načíst data o vybavení.');
      setEquipment(await eqRes.json());

      const locRes = await fetch(`${API}/api/locations`, { credentials: 'include' });
      if (locRes.ok) setLocations(await locRes.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newLocationId === '') return;
    try {
      const res = await fetch(`${API}/api/equipment/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newName, category: newCategory, quantity: newQuantity, location: newLocationId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chyba při přidávání vybavení.');
      setShowAddModal(false);
      setNewName(''); setNewCategory(''); setNewQuantity(1); setNewLocationId('');
      fetchData();
      notify('Vybavení bylo přidáno do skladu.', 'success');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleRemoveEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    if (!removeReason.trim()) {
      notify('Uveďte důvod odpisu.', 'warning');
      return;
    }
    try {
      const res = await fetch(`${API}/api/equipment/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          equipment_id: selectedItem.id,
          amount_to_discard: removeQuantity,
          reason: removeReason
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chyba při odepisování.');
      setShowRemoveModal(false);
      setRemoveReason('');
      fetchData();
      notify(`Odepsáno ${removeQuantity} ks (${selectedItem.name}).`, 'success');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const validateBorrowForm = (): string | null => {
    if (!dateFrom) return 'Vyplňte datum od.';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const from = new Date(dateFrom); from.setHours(0, 0, 0, 0);

    if (borrowStatus === 'reservation') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (from < tomorrow) return 'U rezervace musí být datum od minimálně zítra.';
    } else {
      if (from < today) return 'Datum od nesmí být v minulosti.';
    }

    if (dateTo) {
      const to = new Date(dateTo); to.setHours(0, 0, 0, 0);
      if (to < from) return 'Datum do musí být po datu od.';
      if (borrowStatus === 'reservation' && to < new Date(tomorrowIso())) {
        return 'U rezervace musí být datum do minimálně zítra.';
      }
    }

    if (!borrowItem) return 'Není vybraný předmět.';
    if (borrowQuantity < 1) return 'Počet kusů musí být alespoň 1.';
    if (borrowQuantity > borrowItem.total_quantity) {
      return `Maximální počet kusů ke vzetí je ${borrowItem.total_quantity}.`;
    }

    return null;
  };

  const handleBorrowSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateBorrowForm();
    if (err) { notify(err, 'warning'); return; }
    if (!borrowItem) return;

    if (borrowStatus === 'active') {
      const warnings = findReservationConflicts(conflicts, borrowItem.total_quantity, borrowQuantity);
      if (warnings.length > 0) {
        setPendingWarnings(warnings);
        setShowConfirmModal(true);
        return;
      }
    }

    submitBorrowing();
  };

  const submitBorrowing = async () => {
    if (!borrowItem) return;
    try {
      const res = await fetch(`${API}/api/borrowings/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          equipment_id: borrowItem.id,
          quantity: borrowQuantity,
          date_from: dateFrom,
          date_to: dateTo || null,
          status: borrowStatus,
          note: borrowNote
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chyba při vytváření výpůjčky.');

      setShowBorrowModal(false);
      setShowConfirmModal(false);
      setBorrowNote(''); setBorrowQuantity(1); setPendingWarnings([]);
      fetchData();
      notify(
        borrowStatus === 'active' ? 'Položka byla úspěšně vypůjčena.' : 'Rezervace byla vytvořena.',
        'success'
      );
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const fetchConflicts = async (itemId: number) => {
    setConflicts([]); setLoadingConflicts(true);
    try {
      const res = await fetch(`${API}/api/borrowings/conflicts/${itemId}`, { credentials: 'include' });
      if (res.ok) setConflicts(await res.json());
    } catch (e) {
      console.error('Chyba při načítání obsazenosti:', e);
    } finally {
      setLoadingConflicts(false);
    }
  };

  const openBorrowModal = async (item: EquipmentItem) => {
    setBorrowItem(item);
    setBorrowQuantity(1);
    setBorrowStatus('reservation');
    setDateFrom(tomorrowIso());
    setDateTo('');
    setBorrowNote('');
    setShowBorrowModal(true);
    await fetchConflicts(item.id);
  };
  
  const handleStatusChange = (newStatus: 'active' | 'reservation') => {
    setBorrowStatus(newStatus);
    setDateFrom(newStatus === 'reservation' ? tomorrowIso() : todayIso());
  };

  return (
    <>
      <Header />

      <Container className="pb-5">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h2 className="fw-bold text-dark">Katalog a rezervace</h2>
          {userRole === 'admin' && (
            <Button variant="success" onClick={() => setShowAddModal(true)}>+ Přidat vybavení</Button>
          )}
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        <Card className="shadow-sm border-0">
          <Card.Body className="p-0">
            {loading ? (
              <div className="text-center p-5"><Spinner animation="border" variant="primary" /></div>
            ) : (
              <div className="border rounded shadow-sm overflow-hidden"> 
              <Table hover responsive className="m-0 align-middle">
                <thead>
                  <tr>
                    <th className="ps-4">Název</th>
                    <th>Kategorie</th>
                    <th>Sklad</th>
                    <th className="text-center">Celkem majetek</th>
                    <th className="text-center">Volné k půjčení</th>
                    <th className="text-end pe-4">Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {equipment.map((item) => (
                    <tr key={item.id}>
                      <td className="ps-4 fw-bold">{item.name}</td>
                      <td><Badge bg="secondary">{item.category}</Badge></td>
                      <td>{item.location_name}</td>
                      <td className="text-center">{item.total_quantity} ks</td>
                      <td className="text-center">
                        <Badge bg={item.available_quantity > 0 ? 'success' : 'danger'} className="fs-6">
                          {item.available_quantity} ks
                        </Badge>
                      </td>
                      <td className="text-end pe-4">
                        <div className="d-flex gap-2 justify-content-end">
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={item.total_quantity === 0}
                            onClick={() => openBorrowModal(item)}
                          >
                            Půjčit / Rezervovat
                          </Button>
                          {userRole === 'admin' && (
                            <Button
                              variant="outline-danger"
                              size="sm"
                              disabled={item.total_quantity === 0}
                              onClick={() => {
                                setSelectedItem(item);
                                setRemoveQuantity(1);
                                setRemoveReason('');
                                setShowRemoveModal(true);
                              }}
                            >
                              Odepsat
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              </div>
            )}
          </Card.Body>
        </Card>
      </Container>

      {/* --- MODAL: PŘIDÁNÍ VYBAVENÍ --- */}
      <Modal show={showAddModal} onHide={() => setShowAddModal(false)}>
        <Form onSubmit={handleAddEquipment}>
          <Modal.Header closeButton><Modal.Title>Přidat nové vybavení</Modal.Title></Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Název předmětu</Form.Label>
              <Form.Control type="text" required value={newName} onChange={e => setNewName(e.target.value)} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Kategorie</Form.Label>
              <Form.Select required value={newCategory} onChange={e => setNewCategory(e.target.value)}>
                <option value="" disabled>Vyberte...</option>
                <option value="Stany">Stany</option>
                <option value="Přístřešky">Přístřešky / Tarpy</option>
                <option value="Nářadí">Nářadí</option>
                <option value="Vaření">Vaření</option>
                <option value="Ostatní">Ostatní</option>
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Počet kusů</Form.Label>
              <Form.Control type="number" min={1} required value={newQuantity} onChange={e => setNewQuantity(Number(e.target.value))} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Do jakého skladu?</Form.Label>
              <Form.Select required value={newLocationId} onChange={e => setNewLocationId(Number(e.target.value))}>
                <option value="" disabled>Vyberte sklad...</option>
                {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>Zrušit</Button>
            <Button variant="success" type="submit">Uložit do skladu</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* --- MODAL: VÝPŮJČKA / REZERVACE --- */}
      <Modal show={showBorrowModal} onHide={() => setShowBorrowModal(false)} size="lg">
        <Form onSubmit={handleBorrowSubmit}>
          <Modal.Header closeButton>
            <Modal.Title>Půjčit / Rezervovat: {borrowItem?.name}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p className="text-muted small">
              Sklad: {borrowItem?.location_name} | Celkový majetek: <strong>{borrowItem?.total_quantity} ks</strong>
              {' '}| Ihned k dispozici: <strong>{borrowItem?.available_quantity} ks</strong>
            </p>

            <Form.Group className="mb-3">
              <Form.Label>Typ transakce</Form.Label>
              <Form.Select
                value={borrowStatus}
                onChange={e => handleStatusChange(e.target.value as 'active' | 'reservation')}
              >
                <option value="reservation"> Budoucí Rezervace (plánovaná akce)</option>
                <option value="active"> Okamžitá Výpůjčka (beru si věc hned teď)</option>
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Počet kusů</Form.Label>
              <Form.Control
                type="number" min={1} max={borrowItem?.total_quantity} required
                value={borrowQuantity}
                onChange={e => setBorrowQuantity(Number(e.target.value))}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Datum od</Form.Label>
              <Form.Control
                type="date"
                required
                value={dateFrom}
                min={borrowStatus === 'reservation' ? tomorrowIso() : todayIso()}
                onChange={e => setDateFrom(e.target.value)}
              />
              {borrowStatus === 'reservation' && (
                <Form.Text className="text-muted">Rezervaci lze vytvořit nejdříve od zítřka.</Form.Text>
              )}
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Datum do (předpokládané vrácení)</Form.Label>
              <Form.Control
                type="date"
                value={dateTo}
                min={dateFrom || tomorrowIso()}
                onChange={e => setDateTo(e.target.value)}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Poznámka / Účel</Form.Label>
              <Form.Control
                as="textarea" rows={2}
                placeholder="např. Výprava na Ivančenu"
                value={borrowNote}
                onChange={e => setBorrowNote(e.target.value)}
              />
            </Form.Group>

            {/* Tabulka kdo má aktuálně půjčeno / rezervováno */}
            <div className="mt-4 p-3 rounded border">
              <h6 className="fw-bold mb-2 text-secondary">Aktuální obsazenost a budoucí rezervace</h6>
              {loadingConflicts ? (
                <div className="text-center py-2">
                  <Spinner animation="border" size="sm" variant="primary" />
                  <span className="small ms-2">Načítání přehledu...</span>
                </div>
              ) : conflicts.length === 0 ? (
                <p className="text-success small mb-0">✓ Tento předmět momentálně nikdo nemá. Je zcela volný.</p>
              ) : (
                <Table size="sm" bordered responsive className="small mb-0 shadow-sm">
                  <thead className="table-secondary">
                    <tr>
                      <th>Uživatel</th>
                      <th className="text-center">Množství</th>
                      <th>Od</th>
                      <th>Do</th>
                      <th>Stav</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conflicts.map((c) => (
                      <tr key={c.id}>
                        <td><strong>{c.user_name}</strong></td>
                        <td className="text-center">{c.quantity} ks</td>
                        <td>{formatCz(c.date_from)}</td>
                        <td>{c.date_to ? formatCz(c.date_to) : <span className="text-muted">neurčito</span>}</td>
                        <td>
                          <Badge bg={c.status === 'active' ? 'danger' : 'warning'} text={c.status === 'reservation' ? 'dark' : undefined}>
                            {c.status === 'active' ? ' Vypůjčeno' : ' Rezervováno'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>

            {/* Varování o konfliktu - jen u okamžité výpůjčky */}
            {borrowItem && borrowStatus === 'active' &&
              findReservationConflicts(conflicts, borrowItem.total_quantity, borrowQuantity).map(w => (
                <Alert variant="warning" className="mt-3 small border-warning" key={w.conflict.id}>
                   <strong>Pozor na rezervaci!</strong>{' '}
                  <strong>{w.conflict.user_name}</strong> má od <strong>{formatCz(w.deadline)}</strong>{' '}
                  rezervováno {w.conflict.quantity} ks. Pokud si vezmete {borrowQuantity} ks,
                  budete muset do {formatCz(w.deadline)} vrátit alespoň <strong>{w.deficit} ks</strong>.
                </Alert>
              ))
            }
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowBorrowModal(false)}>Zrušit</Button>
            <Button variant="primary" type="submit">
              {borrowStatus === 'active' ? 'Půjčit' : 'Rezervovat'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* --- DRUHÝ POTVRZOVACÍ MODAL při konfliktu s rezervací --- */}
      <Modal show={showConfirmModal} onHide={() => setShowConfirmModal(false)} centered backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title className="text-danger"> Pozor! Opravdu si chcete tyto položky vzít?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Berete si <strong>{borrowQuantity} ks</strong> předmětu <strong>{borrowItem?.name}</strong>,
            ale na tento předmět existují plánované rezervace, které byste mohli ohrozit:</p>
          <ul className="mb-3">
            {pendingWarnings.map(w => (
              <li key={w.conflict.id}>
                <strong>{w.conflict.user_name}</strong> potřebuje {w.conflict.quantity} ks od{' '}
                <strong>{formatCz(w.deadline)}</strong> - musíte vrátit alespoň{' '}
                <strong>{w.deficit} ks do {formatCz(w.deadline)}</strong>,
                jinak ohrozíte plánovanou výpravu!
              </li>
            ))}
          </ul>
          <Alert variant="warning" className="mb-0 small">
            Pokud rozumíte následkům a souhlasíte, potvrďte níže.
            V opačném případě prosím sjednejte odlišný termín.
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowConfirmModal(false)}>Zpět</Button>
          <Button variant="danger" onClick={submitBorrowing}>Beru zodpovědnost, půjčit</Button>
        </Modal.Footer>
      </Modal>

      {/* --- MODAL: ODPIS --- */}
      <Modal show={showRemoveModal} onHide={() => setShowRemoveModal(false)}>
        <Form onSubmit={handleRemoveEquipment}>
          <Modal.Header closeButton><Modal.Title className="text-danger">Odepsat zničené vybavení</Modal.Title></Modal.Header>
          <Modal.Body>
            <p>Předmět: <strong>{selectedItem?.name}</strong></p>
            <Form.Group className="mb-3">
              <Form.Label>Kolik kusů chcete vyřadit?</Form.Label>
              <Form.Control
                type="number" min={1} max={selectedItem?.total_quantity} required
                value={removeQuantity}
                onChange={e => setRemoveQuantity(Number(e.target.value))}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="fw-bold text-danger">Důvod odpisu</Form.Label>
              <Form.Control
                as="textarea" rows={2} required
                placeholder="např. Stan má protrhanou tropiku..."
                value={removeReason}
                onChange={e => setRemoveReason(e.target.value)}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowRemoveModal(false)}>Zrušit</Button>
            <Button variant="danger" type="submit">Potvrdit vyřazení</Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}
