import { useEffect, useState } from 'react';
import { Container, Card, Table, Badge, Spinner, Alert, Button, Modal, Form } from 'react-bootstrap';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import { useNotify } from '../contexts/NotificationContext';
import { API } from '../api';

// Datové typy
interface EquipmentItem {
  id: number;
  name: string;
  category: string;
  total_quantity: number;
  available_quantity: number;
  location_name: string;
}

interface LocationItem {
  id: number;
  name: string;
}

// NOVÝ TYP PRO ODPISY
interface DiscardLogItem {
  id: number;
  equipment_name: string;
  quantity: number;
  reason: string;
  created_at: string;
  user_name: string;
}

export default function Equipment() {
  const { user } = useAuth();
  const { notify } = useNotify();
  const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [discardLogs, setDiscardLogs] = useState<DiscardLogItem[]>([]);
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

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [eqRes, locRes, discardsRes] = await Promise.all([
        fetch(`${API}/api/equipment`, { credentials: 'include' }),
        fetch(`${API}/api/locations`, { credentials: 'include' }),
        fetch(`${API}/api/equipment/discards`, { credentials: 'include' }),
      ]);

      if (!eqRes.ok) throw new Error('Nepodařilo se načíst data o vybavení.');
      setEquipment(await eqRes.json());
      if (locRes.ok) setLocations(await locRes.json());
      if (discardsRes.ok) setDiscardLogs(await discardsRes.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newLocationId === '') {
      notify('Vyberte prosím sklad.', 'warning');
      return;
    }

    try {
      const res = await fetch(`${API}/api/equipment/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: newName,
          category: newCategory,
          quantity: newQuantity,
          location: newLocationId
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chyba při přidávání vybavení.');

      setNewName(''); setNewCategory(''); setNewQuantity(1); setNewLocationId('');
      setShowAddModal(false);
      fetchData();
      notify('Vybavení bylo přidáno do skladu.', 'success');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleRemoveEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

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
      fetchData();
      notify(`Odepsáno ${removeQuantity} ks (${selectedItem.name}).`, 'success');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  // Otevření modalu pro odpis
  const openRemoveModal = (item: EquipmentItem) => {
    setSelectedItem(item);
    setRemoveQuantity(1);
    setRemoveReason('');
    setShowRemoveModal(true);
  };

  return (
    <>
      <Header />

      <Container className="pb-5">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h2 className="fw-bold">Katalog vybavení</h2>
          {user?.role === 'admin' && (
            <Button variant="success" onClick={() => setShowAddModal(true)}>
              + Přidat vybavení
            </Button>
          )}
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        {/* --- HLAVNÍ TABULKA VYBAVENÍ --- */}
        <Card className="shadow-sm border-0 mb-5">
          <Card.Body className="p-0">
            {loading ? (
              <div className="text-center p-5">
                <Spinner animation="border" variant="primary" />
                <p className="mt-2 text-muted">Načítám data ze skladu...</p>
              </div>
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
                    {user?.role === 'admin' && <th className="text-end pe-4">Akce správce</th>}
                  </tr>
                </thead>
                <tbody>
                  {equipment.filter(item => item.total_quantity > 0).map((item) => (
                    <tr key={item.id}>
                      <td className="ps-4 fw-bold">{item.name}</td>
                      <td><Badge bg="secondary">{item.category}</Badge></td>
                      <td>{item.location_name}</td>
                      <td className="text-center fw-bold">{item.total_quantity} ks</td>
                      <td className="text-center">
                        <Badge bg={item.available_quantity > 0 ? "success" : "danger"} className="fs-6">
                          {item.available_quantity} ks
                        </Badge>
                      </td>
                      {user?.role === 'admin' && (
                        <td className="text-end pe-4">
                          <Button 
                            variant="outline-danger" 
                            size="sm" 
                            disabled={item.total_quantity === 0}
                            onClick={() => openRemoveModal(item)}
                          >
                            Odepsat / Vyhodit
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {equipment.filter(item => item.total_quantity > 0).length === 0 && (
                    <tr>
                      <td colSpan={user?.role === 'admin' ? 6 : 5} className="text-center py-4 text-muted">
                        Sklad je prázdný.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
              </div>
            )}
          </Card.Body>
        </Card>

        {/* --- TABULKA: HISTORIE ODPISŮ --- */}
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h3 className="fw-bold">Tabulka odpisů</h3>
        </div>
        
        <Card className="shadow-sm border-0">
          <Card.Body className="p-0">
            <div className="border rounded shadow-sm overflow-hidden"> 
            <Table hover responsive className="m-0 align-middle">
              <thead>
                <tr>
                  <th className="ps-4">Datum</th>
                  <th>Předmět</th>
                  <th className="text-center">Množství</th>
                  <th>Důvod zničení / odpisu</th>
                  <th>Odepsal (Admin)</th>
                </tr>
              </thead>
              <tbody>
                {discardLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="ps-4 text-muted">
                      {new Date(log.created_at).toLocaleDateString('cs-CZ')}
                    </td>
                    <td className="fw-bold">{log.equipment_name}</td>
                    <td className="text-center">
                      <Badge bg="danger">-{log.quantity} ks</Badge>
                    </td>
                    <td>{log.reason}</td>
                    <td>{log.user_name}</td>
                  </tr>
                ))}
                {(!loading && discardLogs.length === 0) && (
                  <tr>
                    <td colSpan={5} className="text-center py-4 text-muted">
                      Zatím nebyly provedeny žádné odpisy majetku.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
            </div>
          </Card.Body>
        </Card>
      </Container>

      {/* --- MODAL: PŘIDÁNÍ VYBAVENÍ --- */}
      <Modal show={showAddModal} onHide={() => setShowAddModal(false)}>
        <Form onSubmit={handleAddEquipment}>
          <Modal.Header closeButton>
            <Modal.Title>Přidat nové vybavení</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Název předmětu</Form.Label>
              <Form.Control type="text" required value={newName} onChange={e => setNewName(e.target.value)} placeholder="např. Stan Jurek 3" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Kategorie</Form.Label>
              <Form.Select required value={newCategory} onChange={e => setNewCategory(e.target.value)}>
                <option value="" disabled>Vyberte...</option>
                <option value="Stany">Stany</option>
                <option value="Nářadí">Nářadí</option>
                <option value="Vaření">Vaření</option>
                <option value="Ostatní">Ostatní</option>
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Počet kusů</Form.Label>
              <Form.Control type="number" min="1" required value={newQuantity} onChange={e => setNewQuantity(Number(e.target.value))} />
            </Form.Group>
            
            <Form.Group className="mb-3">
              <Form.Label>Do jakého skladu?</Form.Label>
              <Form.Select required value={newLocationId} onChange={e => setNewLocationId(Number(e.target.value))}>
                <option value="" disabled>Vyberte sklad ze seznamu...</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>Zrušit</Button>
            <Button variant="success" type="submit">Uložit do skladu</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* --- MODAL: ODPIS ZNIČENÉHO VYBAVENÍ S DŮVODEM --- */}
      <Modal show={showRemoveModal} onHide={() => setShowRemoveModal(false)}>
        <Form onSubmit={handleRemoveEquipment}>
          <Modal.Header closeButton>
            <Modal.Title className="text-danger">Odepsat zničené vybavení</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p>Předmět: <strong>{selectedItem?.name}</strong></p>
            <p className="text-muted small mb-4">Aktuálně v majetku: {selectedItem?.total_quantity} ks</p>
            
            <Form.Group className="mb-3">
              <Form.Label>Kolik kusů chcete natrvalo vyřadit ze skladu?</Form.Label>
              <Form.Control 
                type="number" 
                min="1" 
                max={selectedItem?.total_quantity} 
                required 
                value={removeQuantity} 
                onChange={e => setRemoveQuantity(Number(e.target.value))} 
              />
            </Form.Group>

            {/* --- NOVÉ: DŮVOD ODPISU --- */}
            <Form.Group className="mb-3">
              <Form.Label>Důvod zničení / odpisu</Form.Label>
              <Form.Control 
                as="textarea" 
                rows={3} 
                required 
                placeholder="Např. Plachta se nenávratně roztrhla na výpravě, ztratilo se..." 
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
