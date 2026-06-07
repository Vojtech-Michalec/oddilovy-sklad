/**
 * routes/locations.ts — Sklady a jejich obsazenost.
 */

import { Hono } from 'hono';
import { adminOnly } from '../middleware';
import type { AppEnv } from '../types';

const locations = new Hono<AppEnv>();

locations.get('/', async (c) => {
  const { results: locs } = await c.env.DB.prepare('SELECT * FROM locations').all<{
    id: number; name: string; address: string | null;
    latitude: number | null; longitude: number | null;
  }>();

  // Pro každou lokaci načteme předměty a jejich výpůjčky
  const result = await Promise.all(locs.map(async (loc) => {
    const { results: items } = await c.env.DB.prepare(`
      SELECT e.id, e.name, e.category, e.total_quantity,
        (e.total_quantity - COALESCE((
          SELECT SUM(b.quantity) FROM borrowings b
           WHERE b.equipment_id = e.id AND b.status = 'active'
        ), 0)) AS available_quantity
      FROM equipment e
      WHERE e.location_id = ? AND e.total_quantity > 0
    `).bind(loc.id).all<{
      id: number; name: string; category: string;
      total_quantity: number; available_quantity: number;
    }>();

    const itemsWithPeople = await Promise.all(items.map(async (item) => {
      const { results: borrowers } = await c.env.DB.prepare(`
        SELECT b.id, b.quantity, b.date_from, b.date_to, b.status, u.name AS user_name
          FROM borrowings b
          JOIN users u ON b.user_id = u.id
         WHERE b.equipment_id = ? AND b.status IN ('active', 'reservation')
         ORDER BY b.date_from ASC
      `).bind(item.id).all();
      return { ...item, active_borrowers: borrowers };
    }));

    const totalQty = items.reduce((s, i) => s + i.total_quantity, 0);
    const totalAvail = items.reduce((s, i) => s + i.available_quantity, 0);
    const fullness = totalQty > 0 ? Math.round((totalAvail / totalQty) * 100) : 100;

    return { ...loc, fullness_percentage: fullness, items: itemsWithPeople };
  }));

  return c.json(result);
});

locations.post('/add', adminOnly, async (c) => {
  const { name, address, latitude, longitude } = await c.req.json<{
    name: string; address?: string; latitude?: number; longitude?: number;
  }>();

  if (!name?.trim()) return c.json({ error: 'Chybí název skladu.' }, 400);

  await c.env.DB.prepare(`
    INSERT INTO locations (name, address, latitude, longitude)
    VALUES (?, ?, ?, ?)
  `).bind(name.trim(), address ?? null, latitude ?? null, longitude ?? null).run();

  return c.json({ message: 'Sklad byl úspěšně přidán.' });
});

export default locations;
