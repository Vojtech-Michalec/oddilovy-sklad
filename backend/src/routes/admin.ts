/**
 * routes/admin.ts — Správa uživatelů (pouze pro adminy).
 *
 * Endpointy:
 *   GET  /api/admin/users          — seznam všech uživatelů
 *   PATCH /api/admin/users/:id/block — přepnutí is_blocked (toggle)
 *
 * Pozn.: adminOnly middleware je aplikován globálně v index.ts,
 *        takže zde není potřeba ho volat znovu.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../types';

const admin = new Hono<AppEnv>();

// --- SEZNAM VŠECH UŽIVATELŮ -------------------------------------------------

admin.get('/users', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT id, name, email, role, is_active, is_blocked,
           login_count, last_login_at, last_online, created_at
      FROM users
     ORDER BY created_at DESC
  `).all<{
    id: number; name: string; email: string; role: string;
    is_active: number; is_blocked: number; login_count: number;
    last_login_at: string | null; last_online: string | null; created_at: string;
  }>();

  return c.json(rows.results);
});

// --- BLOKOVÁNÍ / ODBLOKOVÁNÍ UŽIVATELE (toggle) ----------------------------

admin.patch('/users/:id/block', async (c) => {
  const targetId = Number(c.req.param('id'));
  const currentUser = c.get('user');

  if (Number.isNaN(targetId)) {
    return c.json({ error: 'Neplatné ID uživatele.' }, 400);
  }

  // Admin nemůže zablokovat sám sebe.
  if (targetId === currentUser.id) {
    return c.json({ error: 'Nemůžeš zablokovat vlastní účet.' }, 400);
  }

  const user = await c.env.DB.prepare(
    'SELECT id, is_blocked, role FROM users WHERE id = ?'
  ).bind(targetId).first<{ id: number; is_blocked: number; role: string }>();

  if (!user) return c.json({ error: 'Uživatel nenalezen.' }, 404);

  // Nelze blokovat jiné adminy.
  if (user.role === 'admin') {
    return c.json({ error: 'Nelze blokovat jiného administrátora.' }, 403);
  }

  const newBlocked = user.is_blocked ? 0 : 1;

  // Při blokování zneplatnit všechny otevřené sessions uživatele.
  if (newBlocked === 1) {
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE users SET is_blocked = 1 WHERE id = ?').bind(targetId),
      c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId),
    ]);
  } else {
    await c.env.DB.prepare('UPDATE users SET is_blocked = 0 WHERE id = ?').bind(targetId).run();
  }

  return c.json({
    message: newBlocked ? 'Uživatel byl zablokován.' : 'Uživatel byl odblokován.',
    is_blocked: newBlocked,
  });
});

export default admin;
