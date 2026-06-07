/**
 * routes/borrowings.ts — Výpůjčky, rezervace, vrácení (vč. částečného a se zničením).
 *
 * Logika vrácení:
 *   - returned_quantity = vráceno v pořádku zpět do skladu
 *   - discarded_quantity = zničeno/ztraceno → odepíše se z total_quantity
 *   - Pokud zůstanou nesplacené kusy, původní záznam se jen sníží (partial return).
 *   - Vše v db.batch() = atomická operace.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../types';

const borrowings = new Hono<AppEnv>();

// --- VYTVOŘENÍ VÝPŮJČKY / REZERVACE -----------------------------------------

borrowings.post('/create', async (c) => {
  try {
    const user = c.get('user');
    const { equipment_id, quantity, date_from, date_to, status, note } = await c.req.json<{
      equipment_id: number; quantity: number;
      date_from: string; date_to: string | null;
      status: 'active' | 'reservation'; note?: string;
    }>();

    if (!equipment_id || !quantity || quantity < 1 || !date_from || !status) {
      return c.json({ error: 'Chybí povinné údaje.' }, 400);
    }

    // Validace data
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const from = new Date(date_from);
    if (Number.isNaN(from.getTime())) {
      return c.json({ error: 'Neplatný formát data.' }, 400);
    }
    // Rezervace musí být minimálně od zítřka; okamžitá výpůjčka může být od dnes.
    const minFrom = new Date(today);
    if (status === 'reservation') minFrom.setDate(minFrom.getDate() + 1);
    if (from < minFrom) {
      return c.json({ error: 'Datum „od" nesmí být v minulosti.' }, 400);
    }
    if (date_to) {
      const to = new Date(date_to);
      if (to < from) return c.json({ error: 'Datum „do" musí být po datu „od".' }, 400);
    }

    // Dostupnost: celkové množství mínus aktivní výpůjčky
    const avail = await c.env.DB.prepare(`
      SELECT (e.total_quantity - COALESCE((
        SELECT SUM(b.quantity) FROM borrowings b
         WHERE b.equipment_id = e.id AND b.status = 'active'
      ), 0)) AS available
      FROM equipment e WHERE e.id = ?
    `).bind(equipment_id).first<{ available: number }>();

    if (!avail) return c.json({ error: 'Předmět neexistuje.' }, 404);

    if (status === 'active' && avail.available < quantity) {
      return c.json({
        error: `Nelze vypůjčit. Na skladě zbývá ${avail.available} ks.`,
        available: avail.available,
      }, 400);
    }

    await c.env.DB.prepare(`
      INSERT INTO borrowings (equipment_id, user_id, quantity, date_from, date_to, status, note, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(equipment_id, user.id, quantity, date_from, date_to ?? null, status, note ?? null, user.id).run();

    return c.json({
      message: status === 'active' ? 'Položka úspěšně vypůjčena.' : 'Rezervace úspěšně vytvořena.',
    });
  } catch (e: any) {
    return c.json({ error: 'Chyba serveru: ' + e.message }, 500);
  }
});

// --- VRÁCENÍ (vč. částečného + odpisu zničených) ----------------------------

borrowings.post('/return', async (c) => {
  try {
    const user = c.get('user');
    const {
      borrowing_id,
      returned_quantity = 0,
      discarded_quantity = 0,
      reason,
      note,
    } = await c.req.json<{
      borrowing_id: number;
      returned_quantity?: number;
      discarded_quantity?: number;
      reason?: string;
      note?: string;
    }>();

    if (!borrowing_id) return c.json({ error: 'Chybí borrowing_id.' }, 400);
    if (returned_quantity < 0 || discarded_quantity < 0) {
      return c.json({ error: 'Záporné množství není povoleno.' }, 400);
    }
    if (returned_quantity + discarded_quantity === 0) {
      return c.json({ error: 'Musíte vrátit alespoň 1 kus.' }, 400);
    }
    if (discarded_quantity > 0 && !reason?.trim()) {
      return c.json({ error: 'Pro odpis zničených kusů je nutné uvést důvod.' }, 400);
    }

    const borrowing = await c.env.DB.prepare(`
      SELECT id, equipment_id, quantity, status FROM borrowings WHERE id = ?
    `).bind(borrowing_id).first<{
      id: number; equipment_id: number; quantity: number; status: string;
    }>();

    if (!borrowing) return c.json({ error: 'Výpůjčka nenalezena.' }, 404);
    if (!['active', 'reservation'].includes(borrowing.status)) {
      return c.json({ error: 'Tuto výpůjčku již nelze upravovat.' }, 400);
    }

    const totalToProcess = returned_quantity + discarded_quantity;
    if (totalToProcess > borrowing.quantity) {
      return c.json({
        error: `Vracíte více (${totalToProcess} ks) než bylo půjčeno (${borrowing.quantity} ks).`,
      }, 400);
    }

    // Zkontroluj, že equipment má dost kusů pro odpis (bezpečnostní pojistka)
    if (discarded_quantity > 0) {
      const item = await c.env.DB.prepare(
        'SELECT total_quantity FROM equipment WHERE id = ?'
      ).bind(borrowing.equipment_id).first<{ total_quantity: number }>();

      if (!item || item.total_quantity < discarded_quantity) {
        return c.json({ error: 'Nelze odepsat — nedostatek kusů na skladě.' }, 400);
      }
    }

    const remaining = borrowing.quantity - totalToProcess;
    const statements: D1PreparedStatement[] = [];

    // 1) Odepsat zničené kusy ze skladu + zapsat do discard_logs
    if (discarded_quantity > 0) {
      statements.push(
        c.env.DB.prepare(
          'UPDATE equipment SET total_quantity = total_quantity - ? WHERE id = ?'
        ).bind(discarded_quantity, borrowing.equipment_id)
      );
      statements.push(
        c.env.DB.prepare(
          'INSERT INTO discard_logs (equipment_id, user_id, quantity, reason) VALUES (?, ?, ?, ?)'
        ).bind(borrowing.equipment_id, user.id, discarded_quantity, reason!.trim())
      );
    }

    // 2) Aktualizovat záznam výpůjčky
    if (remaining > 0) {
      // Jen snížit počet — část kusů zůstává u uživatele
      statements.push(
        c.env.DB.prepare(`
          UPDATE borrowings
             SET quantity = ?, updated_at = datetime('now'), updated_by = ?,
                 note = COALESCE(?, note)
           WHERE id = ?
        `).bind(remaining, user.id, note ?? null, borrowing_id)
      );
    } else {
      // Vše vyřízeno — uzavřít výpůjčku
      const finalStatus = borrowing.status === 'reservation' ? 'cancelled' : 'returned';
      statements.push(
        c.env.DB.prepare(`
          UPDATE borrowings
             SET status = ?, note = COALESCE(?, note),
                 updated_at = datetime('now'), updated_by = ?
           WHERE id = ?
        `).bind(finalStatus, note ?? null, user.id, borrowing_id)
      );
    }

    await c.env.DB.batch(statements);

    return c.json({ message: 'Záznam byl úspěšně aktualizován.' });
  } catch (e: any) {
    return c.json({ error: 'Chyba serveru: ' + e.message }, 500);
  }
});

// --- KONFLIKTY (budoucí rezervace jiných uživatelů na daný předmět) ---------

borrowings.get('/conflicts/:equipment_id', async (c) => {
  const equipment_id = c.req.param('equipment_id');
  const { results } = await c.env.DB.prepare(`
    SELECT b.id, b.quantity, b.date_from, b.date_to, b.status, u.name AS user_name
      FROM borrowings b
      JOIN users u ON b.user_id = u.id
     WHERE b.equipment_id = ? AND b.status IN ('active', 'reservation')
     ORDER BY b.date_from ASC
  `).bind(equipment_id).all();
  return c.json(results);
});

// --- MOJE VÝPŮJČKY ----------------------------------------------------------

borrowings.get('/my-history', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(`
    SELECT b.*, e.name AS equipment_name
      FROM borrowings b
      JOIN equipment e ON b.equipment_id = e.id
     WHERE b.user_id = ?
     ORDER BY b.created_at DESC
  `).bind(user.id).all();
  return c.json(results);
});

// --- VŠECHNY VÝPŮJČKY (admin přehled) ---------------------------------------

borrowings.get('/history', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT b.*, e.name AS equipment_name, u.name AS user_name
      FROM borrowings b
      JOIN equipment e ON b.equipment_id = e.id
      LEFT JOIN users u ON b.user_id = u.id
     ORDER BY b.created_at DESC
  `).all();
  return c.json(results);
});

export default borrowings;
