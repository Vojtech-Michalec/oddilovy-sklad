import { useEffect, useState } from 'react';
import { Container, Card, Spinner, Alert, Button, Modal, Form, ListGroup, Table, Badge } from 'react-bootstrap';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import { useNotify } from '../contexts/NotificationContext';
import { API } from '../api';
import 'leaflet/dist/leaflet.css';

// --- OPRAVA IKON V LEAFLETU PRO REACT ---
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconRetinaUrl: iconRetina,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;
// ----------------------------------------

interface EquipmentItem {
  id: number;
  name: string;
  category: string;
  total_quantity: number;
  available_quantity: number;
}

interface Location {
  id: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  fullness_percentage: number;
  items: EquipmentItem[];
}

export default function MapLocations() {
  const { user } = useAuth();
  const { notify } = useNotify();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Stavy pro Modal - Přidání skladu
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLocName, setNewLocName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<{address: string, lat: number, lon: number} | null>(null);

  // --- NOVÉ STAVY PRO MODAL - INVENTURA/ZOBRAZENÍ SKLADU ---
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [activeLocation, setActiveLocation] = useState<Location | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const locRes = await fetch(`${API}/api/locations`, { credentials: 'include' });
      if (!locRes.ok) throw new Error('Nepodařilo se načíst lokace skladů.');
      setLocations(await locRes.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchAddress = async () => {
    if (!searchQuery) return;
    setIsSearching(true);
    setSelectedAddress(null);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&addressdetails=1&countrycodes=cz&limit=5`);
      const data = await res.json();
      setSearchResults(data);
    } catch (err) {
      notify('Nepodařilo se vyhledat adresu.', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectResult = (result: any) => {
    setSelectedAddress({
      address: result.display_name,
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon)
    });
    setSearchResults([]);
    setSearchQuery(result.display_name);
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAddress) {
      notify('Nejprve vyhledejte a vyberte adresu ze seznamu.', 'warning');
      return;
    }
    try {
      const res = await fetch(`${API}/api/locations/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: newLocName,
          address: selectedAddress.address,
          latitude: selectedAddress.lat,
          longitude: selectedAddress.lon
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chyba při ukládání skladu.');
      setShowAddModal(false);
      setNewLocName(''); setSearchQuery(''); setSelectedAddress(null);
      fetchData();
      notify('Sklad byl úspěšně přidán.', 'success');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  // Otevření modalu s obsahem skladu
  const openInventoryModal = (loc: Location) => {
    setActiveLocation(loc);
    setShowInventoryModal(true);
  };

  // Pomocná funkce pro barvu odznáčku zaplněnosti
  const getFullnessBadgeColor = (percentage: number) => {
    if (percentage > 60) return 'success';
    if (percentage > 20) return 'warning';
    return 'danger';
  };

  const centerPosition: [number, number] = locations.length > 0 
    ? [locations[0].latitude, locations[0].longitude] 
    : [50.0343, 15.7704];

  return (
    <>
      <Header />

      <Container className="pb-5">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h2 className="fw-bold mb-0">Mapa oddílových skladů</h2>
          {user?.role === 'admin' && (
            <Button variant="success" onClick={() => setShowAddModal(true)}>
              + Přidat sklad
            </Button>
          )}
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        <Card className="shadow-sm border-0 overflow-hidden">
          {loading ? (
            <div className="text-center p-5">
              <Spinner animation="border" variant="primary" />
              <p className="mt-2 text-muted">Načítám souřadnice skladů...</p>
            </div>
          ) : (
            <div style={{ height: '600px', width: '100%' }}>
              <MapContainer 
                key={locations.length}
                center={centerPosition} 
                zoom={12} 
                scrollWheelZoom={true} 
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                
                {locations.map(loc => (
                  <Marker key={loc.id} position={[loc.latitude, loc.longitude]}>
                    <Popup>
                      <div style={{ minWidth: '180px', textAlign: 'center' }} className="p-1">
                        <h6 className="fw-bold mb-1 text-dark">{loc.name}</h6>
                        <p className="text-dark small mb-2">{loc.address.split(',')[0]}</p>
                        
                        <div className="mb-3">
                          <span className="small text-dark d-block mb-1">Věcí ve skladu:</span>
                          <Badge bg={getFullnessBadgeColor(loc.fullness_percentage)} className="fs-6 py-1 px-2">
                            {loc.fullness_percentage} %
                          </Badge>
                        </div>
                        
                        {/* --- NOVÉ TLAČÍTKO V POPUPU MAPY --- */}
                        <Button 
                          variant="primary" 
                          size="sm" 
                          className="w-100 fw-bold py-1"
                          onClick={() => openInventoryModal(loc)}
                        >
                          Zobrazit sklad →
                        </Button>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          )}
        </Card>
      </Container>

      {/* --- NOVÝ MODAL: DETAIL A INVENTURA POLOŽEK SKLADU --- */}
      <Modal show={showInventoryModal} onHide={() => setShowInventoryModal(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>
            📦 Obsah skladu: <span className="text-primary">{activeLocation?.name}</span>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-0">
          <div className="p-3 border-bottom
           d-flex justify-content-between align-items-center">
            <span className="text-muted small">Adresa: {activeLocation?.address.split(',')[0]}</span>
            <Badge bg={getFullnessBadgeColor(activeLocation?.fullness_percentage || 0)} className="fs-6">
              Vybavení z {activeLocation?.fullness_percentage}% kompletní
            </Badge>
          </div>
          <div className="border rounded shadow-sm overflow-auto"> 
          <Table hover responsive className="m-1 align-middle">
            <thead>
              <tr>
                <th className="ps-4">Název předmětu</th>
                <th>Kategorie</th>
                <th className="text-center">Celkem majetek</th>
                <th className="pe-4 text-end">Aktuálně k dispozici</th>
              </tr>
            </thead>
            <tbody>
              {activeLocation?.items && activeLocation.items.map((item) => (
                <tr key={item.id}>
                  <td className="ps-4 fw-bold">{item.name}</td>
                  <td><Badge bg="secondary">{item.category}</Badge></td>
                  <td className="text-center">{item.total_quantity} ks</td>
                  <td className="pe-4 text-end">
                    <Badge bg={item.available_quantity > 0 ? "success" : "danger"} className="fs-6">
                      {item.available_quantity} / {item.total_quantity} ks
                    </Badge>
                  </td>
                </tr>
              ))}
              {(!activeLocation?.items || activeLocation.items.length === 0) && (
                <tr>
                  <td colSpan={4} className="text-center py-5 text-muted">
                    V tomto skladu se momentálně nenachází žádné zapsané vybavení.
                  </td>
                </tr>
              )}
            </tbody>
          </Table></div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowInventoryModal(false)}>
            Zavřít detail
          </Button>
        </Modal.Footer>
      </Modal>

      {/* --- MODAL PRO PŘIDÁNÍ SKLADU --- */}
      <Modal show={showAddModal} onHide={() => setShowAddModal(false)} size="lg">
        <Form onSubmit={handleAddLocation}>
          <Modal.Header closeButton><Modal.Title>Přidat nový sklad na mapu</Modal.Title></Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Název skladu</Form.Label>
              <Form.Control type="text" required value={newLocName} onChange={e => setNewLocName(e.target.value)} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Vyhledat adresu</Form.Label>
              <div className="d-flex gap-2 mb-2">
                <Form.Control type="text" placeholder="Např. Skautská 1, Pardubice" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} disabled={selectedAddress !== null} />
                {selectedAddress ? (
                  <Button variant="outline-danger" onClick={() => setSelectedAddress(null)}>Změnit</Button>
                ) : (
                  <Button variant="primary" onClick={handleSearchAddress} disabled={isSearching || !searchQuery}>
                    {isSearching ? <Spinner size="sm" animation="border" /> : 'Hledat'}
                  </Button>
                )}
              </div>
              {!selectedAddress && searchResults.length > 0 && (
                <ListGroup className="mt-2 position-absolute w-75 shadow" style={{ zIndex: 1000 }}>
                  {searchResults.map((res, index) => (
                    <ListGroup.Item key={index} action onClick={() => handleSelectResult(res)}>{res.display_name}</ListGroup.Item>
                  ))}
                </ListGroup>
              )}
              {selectedAddress && <Alert variant="success" className="py-2 mt-2">✅ Získána přesná poloha</Alert>}
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>Zrušit</Button>
            <Button variant="success" type="submit" disabled={!selectedAddress || !newLocName}>Uložit sklad</Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}