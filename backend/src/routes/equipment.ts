/**
 * routes/equipment.ts — Katalog vybavení a odpisy.
 *
 * Klíčové pravidlo: GET / NEVRÁTÍ položky s total_quantity = 0.
 * Filtrace WHERE e.total_quantity > 0 se děje na úrovni SQL, ne JS.
 */

import { Hono } from 'hono';
import { adminOnly } from '../middleware';
import type { AppEnv } from '../types';

const equipment = new Hono<AppEnv>();

// --- SEZNAM VYBAVENÍ --------------------------------------------------------

equipment.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT
      e.*,
      l.name AS location_name,
      (e.total_quantity - COALESCE((
        SELECT SUM(b.quantity)
          FROM borrowings b
         WHERE b.equipment_id = e.id AND b.status = 'active'
      ), 0)) AS available_quantity
    FROM equipment e
    LEFT JOIN locations l ON e.location_id = l.id
    WHERE e.total_quantity > 0
    ORDER BY e.category, e.name
  `).all();

  return c.json(results);
});

// --- PŘIDÁNÍ VYBAVENÍ (admin) -----------------------------------------------

equipment.post('/add', adminOnly, async (c) => {
  const { name, category, quantity, location } = await c.req.json<{
    name: string; category: string; quantity: number; location: number;
  }>();

  if (!name?.trim() || !category || !quantity || quantity < 1 || !location) {
    return c.json({ error: 'Chybí povinné údaje.' }, 400);
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM equipment WHERE name = ? AND location_id = ?'
  ).bind(name.trim(), location).first<{ id: number }>();

  if (existing) {
    await c.env.DB.prepare(
      'UPDATE equipment SET total_quantity = total_quantity + ? WHERE id = ?'
    ).bind(quantity, existing.id).run();
    return c.json({ message: 'Množství existujícího vybavení bylo navýšeno.' });
  }

  await c.env.DB.prepare(`
    INSERT INTO equipment (name, category, total_quantity, location_id)
    VALUES (?, ?, ?, ?)
  `).bind(name.trim(), category, quantity, location).run();

  return c.json({ message: 'Nové vybavení přidáno do skladu.' });
});

// --- ODPIS (admin) ----------------------------------------------------------

equipment.post('/remove', adminOnly, async (c) => {
  try {
    const user = c.get('user');
    const { equipment_id, amount_to_discard, reason } = await c.req.json<{
      equipment_id: number; amount_to_discard: number; reason: string;
    }>();

    if (!equipment_id || !amount_to_discard || amount_to_discard < 1 || !reason?.trim()) {
      return c.json({ error: 'Chybí parametry nebo důvod odpisu.' }, 400);
    }

    const item = await c.env.DB.prepare(
      'SELECT total_quantity FROM equipment WHERE id = ?'
    ).bind(equipment_id).first<{ total_quantity: number }>();

    if (!item) return c.json({ error: 'Vybavení nenalezeno.' }, 404);
    if (item.total_quantity < amount_to_discard) {
      return c.json({ error: 'Nelze odepsat více, než je na skladě.' }, 400);
    }

    await c.env.DB.batch([
      c.env.DB.prepare(
        'UPDATE equipment SET total_quantity = total_quantity - ? WHERE id = ?'
      ).bind(amount_to_discard, equipment_id),
      c.env.DB.prepare(
        'INSERT INTO discard_logs (equipment_id, user_id, quantity, reason) VALUES (?, ?, ?, ?)'
      ).bind(equipment_id, user.id, amount_to_discard, reason.trim()),
    ]);

    return c.json({ message: 'Poškozené kusy byly odepsány a zaznamenány.' });
  } catch (e: any) {
    return c.json({ error: 'Chyba serveru: ' + e.message }, 500);
  }
});

// --- SEZNAM ODPISŮ ----------------------------------------------------------

equipment.get('/discards', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT d.id, e.name AS equipment_name, d.quantity, d.reason, d.created_at,
           u.name AS user_name
      FROM discard_logs d
      JOIN equipment e ON d.equipment_id = e.id
      LEFT JOIN users u ON d.user_id = u.id
     ORDER BY d.created_at DESC
  `).all();
  return c.json(results);
});

export default equipment;
