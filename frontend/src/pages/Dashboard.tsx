import { useEffect, useState } from 'react';
import { Container, Row, Col, Card, Table, Badge, Spinner, Alert, Button, Modal, Form } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { useNotify } from '../contexts/NotificationContext';
import { formatCz } from '../utils/dateHelpers';
import { API } from '../api';

interface Equipment {
  id: number;
  name: string;
  category: string;
  total_quantity: number;
  available_quantity: number;
  location_name: string;
}

interface Borrowing {
  id: number;
  equipment_name: string;
  quantity: number;
  date_from: string;
  date_to: string;
  status: 'active' | 'reservation' | 'returned' | 'cancelled';
}


export default function Dashboard() {
  const navigate = useNavigate();
  const { notify } = useNotify();

  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [myBorrowings, setMyBorrowings] = useState<Borrowing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showReturnModal, setShowReturnModal] = useState(false);
  const [selectedBorrowing, setSelectedBorrowing] = useState<Borrowing | null>(null);
  const [returnedQty, setReturnedQty] = useState(0);
  const [discardedQty, setDiscardedQty] = useState(0);
  const [returnReason, setReturnReason] = useState('');
  const [returnNote, setReturnNote] = useState('');
  const [cancelReason, setCancelReason] = useState(''); 

  useEffect(() => { fetchDashboardData(); }, []);

  const fetchDashboardData = async () => {
    try {
      const [eqRes, borRes] = await Promise.all([
        fetch(`${API}/api/equipment`, { credentials: 'include' }),
        fetch(`${API}/api/borrowings/my-history`, { credentials: 'include' })
      ]);

      if (eqRes.status === 401 || borRes.status === 401) { navigate('/login'); return; }
      if (!eqRes.ok || !borRes.ok) throw new Error('Nepodařilo se načíst data ze serveru.');

      setEquipment(await eqRes.json());
      setMyBorrowings(await borRes.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openReturnModal = (b: Borrowing) => {
    setSelectedBorrowing(b);
    setReturnedQty(b.quantity);   
    setDiscardedQty(0);           
    setReturnReason('');
    setReturnNote('');
    setCancelReason('');
    setShowReturnModal(true);
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBorrowing) return;

    if (returnedQty + discardedQty === 0) {
      notify('Musíte vrátit alespoň 1 kus.', 'warning'); return;
    }
    if (returnedQty + discardedQty > selectedBorrowing.quantity) {
      notify('Vrácený + zničený součet přesahuje počet půjčených kusů.', 'warning'); return;
    }
    if (discardedQty > 0 && !returnReason.trim()) {
      notify('Při odpisu kusů musíte uvést důvod.', 'warning'); return;
    }

    try {
      const res = await fetch(`${API}/api/borrowings/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          borrowing_id: selectedBorrowing.id,
          returned_quantity: returnedQty,
          discarded_quantity: discardedQty,
          reason: returnReason,
          note: returnNote
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chyba při zpracování vrácení.');

      setShowReturnModal(false);
      fetchDashboardData();

      const total = returnedQty + discardedQty;
      const remaining = selectedBorrowing.quantity - total;
      if (remaining > 0) {
        notify(`Vráceno ${total} ks. U vás zůstává ${remaining} ks.`, 'success');
      } else {
        notify(
          discardedQty > 0
            ? `Vráceno ${returnedQty} ks, odepsáno ${discardedQty} ks.`
            : 'Všechny kusy vráceny v pořádku.',
          'success'
        );
      }
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleCancelReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBorrowing) return;
    if (!cancelReason.trim()) {
      notify('Uveďte důvod zrušení rezervace.', 'warning'); return;
    }

    try {
      const res = await fetch(`${API}/api/borrowings/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          borrowing_id: selectedBorrowing.id,
          returned_quantity: selectedBorrowing.quantity, 
          discarded_quantity: 0,
          note: cancelReason
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chyba při rušení rezervace.');
      setShowReturnModal(false);
      fetchDashboardData();
      notify('Rezervace byla zrušena.', 'success');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const totalItemsCount = equipment.reduce((s, i) => s + i.total_quantity, 0);
  const borrowedItemsCount = equipment.reduce((s, i) => s + (i.total_quantity - i.available_quantity), 0);
  const myActiveCount = myBorrowings.filter(b => b.status === 'active').length;
  const myReservationsCount = myBorrowings.filter(b => b.status === 'reservation').length;
  const outOfStock = equipment.filter(e => e.available_quantity === 0 && e.total_quantity > 0);
  const myCurrentItems = myBorrowings.filter(b => b.status === 'active' || b.status === 'reservation');

  const statusBadge = (status: string) => {
    switch(status) {
      case 'active': return <Badge bg="success">Půjčeno</Badge>;
      case 'reservation': return <Badge bg="warning" text="dark">Rezervace</Badge>;
      default: return <Badge bg="secondary">{status}</Badge>;
    }
  };

  const isReservation = selectedBorrowing?.status === 'reservation';
  const totalToProcess = returnedQty + discardedQty;
  const remainingAfter = selectedBorrowing ? selectedBorrowing.quantity - totalToProcess : 0;

  return (
    <>
      <Header />

      <Container className="pb-5">
        <h2 className="mb-4 fw-bold">Úvodní přehled</h2>
        {error && <Alert variant="danger">{error}</Alert>}

        {loading ? (
          <div className="text-center p-5">
            <Spinner animation="border" variant="primary" />
            <p className="mt-2 text-muted">Načítám aktuální stav skladu...</p>
          </div>
        ) : (
          <>
            <Row className="mb-4 g-3">
              <Col md={3} sm={6}>
                <Card className="h-100 border rounded shadow-sm">
                  <Card.Body>
                    <p className="text-muted mb-1 fs-6">Moje výpůjčky</p>
                    <h3 className="mb-0 fw-bold">{myActiveCount} <span className="fs-6 fw-normal text-muted">položek</span></h3>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={3} sm={6}>
                <Card className="h-100 rounded shadow-sm">
                  <Card.Body>
                    <p className="text-muted mb-1 fs-6">Moje rezervace</p>
                    <h3 className="mb-0 fw-bold">{myReservationsCount} <span className="fs-6 fw-normal text-muted">položek</span></h3>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={3} sm={6}>
                <Card className="h-100 border rounded shadow-sm">
                  <Card.Body>
                    <p className="text-muted mb-1 fs-6">Celkem v majetku</p>
                    <h3 className="mb-0 fw-bold">{totalItemsCount} <span className="fs-6 fw-normal text-muted">kusů</span></h3>
                  </Card.Body>
                </Card>
              </Col>
              <Col md={3} sm={6}>
                <Card className="h-100 border rounded shadow-sm">
                  <Card.Body>
                    <p className="text-muted mb-1 fs-6">Aktuálně rozpůjčováno</p>
                    <h3 className="mb-0 fw-bold">{borrowedItemsCount} <span className="fs-6 fw-normal text-muted">kusů</span></h3>
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            <Row className="g-4">
              <Col lg={5}>
                <Card className="shadow-sm h-100 border rounded shadow-sm">
                  <Card.Header className=" border-bottom-0 pt-4 pb-0">
                    <h5 className="fw-bold text-danger">Nedostatkové předměty</h5>
                    <p className="text-muted small mb-3">Vybavení, které je aktuálně 100% rozpůjčované.</p>
                  </Card.Header>
                  <Card.Body className="p-0">
                    <Table hover responsive className="m-0 align-middle">
                      <thead>
                        <tr>
                          <th className="ps-4">Název</th>
                          <th className="text-center">Celkem oddíl má</th>
                        </tr>
                      </thead>
                      <tbody>
                        {outOfStock.map(item => (
                          <tr key={item.id}>
                            <td className="ps-4 fw-bold">{item.name}</td>
                            <td className="text-center text-danger fw-bold">{item.total_quantity} ks</td>
                          </tr>
                        ))}
                        {outOfStock.length === 0 && (
                          <tr><td colSpan={2} className="text-center py-4 text-muted">Aktuálně máme dostatek od všeho vybavení.</td></tr>
                        )}
                      </tbody>
                    </Table>
                  </Card.Body>
                </Card>
              </Col>

              <Col lg={7}>
                <Card className="h-100 border rounded shadow-sm">
                  <Card.Header className=" border-bottom-0 pt-4 pb-0">
                    <h5 className="fw-bold">Moje věci u sebe / Rezervace</h5>
                    <p className="text-muted small mb-3">Co máte aktuálně na starosti vy.</p>
                  </Card.Header>
                  <Card.Body className="p-0">
                    <Table hover responsive className="m-0 align-middle">
                      <thead>
                        <tr>
                          <th className="ps-4">Předmět</th>
                          <th>Termín</th>
                          <th>Stav</th>
                          <th className="pe-4 text-end">Akce</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myCurrentItems.map(item => (
                          <tr key={item.id}>
                            <td className="ps-4">
                              <span className="fw-bold">{item.equipment_name}</span><br />
                              <small className="text-muted">{item.quantity} ks</small>
                            </td>
                            <td>
                              <small>
                                {formatCz(item.date_from)} - <br />
                                {item.date_to ? formatCz(item.date_to) : 'Neurčeno'}
                              </small>
                            </td>
                            <td>{statusBadge(item.status)}</td>
                            <td className="pe-4 text-end">
                              <Button
                                variant={item.status === 'reservation' ? 'outline-danger' : 'outline-primary'}
                                size="sm"
                                onClick={() => openReturnModal(item)}
                              >
                                {item.status === 'reservation' ? 'Zrušit' : 'Vrátit'}
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {myCurrentItems.length === 0 && (
                          <tr><td colSpan={4} className="text-center py-5 text-muted">Zatím nemáte žádné aktivní výpůjčky ani rezervace.</td></tr>
                        )}
                      </tbody>
                    </Table>
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          </>
        )}
      </Container>

      {/* MODAL: VRÁCENÍ / ZRUŠENÍ */}
      <Modal show={showReturnModal} onHide={() => setShowReturnModal(false)}>
        <Form onSubmit={isReservation ? handleCancelReservation : handleReturnSubmit}>
          <Modal.Header closeButton>
            <Modal.Title>{isReservation ? 'Zrušení rezervace' : 'Vrácení předmětu'}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p className="mb-3">
              Položka: <strong>{selectedBorrowing?.equipment_name}</strong>
              {' '}({selectedBorrowing?.quantity} ks)
            </p>

            {isReservation ? (
              <Form.Group className="mb-3">
                <Form.Label className="fw-bold text-danger">Důvod zrušení rezervace</Form.Label>
                <Form.Control
                  as="textarea" rows={3} required
                  placeholder="např. Akce byla zrušena..."
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                />
              </Form.Group>
            ) : (
              <>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-bold">Kolik kusů vracíte celkem?</Form.Label>
                  <Form.Control
                    type="number" min={0} max={selectedBorrowing?.quantity} required
                    value={returnedQty}
                    onChange={e => {
                      const v = Number(e.target.value);
                      setReturnedQty(v);
                      if (discardedQty > v) setDiscardedQty(v);
                    }}
                  />
                  <Form.Text className="text-muted">
                    Defaultně všechny ({selectedBorrowing?.quantity} ks). Snižte, pokud vracíte jen část.
                  </Form.Text>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label className="fw-bold text-danger">Koilik jich je zničeno.</Form.Label>
                  <Form.Control
                    type="number" min={0} max={(selectedBorrowing?.quantity ?? 0) - returnedQty}
                    value={discardedQty}
                    onChange={e => setDiscardedQty(Number(e.target.value))}
                  />
                  <Form.Text className="text-muted">
                    Tyto kusy se rovnou odepíšou ze skladu (sníží majetek oddílu).
                  </Form.Text>
                </Form.Group>

                {discardedQty > 0 && (
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-bold text-danger">Důvod odpisu (povinný)</Form.Label>
                    <Form.Control
                      as="textarea" rows={2} required
                      placeholder="např. Ondra zlomil topůrko při sekání dřeva..."
                      value={returnReason}
                      onChange={e => setReturnReason(e.target.value)}
                    />
                  </Form.Group>
                )}

                <Form.Group className="mb-3">
                  <Form.Label>Dobrovolná poznámka</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="Vše v pořádku, čisté..."
                    value={returnNote}
                    onChange={e => setReturnNote(e.target.value)}
                  />
                </Form.Group>

                <Alert variant={remainingAfter > 0 ? 'info' : 'success'} className="small mb-0">
                  Souhrn:&nbsp;
                  <strong>{returnedQty - discardedQty} ks</strong> půjde zpět do skladu,&nbsp;
                  <strong>{discardedQty} ks</strong> se odepíše.&nbsp;
                  {remainingAfter > 0
                    ? <>U vás zůstane <strong>{remainingAfter} ks</strong> (výpůjčka zůstává aktivní).</>
                    : <>Výpůjčka bude uzavřena.</>}
                </Alert>
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowReturnModal(false)}>Zrušit</Button>
            <Button
              variant={discardedQty > 0 || isReservation ? 'danger' : 'success'}
              type="submit"
            >
              {isReservation ? 'Potvrdit storno' : 'Potvrdit vrácení'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}
